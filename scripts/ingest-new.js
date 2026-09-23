// Add NEW Help Scout articles to the site. Never touch an existing page.
//
// The published docs are hand-written and have diverged from Help Scout on every
// page, so nothing already in docs/ may be overwritten. But a brand-new article
// has no hand-written counterpart to protect — so it can be filed automatically.
//
// What "new" means: present in the converted output, absent from
// scripts/helpscout-baseline.json, and no file already at its destination.
//
// What it does per article:
//   1. tidies the converted Markdown toward house style (mechanical only)
//   2. writes docs/<section>/<slug>.mdx
//   3. files it in the sidebar group its Help Scout category maps to
//   4. records it in the baseline so it is not ingested twice
//
// What it never does: modify or delete an existing page, reorder navigation, or
// touch baseline entries for articles it did not ingest — that would silently
// acknowledge edits the drift report is meant to surface.
//
//   npm run ingest                          report what would be added, write nothing
//   npm run ingest -- --preview .preview     write the pages to .preview/ to read them
//   npm run ingest -- --preview .preview --only <slug>
//                                           force one article through, even if it is
//                                           already published — preview only
//   npm run ingest -- --write               apply for real
//   npm run ingest -- --write --no-style-pass   skip the AI pass
//
// Run `npm run convert` first.

import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tidy, tidyDescription } from "./tidy.mjs";
import { stylePass } from "./style-pass.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(scriptDir, "..");
const srcDir = join(rootDir, "data", "markdown");
const servedRoot = join(rootDir, "docs");
const docsJsonPath = join(rootDir, "docs.json");
const baselinePath = join(scriptDir, "helpscout-baseline.json");

const argVal = (flag) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : null;
};

const WRITE = process.argv.includes("--write");
// The AI conformance pass runs by default when ANTHROPIC_API_KEY is set.
// --no-style-pass keeps the mechanical output even when a key is present.
const NO_STYLE = process.argv.includes("--no-style-pass");

// --preview <dir> writes the candidate pages to a scratch directory so you can
// read what the style pass produced. It never touches docs/, docs.json or the
// baseline, so it is safe to run against the live repo at any time.
const PREVIEW = argVal("--preview");

// --only <slug> restricts the run to one article. Combined with --preview it
// will re-process an article that is already published or already in the
// baseline, which is the only way to exercise the style pass when Help Scout
// has nothing new. Refused without --preview: outside preview mode it would
// mean writing over a hand-written page.
const ONLY = argVal("--only");

if (ONLY && !PREVIEW) {
  console.error(
    "--only re-processes an article that may already be published, so it is\n" +
      "only allowed with --preview <dir>. Without --preview it would overwrite a\n" +
      "hand-written page, which this script exists to prevent."
  );
  process.exit(1);
}
if (PREVIEW && WRITE) {
  console.error("--preview and --write are mutually exclusive: pick a scratch dir or the real thing.");
  process.exit(1);
}

const SECTIONS = ["documentation", "tutorial", "api-reference"];
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

function splitFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { fm: "", body: text };
  return { fm: m[1], body: text.slice(m[0].length) };
}

function fmValue(fm, key) {
  const m = fm.match(new RegExp(`^${key}:\\s*"?(.*?)"?\\s*$`, "m"));
  return m ? m[1] : null;
}

/* ------------------------------------------------------------------- inputs */

if (!existsSync(srcDir)) {
  console.error("No converted output. Run `npm run convert` first.");
  process.exit(1);
}
if (!existsSync(baselinePath)) {
  console.error(
    "No baseline. Seed one with `npm run baseline` and commit it — without it\n" +
      "every article looks new and would be ingested."
  );
  process.exit(1);
}

const baselineFile = JSON.parse(await readFile(baselinePath, "utf8"));
const baseline = baselineFile.articles || {};
const categoryMap = JSON.parse(await readFile(join(scriptDir, "category-map.json"), "utf8"));

