// Publish generated + hand-authored pages into the tree Mintlify serves, and
// write the Documentation product's navigation from committed config.
//
// The ordering principle: Help Scout is the source of CONTENT, this repo is the
// source of STRUCTURE. A sync can add, change or remove pages; it can never
// reshape the sidebar, move a page between sections, or delete a hand-authored
// page. Every editorial decision lives in a committed file:
//
//   scripts/nav.json        the sidebar, verbatim — tabs, nested groups, order
//   scripts/sections.json   slug -> section, overriding Help Scout's mapping
//   scripts/exclude.json    articles that must never be published
//   data/pages/<section>/   hand-authored pages, not derived from Help Scout
//
// Sources:
//   data/markdown/<section>/*.mdx    converted from Help Scout (`npm run convert`)
//   data/pages/<section>/*.mdx       hand-authored, committed
//
// Output:
//   docs/{documentation,tutorial,api-reference}/*.mdx
//   docs.json — the "Documentation" product's tabs only. Every other product
//   (notably Blog) and every top-level setting is left exactly as found.
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

// Served pages sit under this folder, which becomes the leading URL segment:
// the site is hosted at the domain root with no Mintlify base path, so
// docs/tutorial/x.mdx serves at pitchprint.com/docs/tutorial/x.
const SERVED_ROOT = "docs";
const SECTION_DIRS = ["documentation", "tutorial", "api-reference"];

const navConfig = JSON.parse(await readFile(join(scriptDir, "nav.json"), "utf8"));
const OWNED_PRODUCT = navConfig.product;

// ---------------------------------------------------------------------------
// DEPRECATED as an automated step, and deliberately hard to run.
//
// The Help Scout import was a one-time seed. Every page under docs/ has since
// been rewritten by hand into richer MDX, and the API Reference was rebuilt as
// OpenAPI playground pages backed by docs/api-reference/openapi.json. Help Scout
// is now the STALE copy of all of it, so running this replaces the site with
// worse, older prose. It is kept only for a future deliberate re-seed.
//
// The scheduled job runs `npm run drift` instead, which reports Help Scout
// changes and never writes into docs/.
// ---------------------------------------------------------------------------
if (!process.argv.includes("--overwrite-docs")) {
  console.error(
    "publish-to-docs.js OVERWRITES the hand-written docs/ tree from Help Scout content.\n" +
      "\n" +
      "Every published page has diverged from Help Scout: the live pages are hand-authored\n" +
      "MDX and the API Reference pages are OpenAPI pointers with no Help Scout equivalent.\n" +
      "Running this would replace them with the converted originals.\n" +
      "\n" +
      "For a routine check of what support changed in Help Scout, use:\n" +
      "    npm run drift\n" +
      "\n" +
      "If you genuinely intend to re-seed from Help Scout, commit your work first, then:\n" +
      "    node scripts/publish-to-docs.js --overwrite-docs\n"
  );
  process.exit(1);
}

/** Read the `title:` from a file's YAML frontmatter. */
async function readTitle(filePath, fallback) {
  const text = await readFile(filePath, "utf8");
  const match = text.match(/^title:\s*"?(.*?)"?\s*$/m);
  return match ? match[1] : fallback;
}

/** Every .mdx basename in a folder, without extension. */
async function slugsIn(dir) {
  if (!existsSync(dir)) return [];
  return (await readdir(dir)).filter((f) => f.endsWith(".mdx")).map((f) => f.slice(0, -4));
}

/* ------------------------------------------------- 1. lay down the page files */

await mkdir(join(rootDir, SERVED_ROOT), { recursive: true });

const published = new Map(); // section -> Set(slug)

for (const dir of SECTION_DIRS) {
  const dest = join(rootDir, SERVED_ROOT, dir);

  // Non-.mdx assets in the served folder are not reproducible from any source —
  // docs/api-reference/openapi.json drives eight OpenAPI playground pages and
  // exists nowhere else. Hold them aside across the rebuild.
  const assets = [];
  if (existsSync(dest)) {
    for (const f of await readdir(dest)) {
      if (!f.endsWith(".mdx")) assets.push([f, await readFile(join(dest, f))]);
    }
  }

  // Recreate from scratch so articles deleted in Help Scout don't linger.
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });

  for (const [name, buf] of assets) {
    await writeFile(join(dest, name), buf);
  }
  if (assets.length) {
    console.log(`  ${dir}/ — preserved ${assets.length} non-page asset(s): ${assets.map(([n]) => n).join(", ")}`);
  }

  const slugs = new Set();

  for (const slug of await slugsIn(join(srcDir, dir))) {
    await copyFile(join(srcDir, dir, `${slug}.mdx`), join(dest, `${slug}.mdx`));
    slugs.add(slug);
  }

  // Hand-authored pages are copied last so they win any name clash.
  for (const slug of await slugsIn(join(handwrittenDir, dir))) {
    await copyFile(join(handwrittenDir, dir, `${slug}.mdx`), join(dest, `${slug}.mdx`));
    slugs.add(slug);
  }

  published.set(dir, slugs);
}

/* ----------------------------------- 2. navigation, verbatim from nav.json */

