// Work out which docs article a release-note feature heading is about.
//
// Nothing in a release note says which article it affects, so this infers it
// from the words. That inference is about to drive edits to published docs
// pages, so the bar is not "usually right" — it is "right, or silent".
//
// HOW IT DECIDES
//
// Words are weighted by how rare they are across all article titles (IDF). A
// heading sharing "canvas" and "adjuster" with an article is strong evidence,
// because almost nothing else is called an adjuster. A heading sharing "new"
// and "button" is close to no evidence at all.
//
// WHICH WAY ROUND THE RATIO GOES
//
// The score is how much of the ARTICLE's identity the heading names — not how
// much of the heading the article covers. The first version did it the other
// way and was wrong in both directions at once, measured on the real corpus:
//
//   "Canvas Adjuster predefined and custom values"  ->  Canvas Adjuster Module
//        rejected at 0.34, because "predefined" and "values" appear in no
//        article title and so swamped the denominator. Being specific was
//        punished.
//   "Search Designs"  ->  How to enable Pixabay image search
//        accepted at 0.73 on the single shared word "search", while the
//        article's distinctive word, "pixabay", was absent. Being vague was
//        rewarded.
//
// Scoring the article's side fixes both: an article is matched when the
// heading names the things that make that article what it is.
//
// A match is only CONFIDENT when all four hold:
//
//   1. The score clears a floor — enough of the heading's distinctive weight
//      is accounted for by that article.
//   2. It beats the runner-up by a margin — if two articles both look
//      plausible, the heading is ambiguous and we must not guess.
//   3. At least one shared word is genuinely rare across the corpus.
//   4. Exactly one article clears the floor.
//
// Anything else is reported as AMBIGUOUS or NO MATCH and goes to a human.
//
//   node scripts/match-release-topics.mjs            report every heading
//   node scripts/match-release-topics.mjs --confident-only
//   node scripts/match-release-topics.mjs --json
//
// The thresholds are deliberately exposed: --floor, --margin.

import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const rootDir = join(scriptDir, "..");

const argVal = (f) => {
  const i = process.argv.indexOf(f);
  return i !== -1 ? process.argv[i + 1] : null;
};

export const FLOOR = Number(argVal("--floor") ?? 0.55);
export const MARGIN = Number(argVal("--margin") ?? 0.2);

const SCAN_DIRS = ["docs/documentation", "docs/tutorial", "docs/api-reference"];

// Words that carry no topic signal. Release headings are full of them:
// "How to enable this feature", "What's new", "New button".
const STOP = new Set(`
a an and are as at be by can for from has have how in into is it its new now of
on or our that the their this to up us use used using we what when where which
with you your all also any been more most not only other some than then there
these they was will would about after again before both each few same so such
too very just like get got make made add added adding set setting update
updated updates feature features improvement improvements fix fixed fixes
release releases enable enabled enabling option options support supported
introducing available able now better faster easier
`.trim().split(/\s+/));

/** Lowercase word tokens, stopwords dropped, crude plural stripping. */
export function tokenize(text) {
  return [
    ...new Set(
      String(text)
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/[\s-]+/)
        .filter((w) => w.length > 2 && !STOP.has(w))
        .map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    ),
  ];
}

/** Inverse document frequency of every token across the article titles. */
export function buildIdf(articles) {
  const df = new Map();
  for (const a of articles) {
    for (const t of tokenize(a.title)) df.set(t, (df.get(t) || 0) + 1);
  }
  const N = articles.length || 1;
  const idf = new Map();
  for (const [t, n] of df) idf.set(t, Math.log(N / n));
  return { idf, df, N };
}

/**
 * Score one heading against every article and decide.
 *
 * @returns { verdict, best, runnerUp, score, margin, shared }
 *          verdict is "confident" | "ambiguous" | "none"
 */
