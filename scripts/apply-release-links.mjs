// Put a "what's new" callout on the docs articles a release note touched.
//
// APPROVE ONCE, THEN TRUST THAT ARTICLE
//
// The first time a release is matched to an article, the edit and a new entry
// in scripts/release-topics.json go into the same pull request. Merging it is
// the approval: the entry lands, and from then on that article is one the
// automation may update by itself. A pairing nobody has seen never merges
// unreviewed.
//
// That boundary exists because the matcher is inference, not fact. Measured on
// the real corpus it proposed two wrong links — "Eyedropper Color Picker" to
// "All About Colors", and "Move Designs Across Categories" to the Fetch Design
// Categories API page — and both were caught by a person reading them. The
// rules that exclude them now (two shared words minimum, no api-reference) came
// from those two cases, so they are fitted to known errors and cannot be
// assumed to catch the next unknown one. Hence: a human sees every new pairing.
//
// THE EDIT IS CONFINED TO TWO MARKERS
//
// Everything this writes lives between `release-notes:start` and
// `release-notes:end`. Strip that region from the file before and after, and
// the two must be byte-identical — that is checked on every write, and it is
// the whole reason automation is allowed near docs/ at all.
//
//   node scripts/apply-release-links.mjs                 dry run (default)
//   node scripts/apply-release-links.mjs --preview DIR   write candidates aside
//   node scripts/apply-release-links.mjs --write         apply to docs/
//
// Exit codes: 0 nothing to do, 1 refused, 2 wrote changes.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import {
  loadArticles,
  loadReleases,
  buildIdf,
  matchHeading,
  rootDir,
} from "./match-release-topics.mjs";
import {
  BLOCK_RE,
  withoutBlock,
  labelsInArticle,
  renderCards,
  applyBlock,
  weekOf,
} from "./release-callout.mjs";

const argVal = (f) => {
  const i = process.argv.indexOf(f);
  return i !== -1 ? process.argv[i + 1] : null;
};
const WRITE = process.argv.includes("--write");
const PREVIEW = argVal("--preview");
const RESULT_PATH = process.env.RESULT_PATH || null;

if (PREVIEW && WRITE) {
  console.error("--preview and --write are mutually exclusive. Pick one.");
  process.exit(1);
}

const TOPICS_PATH = join(rootDir, "scripts", "release-topics.json");

/* ------------------------------------------------------------- topics */

async function loadApproved() {
  if (!existsSync(TOPICS_PATH)) return {};
  const raw = JSON.parse(await readFile(TOPICS_PATH, "utf8"));
  return raw.approved || {};
}

/* --------------------------------------------------------------- plan */

const articles = await loadArticles();
const releases = await loadReleases();
const model = buildIdf(articles);
const approved = await loadApproved();

