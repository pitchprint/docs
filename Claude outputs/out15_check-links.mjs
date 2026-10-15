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

import { readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
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

console.log(`Running: ${process.env.MINT_CMD || "npx --yes mint broken-links"}`);

// Capture by redirecting to a file rather than through stdio pipes. On Windows
// the piped capture came back completely empty — no summary line, no links —
// while the same command printed 430 results when run by hand. A shell redirect
// is what the terminal itself does, so it behaves the same way everywhere.
// `npx --yes mint` rather than `mint@latest`: pinning @latest forces a fresh
// download on every single run, which fails outright when the npm cache is
// damaged or the disk is full — exactly what happened here. Without the pin it
// uses whatever is already cached locally, and still installs cleanly in CI
// where nothing is cached. Override with MINT_CMD if you need a specific build.
const MINT = process.env.MINT_CMD || "npx --yes mint broken-links";

const logFile = join(tmpdir(), `mint-broken-links-${process.pid}.txt`);
const res = spawnSync(`${MINT} > "${logFile}" 2>&1`, {
  cwd: rootDir,
  encoding: "utf8",
  shell: true,
  maxBuffer: 32 * 1024 * 1024,
});

let output = "";
try {
  output = await readFile(logFile, "utf8");
} catch {
  output = `${res.stdout || ""}\n${res.stderr || ""}`; // fall back to the pipes
}
try { await rm(logFile, { force: true }); } catch {}

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

// mint prefixes each link with a box-drawing character. Do NOT match on it:
// through spawnSync on Windows the console codepage mangles it, the regex misses
// every link, and the script silently records an empty baseline — a check that
// checks nothing. Match on the shape of the link instead, and let the summary
// guard below catch any parse failure that slips through anyway.
const LINK = /(?:^|\s)((?:https?:\/\/|\/|\.{1,2}\/|#)\S*)\s*$/;

for (const rawLine of output.split(/\r?\n/)) {
  const line = rawLine.replace(/\u001b\[[0-9;]*[A-Za-z]/g, ""); // strip ANSI

  // A file heading starts at column 0 and ends in .md/.mdx.
  const fileMatch = line.match(/^(\S.*\.mdx?)\s*$/);
  if (fileMatch) {
    currentFile = norm(fileMatch[1]);
    continue;
  }

  // A link line is indented and ends in something link-shaped.
  if (currentFile && /^\s/.test(line)) {
    const m = line.match(LINK);
    if (m) {
      const entry = `${currentFile}::${m[1].trim()}`;
      if (PUBLISHED.some((p) => currentFile.startsWith(p))) found.add(entry);
      else skipped.add(entry);
      continue;
    }
  }

  if (!line.trim()) currentFile = null;
}

// What mint itself claims, so a parse failure cannot pass as a clean result.
const summary = output.match(/found\s+(\d+)\s+broken links?\s+in\s+(\d+)\s+files?/i);
const claimed = summary ? Number(summary[1]) : null;

console.log(
  `\nmint reported: ${claimed === null ? "(no summary line found)" : `${claimed} broken link(s)`}`
);
console.log(
  `parsed: ${found.size} in published content` +
    (skipped.size ? `, ${skipped.size} outside docs/ and blog/` : "")
);

// The guard. If mint found problems and we parsed none, the output format has
// changed or the encoding mangled it — either way, recording that as "nothing
// broken" would be worse than failing.
const unreadable =
  claimed === null || (claimed > 0 && found.size + skipped.size === 0);

if (unreadable) {
  console.error(
    claimed === null
      ? "\nCould not find mint's summary line in its output, so there is no way to\n" +
        "confirm what it actually found. Refusing to continue: an empty baseline\n" +
        "written from unreadable output would make this check pass forever.\n\n" +
        "What mint printed:\n"
      : `\nCould not parse mint's output: it reported ${claimed} broken link(s) but none were read.\n` +
        "Refusing to continue — writing a baseline from this would record an empty set\n" +
        "and the check would silently pass forever.\n\n" +
        "What mint printed:\n"
  );
  const lines = output.split(/\r?\n/).filter((l) => l.trim());
  console.error(
    lines.slice(-25).map((l) => `  | ${l}`).join("\n") ||
      "  | (nothing at all — mint produced no output)"
  );
  console.error(`\n  exit code: ${res.status}`);
  if (res.status !== 0) {
    console.error(
      "\n  mint did not run successfully. Common causes:\n" +
        "    - a damaged npm cache:  npm cache clean --force\n" +
        "    - no disk space for the download\n" +
        "    - no network access to the npm registry\n" +
        "  Try `npx mint broken-links` by hand; if that works and this does not,\n" +
        "  set MINT_CMD to the command that works for you."
    );
  }
  process.exit(1);
}

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
