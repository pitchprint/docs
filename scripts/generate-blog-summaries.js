// Build a release-note `<Update>` block from the docs articles shipping in a
// release. Library + CLI: `scripts/ingest-release-notes.mjs` imports from here,
// and running this file directly writes the blocks somewhere safe to read.
//
// THIS IS A DRAFT GENERATOR, NOT AN AUTHOR.
//
// The live release notes in blog/releases/<year>.mdx are hand-written and much
// richer than anything that can be assembled from frontmatter: they open with a
// paragraph of voice, explain each feature, and carry annotated screenshots.
// Compare what the generator can know about WK26-26 —
//
//   release_summary: "You can now set predefined and custom canvas values at
//                     the same time."
//
// — with the four paragraphs, two headings and two screenshots the published
// WK26-26 block actually has. The generator exists to make sure a release never
// goes unrecorded and to save the typing, not to replace that writing. Every
// block it produces is marked as a draft and goes through a pull request.
//
// Article frontmatter contract (add to any docs article shipping in a release):
//   ---
//   title: "Canvas Adjuster Module"
//   release: "wk26-26"              # which release note this belongs to
//   release_summary: "Set predefined and custom values at the same time."
//   release_date: "25 June 2026"    # optional; otherwise the Thursday of that
//                                   # ISO week, since releases ship Thursdays
//   release_title: "..."            # optional; overrides the heading line
//   ---
//
// Usage:
//   node scripts/generate-blog-summaries.js            print the blocks
//   node scripts/generate-blog-summaries.js --out DIR  write one .mdx per block
//
// Env overrides:
//   SCAN_DIRS      folders to scan (default "docs/documentation,docs/tutorial,docs/api-reference")
//   DOCS_BASE_URL  base URL for the per-topic "Learn more" backlinks

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, basename } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const rootDir = join(scriptDir, "..");

