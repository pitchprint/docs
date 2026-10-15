// Reading and writing blog/releases/<year>.mdx, with the guards that make
// "additive only" a fact rather than a promise.
//
// Shared by both release-note pipelines:
//   ingest-blog-releases.mjs   the real one — pulls from the Ghost blog
//   ingest-release-notes.mjs   drafts from docs `release:` frontmatter
//
// Only one copy of the insert logic exists, so only one thing has to be right,
// and scripts/test-release-notes.mjs exercises it from both directions.

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const rootDir = join(scriptDir, "..");
export const RELEASES_DIR = join(rootDir, "blog", "releases");

/** The file's dominant line ending. Year files are CRLF; preserve it or the
 *  whole file reports as rewritten and the real change is invisible. */
export const eolOf = (text) => (text.includes("\r\n") ? "\r\n" : "\n");

/**
 * Split a year file into the part before the first <Update> and the part from
 * it onwards. The second half is what must come through untouched.
 */
export function splitYearFile(text) {
  const m = text.match(/^<Update\b/m);
  if (!m) return { head: text.replace(/\s*$/, ""), blocks: "" };
  return {
    head: text.slice(0, m.index).replace(/\s*$/, ""),
    blocks: text.slice(m.index),
  };
}

/** Every release label already present in a year file, upper-cased. */
export function labelsIn(text) {
  return new Set(
    [...text.matchAll(/^<Update\s+label="([^"]+)"/gm)].map((m) =>
      m[1].toUpperCase()
    )
  );
}

const YEAR_FILE_INTRO =
  "Releases ship weekly on Thursdays. Subscribe with the RSS button above to " +
  "get each one as it lands.";

export function newYearFile(year, eol) {
  return [
    "---",
    `title: "${year} releases"`,
    `description: "PitchPrint release notes from ${year} — new features, improvements, and bug fixes."`,
    "rss: true",
    "---",
    "",
    YEAR_FILE_INTRO,
    "",
    "",
  ]
    .join("\n")
    .replace(/\n/g, eol);
}

/**
 * Register a brand-new year file in the sidebar, immediately above the
 * previous year. Only ever runs in January; without it both pipelines would
 * quietly stop working at every year boundary.
 */
export async function addYearToNav(year, apply) {
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
    const eol = eolOf(raw);
    await writeFile(
      docsJsonPath,
      (JSON.stringify(doc, null, 2) + "\n").replace(/\n/g, eol),
      "utf8"
    );
  }
  return { changed: true };
}

/**
 * Insert blocks at the top of a year file, above every existing release note.
 *
 * Returns the new file text, or throws. Two independent guards, because they
 * catch different failure shapes: a bug that drops a whole block slips past
 * the byte-identity check (the expected suffix shrinks with it) and is caught
 * by the count; a bug that rewrites text inside a block passes the count and
 * is caught by byte-identity. Both have been seen to fire — the test suite
 * deliberately introduces each one.
 */
export function insertBlocks(originalText, blocks, { existed = true } = {}) {
  const eol = existed ? eolOf(originalText) : "\r\n";
  const { head, blocks: tail } = splitYearFile(originalText);

  const rendered = blocks.map((b) => b.replace(/\r?\n/g, eol)).join(`${eol}${eol}`);

  const parts = [head, rendered];
  if (tail) parts.push(tail.replace(/^\s+/, ""));
  const next = parts.join(`${eol}${eol}`).replace(/\s*$/, eol);

  if (existed && tail) {
    const expected = tail.replace(/^\s+/, "").replace(/\s*$/, eol);
    if (!next.endsWith(expected)) {
      throw new Error(
        "writing this file would have altered an existing release note. " +
          "Nothing has been written. This is a bug in the script, not in your file."
      );
    }
    const before = labelsIn(originalText).size;
    const after = labelsIn(next).size;
    if (after !== before + blocks.length) {
      throw new Error(
        `this file should have gone from ${before} to ${before + blocks.length} ` +
          `release notes, but came to ${after}.`
      );
    }
  }
  return next;
}

/**
 * Re-read from disk and confirm the published notes are still there, rather
 * than trusting the value we just wrote.
 */
export async function verifyAfterWrite(file, originalText) {
  const now = await readFile(file, "utf8");
  const wasBlocks = splitYearFile(originalText)
    .blocks.replace(/^\s+/, "")
    .replace(/\s*$/, "");
  if (wasBlocks && !now.replace(/\s*$/, "").endsWith(wasBlocks)) {
    throw new Error(
      `${file} no longer ends with the release notes it started with. ` +
        `Restore it from git before doing anything else.`
    );
  }
}
