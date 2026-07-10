// Convert the fetched Help Scout articles (HTML in data/articles.json) into
// Mintlify MDX pages, chunked into three section folders under data/markdown/:
//   data/markdown/documentation/
//   data/markdown/tutorial/
//   data/markdown/api-reference/
//
// This is the SOURCE of the docs content. Run `npm run publish` afterwards to
// copy these into the docs tree Mintlify serves and build the navigation.
//
// Run with:  npm run convert
// (Requires data/articles.json — produce it first with `npm run example`.)

import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(scriptDir, "..");
const inFile = join(rootDir, "data", "articles.json");
const outDir = join(rootDir, "data", "markdown");

// --- Section + category mapping ---------------------------------------------

const COLLECTION = {
  DOCUMENTATION: "58fd98042c7d3a057f887b63",
  DEVELOPER_KB: "5b76b1cf0428631d7a8a1704",
  DEVELOPER_HUB: "5ae45f3a2c7d3a3f981f0b35",
  LEGACY_DEV_HUB: "58f79a282c7d3a057f886156", // "v8 - old - DO NOT USE" — excluded
};

// Categories (within Documentation) that count as tutorials — "How-to heavy".
const TUTORIAL_CATEGORY_IDS = new Set([
  "58fd98530428634b4a3289b4", // Installation guide
  "58fd98772c7d3a057f887b6a", // Tips 'n Tricks
  "58fd98262c7d3a057f887b67", // Admin Guide
  "58fd985f2c7d3a057f887b69", // Sample Solutions
]);

// section display name -> folder name
const SECTION_DIRS = {
  Documentation: "documentation",
  Tutorial: "tutorial",
  "API Reference": "api-reference",
};

/** Which section folder an article belongs in (null = skip). */
function sectionFor(article) {
  if (article.collectionId === COLLECTION.LEGACY_DEV_HUB) return null;
  if (
    article.collectionId === COLLECTION.DEVELOPER_HUB ||
    article.collectionId === COLLECTION.DEVELOPER_KB
  ) {
    return "API Reference";
  }
  const cats = article.categories || [];
  if (cats.some((id) => TUTORIAL_CATEGORY_IDS.has(id))) return "Tutorial";
  return "Documentation";
}

// --- HTML -> Markdown converter ---------------------------------------------
const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "_",
});
turndown.use(gfm);

// --- Helpers ----------------------------------------------------------------

/** Safe, UNIQUE slug within a folder. On collision, append the article number. */
function fileNameFor(article, used) {
  const base =
    article.slug ||
    (article.name || `article-${article.number || article.id}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  let name = base || `article-${article.number || article.id}`;
  if (used.has(name)) name = `${name}-${article.number || article.id}`;
  used.add(name);
  return name;
}

/** Clean up Turndown output. */
function tidy(markdown) {
  return markdown
    .replace(/ /g, " ") // &nbsp; -> normal space
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Make markdown safe for the MDX compiler. MDX treats `{` and `<` as the start
 * of JS expressions / JSX, which breaks the build when they appear in prose
 * (template code, HTML shown as examples, etc.). We escape those characters —
 * but only OUTSIDE code spans/blocks, where they're already literal.
 */
function sanitizeMdx(markdown) {
  const parts = [];
  // Sentinel is ASCII and contains none of <, {, } so the escaping step below
  // leaves it untouched, and it can't collide with real article content.
  const stash = (m) => {
    parts.push(m);
    return `@@PROTECTED_${parts.length - 1}@@`;
  };

  // Protect genuine code from escaping: fenced blocks first, then inline code.
  // The inline pattern requires REAL backticks — a backslash-escaped backtick
  // is literal text (a JS snippet Turndown flattened into prose), not a code
  // delimiter, so the { and < inside it must still be escaped.
  let out = markdown
    .replace(/```[\s\S]*?```/g, stash)
    .replace(/(?<!\\)`[^`\n]+`/g, stash);

  // Escape the MDX-significant characters in the remaining prose.
  out = out
    .replace(/</g, "&lt;")
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;");

  // Restore the protected code regions verbatim.
  return out.replace(/@@PROTECTED_(\d+)@@/g, (_, i) => parts[Number(i)]);
}

/** Escape a string as a double-quoted YAML value. */
function yamlString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** One-line description from the body. */
function describe(markdown) {
  const firstLine = markdown
    .replace(/^#.*$/gm, "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return "";
  const text = firstLine.replace(/[*_`>[\]()#]|&#12[35];|&lt;/g, "").trim();
  return text.length > 157 ? text.slice(0, 157) + "..." : text;
}

// --- Main -------------------------------------------------------------------

const articles = JSON.parse(await readFile(inFile, "utf8"));

// Start fresh so removed/renamed articles don't linger.
await rm(outDir, { recursive: true, force: true });

let written = 0;
let skipped = 0;
let empty = 0;
const perSection = {};
const usedNames = {}; // dir -> Set

for (const article of articles) {
  const section = sectionFor(article);
  if (!section) {
    skipped += 1;
    continue;
  }

  const dir = SECTION_DIRS[section];
  const body = sanitizeMdx(tidy(turndown.turndown(article.text || "")));
  if (!body) empty += 1;

  const description = describe(body);
  const frontmatter = [
    "---",
    `title: ${yamlString(article.name || "Untitled")}`,
    description ? `description: ${yamlString(description)}` : null,
    "---",
  ]
    .filter(Boolean)
    .join("\n");

  usedNames[dir] ??= new Set();
  const slug = fileNameFor(article, usedNames[dir]);
  await mkdir(join(outDir, dir), { recursive: true });
  await writeFile(join(outDir, dir, `${slug}.mdx`), `${frontmatter}\n\n${body}\n`, "utf8");

  written += 1;
  perSection[dir] = (perSection[dir] || 0) + 1;
}

console.log(`Converted ${written} articles into ${outDir}`);
for (const [dir, count] of Object.entries(perSection)) {
  console.log(`  ${dir}/ — ${count} pages`);
}
console.log(`Skipped ${skipped} legacy article(s); ${empty} had no body content.`);
