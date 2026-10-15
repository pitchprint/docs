// Turn the release notes on the PitchPrint blog into <Update> blocks in
// blog/releases/<year>.mdx. Additive only; proposed as a pull request.
//
// WHY THIS DIRECTION
//
// The release notes are written in Ghost at blog.pitchprint.com. The year files
// under blog/releases/ mirror them, and until now that mirroring was done by
// hand — which is why WK40-26 shipped on 1 October and the docs site still
// stopped at WK26-26 from June. The blog is the source; this follows it.
//
// Unlike the Help Scout docs, there is no "the published version is better"
// problem here: the year-file blocks ARE the blog posts, converted. So this can
// produce near-publishable output rather than a stub — the feed carries the
// full post HTML. Run --benchmark to see how close, measured against the
// blocks a person wrote for the same posts.
//
// WHAT IT STILL WON'T DO
//
// It will not touch an <Update> block that already exists, for any reason. If
// someone improved a note after it was imported, that improvement stands. The
// guards live in release-file.mjs and are shared with the other pipeline.
//
//   node scripts/ingest-blog-releases.mjs                dry run (default)
//   node scripts/ingest-blog-releases.mjs --preview DIR  write candidates somewhere safe
//   node scripts/ingest-blog-releases.mjs --write        apply to blog/releases/
//   node scripts/ingest-blog-releases.mjs --benchmark    conversion vs. hand-written
//
// Exit codes: 0 nothing to do, 1 refused, 2 wrote changes.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import {
  convertPost,
  renderBlock,
  labelFor,
  labelInTitle,
  prettyDate,
} from "./blog-convert.mjs";
import { validateReleaseNote } from "./validate-release-note.mjs";
import {
  rootDir,
  RELEASES_DIR,
  labelsIn,
  insertBlocks,
  newYearFile,
  addYearToNav,
  verifyAfterWrite,
} from "./release-file.mjs";

const argVal = (f) => {
  const i = process.argv.indexOf(f);
  return i !== -1 ? process.argv[i + 1] : null;
};
const WRITE = process.argv.includes("--write");
// The fidelity bar, as a percentage of the source post's prose that must
// survive the conversion. Structure failures are not scored — they are flat.
const FLOOR = Number(argVal("--floor") ?? process.env.FIDELITY_FLOOR ?? 95);
// Where to leave a machine-readable verdict for the workflow to read.
const RESULT_PATH = process.env.RESULT_PATH || null;
const PREVIEW = argVal("--preview");
const BENCHMARK = process.argv.includes("--benchmark");

if (PREVIEW && WRITE) {
  console.error("--preview and --write are mutually exclusive. Pick one.");
  process.exit(1);
}

const CACHE = join(rootDir, "data", "blog-releases.json");

if (!existsSync(CACHE)) {
  console.error(
    "data/blog-releases.json not found. Fetch the feed first:\n  npm run blog-fetch"
  );
  process.exit(1);
}

const cache = JSON.parse(await readFile(CACHE, "utf8"));
const posts = (cache.releases || []).map((r) => {
  const date = new Date(r.pubDate);
  return { ...r, date, label: labelFor(date), pretty: prettyDate(date) };
});

if (!posts.length) {
  console.error("The cache holds no release notes. Re-run the fetch.");
  process.exit(1);
}

const badDates = posts.filter((p) => Number.isNaN(p.date.getTime()));
if (badDates.length) {
  console.error(
    `\n${badDates.length} post(s) have an unreadable pubDate, and the date is what\n` +
      "decides the label and the year file. Refusing to guess:\n" +
      badDates.map((p) => `  | ${p.title} — "${p.pubDate}"`).join("\n")
  );
  process.exit(1);
}

/* ----------------------------------------------------------- benchmark */

