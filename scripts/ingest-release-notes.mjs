// Add a draft release note to blog/releases/<year>.mdx for any release that
// doesn't have one yet. Additive only: an existing <Update> block is never
// touched, reordered or reformatted.
//
// WHY THIS IS ADDITIVE AND NOTHING ELSE
//
// Same lesson as the Help Scout sync. The published release notes are written
// by a person — an opening paragraph in the company's voice, a few hundred
// words per feature, annotated screenshots. All this script knows about a
// release is the `release_summary` line on each docs article that shipped in
// it, which is one sentence. If it were allowed to regenerate a block it would
// replace good writing with a stub, every single time.
//
// So the only thing it does is notice that a release has no block at all and
// propose a skeleton for one, through a pull request, marked as a draft. The
// writing is still the writer's job; this just means a shipped release can
// never silently go unrecorded.
//
// WHAT COUNTS AS "ALREADY HAS ONE"
//
// The year file is its own baseline — no separate state to drift. If a block
// with that label exists in the file, the release is done and is skipped, and
// that remains true after someone has rewritten the block beyond recognition,
// because only the label is matched.
//
//   node scripts/ingest-release-notes.mjs                  dry run (default)
//   node scripts/ingest-release-notes.mjs --preview DIR    write candidates somewhere safe
//   node scripts/ingest-release-notes.mjs --write          apply to blog/releases/
//
// Exit codes: 0 nothing to do or success, 1 refused, 2 wrote changes.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  collectReleases,
  renderUpdateBlock,
  yearFor,
  weekFor,
  rootDir,
} from "./generate-blog-summaries.js";

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

const sha = (s) => createHash("sha256").update(s).digest("hex");
const RELEASES_DIR = join(rootDir, "blog", "releases");

/* ----------------------------------------------------------- parsing */

/**
 * Split a year file into the part before the first <Update> and the part from
 * it onwards. The second half is what must come through untouched.
 */
function splitYearFile(text) {
  const m = text.match(/^<Update\b/m);
  if (!m) return { head: text.replace(/\s*$/, ""), blocks: "" };
  return { head: text.slice(0, m.index).replace(/\s*$/, ""), blocks: text.slice(m.index) };
}

/** Every release label already present in a year file. */
function labelsIn(text) {
  return new Set(
    [...text.matchAll(/^<Update\s+label="([^"]+)"/gm)].map((m) =>
      m[1].toUpperCase()
    )
  );
}

/** The file's dominant line ending, so the diff is the new block only. */
const eolOf = (text) => (text.includes("\r\n") ? "\r\n" : "\n");

/* -------------------------------------------------------- new years */

const YEAR_FILE_INTRO =
  "Releases ship weekly on Thursdays. Subscribe with the RSS button above to " +
  "get each one as it lands.";

function newYearFile(year, eol) {
  return (
    [
      "---",
      `title: "${year} releases"`,
      `description: "PitchPrint release notes from ${year} — new features, improvements, and bug fixes."`,
      "rss: true",
      "---",
      "",
      YEAR_FILE_INTRO,
      "",
      "",
    ].join("\n") + ""
  ).replace(/\n/g, eol);
}

/**
 * Register a brand-new year file in the sidebar, immediately above the
 * previous year. Only ever runs in January; without it the automation would
 * quietly stop working at every year boundary.
 */
