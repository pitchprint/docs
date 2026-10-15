// Draft a release note from docs articles carrying a `release:` value.
//
// THE SECONDARY PIPELINE. The release notes are written on the blog, and
// scripts/ingest-blog-releases.mjs imports them from there — that is the one
// that keeps blog/releases/ current. This exists for the other direction: a
// release that shipped with docs changes but no blog post yet, where the
// frontmatter is all there is to go on.
//
// All it knows about a release is the one-line `release_summary` on each
// article, so what it produces is scaffolding, marked as a draft. Compare it
// with any published block and the gap is the writing.
//
// Both pipelines share release-file.mjs, so there is exactly one implementation
// of "insert without touching what is already there".
//
//   node scripts/ingest-release-notes.mjs                  dry run (default)
//   node scripts/ingest-release-notes.mjs --preview DIR    write candidates somewhere safe
//   node scripts/ingest-release-notes.mjs --write          apply to blog/releases/
//
// Exit codes: 0 nothing to do, 1 refused, 2 wrote changes.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  collectReleases,
  renderUpdateBlock,
  yearFor,
  weekFor,
} from "./generate-blog-summaries.js";
import {
  rootDir,
  RELEASES_DIR,
  labelsIn,
  insertBlocks,
  newYearFile,
  addYearToNav,
  verifyAfterWrite,
} from "./release-file.mjs";

const argVal = (flag) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
};
const WRITE = process.argv.includes("--write");
const PREVIEW = argVal("--preview");

if (PREVIEW && WRITE) {
  console.error("--preview and --write are mutually exclusive. Pick one.");
  process.exit(1);
}

/* -------------------------------------------------------------- plan */

const byRelease = await collectReleases();

if (byRelease.size === 0) {
  console.log("No docs article carries a `release:` value. Nothing to do.");
  process.exit(0);
}

const planned = [];
const skipped = [];
const refused = [];

for (const [releaseId, articles] of byRelease) {
  const year = yearFor(releaseId, articles[0].frontmatter);
  if (!year) {
    refused.push(
      `${releaseId} — cannot tell which year this belongs to. Use the WKnn-yy ` +
        "form, or set `release_year:` on one of its articles."
    );
    continue;
  }

  const file = join(RELEASES_DIR, `${year}.mdx`);
  const exists = existsSync(file);
  const text = exists ? await readFile(file, "utf8") : "";

  if (exists && labelsIn(text).has(releaseId.toUpperCase())) {
    skipped.push(`${releaseId} — already written up in blog/releases/${year}.mdx`);
    continue;
  }

  planned.push({
    releaseId,
    year,
    file,
    exists,
    articles,
    block: renderUpdateBlock(releaseId, articles),
  });
}

// Newest first, so several additions land in the file's own order.
planned.sort(
  (a, b) => b.year - a.year || (weekFor(b.releaseId) ?? 0) - (weekFor(a.releaseId) ?? 0)
);

/* ------------------------------------------------------------ report */

for (const s of skipped) console.log(`  skipped ${s}`);
for (const r of refused) console.error(`  REFUSED ${r}`);

if (!planned.length) {
  console.log(
    refused.length
      ? "\nNothing to add, but some releases were refused — see above."
      : "\nEvery release already has a note. Nothing to add."
  );
  process.exit(refused.length ? 1 : 0);
}

console.log(`\n${planned.length} release(s) with no note yet:\n`);
for (const p of planned) {
  console.log(`  ${p.releaseId}`);
  console.log(`    into      blog/releases/${p.year}.mdx${p.exists ? "" : "  (NEW FILE)"}`);
  console.log(
    `    topics    ${p.articles.map((a) => a.frontmatter.title || a.slug).join(", ")}`
  );
  console.log(`    from      ${p.articles.map((a) => a.path).join(", ")}`);
  console.log("");
}

console.log(
  "Each block is a DRAFT: headings and one-line summaries from the articles,\n" +
    "no opening paragraph, no detail, no screenshots. Expand before merging.\n"
);

/* ----------------------------------------------------------- preview */

if (PREVIEW) {
  const dir = join(rootDir, PREVIEW);
  await mkdir(dir, { recursive: true });
  for (const p of planned) {
    await writeFile(join(dir, `${p.year}-${p.releaseId}.mdx`), p.block + "\n", "utf8");
    console.log(`  preview ${PREVIEW}/${p.year}-${p.releaseId}.mdx`);
  }
  console.log("\nPreview only — blog/releases/ untouched.");
  process.exit(0);
}

if (!WRITE) {
  console.log("Dry run — nothing written. Re-run with --write to apply.");
  process.exit(0);
}

/* ------------------------------------------------------------- apply */

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
    if (nav.changed) {
      written.push(`docs.json (sidebar entry for ${year})`);
    } else {
      console.warn(
        `\nWARNING: blog/releases/${year}.mdx was created but could NOT be added to the\n` +
          `sidebar${nav.problem ? ` (${nav.problem})` : ""}. Add "blog/releases/${year}" to docs.json by hand,\n` +
          "or the page will exist but not be linked."
      );
    }
  }
}

console.log("\nWritten:");
for (const w of written) console.log(`  ${w}`);
console.log(
  "\nEvery pre-existing release note is byte-for-byte unchanged (verified after writing)." +
    "\nThe new block(s) are drafts — expand them before merging."
);
process.exit(2);
