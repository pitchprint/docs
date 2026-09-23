// Report what changed in Help Scout since the last check. Writes nothing into
// docs/ — ever.
//
// Why this exists instead of a publishing pipeline: the Help Scout import was a
// one-time seed. Since then every page has been rewritten by hand into richer
// MDX, and the API Reference was rebuilt as OpenAPI playground pages. Help Scout
// is now the STALE copy of all 134 pages, so republishing from it would replace
// the site with worse, older prose. Support still edits Help Scout though, so
// those edits need surfacing — by hand, not automatically.
//
// The signal is drift against a committed fingerprint, not a diff against the
// live pages: the live pages differ permanently, so diffing them is all noise.
//
//   npm run drift        report changed / new / removed articles
//   npm run baseline     accept the current state as the new baseline
//
// Run `npm run convert` first — this reads its output.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(scriptDir, "..");
const srcDir = join(rootDir, "data", "markdown");
const servedDir = join(rootDir, "docs");
const baselinePath = join(scriptDir, "helpscout-baseline.json");

const WRITE = process.argv.includes("--write");
const SECTIONS = ["documentation", "tutorial", "api-reference"];

const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/** Title from YAML frontmatter, for readable reports. */
function titleOf(text, fallback) {
  const m = text.match(/^title:\s*"?(.*?)"?\s*$/m);
  return m ? m[1] : fallback;
}

if (!existsSync(srcDir)) {
  console.error(`No converted output at ${srcDir}. Run \`npm run convert\` first.`);
  process.exit(1);
}

/* ------------------------------------------------- fingerprint this run */

const current = {};
for (const section of SECTIONS) {
  const dir = join(srcDir, section);
  if (!existsSync(dir)) continue;
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".mdx"))) {
    const slug = file.slice(0, -4);
    const text = (await readFile(join(dir, file), "utf8")).replace(/\r\n/g, "\n").trim();
    current[`${section}/${slug}`] = {
      hash: sha(text),
      title: titleOf(text, slug),
      bytes: text.length,
    };
  }
}

const baseline = existsSync(baselinePath)
  ? JSON.parse(await readFile(baselinePath, "utf8")).articles || {}
  : null;

// Articles that deliberately have no published page. Their edits are still
// worth surfacing — support is maintaining something — but separately, so
// nobody goes looking for a published page to port a change into.
const unpublishedPath = join(scriptDir, "unpublished.json");
const unpublished = existsSync(unpublishedPath)
  ? JSON.parse(await readFile(unpublishedPath, "utf8")).articles || {}
  : {};

/* ----------------------------------------------------- seed or compare */

if (baseline === null && !WRITE) {
  console.error(
    "No baseline yet. Seed one with:\n  npm run baseline\n\n" +
      "Commit scripts/helpscout-baseline.json afterwards — the scheduled check\n" +
      "compares against it, so it must be in the repo."
  );
  process.exit(1);
}

// Seeding: no baseline to compare against, so there is nothing to report.
const seeding = baseline === null;

const changed = [];
const added = [];
const removed = [];

for (const [key, meta] of Object.entries(current)) {
  const was = baseline?.[key];
  if (!was) added.push({ key, ...meta });
  else if (was.hash !== meta.hash) {
    changed.push({ key, ...meta, wasBytes: was.bytes, delta: meta.bytes - was.bytes });
  }
}
for (const key of Object.keys(baseline || {})) {
  if (!current[key]) removed.push({ key, ...baseline[key] });
}

/** Does a hand-written page exist for this article? */
const hasLivePage = (key) => existsSync(join(servedDir, `${key}.mdx`));

/* ------------------------------------------------------------- output */

const lines = [];
const drifted = changed.length + added.length + removed.length;

if (seeding) {
  lines.push(`Seeding baseline from ${Object.keys(current).length} article(s) — nothing to compare yet.`);
} else if (!drifted) {
  lines.push("No Help Scout changes since the last baseline.");
} else {
  lines.push(`## Help Scout drift — ${drifted} article(s) need attention`);
  lines.push("");
  lines.push(
    "These changed in Help Scout. The published docs are hand-written and were " +
      "**not** modified — port anything worth keeping by hand, then run " +
      "`npm run baseline` to acknowledge."
  );
  lines.push("");

  // Split the edits: ones with a page to port into, and ones we deliberately
  // do not publish. Mixing them wastes a reviewer's time on a page that was
  // never meant to exist.
  const editedLive = changed.filter((a) => !unpublished[a.key]);
  const editedUnpublished = changed.filter((a) => unpublished[a.key]);

  if (editedLive.length) {
    lines.push(`### Edited in Help Scout (${editedLive.length})`);
    lines.push("");
    lines.push("| Article | Published page | Size change |");
    lines.push("| --- | --- | --- |");
    for (const a of editedLive.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))) {
      const live = hasLivePage(a.key) ? `\`docs/${a.key}.mdx\`` : "— none —";
      const d = a.delta > 0 ? `+${a.delta}` : `${a.delta}`;
      lines.push(`| ${a.title} <br><code>${a.key}</code> | ${live} | ${d} bytes |`);
    }
    lines.push("");
  }

  if (editedUnpublished.length) {
    lines.push(`### Edited, but deliberately unpublished (${editedUnpublished.length})`);
    lines.push("");
    lines.push(
      "Support is still maintaining these in Help Scout. They have no published " +
        "page by decision — see `scripts/unpublished.json`. **No action needed** " +
        "unless the decision has changed."
    );
    lines.push("");
    for (const a of editedUnpublished) {
      const d = a.delta > 0 ? `+${a.delta}` : `${a.delta}`;
      lines.push(`- **${a.title}** — \`${a.key}\` (${d} bytes)`);
    }
    lines.push("");
  }

  if (added.length) {
    lines.push(`### New in Help Scout (${added.length})`);
    lines.push("");
    for (const a of added) {
      const live = hasLivePage(a.key) ? " (a published page already exists)" : "";
      lines.push(`- **${a.title}** — \`${a.key}\`${live}`);
    }
    lines.push("");
  }

  if (removed.length) {
    lines.push(`### Gone from Help Scout (${removed.length})`);
    lines.push("");
    for (const a of removed) {
      const live = hasLivePage(a.key)
        ? ` — \`docs/${a.key}.mdx\` is still published, decide whether to retire it`
        : "";
      lines.push(`- **${a.title}** — \`${a.key}\`${live}`);
    }
    lines.push("");
  }

  lines.push("Converted copies for comparison are under `data/markdown/` (not committed).");
}

const report = lines.join("\n");
console.log(report);

if (process.env.GITHUB_STEP_SUMMARY) {
  await writeFile(process.env.GITHUB_STEP_SUMMARY, report + "\n", { flag: "a" });
}
if (process.env.DRIFT_REPORT_PATH) {
  await writeFile(process.env.DRIFT_REPORT_PATH, report + "\n", "utf8");
}

/* ------------------------------------------------------------ baseline */

if (WRITE) {
  await writeFile(
    baselinePath,
    JSON.stringify(
      {
        _comment:
          "Fingerprint of the Help Scout content as last reviewed. scripts/report-drift.js " +
          "compares each sync against this to show only what support has changed. " +
          "Regenerate with `npm run baseline` after porting changes into docs/.",
        updatedAt: new Date().toISOString(),
        articles: current,
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
  console.log(
    `\nBaseline written: ${Object.keys(current).length} articles. ` +
      "Commit scripts/helpscout-baseline.json."
  );
}

// Always exit 0 — drift is information, not a build failure.