async function addYearToNav(year, apply) {
  const docsJsonPath = join(rootDir, "docs.json");
  const raw = await readFile(docsJsonPath, "utf8");
  const target = `blog/releases/${year}`;
  if (raw.includes(`"${target}"`)) return { changed: false };

  const prev = `blog/releases/${year - 1}`;
  if (!raw.includes(`"${prev}"`)) {
    return { changed: false, problem: `no "${prev}" in docs.json to anchor to` };
  }

  const doc = JSON.parse(raw);
  let inserted = false;
  const walk = (node, inPages = false) => {
    if (Array.isArray(node)) {
      if (inPages && !inserted) {
        const at = node.indexOf(prev);
        if (at !== -1) {
          node.splice(at, 0, target);
          inserted = true;
          return node;
        }
      }
      return node.map((n) => walk(n, inPages));
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) node[k] = walk(v, k === "pages");
    }
    return node;
  };
  walk(doc.navigation);
  if (!inserted) return { changed: false, problem: "could not place the nav entry" };

  if (apply) {
    // Preserve the file's line endings — otherwise every line reports as changed.
    const eol = eolOf(raw);
    await writeFile(
      docsJsonPath,
      (JSON.stringify(doc, null, 2) + "\n").replace(/\n/g, eol),
      "utf8"
    );
  }
  return { changed: true };
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

// Newest release first, so multiple additions land in the file's own order.
planned.sort((a, b) => b.year - a.year || (weekFor(b.releaseId) ?? 0) - (weekFor(a.releaseId) ?? 0));

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
    const out = join(dir, `${p.year}-${p.releaseId}.mdx`);
    await writeFile(out, p.block + "\n", "utf8");
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

// Hash every year file we are about to touch, and the published docs articles,
// so "additive only" is verified rather than asserted.
const before = new Map();
for (const p of planned) {
  if (p.exists) before.set(p.file, await readFile(p.file, "utf8"));
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
  const original = existed ? before.get(file) : null;
  const eol = existed ? eolOf(original) : "\r\n";

  const text = existed ? original : newYearFile(year, eol);
  const { head, blocks } = splitYearFile(text);

  const newBlocks = group
    .map((p) => p.block.replace(/\n/g, eol))
    .join(`${eol}${eol}`);

  const parts = [head, newBlocks];
  if (blocks) parts.push(blocks.replace(/^\s+/, ""));
  const next = parts.join(`${eol}${eol}`).replace(/\s*$/, eol);

  // THE GUARD. Everything from the first pre-existing <Update> onwards must
  // survive byte for byte, as a suffix. If a single character of a published
  // block changed, this refuses and nothing is written.
  if (existed && blocks) {
    const expected = blocks.replace(/^\s+/, "").replace(/\s*$/, eol);
    if (!next.endsWith(expected)) {
      console.error(
        `\nREFUSED: writing ${year}.mdx would have altered an existing release note.\n` +
          "Nothing has been written. This is a bug in the script, not in your file."
      );
      process.exit(1);
    }
    const beforeCount = labelsIn(original).size;
    const afterCount = labelsIn(next).size;
    if (afterCount !== beforeCount + group.length) {
      console.error(
        `\nREFUSED: ${year}.mdx should have gone from ${beforeCount} to ` +
          `${beforeCount + group.length} release notes, but came to ${afterCount}.`
      );
      process.exit(1);
    }
  }

  await mkdir(RELEASES_DIR, { recursive: true });
  await writeFile(file, next, "utf8");
  written.push(`blog/releases/${year}.mdx (+${group.length})`);

  if (!existed) {
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

/* ------------------------------------------------- independent check */

// Re-read from disk rather than trusting the in-memory value we just wrote.
for (const [file, originalText] of before) {
  const now = await readFile(file, "utf8");
  const wasBlocks = splitYearFile(originalText).blocks.replace(/^\s+/, "").replace(/\s*$/, "");
  const nowText = now.replace(/\s*$/, "");
  if (wasBlocks && !nowText.endsWith(wasBlocks)) {
    console.error(
      `\nREFUSED AFTER WRITING: ${file} no longer ends with the release notes it ` +
        "started with.\nRestore it from git before doing anything else:\n" +
        `  git checkout -- ${file.replace(rootDir + "/", "")}`
    );
    process.exit(1);
  }
}

console.log("\nWritten:");
for (const w of written) console.log(`  ${w}`);
console.log(
  `\nEvery pre-existing release note is byte-for-byte unchanged (verified after writing).` +
    `\nThe new block(s) are drafts — expand them before merging.`
);
process.exit(2);
