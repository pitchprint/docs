// Group docs articles by their `release` frontmatter and generate ONE blog
// release note per release, ready to publish on the (separate) Mintlify blog
// site. Each docs article is a single topic; a release note bundles every
// article that shares the same `release` value into one post — one section per
// topic — mirroring the blog's "Release WKxx-yy" format.
//
// This is a TEMPLATE generator — no LLM.
//
// Article frontmatter contract (add to any docs article shipping in a release):
//   ---
//   title: "Canvas Adjuster Module"
//   release: "wk26-26"                 # which release note this belongs to
//   release_summary: "Set predefined and custom values at the same time."  # optional
//   ---
//
// Usage:
//   node scripts/generate-blog-summaries.js
//     Scans SCAN_DIRS, groups articles by `release`, and writes one release
//     note per release to OUTPUT_DIR. (The GitHub Action runs this, then commits
//     only the posts that actually changed into the blog repo.)
//
// Env overrides:
//   SCAN_DIRS     comma-separated folders to scan (default "documentation,tutorial,api-reference")
//   OUTPUT_DIR    where generated release notes are written (default "dist/blog-posts")
//   DOCS_BASE_URL base URL of this docs site, used for the per-topic "Learn more"
//                 backlinks (default "https://docs.pitchprint.com")

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(scriptDir, "..");

const SCAN_DIRS = (
  process.env.SCAN_DIRS || "documentation,tutorial,api-reference"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const OUTPUT_DIR = process.env.OUTPUT_DIR || join("dist", "blog-posts");
const DOCS_BASE_URL = (
  process.env.DOCS_BASE_URL || "https://docs.pitchprint.com"
).replace(/\/+$/, "");

// --- Frontmatter parsing -----------------------------------------------------

/** Parse a small YAML subset: `key: value`, quoted strings, booleans, arrays. */
function parseFrontmatter(rawInput) {
  // Normalize CRLF/CR (Windows/legacy) so the frontmatter regex matches.
  const raw = rawInput.replace(/\r\n?/g, "\n");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw.trim() };

  const frontmatter = {};
  for (const line of match[1].split("\n")) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    const value = rawValue.trim();
    if (value === "true" || value === "false") {
      frontmatter[key] = value === "true";
    } else if (value.startsWith("[") && value.endsWith("]")) {
      frontmatter[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else {
      frontmatter[key] = value.replace(/^["']|["']$/g, "");
    }
  }
  return { frontmatter, body: match[2].trim() };
}

/** First non-empty, non-heading, non-bullet paragraph — the lede. */
function firstParagraph(body) {
  for (const block of body.split(/\n\s*\n/)) {
    const text = block.trim();
    if (!text || text.startsWith("#") || text.startsWith("-")) continue;
    return text.replace(/\s+/g, " ");
  }
  return "";
}

// --- Rendering ---------------------------------------------------------------

/** Escape a string for a double-quoted YAML value. */
function yamlString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** "wk26-26" -> "Release WK26-26". A `release_title` on any article wins. */
function releaseTitle(releaseId, articles) {
  const override = articles.find((a) => a.frontmatter.release_title);
  if (override) return override.frontmatter.release_title;
  return `Release ${releaseId.toUpperCase()}`;
}

/** Build one blog release note from all articles sharing a release id. */
function renderReleaseNote(releaseId, articles) {
  const title = releaseTitle(releaseId, articles);
  const topics = [...articles].sort((a, b) =>
    (a.frontmatter.title || "").localeCompare(b.frontmatter.title || "")
  );
  const label = articles.find((a) => a.frontmatter.date)?.frontmatter.date
    || releaseId.toUpperCase();

  const description =
    `What's new in ${title}: ` +
    topics.map((t) => t.frontmatter.title || t.slug).join(", ") + ".";

  const lines = [
    "---",
    `title: ${yamlString(title)}`,
    `description: ${yamlString(description.slice(0, 157))}`,
    "---",
    "",
    `<Update label=${yamlString(label)} tags={["release"]}>`,
    "",
    "## What's new 🚀",
  ];

  for (const t of topics) {
    const topicTitle = t.frontmatter.title || t.slug;
    const summary =
      t.frontmatter.release_summary ||
      t.frontmatter.description ||
      firstParagraph(t.body);
    const url = `${DOCS_BASE_URL}/${t.path.replace(/\.mdx$/, "")}`;
    lines.push(
      "",
      `### ${topicTitle}`,
      "",
      summary,
      "",
      `[Learn more →](${url})`
    );
  }

  lines.push("", "</Update>", "");
  return lines.join("\n");
}

// --- Main --------------------------------------------------------------------

/** Collect every article across SCAN_DIRS that has a `release` value. */
async function collectReleaseArticles() {
  const byRelease = new Map();
  for (const dir of SCAN_DIRS) {
    const abs = join(rootDir, dir);
    if (!existsSync(abs)) continue;
    for (const file of await readdir(abs)) {
      if (!file.endsWith(".mdx")) continue;
      const relPath = `${dir}/${file}`;
      const parsed = parseFrontmatter(await readFile(join(abs, file), "utf8"));
      const release = parsed.frontmatter.release;
      if (!release) continue;
      const entry = { ...parsed, path: relPath, slug: basename(file, ".mdx") };
      if (!byRelease.has(release)) byRelease.set(release, []);
      byRelease.get(release).push(entry);
    }
  }
  return byRelease;
}

const byRelease = await collectReleaseArticles();
const outDir = join(rootDir, OUTPUT_DIR);

if (byRelease.size === 0) {
  console.log("No articles have a `release:` frontmatter value. Nothing to do.");
  process.exit(0);
}

await mkdir(outDir, { recursive: true });
for (const [releaseId, articles] of byRelease) {
  const post = renderReleaseNote(releaseId, articles);
  const outName = `release-${releaseId}.mdx`;
  await writeFile(join(outDir, outName), post, "utf8");
  console.log(
    `  generated ${OUTPUT_DIR}/${outName}  (${articles.length} topic(s): ` +
      articles.map((a) => a.frontmatter.title || a.slug).join(", ") + ")"
  );
}

console.log(`\nDone. ${byRelease.size} release note(s) generated.`);