// Articles that deliberately have no published page. These were being skipped
// only because they happen to sit in the baseline, which is a content
// fingerprint for drift detection — not a record of intent. Re-seed the
// baseline, or lose an entry, and they would quietly go live. This file states
// the decision outright so it survives both.
const unpublishedPath = join(scriptDir, "unpublished.json");
const unpublished = existsSync(unpublishedPath)
  ? JSON.parse(await readFile(unpublishedPath, "utf8")).articles || {}
  : {};
const manifest = JSON.parse(await readFile(join(srcDir, "nav-manifest.json"), "utf8"));

// slug -> Help Scout category, from the manifest the convert step emits.
//
// Keyed by slug, not by the manifest's path: a scripts/sections.json override
// moves the file to another section after the manifest has recorded the original,
// so the two disagree. Slugs are unique across sections (convert de-duplicates
// them), and a collision is reported rather than silently resolved.
const categoryOf = {};
const slugCollisions = [];
for (const groups of Object.values(manifest)) {
  for (const g of groups) {
    for (const p of g.pages) {
      const path = typeof p === "string" ? p : p.path;
      const slug = path.split("/").pop();
      if (categoryOf[slug] && categoryOf[slug] !== g.group) {
        slugCollisions.push(`${slug}: "${categoryOf[slug]}" vs "${g.group}"`);
      }
      categoryOf[slug] = g.group;
    }
  }
}
if (slugCollisions.length) {
  console.error("Same slug in two Help Scout categories — cannot choose a group:");
  for (const c of slugCollisions) console.error(`  ${c}`);
  process.exit(1);
}

/* ----------------------------------------- snapshot, so we can prove no harm */

const existingBefore = {};
for (const section of SECTIONS) {
  const dir = join(servedRoot, section);
  if (!existsSync(dir)) continue;
  for (const f of (await readdir(dir)).filter((x) => x.endsWith(".mdx"))) {
    existingBefore[`${section}/${f}`] = sha(await readFile(join(dir, f), "utf8"));
  }
}

/* ------------------------------------------------------------- what is new? */

const candidates = [];
const skipped = [];

for (const section of SECTIONS) {
  const dir = join(srcDir, section);
  if (!existsSync(dir)) continue;
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".mdx"))) {
    const slug = file.slice(0, -4);
    const key = `${section}/${slug}`;

    // A recorded decision not to publish. Checked before the baseline, because
    // the baseline is a content fingerprint and this is a statement of intent.
    //
    // --only is exempt so you can still *look* at one: it requires --preview,
    // which cannot write into docs/. Looking is how you decide.
    if (unpublished[key] && !ONLY) {
      skipped.push({
        key,
        why:
          unpublished[key].status === "needs-decision"
            ? "awaiting a decision — see scripts/unpublished.json"
            : "deliberately not published — see scripts/unpublished.json",
      });
      continue;
    }

    if (ONLY) {
      // Preview-only: process just this article, whatever its status.
      if (slug === ONLY) candidates.push({ key, section, slug, file });
      continue;
    }

    if (baseline[key]) continue; // already known to us
    if (existsSync(join(servedRoot, section, file))) {
      // A hand-written page already owns this slug. Leave it alone.
      skipped.push({ key, why: "a published page already exists" });
      continue;
    }
    candidates.push({ key, section, slug, file });
  }
}

if (!candidates.length) {
  if (ONLY) {
    console.error(`No converted article with the slug "${ONLY}".`);
    console.error("Slugs come from data/markdown/<section>/<slug>.mdx — run `npm run convert` first,");
    console.error("then pick one from there.");
    process.exit(1);
  }
  console.log("No new Help Scout articles to add.");
  for (const s of skipped) console.log(`  skipped ${s.key} — ${s.why}`);
  process.exit(0);
}

/* -------------------------------------------------------------- prepare each */

const docs = JSON.parse(await readFile(docsJsonPath, "utf8"));
const products = docs.navigation?.products;
if (!Array.isArray(products)) {
  console.error('docs.json has no navigation.products array. Refusing to edit navigation.');
  process.exit(1);
}

