// Tests for the generated "What's new" card grid.
//
// The claim being defended is narrow and absolute: the automation writes only
// between its two markers, and a published docs page is otherwise untouched.
// So a good share of this file breaks the insert logic on purpose and asserts
// it refuses. The guard is the only thing standing between this and corrupted
// customer-facing pages.
//
//   node scripts/test-release-links.mjs

import {
  startMarker,
  END,
  withoutBlock,
  labelsInArticle,
  anchorFor,
  weekOf,
  summarize,
  renderCards,
  applyBlock,
} from "./release-callout.mjs";

let failures = 0;
const check = (name, ok, detail = "") => {
  if (ok) console.log(`  ok    ${name}`);
  else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`);
  }
};

/* ------------------------------------------------------------ fixtures */

const ARTICLE = `---
title: "Canvas Adjuster Module"
description: "Let customers resize the canvas."
---

import { ReleaseLink } from "/snippets/release-link.jsx";

<ReleaseLink release="wk26-26" />

This module allows your customers to adjust the canvas dimension.

### How to Enable and Configure Canvas Adjuster

1. Open the design.
2. Set the values — note the {braces} and <Note> below.

<Note>Hand-written note that must survive.</Note>

## Related articles

<CardGroup cols={2}>
  <Card title="Integrating Canvas Adjuster To A WordPress Store" icon="store" href="/docs/tutorial/integrating-canvas-adjuster-to-a-wordpress-store">
    Set up canvas-based pricing variations for the Canvas Adjuster in a WooCommerce store.
  </Card>
</CardGroup>
`;

const ENTRIES = [
  {
    label: "WK12-26",
    date: "19 March 2026",
    year: "2026",
    heading: "Scale Grouped Items in Canvas Adjuster",
    body: "We've enhanced the canvas adjuster to support automatic scaling for grouped items. Previously, this feature worked well for individual elements but did not fully support groups.",
  },
  {
    label: "WK30-25",
    date: "24 July 2025",
    year: "2025",
    heading: "Auto-Scale Items Canvas adjuster",
    body: "Items now scale automatically when the canvas size changes.",
  },
];

/* --------------------------------------------------------------- dates */

console.log("\nLabel conventions");
check("WK48-25 in 2025 is week 48", weekOf("WK48-25", "2025") === 48);
check("WK21-46 in 2021 is week 46 (year-first era)", weekOf("WK21-46", "2021") === 46);
check("WK26-26 in 2026 is week 26", weekOf("WK26-26", "2026") === 26);
check("the transposed WK26-40 in 2026 reads as week 40", weekOf("WK26-40", "2026") === 40);
check("a non-WK label does not throw", weekOf("December 🎅", "2019") === 0);

console.log("\nAnchors");
check(
  "slugged from the heading",
  anchorFor("Scale Grouped Items in Canvas Adjuster") === "scale-grouped-items-in-canvas-adjuster"
);
check("punctuation dropped", anchorFor("Single/Double sided module!") === "singledouble-sided-module");

/* ------------------------------------------------------------ summaries */

console.log("\nCard descriptions");
check(
  "takes the first sentence",
  summarize(ENTRIES[0].body) === "We've enhanced the canvas adjuster to support automatic scaling for grouped items.",
  summarize(ENTRIES[0].body)
);
check("a short body is kept whole", summarize("Items now scale automatically.") === "Items now scale automatically.");
check("empty body gives empty string", summarize("") === "");
check("images and frames are stripped", !summarize("<Frame><img src='/a.png' /></Frame> Text here.").includes("img"));
check(
  "link syntax becomes its text",
  summarize("Go to [admin settings](https://admin.pitchprint.com/settings) now.").includes("admin settings") &&
    !summarize("Go to [admin settings](https://x) now.").includes("http")
);
check(
  "braces are escaped so the MDX build survives",
  summarize("Use the {size} token in your field.").includes("&#123;size&#125;"),
  summarize("Use the {size} token in your field.")
);
check("inline code is left alone", summarize("Set `#size` as the selector.").includes("`#size`"));
check("a long body is cut and marked", summarize("word ".repeat(80), 60).length <= 62);

/* -------------------------------------------------------------- cards */

console.log("\nThe card grid");
const cards = renderCards(ENTRIES);
check("uses CardGroup cols={2}, like Related articles", cards.includes("<CardGroup cols={2}>"));
check("one Card per release", (cards.match(/<Card /g) || []).length === 2);
check("uses an icon the repo already uses", cards.includes('icon="rocket"'));
check("links to the feature's own anchor", cards.includes("/blog/releases/2026#scale-grouped-items-in-canvas-adjuster"));
check("links internally, not to the Ghost blog", !cards.includes("blog.pitchprint.com"));
check("the release and date are shown", cards.includes("**WK12-26 · 19 March 2026**"));
check("the description explains the change", cards.includes("support automatic scaling for grouped items"));
check("carries a What's new heading", cards.includes("## What's new"));

console.log("\nThe Latest badge");
check("the first card carries it", /<Card [^>]*Scale Grouped[\s\S]*?<Badge color="purple" size="sm">Latest<\/Badge>/.test(cards));
check("only one card carries it", (cards.match(/Latest<\/Badge>/g) || []).length === 1);
{
  // Measured inside the grid only: both labels also appear in the start
  // marker, which precedes every card, so searching the whole block compares
  // against the wrong occurrence.
  const grid = cards.slice(cards.indexOf("<CardGroup"));
  check(
    "it is on the newest, which is the first entry",
    grid.indexOf("Latest</Badge>") < grid.indexOf("WK30-25"),
    "the badge landed on the older release"
  );
  check("cards keep the order they were given", grid.indexOf("WK12-26") < grid.indexOf("WK30-25"));
}
{
  const single = renderCards([ENTRIES[1]]);
  check("a lone release still gets the badge", single.includes("Latest</Badge>"));
  check("and only once", (single.match(/Latest<\/Badge>/g) || []).length === 1);
}
check("Badge is a component the repo already uses", cards.includes('<Badge color="purple" size="sm">'));
check("the marker records the labels", cards.includes("release-notes:start WK12-26,WK30-25"));

/* ----------------------------------------------------------- placement */

console.log("\nPlacing it in the article");
const once = applyBlock(ARTICLE, cards);

check("the block is present", once.includes("release-notes:start") && once.includes(END));
check("it goes at the BOTTOM", once.trimEnd().endsWith(END));
check("it comes after Related articles", once.indexOf("release-notes:start") > once.indexOf("## Related articles"));
check(
  "EVERYTHING ELSE IS UNCHANGED",
  withoutBlock(once).trim() === withoutBlock(ARTICLE).trim(),
  "the article changed outside the block"
);
check("the hand-written Note survives", once.includes("Hand-written note that must survive."));
check("the hand-written ReleaseLink survives", once.includes('<ReleaseLink release="wk26-26" />'));
check("the Related articles CardGroup survives", once.includes("Integrating Canvas Adjuster To A WordPress Store"));
check("braces in the body survive untouched", once.includes("{braces}"));

console.log("\nLine endings");
const crlf = applyBlock(ARTICLE.replace(/\n/g, "\r\n"), cards);
check(
  "CRLF preserved — no bare LF introduced",
  (crlf.match(/\n/g) || []).length === (crlf.match(/\r\n/g) || []).length
);
check("an LF file stays LF", !once.includes("\r\n"));

/* --------------------------------------------------------- idempotency */

console.log("\nRunning twice");
const twice = applyBlock(once, cards);
check("is a no-op", twice === once, "the second run changed the file");
check("only one block exists", (twice.match(/release-notes:start/g) || []).length === 1);
check("only one What's new heading", (twice.match(/## What's new/g) || []).length === 1);

console.log("\nReading back what is there");
check("both labels recognised", labelsInArticle(once).join(",") === "WK12-26,WK30-25");
check("no block means no labels", labelsInArticle(ARTICLE).length === 0);
check(
  "a non-WK label is recognised too",
  labelsInArticle(
    applyBlock(ARTICLE, renderCards([{ label: "November", date: "1 Nov 2019", year: "2019", heading: "Bulk design configuration", body: "Configure many designs at once." }]))
  )[0] === "November",
  "parsing labels out of prose made those articles rewrite on every run"
);

console.log("\nAdding a release later");
const grown = applyBlock(
  once,
  renderCards([
    { label: "WK40-26", date: "1 October 2026", year: "2026", heading: "Copy button", body: "Duplicate any item with a single click." },
    ...ENTRIES,
  ])
);
check("the new release appears", grown.includes("WK40-26"));
check("the old ones remain", grown.includes("WK12-26") && grown.includes("WK30-25"));
check("the marker is updated", labelsInArticle(grown).join(",") === "WK40-26,WK12-26,WK30-25");
check("the article body is still untouched", withoutBlock(grown).trim() === withoutBlock(ARTICLE).trim());

/* ---------------------------------------------------------------- guard */

console.log("\nThe guard (sabotaged input)");

const refuses = (name, fn) => {
  let threw = null;
  try {
    fn();
  } catch (err) {
    threw = err;
  }
  check(`${name} — refuses`, threw !== null, "it returned a value instead of throwing");
  check(
    `${name} — says why`,
    threw ? /outside the generated block|not an article/.test(threw.message) : false,
    threw ? threw.message : "(no error)"
  );
};

refuses("a file with no frontmatter", () =>
  applyBlock("Just a body, no frontmatter.\n", cards)
);

// A block that smuggles an end marker closes the region early, so the text
// after it lands outside — the exact shape of a corrupting edit.
refuses("a block carrying a stray end marker", () =>
  applyBlock(ARTICLE, `${startMarker(["WK12-26"])}\n\n## What's new\n${END}\nLEAKED TEXT\n${END}`)
);

console.log("\nThe guard's comparison actually sees body changes");
{
  const corrupt = once.replace("This module allows your customers", "This module ALLOWS customers");
  check(
    "a changed line outside the block is detected",
    withoutBlock(corrupt).trim() !== withoutBlock(once).trim(),
    "the guard is blind to body edits — it would not catch anything"
  );
}

console.log("");
if (failures) {
  console.error(`${failures} release-link check(s) failed.`);
  process.exit(1);
}
console.log("All release-link tests passed.");
