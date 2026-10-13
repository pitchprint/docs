# How the Help Scout sync works — a walkthrough

The readable version of the demo. Real outputs from a real run, not invented
examples. If you want to *record* the demo instead, see
[`DEMO-RECORDING-SCRIPT.md`](./DEMO-RECORDING-SCRIPT.md).

For the reference documentation — every flag, every file, every failure mode —
see [`README.md`](./README.md).

---

## In one paragraph

Support writes help articles in Help Scout. The documentation site is Mintlify,
fed from this repository. Once a week a GitHub Action pulls everything out of
Help Scout, works out which articles are genuinely new, formats them to match
our hand-written pages, and opens a pull request. Nothing reaches the live site
until a person merges it. Articles that already have a published page are never
overwritten — those pages have been rewritten by hand and are better than the
Help Scout originals — so edits to them are reported in an issue for someone to
port across by hand.

---

## Why it works this way

The obvious design would be "Help Scout is the source of truth, republish it
every week". We measured that and it is wrong.

Of the published pages checked, **39 of 39 had diverged from Help Scout, and the
published version was richer every time.**

| Page | Published | From Help Scout |
| --- | --- | --- |
| `which-framework-should-i-pick` | 10,168 bytes | 2,519 |
| `3d` | 8,262 | 5,563 |
| `how-to-install-pitchprint-on-ecwid` | 847 | 103 |
| `fetch-project` | 193 (live OpenAPI pointer) | 13,975 (stale prose) |

Republishing from Help Scout would have replaced the documentation with older,
worse prose — and in the API Reference's case, replaced working interactive
playground pages with stale text.

So the pipeline splits in two:

```
                            ┌──► NEW article ──► format ──► pull request ──► human merges
Help Scout ──► convert ──►──┤
                            └──► EDITED article ──► GitHub issue; live page untouched
```

---

## A real run, step by step

### 0. The safety checks run first

```
$ npm test
All tidy() tests passed.
ok    132 real hand-written pages accepted (bar the known divergences)
All validate() tests passed.
All stylePass() tests passed.
```

52 checks. They decide whether an automatically rewritten page may ship, so if
they fail the job stops before touching anything. One of them feeds all 132 real
published pages through the checker to confirm it doesn't reject our own house
style.

### 1 & 2. Fetch and convert

`npm run example` pulls every article from the Help Scout Docs API into
`data/articles.json`. `npm run convert` turns the HTML into MDX under
`data/markdown/<section>/`, splitting articles across Documentation, Tutorial
and API Reference. 135 articles at the time of writing.

Neither step touches the published site.

### 3. What has support changed?

```
$ npm run drift

## Help Scout drift — 1 article(s) need attention

### New in Help Scout (1)

- **How to Install PitchPrint on EKM** — `documentation/how-to-install-pitchprint-on-ekm-1`
```

This runs *before* anything is ingested, so the report reflects the state at the
start of the run. Edits to published articles appear here with the matching page
so someone can port them by hand; the report becomes a GitHub issue that closes
itself once there is nothing left to port.

### 4. Where does everything stand?

```
$ npm run registry

| State                                              | Count |
| -------------------------------------------------- | ----- |
| Published                                           | 129   |
| Deliberately not publishing                         | 5     |
| Needs a decision                                    | 1     |
| **Untracked — would be proposed on the next sync**  | **0** |
| Pages with no Help Scout article                    | 2     |
```

This is the correspondence between Help Scout and the repo. Every article is in
exactly one state, so nothing sits in limbo. The two pages with no Help Scout
article are `quickstart` and `overview`, which are hand-authored and have no
upstream — expected.

### 5. Add what's new

```
$ npm run ingest

No new Help Scout articles to add.
  skipped documentation/how-to-install-pitchprint-on-ekm-1 — awaiting a decision — see scripts/unpublished.json
  skipped documentation/how-to-install-pitchprint-on-ekm — deliberately not published — see scripts/unpublished.json
  skipped documentation/how-to-install-pitchprint-on-odoo — deliberately not published — see scripts/unpublished.json
  skipped documentation/how-to-install-pitchprint-on-vb-media — deliberately not published — see scripts/unpublished.json
  skipped documentation/how-to-install-pitchprint-on-wix — deliberately not published — see scripts/unpublished.json
  skipped documentation/magento-installation — deliberately not published — see scripts/unpublished.json
```

When there *is* something new, the report looks like this:

```
1 article(s):

  How To Install PitchPrint On Demo Cart
    file      docs/documentation/how-to-install-pitchprint-on-demo-cart.mdx
    filed     Documentation / Installation Guide / Platform Installation
    via       category "Installation guide"
    tidied    run-on images, list ordinals, 3 image(s) wrapped in Frame,
              1 paragraph(s) converted to callouts, 4 numbered item(s) wrapped in Steps
    style     AI pass applied
```

---

## What "formatted" actually means

Two passes, and the second is checked.

### The mechanical pass

Deterministic fixes that cannot misread the content — Help Scout's escaped list
ordinals (`1\.`), images glued to the text after them, `#####` headings the page
nav can't see, images that need wrapping in `<Frame>`, `Note:` paragraphs that
should be callouts, numbered runs that should be `<Steps>`.

It cannot write a good step title. It takes the first clause, which produces
things like:

```mdx
<Step title="Clicking on this link will take you to the a page where you">
```

### The AI pass

The tidied article goes to a model along with our house style guide, a real
hand-written page from the same section as an example, and Mintlify's own
component reference. That last part is what makes the output use components
that actually exist rather than plausible-sounding inventions.

Measured on a real article, mechanical versus rewritten:

| | mechanical | rewritten |
| --- | --- | --- |
| Screenshots with no alt text | 8 | 0 |
| Callouts | 0 | 3 |
| Escaped markup left in prose | 3 | 0 |
| Step titles | first clause of the sentence | short imperative phrases |

`"Clicking on this link will take you to the a page where you"` becomes
`"Register or log in to EKM"`.

### Nothing trusts the model

Every rewrite is checked against its source and **thrown away** if:

- the frontmatter is missing, the title changed, or a key was added
- any image URL is missing or altered
- any external link disappeared
- a component was used that isn't in our allowlist, or a tag is unbalanced
- the steps or headings collapsed
- a version number, port, file name or bold UI label vanished
- the prose dropped below 70% of the source length

On any failure the plainer mechanical version ships instead, carrying a marker
comment, and the reason is printed in the pull request. **A rejected rewrite
costs a duller page, never a wrong one.**

---

## What it will not do

**It will not modify an existing page.** Four independent layers:

1. `npm test` runs first; if the guards are broken nothing else executes.
2. The ingest skips any article whose slug already has a published page.
3. It hashes every existing page before writing and re-checks afterwards,
   failing if any changed.
4. The workflow re-checks independently: only new files, `docs.json` and the
   baseline may differ, and nothing may be deleted.

Then the pull request, which is the only thing that reaches `main`.

**It will not publish articles we've decided against.** Five install guides —
EKM, Odoo, VB Media, WIX and Magento — are recorded in
`scripts/unpublished.json` as deliberately unpublished. That is a written
decision, not an accident of configuration: before, they were skipped only
because they happened to sit in the baseline, and re-seeding it would have
quietly published them.

**It will not decide for you.** A sixth article, a second copy of the EKM guide
that support wrote after the baseline was seeded, is marked `needs-decision`. It
is held back and listed separately in the registry until someone chooses.

---

## What a reviewer sees

A pull request titled **Add new Help Scout articles**, with the ingest report in
the body and a checklist:

- Do the `<Step>` titles read like instructions a person would write?
- Does every screenshot have `alt` text that describes it?
- Is each article filed under the right sidebar group?
- Any page marked `mechanical only` did **not** get the AI pass — it needs the
  most attention.

The branch is rebuilt from scratch on every run and force-pushed, so don't
commit fixes to it — merge first, then edit on `main`. The workflow refuses to
run if it sees a non-bot commit on that branch, rather than destroying it.

---

## Running it yourself

```bash
npm test                              # the safety checks — no network or key needed
npm run example                       # fetch from Help Scout
npm run convert                       # HTML -> MDX
npm run drift                         # what has support edited?
npm run registry                      # where does every article stand?
npm run ingest                        # what is new?            dry run
npm run ingest -- --preview .preview  # write the candidates somewhere safe to read
```

`--preview` writes candidate pages to a scratch directory and touches nothing
else. Each rewritten page gets a `.mechanical.mdx` sibling, so you can diff the
two and see exactly what the AI pass changed:

```bash
git diff --no-index .preview/documentation/x.mechanical.mdx .preview/documentation/x.mdx
```

---

## Known limits

- **Help Scout is not being retired.** The design assumes support keeps writing
  there. Nothing here moves toward phasing it out.
- **Edits to published pages are never applied automatically** — reported only.
  This is deliberate, for the reason at the top of this page.
- **Mintlify cannot filter by tag.** Its `tag:` frontmatter is a single-string
  sidebar badge, already used for `Premium` and `BETA`. A topic taxonomy needs
  `keywords:` frontmatter plus hand-written index pages.