/** Walk a group path like ["Documentation","Installation Guide","Platform Installation"]. */
function resolveGroup(path) {
  const tab = products
    .flatMap((p) => p.tabs || [])
    .find((t) => t.tab === path[0]);
  if (!tab) return { error: `no tab "${path[0]}"` };

  let node = tab;
  for (const name of path.slice(1)) {
    const pool = node.groups || node.pages || [];
    const next = pool.find((g) => g && typeof g === "object" && g.group === name);
    if (!next) return { error: `no group "${name}" under ${path.join(" / ")}` };
    node = next;
  }
  if (!Array.isArray(node.pages)) return { error: `group "${path.at(-1)}" has no pages array` };
  return { group: node };
}

/**
 * The largest hand-written page in a section, used as the exemplar for the AI
 * pass — the biggest page is reliably the one with the richest component usage.
 */
async function exemplarFor(section) {
  const dir = join(servedRoot, section);
  if (!existsSync(dir)) return null;
  let best = null;
  for (const f of (await readdir(dir)).filter((x) => x.endsWith(".mdx"))) {
    const { size } = await stat(join(dir, f));
    if (!best || size > best.size) best = { file: f, size };
  }
  if (!best) return null;
  // Cap it so one enormous page cannot dominate the prompt.
  return (await readFile(join(dir, best.file), "utf8")).slice(0, 12000);
}

const exemplars = {};
const planned = [];
const problems = [];

for (const c of candidates) {
  const category = categoryOf[c.slug] || null;
  // Per-article placement wins, then the category map, then the section fallback.
  const target =
    (categoryMap.slugOverrides || {})[c.slug] ||
    (category && categoryMap.categories[category]) ||
    categoryMap._fallback[c.section];
  const via = (categoryMap.slugOverrides || {})[c.slug]
    ? "slug override"
    : category && categoryMap.categories[category]
      ? `category "${category}"`
      : `fallback for ${c.section}`;
  const resolved = resolveGroup(target);
  if (resolved.error) {
    problems.push(`${c.key}: ${resolved.error}`);
    continue;
  }

  const raw = await readFile(join(srcDir, c.section, c.file), "utf8");
  const { fm, body } = splitFrontmatter(raw);
  const title = fmValue(fm, "title") || c.slug;
  const description = tidyDescription(fmValue(fm, "description"));

  const tidied = tidy(body);

  const frontmatter =
    ["---", `title: "${title.replace(/"/g, '\\"')}"`]
      .concat(description ? [`description: "${description.replace(/"/g, '\\"')}"`] : [])
      .concat(["---", ""])
      .join("\n");

  const mechanical = frontmatter + "\n" + tidied.body;
  let out = mechanical;
  let styled = false;
  let styleNotes = [...tidied.warnings];

  if (!NO_STYLE) {
    exemplars[c.section] ??= await exemplarFor(c.section);
    const res = await stylePass({
      mdx: out,
      title,
      section: c.section,
      exemplar: exemplars[c.section] || "(no exemplar available)",
    });
    if (res.applied) {
      out = res.mdx;
      styled = true;
      styleNotes = [];
    } else {
      styleNotes = [...styleNotes, ...res.problems];
    }
  }

  // Only an unstyled page needs a human pass; a styled one is already in shape.
  if (!styled) {
    out = out.replace(
      /^(---\n[\s\S]*?\n---\n)/,
      "$1\n{/* Imported from Help Scout, mechanically tidied. Worth a pass for step titles, alt text and callouts. */}\n"
    );
  }

  planned.push({ ...c, category, target, via, group: resolved.group, out, mechanical,
                 applied: tidied.applied, styled, styleNotes,
                 navPath: `/docs/${c.section}/${c.slug}`, title, description });
}

/* ------------------------------------------------------------------- report */

