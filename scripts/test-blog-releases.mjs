// Tests for the Ghost blog -> blog/releases ingest.
//
// The important ones are the date tests. The label decides which year file a
// post lands in and whether it is seen as already imported, and it is derived
// from pubDate rather than the post title — so it is checked against the four
// labels a person assigned by hand in blog/releases/2026.mdx. If this script's
// arithmetic disagreed with theirs, it would re-import everything.
//
//   node scripts/test-blog-releases.mjs

import { mkdtemp, mkdir, writeFile, readFile, readdir, cp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  isoWeek,
  labelFor,
  labelInTitle,
  localImagePath,
  convertPost,
  renderBlock,
  prettyDate,
} from "./blog-convert.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
let failures = 0;
const check = (name, ok, detail = "") => {
  if (ok) console.log(`  ok    ${name}`);
  else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`);
  }
};

/* --------------------------------------------------------------- dates */

console.log("\nLabels derived from pubDate");

// The first four are the labels already written by hand in the repo, with the
// publication dates from the feed. The fifth is the post whose title has its
// digits transposed.
const REAL = [
  ["Thu, 25 Jun 2026 12:56:41 GMT", "WK26-26", "matches the repo"],
  ["Thu, 07 May 2026 13:28:32 GMT", "WK19-26", "matches the repo"],
  ["Thu, 19 Mar 2026 00:00:00 GMT", "WK12-26", "matches the repo"],
  ["Thu, 26 Feb 2026 00:00:00 GMT", "WK09-26", "matches the repo"],
  ["Thu, 01 Oct 2026 14:02:58 GMT", "WK40-26", "blog title says WK26-40"],
];
for (const [date, want, note] of REAL) {
  const got = labelFor(new Date(date));
  check(`${new Date(date).toUTCString().slice(0, 16)} -> ${want}  (${note})`, got === want, `got ${got}`);
}

check("1 Oct 2026 is in ISO week 40", isoWeek(new Date("2026-10-01T00:00:00Z")).week === 40);
check(
  "a Sunday belongs to the week that started on the Monday",
  isoWeek(new Date("2026-10-04T00:00:00Z")).week === 40
);
check(
  "1 Jan 2027 belongs to ISO week 53 of 2026",
  isoWeek(new Date("2027-01-01T00:00:00Z")).year === 2026,
  JSON.stringify(isoWeek(new Date("2027-01-01T00:00:00Z")))
);
check("prettyDate formats as the year files do", prettyDate(new Date("2026-10-01T00:00:00Z")) === "1 October 2026");

console.log("\nTransposed titles");
check("reads WK26-40 out of the title", labelInTitle("Release WK26-40") === "WK26-40");
check("reads WK09-26 with a leading zero", labelInTitle("Release WK09-26") === "WK09-26");
check("no code in a feature post title", labelInTitle("Introducing the New AI Studio") === null);
check(
  "title and date disagree for the transposed post",
  labelInTitle("Release WK26-40") !== labelFor(new Date("Thu, 01 Oct 2026 14:02:58 GMT"))
);

/* --------------------------------------------------------------- images */

console.log("\nImage paths");
check(
  "blog CDN -> repo path",
  localImagePath("https://blog.pitchprint.com/content/images/2026/06/image.png") ===
    "/blog/images/2026/06/image.png"
);
check(
  "nested month folders survive",
  localImagePath("https://blog.pitchprint.com/content/images/2024/11/a/b-2.jpg") ===
    "/blog/images/2024/11/a/b-2.jpg"
);
check("a foreign host is left alone", localImagePath("https://cdn.example.com/x.png") === null);
check("a non-image blog URL is left alone", localImagePath("https://blog.pitchprint.com/about/") === null);
check("junk does not throw", localImagePath("not a url") === null);

/* ----------------------------------------------------------- conversion */

console.log("\nConverting a post");

const HTML = `<h1>Release WK26-40</h1>
<p>Hi all,</p>
<p>We're back with another round of updates.</p>
<p><strong>What's new&#128640;,</strong></p>
<h2>Show item dimensions</h2>
<p>You can now view an item's dimensions while resizing. Use the <code>{size}</code> token.</p>
<figure class="kg-card kg-image-card"><img src="https://blog.pitchprint.com/content/images/2026/06/image.png" alt=""><figcaption>The option on the settings page</figcaption></figure>
<h2>Copy button</h2>
<p>A second feature.</p>
<figure class="kg-card kg-image-card"><img src="https://blog.pitchprint.com/content/images/2026/06/image-6.png" alt=""></figure>
<p><em>We also fixed the following bugs:</em></p>
<p><strong>Page Loader</strong></p>
<p>Fixed a hang.</p>
<p>From all of us at the PitchPrint team</p>`;

const c = convertPost(HTML);

check("the post's h1 is dropped", !/^#\s/m.test(c.markdown));
check("h2 becomes ###", (c.markdown.match(/^### /gm) || []).length === 2);
check("the What's-new lead-in is removed", !/what'?s new/i.test(c.markdown));
check("the opening paragraph survives", c.markdown.includes("another round of updates"));
check("the sign-off survives", c.markdown.includes("From all of us at the PitchPrint team"));
check("both images found", c.images.length === 2, `${c.images.length}`);
check("both rewritten to repo paths", c.images.every((i) => i.local?.startsWith("/blog/images/")));
check("images wrapped in Frame", (c.markdown.match(/<Frame>/g) || []).length === 2);
check("figcaption became alt text", c.markdown.includes('alt="The option on the settings page"'));
check("missing alt counted", c.missingAlt === 1, `${c.missingAlt}`);
check("bug-fix section detected", c.hasFixes === true);
check(
  "braces in prose are escaped for MDX",
  c.markdown.includes("&#123;size&#125;") || c.markdown.includes("`{size}`"),
  c.markdown.match(/.{0,30}size.{0,30}/)?.[0]
);
check("no raw < left in prose", !/<(?!Frame|\/Frame|img)/.test(c.markdown.replace(/<Frame>[\s\S]*?<\/Frame>/g, "")));

const block = renderBlock({
  label: "WK40-26",
  date: "1 October 2026",
  markdown: c.markdown,
  link: "https://blog.pitchprint.com/release-wk26-40/",
});

console.log("\nThe rendered block");
check("opens in the live format", /^<Update label="WK40-26" description="1 October 2026"\n/.test(block));
check("has an rss line", /^\s{2}rss=\{\{ title: "/m.test(block));
check("carries the source link", block.includes("release-wk26-40"));
check("has the bold summary line", block.includes("**Show item dimensions, Copy button.**"));
check("closes", block.trimEnd().endsWith("</Update>"));
check("body is indented two spaces", /^ {2}### Show item dimensions$/m.test(block));
check("no line is left with trailing spaces", !/[ \t]+$/m.test(block));

/* -------------------------------------------------------- end to end */

console.log("\nEnd to end, against a year file");

const CRLF = "\r\n";
const YEAR = [
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
  "  Hand-written prose — with an em dash — that must survive byte for byte.",
  "",
  "  <AccordionGroup>",
  '    <Accordion title="A fix">',
  "      Detail.",
  "    </Accordion>",
  "  </AccordionGroup>",
  "</Update>",
  "",
].join(CRLF);

const DOCS_JSON =
  JSON.stringify(
    {
      navigation: {
        products: [
          {
            tabs: [
              {
                tab: "Blog",
                groups: [{ group: "Releases", pages: ["blog/releases/2026", "blog/releases/2025"] }],
              },
            ],
          },
        ],
      },
    },
    null,
    2
  ) + "\n";

function feed(items) {
  return (
    JSON.stringify(
      { source: "fixture", fetchedAt: "2026-10-15T00:00:00Z", count: items.length, releases: items },
      null,
      2
    ) + "\n"
  );
}

// Fixtures go in the system temp dir, never inside the repo: on a machine
// working through the Cowork device bridge, files inside a connected folder
// cannot be unlinked, so cleanup would fail with EPERM.
//
// turndown is reached by linking the repo's node_modules rather than copying
// it — copying took minutes per fixture over a mounted volume. A junction is
// used because that is the one directory link Windows allows unprivileged.
async function linkModules(dir) {
  const target = join(scriptDir, "..", "node_modules");
  if (!existsSync(target)) return;
  try {
    await symlink(target, join(dir, "node_modules"), "junction");
  } catch {
    // Not fatal on its own — the spawned script will say what it could not
    // resolve, which is a clearer error than a broken link.
  }
}

async function fixture(items) {
  const dir = await mkdtemp(join(tmpdir(), "blogrel-"));
  await mkdir(join(dir, "blog", "releases"), { recursive: true });
  await mkdir(join(dir, "data"), { recursive: true });
  await mkdir(join(dir, "scripts"), { recursive: true });
  await writeFile(join(dir, "blog", "releases", "2026.mdx"), YEAR, "utf8");
  await writeFile(join(dir, "docs.json"), DOCS_JSON, "utf8");
  await writeFile(join(dir, "package.json"), '{"type":"module"}\n', "utf8");
  await writeFile(join(dir, "data", "blog-releases.json"), feed(items), "utf8");
  // Copy every non-test module rather than an explicit list. The list was a
  // hidden coupling: adding an import to ingest-blog-releases.mjs broke 15
  // tests with ERR_MODULE_NOT_FOUND, which says nothing about the import.
  for (const f of await readdir(scriptDir)) {
    if (!f.endsWith(".mjs") && !f.endsWith(".js")) continue;
    if (f.startsWith("test-")) continue;
    await cp(join(scriptDir, f), join(dir, "scripts", f));
  }
  await linkModules(dir);
  // Pre-place the images the posts reference, so a passing run needs no
  // network at all. The one case that must hit the network is the download
  // failure below, which references a path that exists nowhere.
  for (const p of ["2026/06/image.png", "2026/06/image-6.png"]) {
    const dest = join(dir, "blog", "images", p);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, "x", "utf8");
  }
  return dir;
}

/** Cleanup must never fail the suite: some filesystems refuse unlink. */
const cleanup = async (dir) => {
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    /* left behind in the temp dir; harmless */
  }
};

const run = (dir, args = []) => {
  const r = spawnSync("node", [join(dir, "scripts", "ingest-blog-releases.mjs"), ...args], {
    cwd: dir,
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

const POST_NEW = {
  title: "Release WK26-40",
  link: "https://blog.pitchprint.com/release-wk26-40/",
  pubDate: "Thu, 01 Oct 2026 14:02:58 GMT",
  html: HTML,
};
const POST_EXISTING = {
  title: "Release WK26-26",
  link: "https://blog.pitchprint.com/release-wk26-26/",
  pubDate: "Thu, 25 Jun 2026 12:56:41 GMT",
  html: "<h2>Show item dimensions</h2><p>Body.</p>",
};

{
  const dir = await fixture([POST_EXISTING]);
  const r = run(dir, ["--write"]);
  check("a post already in the year file is skipped", r.code === 0 && /already in/.test(r.out), r.out.trim());
  check("and the file is untouched", (await readFile(join(dir, "blog/releases/2026.mdx"), "utf8")) === YEAR);
  await cleanup(dir);
}

{
  const dir = await fixture([POST_NEW, POST_EXISTING]);
  const dry = run(dir);
  check("dry run exits 0 and writes nothing", dry.code === 0 && (await readFile(join(dir, "blog/releases/2026.mdx"), "utf8")) === YEAR);
  check("the transposed title is reported", /transposed/.test(dry.out));
  check("the accordion gap is reported", /AccordionGroup/.test(dry.out));
  // Wording comes from the gate's warnings now, not the ingest's own report.
  check("missing alt text is reported", /1 image\(s\) have no alt text/.test(dry.out), dry.out);

  const r = run(dir, ["--write"]);
  const after = await readFile(join(dir, "blog/releases/2026.mdx"), "utf8");
  check("exits 2 for 'wrote changes'", r.code === 2, `exit ${r.code}: ${r.out.slice(-200)}`);

  const blocks = (s) => s.match(/<Update\b[\s\S]*?<\/Update>/g) || [];
  check("one block added", blocks(after).length === 2, `${blocks(after).length}`);
  check(
    "the hand-written block is byte-for-byte identical",
    blocks(YEAR).every((b) => after.includes(b))
  );
  check("the new block is first", /^<Update\s+label="WK40-26"/.test(blocks(after)[0]));
  check("filed under the right label, not the title's", after.includes('label="WK40-26"') && !after.includes('label="WK26-40"'));
  check(
    "line endings preserved — no bare LF",
    (after.match(/\n/g) || []).length === (after.match(/\r\n/g) || []).length
  );
  check("images point at the repo, not the blog", after.includes('src="/blog/images/2026/06/image.png"'));
  check("no blog.pitchprint.com image URL left behind", !/<img[^>]*blog\.pitchprint\.com/.test(after));
  check("docs.json untouched", (await readFile(join(dir, "docs.json"), "utf8")) === DOCS_JSON);

  const again = run(dir, ["--write"]);
  check("re-running is a no-op", again.code === 0 && (await readFile(join(dir, "blog/releases/2026.mdx"), "utf8")) === after);
  await cleanup(dir);
}

{
  // The "every image must land before anything is written" guard.
  //
  // The first version of this test created the failure by having no network,
  // which meant it passed on a laptop behind an egress proxy and FAILED on a
  // CI runner that could reach the blog — there the image downloaded, the note
  // was written, and the assertion was simply wrong. A test that passes for
  // environmental reasons is worse than no test.
  //
  // So it now points at a path that does not exist on the blog. The download
  // fails the same way everywhere: 404 where the host is reachable, a
  // connection error where it is not. Both land in the same refusal.
  const MISSING = {
    ...POST_NEW,
    html: HTML.replace(
      "content/images/2026/06/image.png",
      "content/images/2026/06/__deliberately-absent-for-tests__.png"
    ),
  };
  const dir = await fixture([MISSING]);
  const before = await readFile(join(dir, "blog/releases/2026.mdx"), "utf8");
  const r = run(dir, ["--write"]);
  check(
    "a failed image download refuses rather than writing a broken note",
    r.code === 1 && /Refusing to write a release note whose images are missing/.test(r.out),
    `exit ${r.code}: ${r.out.trim().split("\n").slice(-2).join(" ")}`
  );
  check("and nothing was written", (await readFile(join(dir, "blog/releases/2026.mdx"), "utf8")) === before);
  await cleanup(dir);
}

{
  const dir = await fixture([{ ...POST_NEW, pubDate: "not a date" }]);
  const before = await readFile(join(dir, "blog/releases/2026.mdx"), "utf8");
  const r = run(dir, ["--write"]);
  check("an unreadable pubDate is refused, not guessed", r.code === 1 && /unreadable pubDate/.test(r.out));
  check("and nothing was written", (await readFile(join(dir, "blog/releases/2026.mdx"), "utf8")) === before);
  await cleanup(dir);
}

{
  const dir = await fixture([POST_NEW]);
  const before = await readFile(join(dir, "blog/releases/2026.mdx"), "utf8");
  const r = run(dir, ["--preview", ".draft"]);
  check("preview exits 0", r.code === 0);
  check("preview leaves the year file alone", (await readFile(join(dir, "blog/releases/2026.mdx"), "utf8")) === before);
  check("preview writes the candidate", existsSync(join(dir, ".draft", "2026-WK40-26.mdx")));
  check("--preview with --write is refused", run(dir, ["--preview", ".draft", "--write"]).code === 1);
  await cleanup(dir);
}

/* --------------------------------------------------------------- done */

console.log("");
if (failures) {
  console.error(`${failures} blog release-note check(s) failed.`);
  process.exit(1);
}
console.log("All blog release-note tests passed.");
