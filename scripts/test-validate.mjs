// Adversarial tests for validate() in style-pass.mjs.
//
// validate() is the only thing standing between a model's output and a page
// that goes live unreviewed. Every check gets a test that proves it fires, and
// a legitimately restructured page gets a test that proves it does NOT fire.
//
//   node scripts/test-validate.mjs

import { validate } from "./style-pass.mjs";

const TITLE = "How To Install PitchPrint On EKM";

// A mechanically-tidied source article: two images, one external link, a
// numbered procedure, and a callout.
const SOURCE = `---
title: "How To Install PitchPrint On EKM"
description: "Install the PitchPrint app on EKM and assign a design to a product."
---

<Steps>
  <Step title="Log in to your EKM dashboard">
    Log in to your EKM dashboard and open the apps area.

    <Frame>
      <img src="https://s3.amazonaws.com/helpscout.net/docs/assets/file-AAA111.png" alt="" />
    </Frame>
  </Step>

  <Step title="Search for PitchPrint in the app store">
    Search the app store for PitchPrint and click install. You will need an
    account first — sign up at [pitchprint.com](https://pitchprint.com/register).

    <Frame>
      <img src="https://s3.amazonaws.com/helpscout.net/docs/assets/file-BBB222.png" alt="" />
    </Frame>
  </Step>
</Steps>

<Note>
  The app requires an active EKM subscription before the design tool appears on
  your product pages.
</Note>
`;

// What a good model response looks like: real alt text, better step titles,
// restructured prose, same facts, same URLs.
const GOOD = `---
title: "How To Install PitchPrint On EKM"
description: "Install the PitchPrint app on EKM and assign a design to a product."
---

Install the PitchPrint app from the EKM app store, then assign a design to any
product in your catalogue.

<Steps>
  <Step title="Open the apps area">
    Log in to your EKM dashboard and open the apps area.

    <Frame>
      <img src="https://s3.amazonaws.com/helpscout.net/docs/assets/file-AAA111.png" alt="The apps area in the EKM dashboard" />
    </Frame>
  </Step>

  <Step title="Install PitchPrint">
    Search the app store for PitchPrint and click install. Create an account
    first at [pitchprint.com](https://pitchprint.com/register) if you do not
    have one.

    <Frame>
      <img src="https://s3.amazonaws.com/helpscout.net/docs/assets/file-BBB222.png" alt="PitchPrint listed in the EKM app store" />
    </Frame>
  </Step>
</Steps>

<Note>
  The design tool only appears on your product pages once your EKM subscription
  is active.
</Note>
`;

/* ------------------------------------------------------------------ harness */

let failures = 0;

function expectClean(name, after) {
  const problems = validate(SOURCE, after, TITLE);
  if (problems.length) {
    failures += 1;
    console.log(`FAIL  ${name}`);
    console.log(`      expected no problems, got: ${problems.join("; ")}`);
  } else {
    console.log(`ok    ${name}`);
  }
}

function expectRejected(name, after, matcher) {
  const problems = validate(SOURCE, after, TITLE);
  const hit = problems.find((p) => matcher.test(p));
  if (!hit) {
    failures += 1;
    console.log(`FAIL  ${name}`);
    console.log(`      expected a problem matching ${matcher}, got: ${problems.join("; ") || "none"}`);
  } else {
    console.log(`ok    ${name}  (${hit})`);
  }
}

/* -------------------------------------------------------------------- tests */

// The one that must pass. If this fails, every article silently falls back to
// the mechanical version and the AI pass is dead weight.
expectClean("a legitimately restructured page is accepted", GOOD);

expectRejected(
  "an image dropped entirely",
  GOOD.replace(
    /\s*<Frame>\s*<img src="https:\/\/s3\.amazonaws\.com\/helpscout\.net\/docs\/assets\/file-BBB222\.png"[^>]*\/>\s*<\/Frame>/,
    ""
  ),
  /image dropped/
);

expectRejected(
  "an image URL rewritten (CDN swap)",
  GOOD.replace("s3.amazonaws.com/helpscout.net/docs/assets/file-AAA111.png", "cdn.pitchprint.com/file-AAA111.png"),
  /image dropped/
);

expectRejected(
  "an external link dropped",
  GOOD.replace("[pitchprint.com](https://pitchprint.com/register)", "the PitchPrint site"),
  /link dropped/
);

expectRejected(
  "frontmatter removed",
  GOOD.replace(/^---\n[\s\S]*?\n---\n/, ""),
  /frontmatter missing/
);

expectRejected(
  "an extra frontmatter key added",
  GOOD.replace('description:', 'sidebarTitle: "EKM"\ndescription:'),
  /extra frontmatter keys: sidebarTitle/
);

expectRejected(
  "the title reworded",
  GOOD.replace(TITLE, "Installing PitchPrint on EKM"),
  /title changed/
);

expectRejected(
  "a component invented",
  GOOD.replace("<Steps>", "<Columns cols={2}>\n</Columns>\n\n<Steps>"),
  /component not in the allowlist: Columns/
);

