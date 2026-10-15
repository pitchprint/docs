// Tests for the release-note quality gate.
//
// Most of this file is damage: a correct block, then the same block with one
// thing broken, asserting the gate catches it and says which. A gate that has
// only ever been seen to pass is not a gate.
//
//   node scripts/test-validate-release-note.mjs

import { validateReleaseNote, proseWords } from "./validate-release-note.mjs";

let failures = 0;
const check = (name, ok, detail = "") => {
  if (ok) console.log(`  ok    ${name}`);
  else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`);
  }
};

/* ------------------------------------------------------------ fixtures */

// The markdown convertPost would produce from a post, and the block
// renderBlock would build from it. Kept in step by hand so a change to the
// renderer that breaks the gate shows up here.
const SOURCE_MD = `Hi all,

We're back with another round of updates, and the team has been busy improving
the editor for you and your customers this week.

### Show item dimensions

You can now view an item's dimensions directly on the canvas while resizing,
which makes precise placement much easier than it used to be.

<Frame>
  <img src="/blog/images/2026/06/image.png" alt="The settings page" />
</Frame>

### Copy button

Duplicate any item with a single click instead of copying and pasting it.
Read more at [the guide](https://docs.pitchprint.com/tutorial/copy).

From all of us at the PitchPrint team`;

const SOURCE = {
  markdown: SOURCE_MD,
  images: [{ src: "https://blog.pitchprint.com/content/images/2026/06/image.png", local: "/blog/images/2026/06/image.png" }],
  missingAlt: 0,
  hasFixes: false,
};

const body = (md) => md.split("\n").map((l) => (l.trim() ? "  " + l : "")).join("\n");

const BLOCK = `<Update label="WK40-26" description="1 October 2026"
  rss={{ title: "WK40-26 — Show item dimensions, Copy button", description: "Show item dimensions, Copy button." }}>
  {/* Imported from https://blog.pitchprint.com/release-wk26-40/ — check the bug-fix section reads as an <AccordionGroup>, and that every image has real alt text. */}

  **Show item dimensions, Copy button.**

${body(SOURCE_MD)}

</Update>`;

/* -------------------------------------------------------- the good case */

console.log("\nA correct block");
{
  const v = validateReleaseNote(BLOCK, SOURCE);
  check("passes", v.ok, v.problems.join(" | "));
  check("is clean — nothing for a person to do", v.clean, v.warnings.join(" | "));
  check("scores 100%", v.score === 100, `${v.score}%`);
  check("no problems listed", v.problems.length === 0, v.problems.join(" | "));
}

console.log("\nThe import comment is prose, not markup");
{
  // The gate's very first run rejected a good block because its own import
  // comment mentions <AccordionGroup>, and the tag scan counted it as open.
  const v = validateReleaseNote(BLOCK, SOURCE);
  check(
    "a comment mentioning <AccordionGroup> is not read as a tag",
    !v.problems.some((p) => /AccordionGroup/.test(p)),
    v.problems.join(" | ")
  );
}

/* ----------------------------------------------------------- the damage */

console.log("\nContent loss");

const broke = (name, mutate, expect, source = SOURCE) => {
  const v = validateReleaseNote(mutate(BLOCK), source);
  check(`${name} — rejected`, !v.ok, `score ${v.score}, problems: ${v.problems.join(" | ")}`);
  check(
    `${name} — says why`,
    v.problems.some((p) => expect.test(p)),
    v.problems.join(" | ") || "(no problems reported)"
  );
};

broke(
  "a whole heading and its section dropped",
  (b) => b.replace(/ {2}### Copy button[\s\S]*?copy\)\./, ""),
  /heading dropped|fidelity/
);

broke(
  "an image dropped",
  (b) => b.replace(/ {2}<Frame>[\s\S]*?<\/Frame>/, ""),
  /images: 1 in the post, 0 in the block/
);

broke(
  "an external link dropped",
  (b) => b.replace("[the guide](https://docs.pitchprint.com/tutorial/copy)", "the guide"),
  /external link dropped/
);

broke(
  "half the prose cut away",
  (b) =>
    b.replace(
      /You can now view an item's dimensions directly on the canvas while resizing,\n {2}which makes precise placement much easier than it used to be\./,
      "It shows dimensions."
    ),
  /fidelity \d+(\.\d+)?% of the source post's prose \(need 95%\)/
);

broke(
  "the body duplicated",
  (b) => b.replace("</Update>", `${body(SOURCE_MD)}\n${body(SOURCE_MD)}\n</Update>`),
  /content looks duplicated/
);

console.log("\nHouse style");

broke(
  "a component that is not in the allowlist",
  (b) => b.replace("**Show item dimensions", "<Columns>text</Columns>\n\n  **Show item dimensions"),
  /component not in the allowlist: Columns/
);

broke(
  "an unbalanced component",
  (b) => b.replace("</Frame>", ""),
  /unbalanced <Frame>/
);

broke(
  "a heading at the wrong level",
  (b) => b.replace("  ### Copy button", "  ## Copy button"),
  /headings must be ###/
);

broke(
  "an image left pointing at the blog",
  (b) => b.replace('src="/blog/images/2026/06/image.png"', 'src="https://blog.pitchprint.com/content/images/2026/06/image.png"'),
  /image still points off-site/
);

broke(
  "an image outside a Frame",
  (b) => b.replace(/ {2}<Frame>\n( *)(<img[^>]*>)\n {2}<\/Frame>/, "  $2"),
  /not wrapped in <Frame>/
);

broke(
  "an unescaped brace in prose",
  (b) => b.replace("Duplicate any item", "Duplicate any {item}"),
  /unescaped \{ or \}/
);

broke(
  "the Update header mangled",
  (b) => b.replace(/^<Update label="[^"]+" description="[^"]*"/, "<Update"),
  /does not open with <Update/
);

broke(
  "the rss line removed",
  (b) => b.replace(/^ {2}rss=\{\{[\s\S]*?\}\}>/m, ">"),
  /missing the rss/
);

/* -------------------------------------------------- needs a person */

console.log("\nPasses the gate but still needs a person");
{
  const v = validateReleaseNote(BLOCK, { ...SOURCE, missingAlt: 2 });
  check("missing alt text does not fail the gate", v.ok, v.problems.join(" | "));
  check("but it is not clean", !v.clean);
  check("and it says so", v.warnings.some((w) => /alt text/.test(w)), v.warnings.join(" | "));
}
{
  const v = validateReleaseNote(BLOCK, { ...SOURCE, hasFixes: true });
  check("an un-accordioned bug-fix section does not fail the gate", v.ok);
  check("but it is not clean", !v.clean);
  check("and it says so", v.warnings.some((w) => /AccordionGroup/.test(w)), v.warnings.join(" | "));
}

/* ------------------------------------------------------------- floor */

console.log("\nThe floor is a dial, not a constant");
{
  const cut = BLOCK.replace(
    /which makes precise placement much easier than it used to be\./,
    ""
  );
  const strict = validateReleaseNote(cut, SOURCE, { floor: 99 });
  const loose = validateReleaseNote(cut, SOURCE, { floor: 50 });
  check("rejected at 99%", !strict.ok, `score ${strict.score}`);
  check("accepted at 50%", loose.ok, loose.problems.join(" | "));
  check("same score either way", strict.score === loose.score, `${strict.score} vs ${loose.score}`);
  check("the score is between 50 and 99", strict.score > 50 && strict.score < 99, `${strict.score}`);
}

console.log("\nproseWords ignores markup, not words");
{
  check("strips tags", !proseWords("<Frame><img src='/a.png' /></Frame>").includes("frame"));
  check("keeps link text", proseWords("[the guide](https://x.com/y)").includes("the".length > 2 ? "guide" : "guide"));
  check("drops our import comment", !proseWords("{/* Imported from x */}").includes("imported"));
}

console.log("");
if (failures) {
  console.error(`${failures} gate check(s) failed.`);
  process.exit(1);
}
console.log("All release-note gate tests passed.");
