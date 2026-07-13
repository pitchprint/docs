// Publish the converted markdown + hand-authored pages into the docs tree that
// Mintlify serves, and regenerate the docs.json navigation.
//
// Sources:
//   data/markdown/<section>/*.mdx      converted from Help Scout (via `npm run convert`)
//   data/markdown/nav-manifest.json    section -> ordered groups -> pages
//   data/pages/<section>/*.mdx         hand-authored pages (e.g. the API Introduction)
//
// Output:
//   <root>/{documentation,tutorial,api-reference}/*.mdx   served pages
//   docs.json navigation (a tab per section, grouped by category)
//
// Run with:  npm run publish   (run `npm run convert` first)

import { readdir, readFile, writeFile, mkdir, rm, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(scriptDir, "..");
const srcDir = join(rootDir, "data", "markdown");
const handwrittenDir = join(rootDir, "data", "pages");
const docsJsonPath = join(rootDir, "docs.json");

// dir = served folder + source subfolder; tab = Mintlify tab label = manifest key.
const SECTIONS = [
  { dir: "documentation", tab: "Documentation" },
  { dir: "tutorial", tab: "Tutorial" },
  { dir: "api-reference", tab: "API Reference" },
];

// Sidebar group that hand-authored pages are placed in (shown first in the tab).
const HANDWRITTEN_GROUP = { "api-reference": "Get Started" };

/** Read the `title:` from a file's YAML frontmatter. */
async function readTitle(filePath, fallback) {
  const text = await readFile(filePath, "utf8");
  const match = text.match(/^title:\s*"?(.*?)"?\s*$/m);
  return match ? match[1] : fallback;
}

const manifest = JSON.parse(await readFile(join(srcDir, "nav-manifest.json"), "utf8"));
const tabs = [];

for (const { dir, tab } of SECTIONS) {
  const destSection = join(rootDir, dir);

  // Recreate the served folder from scratch so stale pages don't linger.
  await rm(destSection, { recursive: true, force: true });
  await mkdir(destSection, { recursive: true });

  const groups = [];

  // 1. Hand-authored pages first (e.g. the API Introduction), in their own group.
  const handSection = join(handwrittenDir, dir);
  if (existsSync(handSection)) {
    const files = (await readdir(handSection)).filter((f) => f.endsWith(".mdx"));
    const pages = [];
    for (const file of files) {
      await copyFile(join(handSection, file), join(destSection, file));
      const slug = file.replace(/\.mdx$/, "");
      pages.push({ path: `${dir}/${slug}`, title: await readTitle(join(handSection, file), slug) });
    }
    if (pages.length) {
      pages.sort((a, b) => a.title.localeCompare(b.title));
      groups.push({ group: HANDWRITTEN_GROUP[dir] || "Overview", pages: pages.map((p) => p.path) });
    }
  }

  // 2. Converted pages, grouped per the manifest.
  for (const { group, pages } of manifest[tab] || []) {
    for (const { path } of pages) {
      await copyFile(join(srcDir, `${path}.mdx`), join(rootDir, `${path}.mdx`));
    }
    groups.push({ group, pages: pages.map((p) => p.path) });
  }

  tabs.push({ tab, groups });
}

// Update docs.json: swap the navigation for tabs, keep global anchors.
const docs = JSON.parse(await readFile(docsJsonPath, "utf8"));
docs.navigation = {
  tabs,
  ...(docs.navigation.global ? { global: docs.navigation.global } : {}),
};
await writeFile(docsJsonPath, JSON.stringify(docs, null, 2) + "\n", "utf8");

console.log("Published pages into the docs tree and updated docs.json:");
for (const t of tabs) {
  const n = t.groups.reduce((s, g) => s + g.pages.length, 0);
  console.log(`  ${t.tab} — ${n} pages, ${t.groups.length} groups`);
}