/** Collect every page path referenced anywhere in a tab, at any nesting depth. */
function referencedPaths(node, out = new Set()) {
  if (typeof node === "string") out.add(node);
  else if (Array.isArray(node)) node.forEach((n) => referencedPaths(n, out));
  else if (node && typeof node === "object") {
    if (typeof node.page === "string") out.add(node.page);
    if (typeof node.root === "string") out.add(node.root);
    for (const key of ["pages", "groups", "tabs"]) {
      if (Array.isArray(node[key])) referencedPaths(node[key], out);
    }
  }
  return out;
}

// Deep copy so we never mutate the loaded config.
const tabs = JSON.parse(JSON.stringify(navConfig.tabs));
const referenced = referencedPaths(tabs);

/** Does a nav path resolve to a file on disk? */
function resolves(path) {
  const rel = path.replace(/^\//, "").replace(new RegExp(`^${SERVED_ROOT}/`), "");
  return existsSync(join(rootDir, SERVED_ROOT, `${rel}.mdx`));
}

// A nav entry with no file behind it is a broken sidebar link. Fail rather than
// publish it — this is the check that makes an unattended run safe.
const dangling = [...referenced].filter((p) => !resolves(p));
if (dangling.length) {
  throw new Error(
    `scripts/nav.json references ${dangling.length} page(s) that do not exist after publish:\n` +
      dangling.map((p) => `  ${p}`).join("\n") +
      "\n\nEither the article was deleted or renamed in Help Scout, or its slug changed.\n" +
      "Fix scripts/nav.json (or scripts/sections.json) to match, then re-run."
  );
}

/* --------------------------- 3. new pages land in their auto-append group */

const autoAppend = navConfig.autoAppend || {};
const appended = {};

for (const dir of SECTION_DIRS) {
  const orphans = [...published.get(dir)]
    .map((slug) => `/${SERVED_ROOT}/${dir}/${slug}`)
    .filter((p) => !referenced.has(p));

  if (!orphans.length) continue;

  const target = autoAppend[dir];
  if (!target) {
    appended[dir] = { group: null, pages: orphans };
    continue;
  }

  const [tabName, groupName] = target;
  const tab = tabs.find((t) => t.tab === tabName);
  if (!tab) {
    throw new Error(
      `autoAppend for "${dir}" names tab "${tabName}", which is not in nav.json. ` +
        `Tabs are: ${tabs.map((t) => t.tab).join(", ")}`
    );
  }

  tab.groups ??= [];
  let group = tab.groups.find((g) => g.group === groupName);
  if (!group) {
    group = { group: groupName, expanded: false, pages: [] };
    tab.groups.push(group);
  }

  const withTitles = [];
  for (const p of orphans) {
    const slug = p.split("/").pop();
    withTitles.push({ p, title: await readTitle(join(rootDir, SERVED_ROOT, dir, `${slug}.mdx`), slug) });
  }
  withTitles.sort((a, b) => a.title.localeCompare(b.title));
  group.pages = [...group.pages, ...withTitles.map((x) => x.p)];

  appended[dir] = { group: `${tabName} / ${groupName}`, pages: orphans };
}

/* ------------------------------------------- 4. write docs.json, narrowly */

const docs = JSON.parse(await readFile(docsJsonPath, "utf8"));
const products = docs.navigation?.products;

if (!Array.isArray(products)) {
  throw new Error(
    'docs.json navigation has no "products" array. This script expects the ' +
      "consolidated layout (a Documentation product and a Blog product). " +
      "Refusing to overwrite navigation blind — inspect docs.json first."
  );
}

const owned = products.find((p) => p.product === OWNED_PRODUCT);
if (!owned) {
  throw new Error(
    `docs.json has no "${OWNED_PRODUCT}" product. Found: ${products.map((p) => p.product).join(", ")}`
  );
}

owned.tabs = tabs;
await writeFile(docsJsonPath, JSON.stringify(docs, null, 2) + "\n", "utf8");

/* ------------------------------------------------------------- 5. report */

console.log(`Published into ${SERVED_ROOT}/ and rewrote the ${OWNED_PRODUCT} product's tabs.`);
for (const dir of SECTION_DIRS) {
  console.log(`  ${dir}/ — ${published.get(dir).size} pages`);
}
console.log(`  navigation: ${tabs.length} tabs, ${referenced.size} curated page entries`);
console.log(
  `  untouched products: ${products.filter((p) => p !== owned).map((p) => p.product).join(", ") || "none"}`
);

const appendedDirs = Object.keys(appended);
if (!appendedDirs.length) {
  console.log("  no new pages — every published page is placed in nav.json");
} else {
  for (const dir of appendedDirs) {
    const { group, pages } = appended[dir];
    if (group) {
      console.log(`  ${pages.length} new ${dir} page(s) appended to "${group}":`);
    } else {
      console.log(
        `  ${pages.length} new ${dir} page(s) published but NOT in nav (autoAppend is null):`
      );
    }
    for (const p of pages) console.log(`      ${p}`);
  }
  console.log("  Move them into a proper group in scripts/nav.json when you get a chance.");
}
