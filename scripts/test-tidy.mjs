// Tests for the mechanical tidy pass.
//
// These lock in the Help Scout quirks that tidy() exists to undo. The run-on
// image case is a regression test: the ordinal unescape is anchored to line
// start, so it has to run AFTER images are split off the text glued to them,
// or the glued step silently stays escaped and never becomes a <Step>.
//
//   node scripts/test-tidy.mjs

import { tidy, tidyDescription } from "./tidy.mjs";

let failures = 0;
const check = (name, cond, detail) => {
  if (cond) console.log(`ok    ${name}`);
  else {
    failures += 1;
    console.log(`FAIL  ${name}\n      ${detail}`);
  }
};

/* ------------------------------------------------------- the run-on image bug */

const RUNON = `1\\. Open the admin panel.

![](https://example.com/a.png)2\\. Search for PitchPrint.

![](https://example.com/b.png)

3\\. Paste your key.
`;

{
  const r = tidy(RUNON);
  const steps = [...r.body.matchAll(/<Step title=/g)].length;
  check("an image glued to the next ordinal still becomes a step", steps === 3, `got ${steps} steps:\n${r.body}`);
  check("no escaped ordinal survives", !/\d\\\./.test(r.body), r.body);
  check("both images are kept", r.body.includes("a.png") && r.body.includes("b.png"), r.body);
}

/* ------------------------------------------------------------------ the rest */

{
  const r = tidy("![](https://example.com/x.png)\n");
  check("a bare image is wrapped in Frame", /<Frame>\s*<img src="https:\/\/example\.com\/x\.png"/.test(r.body), r.body);
  check("a missing alt is reported", r.warnings.some((w) => /alt text/.test(w)), JSON.stringify(r.warnings));
}

{
  const r = tidy("Note: back up your store first.\n");
  check("a Note: prefix becomes a Note callout", /<Note>\s*back up your store first\.\s*<\/Note>/.test(r.body), r.body);
}

{
  const r = tidy("Important: this cannot be undone.\n");
  check("an Important: prefix becomes a Warning", /<Warning>/.test(r.body), r.body);
}

{
  const r = tidy("##### Troubleshooting\n\nSome text.\n");
  check("h5 is demoted to h3", /^### Troubleshooting/m.test(r.body), r.body);
}

{
  const r = tidy("**\\[POST\\]** /api/v1\n");
  check("escaped brackets are unescaped", r.body.includes("**[POST]**"), r.body);
}

{
  // A single numbered item is not a procedure; wrapping it in <Steps> would be
  // worse than leaving it.
  const r = tidy("1\\. The only item.\n\nSome following prose.\n");
  check("a lone numbered item is left alone", !r.body.includes("<Steps>"), r.body);
}

{
  // Trailing prose after the last step must stay outside the Steps block.
  const r = tidy("1\\. First.\n\n2\\. Second.\n\nClosing remarks.\n");
  const after = r.body.split("</Steps>")[1] || "";
  check("prose after the last step stays outside Steps", after.includes("Closing remarks"), r.body);
}

/* ---------------------------------------------------------------- descriptions */

check(
  "a truncated description is cut at the sentence",
  tidyDescription("Install the plugin on your store. Then assign a design to a product and...") ===
    "Install the plugin on your store.",
  tidyDescription("Install the plugin on your store. Then assign a design to a product and...")
);

check("an empty description stays null", tidyDescription(null) === null, "expected null");

{
  const long = "a".repeat(300);
  const d = tidyDescription(long);
  check("an over-long description is capped", d.length <= 160, `${d.length} chars`);
}

console.log("");
if (failures) {
  console.log(`${failures} test(s) failed.`);
  process.exit(1);
}
console.log("All tidy() tests passed.");
