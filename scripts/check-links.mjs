// Run `mint broken-links` and compare the result against a committed baseline.
//
// WHY THIS EXISTS
//
// `mint broken-links` reports ~430 broken links in this repository, and every
// one that has been checked is a false positive: the target file exists, the
// target is listed in docs.json navigation, and the link renders correctly on
// the live site. Ruled out as causes, by testing rather than assumption:
//
//   - leading slashes in navigation page paths  (fixed; no change in the count)
//   - the navigation.products[] structure       (reproduced in isolation; fine)
//   - the link format itself                    (isolated test: "/docs/x/y" is
//                                                the correct, accepted form —
//                                                only "/x/y" is rejected)
//   - targets missing from the navigation       (all present)
//   - targets missing from disk                 (all present)
//
// Whatever the cause, the tool cannot currently validate this project, so its
// raw output is noise. Suppressing it entirely would mean a genuinely broken
// link added next month goes unnoticed — so instead the known set is recorded
// here and only *new* breakage fails.
//
//   npm run links           compare against the baseline
//   npm run links -- --write  accept the current state as the new baseline
//
// Exits non-zero only when a link breaks that was not broken before.
//
// Re-test the root cause occasionally — if a Mintlify release fixes it, the
// baseline will show hundreds of "fixed" entries and can be deleted.

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(scriptDir, "..");
const baselinePath = join(scriptDir, "known-broken-links.json");

const WRITE = process.argv.includes("--write");

// Only these trees are published. mint also scans scripts/, data/pages/ and any
// scratch folder lying around; breakage reported there is meaningless.
const PUBLISHED = ["docs/", "blog/"];

/* ------------------------------------------------------------------- run */

console.log("Running mint broken-links…");
const res = spawnSync("npx", ["--yes", "mint@latest", "broken-links"], {
  cwd: rootDir,
  encoding: "utf8",
  shell: process.platform === "win32",
  maxBuffer: 32 * 1024 * 1024,
});

const output = `${res.stdout || ""}\n${res.stderr || ""}`;

if (res.error) {
  console.error(`Could not run mint: ${res.error.message}`);
  process.exit(0); // never block on tooling trouble
}

/* ----------------------------------------------------------------- parse */

/** Windows prints backslashes; CI prints forward slashes. Normalise both. */
const norm = (p) => p.replace(/\\/g, "/").trim();

const found = new Set();
const skipped = new Set();
let currentFile = null;

for (const rawLine of output.split(/\r?\n/)) {
  const line = rawLine.replace(/\u001b\[[0-9;]*[A-Za-z]/g, ""); // strip ANSI
  const linkMatch = line.match(/^\s*(?:⎿|└|\|_)\s+(\S.*)$/);
  if (linkMatch && currentFile) {
    const entry = `${currentFile}::${linkMatch[1].trim()}`;
    if (PUBLISHED.some((p) => currentFile.startsWith(p))) found.add(entry);
    else skipped.add(entry);
    continue;
  }
  const fileMatch = line.match(/^(\S.*\.mdx?)\s*$/);
  if (fileMatch) {
    currentFile = norm(fileMatch[1]);
    continue;
  }
  if (!line.trim()) currentFile = null;
}

console.log(
  `\n${found.size} reported in published content` +
    (skipped.size ? `, ${skipped.size} ignored outside docs/ and blog/` : "")
);

/* -------------------------------------------------------------- compare */

const baseline = existsSync(baselinePath)
  ? new Set(JSON.parse(await readFile(baselinePath, "utf8")).links || [])
  : null;

if (baseline === null && !WRITE) {
  console.error(
    "\nNo baseline yet. Record the current state once with:\n" +
      "  npm run links -- --write\n\n" +
      "Then commit scripts/known-broken-links.json."
  );
  process.exit(1);
}

if (WRITE) {
  await writeFile(
    baselinePath,
    JSON.stringify(
      {
        _comment:
          "Known-broken links, almost certainly false positives from mint broken-links — " +
          "see the header of scripts/check-links.mjs. Only links NOT in this list fail the " +
          "build. Refresh with `npm run links -- --write` after deliberately changing links.",
        recordedAt: new Date().toISOString(),
        count: found.size,
        links: [...found].sort(),
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
  console.log(`\nBaseline written: ${found.size} link(s) recorded.`);
  console.log("Commit scripts/known-broken-links.json.");
  process.exit(0);
}

const added = [...found].filter((l) => !baseline.has(l));
const fixed = [...baseline].filter((l) => !found.has(l));

if (fixed.length) {
  console.log(`\n${fixed.length} link(s) in the baseline no longer report as broken.`);
  if (fixed.length > 50) {
    console.log("That is a lot — a Mintlify release may have fixed the underlying problem.");
    console.log("Worth re-testing whether the baseline is needed at all.");
  }
  console.log("Refresh the baseline with: npm run links -- --write");
}

if (!added.length) {
  console.log("\nNo new broken links.");
  process.exit(0);
}

console.error(`\n${added.length} NEW broken link(s) — these were not broken before:\n`);
const byFile = {};
for (const a of added) {
  const [f, l] = a.split("::");
  (byFile[f] ||= []).push(l);
}
for (const [f, links] of Object.entries(byFile)) {
  console.error(`  ${f}`);
  for (const l of links) console.error(`    -> ${l}`);
}
console.error(
  "\nIf these are genuine, fix the links. If they are more false positives,\n" +
    "accept them with: npm run links -- --write"
);
process.exit(1);