const mode = WRITE ? "" : PREVIEW ? ` — preview into ${PREVIEW}/` : " — dry run, nothing written";
console.log(`${planned.length} article(s)${mode}:\n`);
for (const p of planned) {
  console.log(`  ${p.title}`);
  console.log(`    file      docs/${p.section}/${p.slug}.mdx`);
  console.log(`    filed     ${p.target.join(" / ")}`);
  console.log(`    via       ${p.via}`);
  console.log(`    tidied    ${p.applied.length ? p.applied.join(", ") : "nothing needed"}`);
  console.log(`    style     ${p.styled ? "AI pass applied" : "mechanical only"}`);
  for (const n of p.styleNotes) console.log(`              - ${n}`);
  console.log("");
}
for (const s of skipped) console.log(`  skipped ${s.key} — ${s.why}`);
if (problems.length) {
  console.error("\nCould not place:");
  for (const p of problems) console.error(`  ${p}`);
  console.error("\nAdd the category to scripts/category-map.json, then re-run.");
  process.exit(1);
}

/* ------------------------------------------------------------------ preview */

if (PREVIEW) {
  for (const p of planned) {
    const dir = join(PREVIEW, p.section);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${p.slug}.mdx`), p.out, "utf8");
    // The mechanical version alongside it, so the two can be diffed to see
    // exactly what the AI pass changed.
    if (p.styled) await writeFile(join(dir, `${p.slug}.mechanical.mdx`), p.mechanical, "utf8");
  }
  console.log(`Wrote ${planned.length} page(s) to ${PREVIEW}/ — docs/, docs.json and the baseline untouched.`);
  if (planned.some((p) => p.styled)) {
    console.log("Each styled page has a .mechanical.mdx beside it; diff the two to see the AI pass.");
  }
  process.exit(0);
}

if (!WRITE) {
  console.log("Re-run with --write to apply, or --preview <dir> to read the output first.");
  process.exit(0);
}

/* -------------------------------------------------------------------- apply */

// Belt and braces. The loop above already skips these, but this is the last
// point before anything is written into docs/, and "we decided not to publish
// this" is the kind of intent that must not be lost to a refactor.
const forbidden = planned.filter((p) => unpublished[p.key]);
if (forbidden.length) {
  console.error("\nAbout to publish articles recorded as NOT to be published:");
  for (const p of forbidden) console.error(`  ${p.key} — ${unpublished[p.key].reason || "no reason given"}`);
  console.error("\nRemove the entry from scripts/unpublished.json if that is genuinely intended.");
  process.exit(1);
}

for (const p of planned) {
  await mkdir(join(servedRoot, p.section), { recursive: true });
  await writeFile(join(servedRoot, p.section, `${p.slug}.mdx`), p.out, "utf8");
  p.group.pages.push(p.navPath);
}

// Baseline: record ONLY the ingested articles. Touching any other entry would
// silently acknowledge an edit the drift report exists to surface.
for (const p of planned) {
  const text = p.out.replace(/\r\n/g, "\n").trim();
  baselineFile.articles[p.key] = {
    hash: sha(
      (await readFile(join(srcDir, p.section, p.file), "utf8")).replace(/\r\n/g, "\n").trim()
    ),
    title: p.title,
    bytes: text.length,
    ingestedAt: new Date().toISOString(),
  };
}

await writeFile(docsJsonPath, JSON.stringify(docs, null, 2) + "\n", "utf8");
await writeFile(baselinePath, JSON.stringify(baselineFile, null, 2) + "\n", "utf8");

/* ------------------------------------------------ prove nothing else changed */

const violations = [];
for (const [rel, hash] of Object.entries(existingBefore)) {
  const p = join(servedRoot, rel);
  if (!existsSync(p)) violations.push(`deleted docs/${rel}`);
  else if (sha(await readFile(p, "utf8")) !== hash) violations.push(`modified docs/${rel}`);
}
if (violations.length) {
  console.error("\nINGEST TOUCHED EXISTING PAGES — this must never happen:");
  for (const v of violations) console.error(`  ${v}`);
  console.error("\nRevert with: git checkout -- docs docs.json scripts/helpscout-baseline.json");
  process.exit(1);
}

console.log(`Added ${planned.length} page(s). ${Object.keys(existingBefore).length} existing pages untouched.`);