// Convert posts that ALREADY have a hand-written block and report how close
// the automatic conversion gets. The only honest way to judge a converter is
// against what a person wrote for the same input.
if (BENCHMARK) {
  console.log("Conversion compared against the hand-written blocks.\n");
  let compared = 0;
  for (const p of posts) {
    const file = join(RELEASES_DIR, `${p.date.getUTCFullYear()}.mdx`);
    if (!existsSync(file)) continue;
    const text = await readFile(file, "utf8");
    const m = text.match(new RegExp(`<Update\\s+label="${p.label}"[\\s\\S]*?</Update>`));
    if (!m) continue;
    compared++;
    const human = m[0];
    const { markdown, images } = convertPost(p.html);
    const mine = renderBlock({ label: p.label, date: p.pretty, markdown, link: p.link });
    const words = (s) => (s.match(/[A-Za-z0-9']+/g) || []).length;
    const heads = (s) => (s.match(/^\s*#{3}\s+/gm) || []).length;
    const imgs = (s) => (s.match(/<img\s/g) || []).length;
    const pct = Math.round((words(mine) / Math.max(words(human), 1)) * 100);
    console.log(`  ${p.label}  (${p.pretty})`);
    console.log(`    words     ${words(human)} hand-written vs ${words(mine)} converted  (${pct}%)`);
    console.log(`    headings  ${heads(human)} vs ${heads(mine)}`);
    console.log(`    images    ${imgs(human)} vs ${imgs(mine)}  (${images.length} in the post)`);
    console.log(
      `    accordion ${/AccordionGroup/.test(human) ? "yes" : "no"} vs ${/AccordionGroup/.test(mine) ? "yes" : "no"}`
    );
    console.log("");
  }
  console.log(
    compared
      ? `${compared} post(s) compared. Words near 100% with matching headings and images\n` +
          "means the conversion carries the content. The accordion row is the known\n" +
          "gap, and is flagged on every run."
      : "No post in the feed has a hand-written block to compare against."
  );
  process.exit(0);
}

/* --------------------------------------------------------------- plan */

const planned = [];
const skipped = [];
const rejected = [];
const warnings = [];

for (const p of posts) {
  const year = p.date.getUTCFullYear();
  const file = join(RELEASES_DIR, `${year}.mdx`);
  const exists = existsSync(file);
  const text = exists ? await readFile(file, "utf8") : "";

  const titled = labelInTitle(p.title);
  if (titled && titled !== p.label) {
    warnings.push(
      `"${p.title}" was published ${p.pretty}, which is ${p.label}. ` +
        `Filed as ${p.label} — the digits in the post title look transposed.`
    );
  }

  if (exists && labelsIn(text).has(p.label)) {
    skipped.push(`${p.label} — already in blog/releases/${year}.mdx`);
    continue;
  }

  const { markdown, images, hasFixes, missingAlt } = convertPost(p.html);
  const block = renderBlock({ label: p.label, date: p.pretty, markdown, link: p.link });
  const verdict = validateReleaseNote(
    block,
    { markdown, images, hasFixes, missingAlt },
    { floor: FLOOR }
  );

  // A block that fails the gate is not imported at all. There is no weaker
  // version to fall back to, as there is for a docs page, so the choice is
  // between a missing release note and a wrong one.
  if (!verdict.ok) {
    rejected.push({ ...p, verdict });
    continue;
  }

  planned.push({
    ...p,
    year,
    file,
    exists,
    images,
    hasFixes,
    missingAlt,
    verdict,
    block,
  });
}

planned.sort((a, b) => b.date - a.date);

for (const s of skipped) console.log(`  skipped ${s}`);
if (warnings.length) {
  console.log("");
  for (const w of warnings) console.log(`  NOTE  ${w}`);
}

/* ------------------------------------------------------ the verdict */

// `clean` means: nothing failed the gate, and nothing needs a person. It is
// what the workflow reads to decide whether the pull request may merge itself.
const allClean = rejected.length === 0 && planned.every((p) => p.verdict.clean);

async function writeResult() {
  if (!RESULT_PATH) return;
  await writeFile(
    RESULT_PATH,
    JSON.stringify(
      {
        floor: FLOOR,
        clean: allClean,
        imported: planned.map((p) => ({
          label: p.label,
          score: p.verdict.score,
          warnings: p.verdict.warnings,
        })),
        rejected: rejected.map((r) => ({
          label: r.label,
          score: r.verdict.score,
          problems: r.verdict.problems,
        })),
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
}

if (rejected.length) {
  console.error(`\n${rejected.length} release note(s) REJECTED by the quality gate:\n`);
  for (const r of rejected) {
    console.error(`  ${r.label}  ${r.pretty}  —  fidelity ${r.verdict.score}% (floor ${FLOOR}%)`);
    console.error(`    ${r.link}`);
    for (const prob of r.verdict.problems) console.error(`    - ${prob}`);
    console.error("");
  }
  console.error(
    "These are not imported. There is no plainer fallback for a release note, so\n" +
      "the choice is between a missing one and a wrong one — and a missing one gets\n" +
      "noticed. Fix the post or the converter, then re-run.\n"
  );
}

if (!planned.length) {
  if (rejected.length) {
    await writeResult();
    console.error("Nothing was imported.");
    process.exit(1);
  }
  console.log("\nEvery release note on the blog is already in the docs. Nothing to add.");
  await writeResult();
  process.exit(0);
}

console.log(`\n${planned.length} release note(s) on the blog but not in the docs:\n`);
for (const p of planned) {
  console.log(`  ${p.label}  ${p.pretty}`);
  console.log(`    title     ${p.title}`);
  console.log(`    into      blog/releases/${p.year}.mdx${p.exists ? "" : "  (NEW FILE)"}`);
  console.log(`    source    ${p.link}`);
  console.log(`    fidelity  ${p.verdict.score}% of the post's prose (floor ${FLOOR}%)`);
  const foreign = p.images.filter((i) => !i.local).length;
  console.log(`    images    ${p.images.length}${foreign ? ` (${foreign} not on the blog CDN)` : ""}`);
  for (const w of p.verdict.warnings) console.log(`    NEEDS     ${w}`);
  console.log("");
}

console.log(
  allClean
    ? "All clean: every block passed the gate and none needs a person.\n"
    : "Needs review: at least one block was rejected or needs a person before merging.\n"
);

/* ------------------------------------------------------------ preview */

if (PREVIEW) {
  const dir = join(rootDir, PREVIEW);
  await mkdir(dir, { recursive: true });
  for (const p of planned) {
    await writeFile(join(dir, `${p.year}-${p.label}.mdx`), p.block + "\n", "utf8");
    console.log(`  preview ${PREVIEW}/${p.year}-${p.label}.mdx`);
  }
  console.log("\nPreview only — blog/releases/ untouched, no images downloaded.");
  await writeResult();
  process.exit(0);
}

if (!WRITE) {
  console.log("Dry run — nothing written. Re-run with --write to apply.");
  await writeResult();
  process.exit(0);
}

/* -------------------------------------------------------------- apply */

async function downloadImage(src, localPath) {
  const dest = join(rootDir, localPath.replace(/^\//, ""));
  if (existsSync(dest)) return { skipped: true };
  const res = await fetch(src, { headers: { "user-agent": "pitchprint-docs-sync" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  return { skipped: false, bytes: buf.length };
}

// Images first. A block pointing at a file that failed to download is worse
// than no block at all, so nothing is written until they are all on disk.
console.log("Downloading images…");
for (const p of planned) {
  for (const img of p.images) {
    if (!img.local) {
      console.warn(`  left remote (not on the blog CDN): ${img.src}`);
      continue;
    }
    try {
      const r = await downloadImage(img.src, img.local);
      console.log(`  ${r.skipped ? "have" : "got "} ${img.local}`);
    } catch (err) {
      console.error(`\nCould not download ${img.src}: ${err.message}`);
      console.error("Refusing to write a release note whose images are missing.");
      process.exit(1);
    }
  }
}

const byYear = new Map();
for (const p of planned) {
  if (!byYear.has(p.year)) byYear.set(p.year, []);
  byYear.get(p.year).push(p);
}

const written = [];

for (const [year, group] of byYear) {
  const file = group[0].file;
  const existed = group[0].exists;
  const original = existed ? await readFile(file, "utf8") : null;
  const text = existed ? original : newYearFile(year, "\r\n");

  let next;
  try {
    next = insertBlocks(text, group.map((p) => p.block), { existed });
  } catch (err) {
    console.error(`\nREFUSED: blog/releases/${year}.mdx — ${err.message}`);
    process.exit(1);
  }

  await mkdir(RELEASES_DIR, { recursive: true });
  await writeFile(file, next, "utf8");
  written.push(`blog/releases/${year}.mdx (+${group.length})`);

  if (existed) {
    await verifyAfterWrite(file, original);
  } else {
    const nav = await addYearToNav(year, true);
    if (nav.changed) written.push(`docs.json (sidebar entry for ${year})`);
    else
      console.warn(
        `\nWARNING: blog/releases/${year}.mdx was created but could NOT be added to the\n` +
          `sidebar${nav.problem ? ` (${nav.problem})` : ""}. Add "blog/releases/${year}" to docs.json by hand.`
      );
  }
}

console.log("\nWritten:");
for (const w of written) console.log(`  ${w}`);
await writeResult();
console.log(
  "\nEvery pre-existing release note is byte-for-byte unchanged (verified after writing)."
);
console.log(
  allClean
    ? "Gate: CLEAN — safe to merge without review."
    : "Gate: NEEDS REVIEW — a person must look at this before it merges."
);
process.exit(2);