export function matchHeading(heading, articles, model, opts = {}) {
  const floor = opts.floor ?? FLOOR;
  const margin = opts.margin ?? MARGIN;
  const { idf, df, N } = model;

  const hTokens = new Set(tokenize(heading));
  const weightOf = (t) => idf.get(t) ?? Math.log(N); // unseen word = maximally rare

  if (!hTokens.size) return { verdict: "none", score: 0, shared: [], heading };

  const scored = articles
    .map((a) => {
      const aTokens = tokenize(a.title);
      const shared = aTokens.filter((t) => hTokens.has(t));
      const total = aTokens.reduce((s, t) => s + weightOf(t), 0);
      const got = shared.reduce((s, t) => s + weightOf(t), 0);
      return { article: a, score: total ? got / total : 0, shared };
    })
    .sort((x, y) => y.score - x.score);

  const best = scored[0];
  const runnerUp = scored[1] || { score: 0 };
  const over = scored.filter((s) => s.score >= floor);

  // A word is rare if it names at most a tenth of the corpus. Without one of
  // these, the overlap is generic vocabulary and proves nothing.
  const rareFloor = Math.max(1, Math.floor(N * 0.1));
  const hasRare = best.shared.some((t) => (df.get(t) ?? 0) <= rareFloor);

  let verdict = "none";
  if (best.score >= floor && hasRare) {
    verdict =
      over.length === 1 && best.score - runnerUp.score >= margin ? "confident" : "ambiguous";
  } else if (best.score > 0) {
    verdict = "none";
  }

  return {
    heading,
    verdict,
    score: Math.round(best.score * 100) / 100,
    margin: Math.round((best.score - runnerUp.score) * 100) / 100,
    best: best.article,
    runnerUp: runnerUp.article,
    shared: best.shared,
    hasRare,
    contenders: over.length,
  };
}

/* ---------------------------------------------------------- collection */

export async function loadArticles() {
  const articles = [];
  for (const dir of SCAN_DIRS) {
    const abs = join(rootDir, dir);
    if (!existsSync(abs)) continue;
    for (const f of await readdir(abs)) {
      if (!f.endsWith(".mdx")) continue;
      const raw = (await readFile(join(abs, f), "utf8")).replace(/\r\n/g, "\n");
      const fm = raw.match(/^---\n([\s\S]*?)\n---/);
      const t = fm && fm[1].match(/^title:\s*(.*)$/m);
      articles.push({
        path: `${dir}/${f}`,
        title: t ? t[1].replace(/^["']|["']$/g, "") : f.replace(/\.mdx$/, ""),
      });
    }
  }
  return articles;
}

export async function loadReleases() {
  const dir = join(rootDir, "blog", "releases");
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of await readdir(dir)) {
    if (!f.endsWith(".mdx")) continue;
    const raw = (await readFile(join(dir, f), "utf8")).replace(/\r\n/g, "\n");
    for (const block of raw.match(/<Update[\s\S]*?<\/Update>/g) || []) {
      const label = (block.match(/label="([^"]+)"/) || [])[1];
      const date = (block.match(/description="([^"]*)"/) || [])[1];
      // Each heading plus the prose under it, up to the next heading. The
      // prose is what the release note actually says changed, and it becomes
      // the description on the article's card.
      const sections = [];
      const parts = block.replace(/^<Update[\s\S]*?>\n/, "").split(/^\s*###\s+/m).slice(1);
      for (const part of parts) {
        const [first, ...rest] = part.split("\n");
        sections.push({ heading: first.trim(), body: rest.join("\n").trim() });
      }
      const headings = sections.map((x) => x.heading);
      if (label && headings.length) {
        out.push({ label, date, year: f.replace(/\.mdx$/, ""), headings, sections, block });
      }
    }
  }
  return out;
}

/* --------------------------------------------------------------- CLI */

const isMain =
  process.argv[1] &&
  import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href;

if (isMain) {
  const articles = await loadArticles();
  const releases = await loadReleases();
  const model = buildIdf(articles);

  const rows = [];
  for (const r of releases) {
    for (const h of r.headings) {
      rows.push({ release: r.label, year: r.year, ...matchHeading(h, articles, model) });
    }
  }

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(rows, null, 1));
    process.exit(0);
  }

  const only = process.argv.includes("--confident-only");
  const counts = { confident: 0, ambiguous: 0, none: 0 };
  for (const row of rows) counts[row.verdict]++;

  for (const row of rows) {
    if (only && row.verdict !== "confident") continue;
    const tag =
      row.verdict === "confident" ? "CONFIDENT" : row.verdict === "ambiguous" ? "ambiguous" : "—";
    console.log(`${tag.padEnd(10)} ${row.release.padEnd(9)} ${row.heading}`);
    if (row.verdict !== "none") {
      console.log(`           ${" ".repeat(9)} -> ${row.best?.title}  (${row.best?.path})`);
      console.log(
        `           ${" ".repeat(9)}    score ${row.score}  margin ${row.margin}  ` +
          `shared [${row.shared.join(", ")}]` +
          (row.contenders > 1 ? `  ${row.contenders} articles cleared the floor` : "")
      );
    }
  }

  console.log(
    `\n${rows.length} heading(s) across ${releases.length} release(s), ${articles.length} articles.` +
      `\n  confident  ${counts.confident}` +
      `\n  ambiguous  ${counts.ambiguous}` +
      `\n  no match   ${counts.none}` +
      `\n\nfloor ${FLOOR}  margin ${MARGIN}`
  );
}
