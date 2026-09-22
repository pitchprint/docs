# PitchPrint docs house style

Fed verbatim to the AI conformance step in `scripts/style-pass.mjs`, alongside a
real page from the same section as an exemplar. Edit this file to change how
newly ingested articles are written.

Derived from the existing hand-written pages, not from generic advice. Component
usage counts across `docs/` at the time of writing: Card 342, Frame 336, Step
280, ResponseField 196, CardGroup 98, Steps 52, Note 44, Warning 20, Accordion
14, Tip 13, Tree 12.

## Frontmatter

Exactly two keys, nothing else:

```mdx
---
title: "How To Install PitchPrint On WordPress"
description: "Install WordPress, WooCommerce and the PitchPrint plugin, then assign your first design."
---
```

- `description` is one sentence saying what the reader will accomplish. Not the
  first sentence of the article. Never truncated, never ends in an ellipsis.
- Do not add `sidebarTitle`, `icon`, `mode` or any other key.

Some existing pages carry a third key — `openapi:` on the API playground pages,
`tag:` on two documentation pages, `release:` on one tutorial page. Those are
hand-authored and correct where they are, but they wire a page to a spec file or
a release entry. Never add one to an imported article: it would point at
something that does not exist.

## Procedures use Steps

Any numbered sequence becomes `<Steps>`. Step titles are short imperative
phrases — "Install WooCommerce", not "Once you have logged in, navigate to...".

```mdx
<Steps>
  <Step title="Install WooCommerce">
    Log in to your WordPress admin and go to **Plugins → Add New**, then search
    for "WooCommerce" and install it.
  </Step>
</Steps>
```

- Two-space indentation inside components.
- UI paths use bold with an arrow: **Plugins → Add New**.
- Keep a step's content inside its own `<Step>`; do not let prose leak between steps.
- **Rewrite the titles, keep the count.** One `<Step>` in equals one `<Step>` out.
  Merging two steps because they seem related is treated as a lost step and the
  whole rewrite is discarded.
- Splitting one step into two is fine — the count may grow, never shrink.

## Images are wrapped in Frame with real alt text

```mdx
<Frame>
  <img src="https://s3.amazonaws.com/helpscout.net/docs/assets/.../file-W9AGE0E48d.png" alt="PitchPrint settings in the WordPress admin" />
</Frame>
```

- **Never change an image URL.** They are hosted externally; a rewritten URL is a
  broken image.
- Write `alt` describing what the screenshot shows. Empty `alt=""` is not acceptable.
- A `<Frame>` inside a `<Step>` sits at that step's indentation.

## Callouts

Use the one that matches the stakes, sparingly — at most one or two per page:

- `<Note>` — context the reader needs but would not guess
- `<Tip>` — a shortcut or time-saver
- `<Warning>` — something that will break if ignored
- `<Danger>` — data loss or irreversible action
- `<Info>` — neutral aside

```mdx
<Warning>
  PitchPrint cannot run without WooCommerce. Install WooCommerce before the
  PitchPrint plugin.
</Warning>
```

Convert a paragraph that begins "Note:", "Important:", "Please note" or
"Warning:" into the matching callout and drop the prefix.

## Links

- Internal links are root-relative and include the `/docs` prefix:
  `[Authentication](/docs/api-reference/auth-signature)`
- Never link to `pitchprint.com/docs/...` with the full domain for an internal page.
- Leave external URLs exactly as they are.
- A bare URL used as its own link text should be given readable text where the
  destination is obvious: `[wordpress.org](http://wordpress.org/)`.

## Code and paths

- Inline code for file names, directories, parameters and short snippets:
  `pitchprint.php`, `modules`, `apiKey`.
- Fenced blocks with a language for anything multi-line.
- Script tags and other markup that the source escaped as `&lt;script&gt;` become
  a fenced block, not escaped entities in prose.

## Headings

- Start at `##`. There is no `#` — the title comes from frontmatter.
- Sentence case: "Request format", not "Request Format".
- No heading deeper than `###`.

## Voice

- Second person, present tense, active voice: "Upload the module", not "The
  module should be uploaded".
- Say what the reader does and what they will see.
- Cut filler that survived the Help Scout conversion — marketing copy about how
  good a platform is, "as you can see", "simply", "just".

## Hard rules

These are correctness constraints, not style preferences:

1. **Never invent facts.** No version numbers, prices, menu names, URLs or steps
   that are not in the source.
2. **Never drop a step, image or link.** Restructure freely; lose nothing.
3. **Never change an image or external URL.**
4. Only these components: `Steps`, `Step`, `Frame`, `Note`, `Tip`, `Warning`,
   `Danger`, `Info`, `Card`, `CardGroup`, `Accordion`, `AccordionGroup`, `Tabs`,
   `Tab`, `CodeGroup`, `Badge`, `Tree`, `ResponseField`.
5. **Keep every version number, port, file name, parameter and bold UI label
   verbatim.** Rephrase the sentence around them freely; do not restate `1.7` as
   "recent" or **Advanced Parameters → Performance** as "the performance
   settings".
6. Output MDX only — no explanation, no fences around the whole document. A
   sentence of preamble before the frontmatter discards the whole rewrite.

Every one of these is machine-checked in `validate()` and a breach means the
article ships as its plainer mechanical version instead — so a rewrite that
breaks one of them is worse than no rewrite at all.
