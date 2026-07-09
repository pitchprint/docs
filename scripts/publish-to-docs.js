// Publish the section-grouped markdown from data/markdown/ into the docs tree
// that Mintlify serves, and regenerate the docs.json navigation.
//
// Source:  data/markdown/{documentation,tutorial,api-reference}/*.mdx
// Output:  <root>/{documentation,tutorial,api-reference}/*.mdx  (served pages)
//          docs.json navigation (a tab per section)
//
// Run with:  npm run publish   (run `npm run convert` first to produce the source)

import { readdir, readFile, writeFile, mkdir, rm, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(scriptDir, "..");
const srcDir = join(rootDir, "data", "markdown");
const docsJsonPath = join(rootDir, "docs.json");

// Section folder -> the tab label shown in Mintlify.
const SECTIONS = [
  { dir: "documentation", tab: "Documentation" },
  { dir: "tutorial", tab: "Tutorial" },
  { dir: "api-reference", tab: "API Reference" },
];

/** Read the `title:` from a file's YAML frontmatter (for nav ordering). */
async function readTitle(filePath, fallback) {
  const text = await readFile(filePath, "utf8");
  const match = text.match(/^title:\s*"?(.*?)"?\s*$/m);
  return match ? match[1] : fallback;
}

const tabs = [
  // Preserve the starter's Getting Started pages.
  { tab: "Guides", groups: [{ group: "Getting Started", pages: ["index", "quickstart"] }] },
];

for (const { dir, tab } of SECTIONS) {
  const srcSection = join(srcDir, dir);
  const destSection = join(rootDir, dir);

  // Recreate the served folder from scratch so stale pages don't linger.
  await rm(destSection, { recursive: true, force: true });
  await mkdir(destSection, { recursive: true });

  const files = (await readdir(srcSection)).filter((f) => f.endsWith(".mdx"));

  const pages = [];
  for (const file of files) {
    await copyFile(join(srcSection, file), join(destSection, file));
    const slug = file.replace(/\.mdx$/, "");
    const title = await readTitle(join(srcSection, file), slug);
    pages.push({ path: `${dir}/${slug}`, title });
  }

  pages.sort((a, b) => a.title.localeCompare(b.title));
  tabs.push({ tab, groups: [{ group: tab, pages: pages.map((p) => p.path) }] });
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
  console.log(`  ${t.tab} — ${n} pages`);
}
