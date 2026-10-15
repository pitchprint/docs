// Tests for the blog release-note pipeline.
//
// The claim these defend is narrow and absolute: a published <Update> block is
// never modified. So most of this file is not "does it produce good output" —
// it is "when the insert logic is wrong, does it refuse rather than write".
// Two of the tests deliberately sabotage the script and assert that nothing
// reaches disk. A guard that has never been seen to fire is not a guard.
//
//   node scripts/test-release-notes.mjs

import { mkdtemp, mkdir, writeFile, readFile, cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { thursdayOfIsoWeek, yearFor, weekFor } from "./generate-blog-summaries.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));

let failures = 0;
function check(name, ok, detail = "") {
  if (ok) {
    console.log(`  ok    ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`);
  }
}

/* ------------------------------------------------------------ fixture */

const CRLF = "\r\n";

const YEAR_FILE =
  [
    "---",
    'title: "2026 releases"',
    'description: "PitchPrint release notes from 2026."',
    "rss: true",
    "---",
    "",
    "Releases ship weekly on Thursdays.",
    "",
    '<Update label="WK26-26" description="25 June 2026"',
    '  rss={{ title: "WK26-26 — Show item dimensions", description: "Show item dimensions." }}>',
    "  **Show item dimensions.**",
    "",
    "  We're back with another round of updates.",
    "",
    "  ### Show item dimensions",
    "",
    "  Hand-written prose that must survive untouched, with punctuation — and an em dash.",
    "",
    "  <Frame>",
    '    <img src="/blog/images/2026/06/image.png" alt="The option enabled" />',
    "  </Frame>",
    "</Update>",
    "",
    '<Update label="WK09-26" description="26 February 2026"',
    '  rss={{ title: "WK09-26 — Earlier thing", description: "Earlier thing." }}>',
    "  **Earlier thing.**",
    "",
    "  ### Earlier thing",
    "",
    "  More hand-written prose.",
    "</Update>",
    "",
  ].join(CRLF);

function article(title, release, summary) {
  return (
    [
      "---",
      `title: "${title}"`,
      'description: "A docs page."',
      ...(release ? [`release: "${release}"`] : []),
      ...(summary ? [`release_summary: "${summary}"`] : []),
      "---",
      "",
      "Body text.",
      "",
    ].join(CRLF)
  );
}

const DOCS_JSON = JSON.stringify(
  {
    navigation: {
      products: [
        {
          tabs: [
            {
              tab: "Blog",
              groups: [
                {
                  group: "Releases",
                  pages: ["blog/releases/2026", "blog/releases/2025"],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  null,
  2
) + "\n";

/** Build a throwaway repo with the scripts in it. */
async function fixture(articles) {
  const dir = await mkdtemp(join(tmpdir(), "relnotes-"));
  await mkdir(join(dir, "blog", "releases"), { recursive: true });
  await mkdir(join(dir, "docs", "documentation"), { recursive: true });
  await mkdir(join(dir, "scripts"), { recursive: true });
  await writeFile(join(dir, "blog", "releases", "2026.mdx"), YEAR_FILE, "utf8");
  await writeFile(join(dir, "docs.json"), DOCS_JSON, "utf8");
  await writeFile(join(dir, "package.json"), '{"type":"module"}\n', "utf8");
  for (const [name, content] of Object.entries(articles)) {
    await writeFile(join(dir, "docs", "documentation", name), content, "utf8");
  }
  for (const f of ["generate-blog-summaries.js", "ingest-release-notes.mjs", "release-file.mjs"]) {
    await cp(join(scriptDir, f), join(dir, "scripts", f));
  }
  return dir;
}

function run(dir, args = [], script = "ingest-release-notes.mjs") {
  const res = spawnSync("node", [join(dir, "scripts", script), ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, SCAN_DIRS: "docs/documentation" },
  });
  return { code: res.status, out: `${res.stdout}${res.stderr}` };
}

const read = (dir, p) => readFile(join(dir, p), "utf8");
const blocksOf = (text) => text.match(/<Update\b[\s\S]*?<\/Update>/g) || [];

/* --------------------------------------------------------------- pure */

console.log("\nDate derivation");

check(
  "ISO week 26 of 2026 is Thursday 25 June",
  thursdayOfIsoWeek(2026, 26) === "25 June 2026",
  thursdayOfIsoWeek(2026, 26)
);
check(
  "ISO week 9 of 2026 is Thursday 26 February",
  thursdayOfIsoWeek(2026, 9) === "26 February 2026",
  thursdayOfIsoWeek(2026, 9)
);
check(
  "ISO week 1 of 2027 is Thursday 7 January",
  thursdayOfIsoWeek(2027, 1) === "7 January 2027",
  thursdayOfIsoWeek(2027, 1)
);
// Both dates above are taken from the real published year file, so this is
// checked against what the team actually shipped, not against my own arithmetic.

check("yearFor('wk26-26') is 2026", yearFor("wk26-26") === 2026);
check("yearFor('WK02-27') is 2027", yearFor("WK02-27") === 2027);
check("yearFor('spring-launch') refuses", yearFor("spring-launch") === null);
check(
  "release_year overrides the id",
  yearFor("spring-launch", { release_year: "2030" }) === 2030
);
check("weekFor('wk44-26') is 44", weekFor("wk44-26") === 44);

/* ------------------------------------------------------------ skipping */

console.log("\nA release that already has a note");
{
  const dir = await fixture({
    "a.mdx": article("Show item dimensions", "wk26-26", "Already written up."),
  });
  const before = await read(dir, "blog/releases/2026.mdx");
  const r = run(dir, ["--write"]);
  const after = await read(dir, "blog/releases/2026.mdx");
  check("exits 0", r.code === 0, `exit ${r.code}`);
  check("says it skipped", /already written up/.test(r.out));
  check("file untouched", before === after);
  await rm(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------ adding */

console.log("\nA release with no note yet");
{
  const dir = await fixture({
    "a.mdx": article("Bulk editing", "wk44-26", "Edit many products at once."),
    "b.mdx": article("Dark mode", "wk44-26", "Easier on the eyes."),
  });
  const before = await read(dir, "blog/releases/2026.mdx");

  const dry = run(dir);
  check("dry run exits 0", dry.code === 0, `exit ${dry.code}`);
  check("dry run writes nothing", (await read(dir, "blog/releases/2026.mdx")) === before);

  const r = run(dir, ["--write"]);
  const after = await read(dir, "blog/releases/2026.mdx");
  check("exits 2 for 'wrote changes'", r.code === 2, `exit ${r.code}`);

  const ob = blocksOf(before);
  const ab = blocksOf(after);
  check("one block added", ab.length === ob.length + 1, `${ob.length} -> ${ab.length}`);
  check(
    "every pre-existing block is byte-for-byte identical",
    ob.every((b) => after.includes(b)),
    ob.filter((b) => !after.includes(b)).map((b) => b.slice(0, 60)).join(" | ")
  );
  check("the new block is first", /^<Update\s+label="WK44-26"/.test(ab[0]));
  check(
    "the tail of the original file survives verbatim",
    after.trimEnd().endsWith(before.slice(before.indexOf("<Update")).trimEnd())
  );
  check(
    "line endings preserved — no bare LF introduced",
    (after.match(/\n/g) || []).length === (after.match(/\r\n/g) || []).length
  );
  check("marked as a draft", after.includes("DRAFT —"));
  check("both topics present", after.includes("### Bulk editing") && after.includes("### Dark mode"));
  check("date derived from the week", after.includes('description="29 October 2026"'));
  check("docs.json untouched", (await read(dir, "docs.json")) === DOCS_JSON);

  // Running again must be a no-op.
  const again = run(dir, ["--write"]);
  check("second run is a no-op", again.code === 0 && (await read(dir, "blog/releases/2026.mdx")) === after);
  await rm(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------ preview */

console.log("\nPreview mode");
{
  const dir = await fixture({ "a.mdx": article("New thing", "wk44-26", "Does a thing.") });
  const before = await read(dir, "blog/releases/2026.mdx");
  const r = run(dir, ["--preview", ".preview"]);
  check("exits 0", r.code === 0, `exit ${r.code}`);
  check("year file untouched", (await read(dir, "blog/releases/2026.mdx")) === before);
  check("candidate written", existsSync(join(dir, ".preview", "2026-wk44-26.mdx")));
  const p = run(dir, ["--preview", ".preview", "--write"]);
  check("--preview with --write is refused", p.code === 1);
  await rm(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------- bad release id */

console.log("\nA release id that doesn't say which year");
{
  const dir = await fixture({ "a.mdx": article("Thing", "spring-launch", "A thing.") });
  const before = await read(dir, "blog/releases/2026.mdx");
  const r = run(dir, ["--write"]);
  check("exits 1", r.code === 1, `exit ${r.code}`);
  check("says why and how to fix it", /REFUSED/.test(r.out) && /release_year/.test(r.out));
  check("writes nothing", (await read(dir, "blog/releases/2026.mdx")) === before);
  await rm(dir, { recursive: true, force: true });
}

/* ---------------------------------------------------------- year rollover */

console.log("\nA release in a year with no file yet");
{
  const dir = await fixture({ "a.mdx": article("New year thing", "wk02-27", "First of the year.") });
  const r = run(dir, ["--write"]);
  check("exits 2", r.code === 2, `exit ${r.code}`);
  check("year file created", existsSync(join(dir, "blog", "releases", "2027.mdx")));
  const nav = await read(dir, "docs.json");
  check("added to the sidebar", nav.includes('"blog/releases/2027"'));
  check(
    "placed above the previous year",
    nav.indexOf('"blog/releases/2027"') < nav.indexOf('"blog/releases/2026"')
  );
  check("2026 untouched", (await read(dir, "blog/releases/2026.mdx")) === YEAR_FILE);
  await rm(dir, { recursive: true, force: true });
}

/* -------------------------------------------------------------- guards */

// The important tests. Break the insert logic in two different ways and assert
// that each is caught and that nothing is written. These two sabotages fail
// different checks — the first slips past the byte-identity check and is caught
// by the block count, the second the other way round — which is why both exist.

console.log("\nGuards (sabotaged insert logic)");

async function sabotage(name, find, replace, expect) {
  const dir = await fixture({ "a.mdx": article("Thing", "wk44-26", "A thing.") });
  // The guards live in release-file.mjs, shared with the blog pipeline, so
  // that is what gets broken here — one implementation, one place to test.
  const src = await read(dir, "scripts/release-file.mjs");
  if (!src.includes(find)) {
    check(`${name} — sabotage anchor still present in the script`, false,
      "the script changed; update this test's anchor text");
    await rm(dir, { recursive: true, force: true });
    return;
  }
  await writeFile(
    join(dir, "scripts", "release-file.mjs"),
    src.replace(find, replace),
    "utf8"
  );
  const before = await read(dir, "blog/releases/2026.mdx");
  const r = run(dir, ["--write"]);
  check(`${name} — refuses`, r.code === 1, `exit ${r.code}`);
  check(`${name} — says so`, expect.test(r.out), r.out.trim().split("\n").slice(-2).join(" "));
  check(`${name} — writes nothing`, (await read(dir, "blog/releases/2026.mdx")) === before);
  await rm(dir, { recursive: true, force: true });
}

await sabotage(
  "a published block is dropped",
  'blocks: text.slice(m.index),',
  'blocks: text.slice(m.index).replace(/^<Update[^\\n]*\\n/, ""),',
  /REFUSED/
);

await sabotage(
  "a published block's text is altered",
  'if (tail) parts.push(tail.replace(/^\\s+/, ""));',
  'if (tail) parts.push(tail.replace(/^\\s+/, "").replace("Show item dimensions", "Changed"));',
  /REFUSED/
);

/* --------------------------------------------------------------- done */

console.log("");
if (failures) {
  console.error(`${failures} release-note check(s) failed.`);
  process.exit(1);
}
console.log("All release-note tests passed.");
