// The correspondence between Help Scout and this repo.
//
// Every pull from Help Scout raises the same question: is this article already
// here, deliberately left out, or genuinely new? Slug equality answers it
// implicitly, scattered across three scripts. This prints it in one place.
//
// For each converted article it resolves one of four states:
//
//   published       a page exists at docs/<section>/<slug>.mdx
//   not-publishing  listed in scripts/unpublished.json — a recorded decision
//   needs-decision  listed there but not yet settled
//   UNTRACKED       none of the above: new since the baseline, and the next
//                   `npm run ingest -- --write` would propose it
//
// It also flags pages in docs/ with no Help Scout article behind them, which is
// normal for hand-authored pages (quickstart, overview, the API introduction)
// and a symptom of a renamed article otherwise.
//
//   npm run registry              print the table
//   npm run registry -- --write   also write scripts/article-registry.md
//
// Read-only apart from --write. Run `npm run convert` first.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(scriptDir, "..");
const srcDir = join(rootDir, "data", "markdown");
const servedRoot = join(rootDir, "docs");

const WRITE = process.argv.includes("--write");
const SECTIONS = ["documentation", "tutorial", "api-reference"];

const readJson = async (p, fallback) =>
  existsSync(p) ? JSON.parse(await readFile(p, "utf8")) : fallback;

const unpublished = (await readJson(join(scriptDir, "unpublished.json"), {})).articles || {};
const baseline = (await readJson(join(scriptDir, "helpscout-baseline.json"), {})).articles || {};

if (!existsSync(srcDir)) {
  console.error("No converted output. Run `npm run convert` first.");
  process.exit(1);
}

/** Title from YAML frontmatter, for a readable table. */
async function titleOf(path) {
  const text = (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
  const m = text.match(/^---\n[\s\S]*?title:\s*"?(.*?)"?\s*$/m);
  return m ? m[1] : "";
}

/* ------------------------------------------------------- Help Scout side */

const rows = [];
for (const section of SECTIONS) {
  const dir = join(srcDir, section);
  if (!existsSync(dir)) continue;
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".mdx")).sort()) {
    const slug = file.slice(0, -4);
    const key = `${section}/${slug}`;
    const decision = unpublished[key];
    const live = existsSync(join(servedRoot, section, file));

    let state;
    if (live) state = "published";
    else if (decision) state = decision.status === "needs-decision" ? "needs-decision" : "not-publishing";
    else state = "UNTRACKED";

    rows.push({
      key,
      section,
      title: decision?.title || (await titleOf(join(dir, file))),
      state,
      inBaseline: Boolean(baseline[key]),
      note: decision?.reason || "",
      // A recorded decision that has since been published is a contradiction.
      conflict: live && decision ? "listed as unpublished but a page exists" : null,
    });
  }
}

/* ----------------------------------------------------------- repo side */

const orphanPages = [];
for (const section of SECTIONS) {
  const dir = join(servedRoot, section);
  if (!existsSync(dir)) continue;
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".mdx")).sort()) {
    const slug = file.slice(0, -4);
    if (!existsSync(join(srcDir, section, file))) orphanPages.push(`${section}/${slug}`);
  }
}

/* -------------------------------------------------------------- report */

const by = (s) => rows.filter((r) => r.state === s);
const untracked = by("UNTRACKED");
const needsDecision = by("needs-decision");
const notPublishing = by("not-publishing");
const conflicts = rows.filter((r) => r.conflict);

const out = [];
out.push("# Help Scout → repo registry");
out.push("");
out.push(`Generated ${new Date().toISOString().slice(0, 10)} from \`data/markdown/\` and \`docs/\`.`);
out.push("");
out.push("| State | Count |");
out.push("| --- | --- |");
out.push(`| Published | ${by("published").length} |`);
out.push(`| Deliberately not publishing | ${notPublishing.length} |`);
out.push(`| Needs a decision | ${needsDecision.length} |`);
out.push(`| **Untracked — would be proposed on the next sync** | **${untracked.length}** |`);
out.push(`| Pages with no Help Scout article | ${orphanPages.length} |`);
out.push("");

if (conflicts.length) {
  out.push("## ⚠ Contradictions");
  out.push("");
  out.push("Listed in `unpublished.json` but a published page exists. Remove the entry.");
  out.push("");
  for (const r of conflicts) out.push(`- \`${r.key}\``);
  out.push("");
}

if (untracked.length) {
  out.push("## Untracked");
  out.push("");
  out.push(
    "Not published, and no recorded decision. The next `npm run ingest -- --write` " +
      "would propose these. Add an entry to `scripts/unpublished.json` to hold one back."
  );
  out.push("");
  for (const r of untracked) {
    out.push(`- **${r.title}** — \`${r.key}\`${r.inBaseline ? "" : " *(new since the baseline)*"}`);
  }
  out.push("");
}

if (needsDecision.length) {
  out.push("## Needs a decision");
  out.push("");
  for (const r of needsDecision) {
    out.push(`- **${r.title}** — \`${r.key}\``);
    out.push(`  ${r.note}`);
  }
  out.push("");
}

if (notPublishing.length) {
  out.push("## Deliberately not publishing");
  out.push("");
  out.push("Recorded in `scripts/unpublished.json`. The sync will never propose these.");
  out.push("");
  for (const r of notPublishing) out.push(`- **${r.title}** — \`${r.key}\``);
  out.push("");
}

if (orphanPages.length) {
  out.push("## Published pages with no Help Scout article");
  out.push("");
  out.push(
    "Normal for hand-authored pages. Anything unexpected here usually means an " +
      "article was renamed in Help Scout, leaving the old page stranded."
  );
  out.push("");
  for (const k of orphanPages) out.push(`- \`docs/${k}.mdx\``);
  out.push("");
}

out.push("## Everything");
out.push("");
out.push("| Article | Key | State |");
out.push("| --- | --- | --- |");
for (const r of rows.sort((a, b) => a.key.localeCompare(b.key))) {
  out.push(`| ${r.title} | \`${r.key}\` | ${r.state} |`);
}

const report = out.join("\n");
console.log(report);

if (process.env.GITHUB_STEP_SUMMARY) {
  await writeFile(process.env.GITHUB_STEP_SUMMARY, report + "\n", { flag: "a" });
}
if (WRITE) {
  const p = join(scriptDir, "article-registry.md");
  await writeFile(p, report + "\n", "utf8");
  console.error(`\nWrote ${p}`);
}

// Always exit 0: this is a report, not a gate.
