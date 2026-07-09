// Convert the fetched Help Scout articles (HTML in data/articles.json) into
// Markdown/MDX files — one file per article — in data/markdown/.
//
// Each output file gets YAML frontmatter (title + description) so it can drop
// straight into a Mintlify docs project.
//
// Run with:  npm run convert
// (Requires data/articles.json — produce it first with `npm run example`.)

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const inFile = join(scriptDir, "..", "data", "articles.json");
const outDir = join(scriptDir, "..", "data", "markdown");

// --- Section mapping --------------------------------------------------------
// Articles are chunked into three folders. Mapping is driven by the Help Scout
// collection an article belongs to, then refined by its category.

// Help Scout collection ids (from the Docs API).
const COLLECTION = {
  DOCUMENTATION: "58fd98042c7d3a057f887b63",
  DEVELOPER_KB: "5b76b1cf0428631d7a8a1704",
  DEVELOPER_HUB: "5ae45f3a2c7d3a3f981f0b35",
  LEGACY_DEV_HUB: "58f79a282c7d3a057f886156", // "v8 - old - DO NOT USE" — excluded
};

// Categories within the Documentation collection that count as tutorials
// (the "How-to heavy" split). Everything else in Documentation is reference.
const TUTORIAL_CATEGORY_IDS = new Set([
  "58fd98530428634b4a3289b4", // Installation guide
  "58fd98772c7d3a057f887b6a", // Tips 'n Tricks
  "58fd98262c7d3a057f887b67", // Admin Guide
  "58fd985f2c7d3a057f887b69", // Sample Solutions
]);

/**
 * Decide which folder an article belongs in.
 * @returns {"Documentation"|"Tutorial"|"API Reference"|null} null = skip it.
 */
function sectionFor(article) {
  // Legacy dev articles are excluded entirely.
  if (article.collectionId === COLLECTION.LEGACY_DEV_HUB) return null;

  // Everything in the developer collections is API Reference.
  if (
    article.collectionId === COLLECTION.DEVELOPER_HUB ||
    article.collectionId === COLLECTION.DEVELOPER_KB
  ) {
    return "API Reference";
  }

  // Within Documentation: tutorial categories -> Tutorial, otherwise Documentation.
  const categories = article.categories || [];
  if (categories.some((id) => TUTORIAL_CATEGORY_IDS.has(id))) return "Tutorial";
  return "Documentation";
}

/** Folder name -> filesystem-safe directory name. */
function sectionDir(section) {
  return section.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

// --- Configure the HTML -> Markdown converter -------------------------------
const turndown = new TurndownService({
  headingStyle: "atx", // "# Heading" instead of underlines
  bulletListMarker: "-",
  codeBlockStyle: "fenced", // ```code``` instead of indented
  emDelimiter: "_",
});
turndown.use(gfm); // GitHub-flavored: tables, strikethrough, task lists

// --- Small helpers ----------------------------------------------------------

/**
 * Turn an article into a safe, UNIQUE file name, e.g. "how-to-install.mdx".
 * Some articles share a slug (drafts/backups), so on collision we append the
 * article number to avoid silently overwriting a different article.
 */
function fileNameFor(article, used) {
  const base =
    article.slug ||
    (article.name || `article-${article.number || article.id}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-") // non-alphanumerics -> hyphens
      .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens

  let name = `${base}.mdx`;
  if (used.has(name)) {
    // Slug already taken -> disambiguate with the unique article number.
    name = `${base}-${article.number || article.id}.mdx`;
  }
  used.add(name);
  return name;
}

/** Clean up the markdown Turndown produces. */
function tidy(markdown) {
  return markdown
    .replace(/ /g, " ") // non-breaking spaces (&nbsp;) -> normal spaces
    .replace(/[ \t]+$/gm, "") // strip trailing whitespace per line
    .replace(/\n{3,}/g, "\n\n") // collapse 3+ blank lines into one
    .trim();
}

/** Escape a string so it's a valid double-quoted YAML value. */
function yamlString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Build a one-line description from the article body. */
function describe(markdown) {
  const firstLine = markdown
    .replace(/^#.*$/gm, "") // drop heading lines
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return "";
  const text = firstLine.replace(/[*_`>[\]()#]/g, ""); // strip markdown syntax
  return text.length > 157 ? text.slice(0, 157) + "..." : text;
}

// --- Main -------------------------------------------------------------------

const articles = JSON.parse(await readFile(inFile, "utf8"));

let written = 0;
let empty = 0;
let skipped = 0;
const perSection = {}; // section -> count
const usedNames = {}; // section -> Set of file names (collisions scoped per folder)

for (const article of articles) {
  const section = sectionFor(article);
  if (!section) {
    skipped += 1; // legacy / excluded
    continue;
  }

  const body = tidy(turndown.turndown(article.text || ""));
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

  const dir = join(outDir, sectionDir(section));
  await mkdir(dir, { recursive: true });

  usedNames[section] ??= new Set();
  const contents = `${frontmatter}\n\n${body}\n`;
  await writeFile(join(dir, fileNameFor(article, usedNames[section])), contents, "utf8");

  written += 1;
  perSection[section] = (perSection[section] || 0) + 1;
}

console.log(`Converted ${written} articles into ${outDir}`);
for (const [section, count] of Object.entries(perSection)) {
  console.log(`  ${sectionDir(section)}/ — ${count} articles`);
}
console.log(`Skipped ${skipped} legacy article(s); ${empty} had no body content.`);