const SCAN_DIRS = (
  process.env.SCAN_DIRS ||
  "docs/documentation,docs/tutorial,docs/api-reference"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const DOCS_BASE_URL = (
  process.env.DOCS_BASE_URL || "https://docs.pitchprint.com"
).replace(/\/+$/, "");

/** Marks a block this script wrote, so a reviewer knows what to expand. */
export const DRAFT_MARKER =
  "{/* DRAFT — generated from docs frontmatter. Expand this before merging: " +
  "add the opening paragraph, the detail under each heading, and the screenshots. */}";

/* ------------------------------------------------------- frontmatter */

/** Parse a small YAML subset: `key: value`, quoted strings, booleans, arrays. */
export function parseFrontmatter(rawInput) {
  // Normalise CRLF/CR so the frontmatter regex matches. Only the parsed values
  // are used downstream — the file itself is never rewritten from this.
  const raw = rawInput.replace(/\r\n?/g, "\n");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw.trim() };

  const frontmatter = {};
  for (const line of match[1].split("\n")) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    const value = rawValue.trim();
    if (value === "true" || value === "false") {
      frontmatter[key] = value === "true";
    } else if (value.startsWith("[") && value.endsWith("]")) {
      frontmatter[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else {
      frontmatter[key] = value.replace(/^["']|["']$/g, "");
    }
  }
  return { frontmatter, body: match[2].trim() };
}

/** First non-empty, non-heading, non-bullet paragraph — the lede. */
function firstParagraph(body) {
  for (const block of body.split(/\n\s*\n/)) {
    const text = block.trim();
    if (!text || text.startsWith("#") || text.startsWith("-") || text.startsWith("<"))
      continue;
    return text.replace(/\s+/g, " ");
  }
  return "";
}

/* ------------------------------------------------------------ dates */

/**
 * Which year file a release belongs in. "wk26-26" -> 2026.
 *
 * Deliberately strict: an id that doesn't match the house WKnn-yy convention
 * returns null and the caller refuses, rather than guessing a year and filing
 * a release under the wrong one.
 */
export function yearFor(releaseId, frontmatter = {}) {
  if (frontmatter.release_year) return Number(frontmatter.release_year);
  const m = String(releaseId).match(/^wk(\d{1,2})-(\d{2})$/i);
  if (!m) return null;
  return 2000 + Number(m[2]);
}

/** Week number from a WKnn-yy id, or null. */
export function weekFor(releaseId) {
  const m = String(releaseId).match(/^wk(\d{1,2})-(\d{2})$/i);
  return m ? Number(m[1]) : null;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * The Thursday of ISO week `week` in `year`, formatted "25 June 2026".
 *
 * Releases ship weekly on Thursdays (the year file says so in its intro), so
 * the ship date is derivable from the release id. `release_date` frontmatter
 * overrides this for anything that shipped off-schedule.
 */
export function thursdayOfIsoWeek(year, week) {
  // ISO week 1 is the week containing 4 January, so walk from there.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = jan4.getUTCDay() || 7; // Monday=1 … Sunday=7
  const week1Thursday = new Date(jan4);
  week1Thursday.setUTCDate(jan4.getUTCDate() - dow + 4);
  const d = new Date(week1Thursday);
  d.setUTCDate(week1Thursday.getUTCDate() + (week - 1) * 7);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/* -------------------------------------------------------- rendering */

/** Escape a string for a double-quoted JS/YAML value. */
function quoted(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Render one `<Update>` block in the live blog/releases format.
 *
 * Matches the hand-written blocks exactly: label + description on the opening
 * line, rss={{...}} on the second, two-space indented body, a bold summary
 * line, then one `###` section per topic. Emitted with "\n" throughout — the
 * caller re-applies the target file's line endings.
 */
export function renderUpdateBlock(releaseId, articles, opts = {}) {
  const topics = [...articles].sort((a, b) =>
    (a.frontmatter.title || a.slug).localeCompare(b.frontmatter.title || b.slug)
  );

  const label = releaseId.toUpperCase();
  const week = weekFor(releaseId);
  const year = yearFor(releaseId, topics[0]?.frontmatter || {});
  const date =
    topics.find((t) => t.frontmatter.release_date)?.frontmatter.release_date ||
    (week && year ? thursdayOfIsoWeek(year, week) : "");

  const titles = topics.map((t) => t.frontmatter.title || t.slug);
  // The live blocks lead with a bold run-on of every heading in the post, and
  // reuse a truncated version of it as the RSS title. Mirrored here.
  const summaryLine = titles.join(", ") + ".";
  const rssTitle = `${label} — ${titles.slice(0, 2).join(", ")}`;

  const I = "  ";
  const out = [];
  out.push(`<Update label=${quoted(label)} description=${quoted(date)}`);
  out.push(`${I}rss={{ title: ${quoted(rssTitle)}, description: ${quoted(summaryLine)} }}>`);
  if (opts.draft !== false) out.push(`${I}${DRAFT_MARKER}`);
  out.push("");
  out.push(`${I}**${summaryLine}**`);
  out.push("");

  for (const t of topics) {
    const heading = t.frontmatter.title || t.slug;
    const summary =
      t.frontmatter.release_summary ||
      t.frontmatter.description ||
      firstParagraph(t.body);
    const url = `${DOCS_BASE_URL}/${t.path.replace(/^docs\//, "").replace(/\.mdx$/, "")}`;
    out.push(`${I}### ${heading}`);
    out.push("");
    if (summary) {
      out.push(`${I}${summary}`);
      out.push("");
    }
    out.push(`${I}[Learn more →](${url})`);
    out.push("");
  }

  out.push("</Update>");
  return out.join("\n");
}

/* ------------------------------------------------------- collection */

/** Every article across SCAN_DIRS carrying a `release` value, grouped by it. */
export async function collectReleases() {
  const byRelease = new Map();
  for (const dir of SCAN_DIRS) {
    const abs = join(rootDir, dir);
    if (!existsSync(abs)) continue;
    for (const file of await readdir(abs)) {
      if (!file.endsWith(".mdx")) continue;
      const relPath = `${dir}/${file}`;
      const parsed = parseFrontmatter(await readFile(join(abs, file), "utf8"));
      const release = parsed.frontmatter.release;
      if (!release) continue;
      const entry = { ...parsed, path: relPath, slug: basename(file, ".mdx") };
      if (!byRelease.has(release)) byRelease.set(release, []);
      byRelease.get(release).push(entry);
    }
  }
  return byRelease;
}

/* -------------------------------------------------------------- CLI */

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const outIdx = process.argv.indexOf("--out");
  const outDir = outIdx !== -1 ? process.argv[outIdx + 1] : null;

  const byRelease = await collectReleases();
  if (byRelease.size === 0) {
    console.log("No articles carry a `release:` value. Nothing to do.");
    process.exit(0);
  }

  if (outDir) await mkdir(join(rootDir, outDir), { recursive: true });

  for (const [releaseId, articles] of byRelease) {
    const block = renderUpdateBlock(releaseId, articles);
    const year = yearFor(releaseId, articles[0].frontmatter);
    console.log(
      `\n--- ${releaseId}  ->  blog/releases/${year ?? "?"}.mdx  ` +
        `(${articles.length} topic(s))  ---\n`
    );
    if (outDir) {
      const name = `${releaseId}.mdx`;
      await writeFile(join(rootDir, outDir, name), block + "\n", "utf8");
      console.log(`  written to ${outDir}/${name}`);
    } else {
      console.log(block);
    }
  }
  console.log(`\n${byRelease.size} release(s).`);
}