// The strict settings, fitted to the two known errors. Kept here rather than
// in the matcher so the matcher stays a measurement tool.
const STRICT = { minShared: 2, skip: /^docs\/api-reference\//, margin: 0.25 };

const byArticle = new Map();

for (const r of releases) {
  for (const { heading, body } of r.sections) {
    const m = matchHeading(heading, articles, model, { margin: STRICT.margin });
    if (m.verdict !== "confident") continue;
    if (m.shared.length < STRICT.minShared) continue;
    if (STRICT.skip.test(m.best.path)) continue;

    const key = m.best.path;
    if (!byArticle.has(key)) byArticle.set(key, []);
    byArticle.get(key).push({
      label: r.label,
      date: r.date || "",
      year: r.year,
      heading,
      body,
      score: m.score,
      shared: m.shared,
    });
  }
}

// Newest release first within each article. The year comes from the file the
// block was found in, never from the label.
for (const list of byArticle.values()) {
  list.sort(
    (x, y) =>
      Number(y.year) - Number(x.year) || weekOf(y.label, y.year) - weekOf(x.label, x.year)
  );
}

const planned = [];
const unchanged = [];

for (const [path, entries] of byArticle) {
  const abs = join(rootDir, path);
  if (!existsSync(abs)) continue;
  const original = await readFile(abs, "utf8");
  const have = labelsInArticle(original);
  const want = entries.map((e) => e.label);
  const cards = renderCards(entries);

  // Compare the rendered block, not just the labels. Comparing labels alone
  // meant a change to the card template — adding the Latest badge, say — was
  // reported as "already up to date" and never reached the articles.
  const existing = (original.replace(/\r\n/g, "\n").match(BLOCK_RE) || [""])[0].trim();
  if (existing && existing === cards.trim()) {
    unchanged.push(path);
    continue;
  }

  planned.push({
    path,
    abs,
    original,
    entries,
    added: want.filter((l) => !have.includes(l)),
    trusted: Boolean(approved[path]),
    cards,
  });
}

planned.sort((a, b) => Number(a.trusted) - Number(b.trusted) || a.path.localeCompare(b.path));

const needsApproval = planned.filter((p) => !p.trusted);
const allTrusted = planned.length > 0 && needsApproval.length === 0;

async function writeResult() {
  if (!RESULT_PATH) return;
  await writeFile(
    RESULT_PATH,
    JSON.stringify(
      {
        clean: allTrusted,
        updated: planned.map((p) => ({
          path: p.path,
          trusted: p.trusted,
          added: p.added,
          releases: p.entries.map((e) => `${e.label}: ${e.heading}`),
        })),
        needsApproval: needsApproval.map((p) => p.path),
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
}

/* ------------------------------------------------------------- report */

if (unchanged.length) {
  console.log(`${unchanged.length} article(s) already up to date.`);
}

if (!planned.length) {
  console.log("No article needs a release callout. Nothing to do.");
  await writeResult();
  process.exit(0);
}

console.log(`\n${planned.length} article(s) to update:\n`);
for (const p of planned) {
  console.log(`  ${p.path}`);
  console.log(`    ${p.trusted ? "APPROVED — may merge automatically" : "NEW PAIRING — needs a person"}`);
  for (const e of p.entries) {
    const isNew = p.added.includes(e.label);
    console.log(`    ${isNew ? "+" : " "} ${e.label}  ${e.heading}   [score ${e.score}, shared ${e.shared.join("+")}]`);
  }
  console.log("");
}

if (needsApproval.length) {
  console.log(
    `${needsApproval.length} of these pair a release with an article for the first time.\n` +
      "Merging the pull request approves that pairing and records it in\n" +
      "scripts/release-topics.json; afterwards that article updates itself.\n" +
      "Check each one actually describes the article before you merge.\n"
  );
}

/* ------------------------------------------------------------ preview */

if (PREVIEW) {
  const dir = join(rootDir, PREVIEW);
  await mkdir(dir, { recursive: true });
  for (const p of planned) {
    const out = join(dir, p.path.replace(/\//g, "__"));
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, applyBlock(p.original, p.cards), "utf8");
    console.log(`  preview ${PREVIEW}/${p.path.replace(/\//g, "__")}`);
  }
  console.log("\nPreview only — docs/ untouched.");
  await writeResult();
  process.exit(0);
}

if (!WRITE) {
  console.log("Dry run — nothing written. Re-run with --write to apply.");
  await writeResult();
  process.exit(0);
}

/* -------------------------------------------------------------- apply */

const written = [];
for (const p of planned) {
  let next;
  try {
    next = applyBlock(p.original, p.cards);
  } catch (err) {
    console.error(`\nREFUSED: ${p.path} — ${err.message}`);
    process.exit(1);
  }
  await writeFile(p.abs, next, "utf8");

  // Re-read from disk and check again, rather than trusting what we wrote.
  const now = await readFile(p.abs, "utf8");
  if (withoutBlock(now.replace(/\r\n/g, "\n")).trim() !== withoutBlock(p.original.replace(/\r\n/g, "\n")).trim()) {
    console.error(
      `\nREFUSED AFTER WRITING: ${p.path} changed outside the generated block.\n` +
        `Restore it:  git checkout -- ${p.path}`
    );
    process.exit(1);
  }
  written.push(p.path);
}

// Record every new pairing in the same change, so merging the PR is the
// approval and no separate step can be forgotten.
if (needsApproval.length) {
  const current = existsSync(TOPICS_PATH)
    ? JSON.parse(await readFile(TOPICS_PATH, "utf8"))
    : { approved: {} };
  current._comment =
    "Articles the release-note automation may update without review. An entry " +
    "lands here when someone merges the pull request that first paired that " +
    "article with a release — merging IS the approval. Delete an entry to send " +
    "that article back to review.";
  current.approved = current.approved || {};
  for (const p of needsApproval) {
    current.approved[p.path] = {
      approvedBy: "pull request",
      firstPairedWith: p.added[0] || p.entries[0]?.label,
      recordedAt: new Date().toISOString().slice(0, 10),
    };
  }
  await writeFile(TOPICS_PATH, JSON.stringify(current, null, 2) + "\n", "utf8");
  written.push("scripts/release-topics.json");
}

await writeResult();

console.log("\nWritten:");
for (const w of written) console.log(`  ${w}`);
console.log(
  "\nEvery article is byte-for-byte unchanged outside the generated block (verified after writing)."
);
console.log(
  allTrusted
    ? "Gate: APPROVED — every article here has been vetted before; safe to merge automatically."
    : `Gate: NEEDS REVIEW — ${needsApproval.length} new pairing(s) a person has not seen.`
);
process.exit(2);