expectRejected(
  "an unclosed component",
  GOOD.replace("</Steps>", ""),
  /unbalanced <Steps>/
);

expectRejected(
  "the body summarised away",
  `---
title: "How To Install PitchPrint On EKM"
description: "Install the PitchPrint app on EKM and assign a design to a product."
---

Install PitchPrint from the EKM app store.

<Frame>
  <img src="https://s3.amazonaws.com/helpscout.net/docs/assets/file-AAA111.png" alt="EKM dashboard" />
</Frame>
<Frame>
  <img src="https://s3.amazonaws.com/helpscout.net/docs/assets/file-BBB222.png" alt="App store" />
</Frame>

See [pitchprint.com](https://pitchprint.com/register).
`,
  /content loss/
);

expectRejected(
  "a whole step deleted",
  GOOD.replace(/  <Step title="Install PitchPrint">[\s\S]*?<\/Step>\n/, ""),
  /image dropped|link dropped|content loss/
);

// A response that is only an apology, or a refusal, must not reach the site.
expectRejected(
  "the model answering in prose instead of MDX",
  "I've rewritten the article below in your house style:\n\nInstall PitchPrint on EKM.\n",
  /frontmatter missing/
);

/* ------------------------------------------- the case with no image to lose */

// The residual risk: a step that carries no image and no link. Images and links
// cannot catch its deletion, so the structure and specifics checks are the only
// defence. This article is deliberately image-free.
const PLAIN_TITLE = "Configuring The PitchPrint Module";
const PLAIN = `---
title: "Configuring The PitchPrint Module"
description: "Set your API key and upload the module to the modules directory."
---

## Before you start

You need PrestaShop 1.7 or later and your PitchPrint \`apiKey\` from the dashboard.

<Steps>
  <Step title="Upload the module">
    Copy \`pitchprint.zip\` into the \`modules\` directory on your server.
  </Step>

  <Step title="Set the API key">
    Open **Modules → PitchPrint → Configure** and paste your \`apiKey\` into the
    field, then save.
  </Step>

  <Step title="Clear the cache">
    Go to **Advanced Parameters → Performance** and clear the cache so the
    module registers.
  </Step>
</Steps>

## Troubleshooting

If the design button does not appear, confirm the module is enabled and that
port 443 is open outbound.
`;

function plain(name, after, matcher) {
  const problems = validate(PLAIN, after, PLAIN_TITLE);
  const hit = matcher ? problems.find((p) => matcher.test(p)) : null;
  const ok = matcher ? Boolean(hit) : problems.length === 0;
  if (!ok) {
    failures += 1;
    console.log(`FAIL  ${name}`);
    console.log(
      matcher
        ? `      expected a problem matching ${matcher}, got: ${problems.join("; ") || "none"}`
        : `      expected no problems, got: ${problems.join("; ")}`
    );
  } else {
    console.log(`ok    ${name}${hit ? `  (${hit})` : ""}`);
  }
}

plain("an image-free page passes unchanged", PLAIN, null);

// Caught by the specifics check, not the step floor — the deleted step carries
// `apiKey` and a bold UI path. The requirement is that the deletion is rejected,
// not that a particular rule is the one to notice it.
plain(
  "a middle step deleted with no image to betray it",
  PLAIN.replace(/  <Step title="Set the API key">[\s\S]*?<\/Step>\n\n/, ""),
  /specifics dropped|steps lost|content loss/
);

plain(
  "the last step deleted",
  PLAIN.replace(/\n  <Step title="Clear the cache">[\s\S]*?<\/Step>\n/, "\n"),
  /specifics dropped|steps lost|content loss/
);

