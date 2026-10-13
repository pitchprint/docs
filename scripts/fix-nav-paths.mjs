// Rewrite docs.json navigation page paths into Mintlify's documented form.
//
// Mintlify expects a page entry to be a bare path relative to the project root,
// with no leading slash and no extension:
//
//     "pages": ["docs/documentation/quickstart"]      correct
//     "pages": ["/docs/documentation/quickstart"]     what this repo has
//
// The site still serves correctly with the leading slash, because routes are
// derived from file paths. But `mint broken-links` resolves link targets against
// the pages registered from the navigation, and the leading slash stops them
// registering — so every internal link in the project reports as broken. That is
// the 430-false-positive problem.
//
// What it touches: strings inside `pages` arrays, nothing else. Specifically it
// does NOT touch `redirects` (those are real URL routes and must keep their
// leading slash), anchors, or any external href.
//
//   node scripts/fix-nav-paths.mjs            show what would change
//   node scripts/fix-nav-paths.mjs --write    apply, after writing docs.json.bak
//
// AFTER APPLYING, TEST BEFORE COMMITTING:
//   npx mint dev            sidebar renders? pages resolve?
//   npx mint broken-links   count should collapse
//
// To undo:  move docs.json.bak back over docs.json

import { readFile, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const docsJsonPath = join(scriptDir, "..", "docs.json");
const backupPath = docsJsonPath + ".bak";

const WRITE = process.argv.includes("--write");

if (!existsSync(docsJsonPath)) {
  console.error("docs.json not found next to scripts/.");
  process.exit(1);
}

const raw = await readFile(docsJsonPath, "utf8");
const doc = JSON.parse(raw);

const changes = [];
const untouched = [];

/**
 * Walk the navigation tree and normalise strings found in `pages` arrays.
 * Deliberately narrow: anything not inside a `pages` array is left alone.
 */
function walk(node, inPages = false) {
  if (typeof node === "string") {
    if (!inPages) return node;
    if (node.startsWith("/")) {
      const fixed = node.replace(/^\/+/, "");
      changes.push([node, fixed]);
      return fixed;
    }
    untouched.push(node);
    return node;
  }
  if (Array.isArray(node)) return node.map((n) => walk(n, inPages));
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      // `pages` is the only key whose strings are page paths.
      out[k] = walk(v, k === "pages");
    }
    return out;
  }
  return node;
}

if (!doc.navigation) {
  console.error("docs.json has no navigation block. Nothing to do.");
  process.exit(1);
}

doc.navigation = walk(doc.navigation);

/* --------------------------------------------------------------- report */

console.log(`${changes.length} page path(s) would be rewritten.`);
console.log(`${untouched.length} already in the correct form.`);
if (doc.redirects) {
  console.log(`${doc.redirects.length} redirect(s) left untouched — those are URL routes and keep their leading slash.`);
}

if (changes.length) {
  console.log("\nSample:");
  for (const [from, to] of changes.slice(0, 8)) {
    console.log(`  ${from}`);
    console.log(`    -> ${to}`);
  }
  if (changes.length > 8) console.log(`  ... and ${changes.length - 8} more`);
}

// Every rewritten path must correspond to a real file, or the sidebar breaks.
const missing = [];
for (const [, to] of changes) {
  const candidates = [`${to}.mdx`, `${to}.md`, `${to}/index.mdx`];
  if (!candidates.some((c) => existsSync(join(scriptDir, "..", c)))) missing.push(to);
}
if (missing.length) {
  console.error(`\nSTOP — ${missing.length} rewritten path(s) match no file on disk:`);
  for (const m of missing.slice(0, 10)) console.error(`  ${m}`);
  console.error("\nThat would break the sidebar. Nothing written. Investigate these first.");
  process.exit(1);
}
console.log(`\nAll ${changes.length} rewritten path(s) resolve to a real file.`);

if (!WRITE) {
  console.log("\nDry run — nothing written. Re-run with --write to apply.");
  process.exit(0);
}

await copyFile(docsJsonPath, backupPath);

// Preserve the file's existing line endings so the diff is the paths only.
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const out = (JSON.stringify(doc, null, 2) + "\n").replace(/\n/g, eol);
await writeFile(docsJsonPath, out, "utf8");

console.log(`\nApplied. Backup at ${backupPath}`);
console.log("\nTEST BEFORE COMMITTING:");
console.log("  npx mint dev            sidebar renders? pages resolve?");
console.log("  npx mint broken-links   count should collapse");
console.log("\nTo undo:  move docs.json.bak back over docs.json");