plain(
  "a whole section dropped",
  PLAIN.replace(/## Troubleshooting[\s\S]*$/, ""),
  /specifics dropped|headings lost|content loss/
);

// The step floor tolerates demoting a stray item but not structural collapse.
// Build a 12-step procedure and flatten it to two.
{
  const many =
    "---\ntitle: \"Many Steps\"\ndescription: \"A long procedure.\"\n---\n\n<Steps>\n" +
    Array.from({ length: 12 }, (_, i) => `  <Step title="Step ${i + 1}">\n    Do the ${i + 1} thing carefully and then continue onward to the next one.\n  </Step>`).join("\n") +
    "\n</Steps>\n";
  const collapsed = many.replace(/(  <Step title="Step 3">[\s\S]*)<\/Steps>/, "</Steps>");
  const problems = validate(many, collapsed, "Many Steps");
  const hit = problems.find((p) => /steps lost/.test(p));
  if (!hit) {
    failures += 1;
    console.log(`FAIL  a 12-step procedure collapsed to 2 is rejected\n      got: ${problems.join("; ") || "none"}`);
  } else {
    console.log(`ok    a 12-step procedure collapsed to 2 is rejected  (${hit})`);
  }
}

// One stray closing item demoted out of 14 is allowed — this is the real case
// the EKM article produced, and rejecting it would discard a good rewrite.
{
  const fourteen =
    "---\ntitle: \"Fourteen\"\ndescription: \"A long procedure.\"\n---\n\n<Steps>\n" +
    Array.from({ length: 14 }, (_, i) => `  <Step title="Step ${i + 1}">\n    Do the ${i + 1} thing carefully and then continue onward to the next one.\n  </Step>`).join("\n") +
    "\n</Steps>\n";
  const demoted = fourteen
    .replace(/  <Step title="Step 14">\n    (.*)\n  <\/Step>\n/, "")
    .replace("</Steps>", "</Steps>\n\n<Note>\n  Do the 14 thing carefully and then continue onward to the next one.\n</Note>");
  const problems = validate(fourteen, demoted, "Fourteen");
  if (problems.length) {
    failures += 1;
    console.log(`FAIL  demoting 1 of 14 steps to a callout is allowed\n      got: ${problems.join("; ")}`);
  } else {
    console.log("ok    demoting 1 of 14 steps to a callout is allowed");
  }
}

plain(
  "a version number changed",
  PLAIN.replace("PrestaShop 1.7", "PrestaShop 8.0"),
  /specifics dropped/
);

plain(
  "a UI path reworded away",
  PLAIN.replace("**Advanced Parameters → Performance**", "the performance settings"),
  /specifics dropped/
);

// Backticks dropped from a word that is still there is a cosmetic regression,
// not a fact loss. validate() deliberately allows it: enforcing the backticks
// would reject a legitimate move of a filename into a fenced code block, and
// the cost of a false rejection is losing the whole AI pass for that article.
plain(
  "a code identifier de-emphasised but kept is accepted",
  PLAIN.replace(/`modules` directory/, "modules folder"),
  null
);

plain(
  "a code identifier removed outright",
  PLAIN.replace("Copy `pitchprint.zip` into the `modules` directory", "Upload the archive to the right place"),
  /specifics dropped/
);

plain(
  "the port number dropped",
  PLAIN.replace("port 443 is open outbound", "the port is open outbound"),
  /specifics dropped/
);

// Reformatting a UI path is fine as long as the label survives — the check must
// not fire on a legitimate change of emphasis.
plain(
  "bold reformatted but the label kept is accepted",
  PLAIN.replace(
    "**Advanced Parameters → Performance**",
    "**Advanced Parameters → Performance** in the sidebar"
  ),
  null
);

/* ------------------------------------- the real pages, checked against themselves */

// The check that earns its keep. Every hand-written page in docs/ is fed to
// validate() as both source and output: an identical document must never be
// rejected. This is what caught a whitespace bug that reported every multi-line
// code block as dropped content.
//
// A handful of real pages legitimately use things an automated pass may not
// invent — `openapi:` frontmatter on the API playground pages, `tag:`, and the
// bespoke <ReleaseLink> — so those rejections are expected and named here.
const EXPECTED_DIVERGENCE =
  /extra frontmatter keys: (openapi|tag|release)|component not in the allowlist: ReleaseLink/;

async function sweepRealPages() {
  const { readdir, readFile } = await import("node:fs/promises");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const { existsSync } = await import("node:fs");

  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "docs");
  if (!existsSync(root)) {
    console.log("\n--    docs/ not present, skipping the sweep over real pages");
    return;
  }

  const files = [];
  const walk = async (dir) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.name.endsWith(".mdx")) files.push(p);
    }
  };
  await walk(root);

  const unexpected = [];
  const untitled = [];
  let checked = 0;
  for (const f of files) {
    // The repo is checked out CRLF on Windows; normalise or every title regex
    // misses and the sweep silently checks nothing.
    const text = (await readFile(f, "utf8")).replace(/\r\n/g, "\n");
    const t = text.match(/^---\n[\s\S]*?title:\s*"?(.*?)"?\s*$/m);
    if (!t) {
      untitled.push(f.replace(root, "docs"));
      continue;
    }
    checked += 1;
    for (const p of validate(text, text, t[1])) {
      if (!EXPECTED_DIVERGENCE.test(p)) unexpected.push(`${f.replace(root, "docs")}: ${p}`);
    }
  }

  // A sweep that checks nothing must not report success. This fired for real:
  // CRLF line endings made every title regex miss, and the suite passed while
  // silently exercising none of the 132 pages it exists to cover.
  if (files.length && checked < files.length * 0.9) {
    failures += 1;
    console.log(
      `\nFAIL  the sweep only read ${checked} of ${files.length} pages — it is not actually checking them`
    );
    for (const u of untitled.slice(0, 5)) console.log(`      no title parsed: ${u}`);
    return;
  }

  if (unexpected.length) {
    failures += 1;
    console.log(`\nFAIL  ${checked} real pages swept — validate() rejected ${unexpected.length} unexpectedly:`);
    for (const u of unexpected.slice(0, 15)) console.log(`      ${u}`);
  } else {
    console.log(`\nok    ${checked} real hand-written pages accepted (bar the known divergences)`);
  }
}

await sweepRealPages();

/* ------------------------------------------------------------------ summary */

console.log("");
if (failures) {
  console.log(`${failures} test(s) failed — validate() is not safe to ship.`);
  process.exit(1);
}
console.log("All validate() tests passed.");
