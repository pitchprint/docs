# Help Scout sync — run 24

| | |
| --- | --- |
| When | `2026-10-27T06:03:37Z` |
| Mode | **FULL RUN** (full run) |
| Trigger | `schedule` |
| Commit | `f49356a821a780bebd0bae78ade454c0f3348da1` |
| Result | **failure** |
| Run | https://github.com/pitchprint/docs/actions/runs/40458817637 |

## Steps

| Step | Outcome |
| --- | --- |
| Preflight | ok |
| Install | ok |
| Tests | ok |
| Fetch | ok |
| Convert | ok |
| Drift | ok |
| Registry | ok |
| Preview | – |
| Ingest | **FAILED** |
| Broken links | – |
| Pull request | – |

## Output

### preflight

```
ok    HELPSCOUT_API_KEY is set (40 characters)
warn  ANTHROPIC_API_KEY is not set — new pages will ship in the
      plainer mechanical style. Not fatal.
ok    baseline committed (134 articles)

Preflight passed.
```

### install

```

added 3 packages, and audited 4 packages in 437ms

found 0 vulnerabilities
```

### tests

```
ok    the 429 is reported
ok    a network failure falls back
ok    the network failure is reported
ok    an empty response is rejected

All stylePass() tests passed.

Date derivation
  ok    ISO week 26 of 2026 is Thursday 25 June
  ok    ISO week 9 of 2026 is Thursday 26 February
  ok    ISO week 1 of 2027 is Thursday 7 January
  ok    yearFor('wk26-26') is 2026
  ok    yearFor('WK02-27') is 2027
  ok    yearFor('spring-launch') refuses
  ok    release_year overrides the id
  ok    weekFor('wk44-26') is 44

A release that already has a note
  ok    exits 0
  ok    says it skipped
  ok    file untouched

A release with no note yet
  ok    dry run exits 0
  ok    dry run writes nothing
  ok    exits 2 for 'wrote changes'
  ok    one block added
  ok    every pre-existing block is byte-for-byte identical
  ok    the new block is first
  ok    the tail of the original file survives verbatim
  ok    line endings preserved — no bare LF introduced
  ok    marked as a draft
  ok    both topics present
  ok    date derived from the week
  ok    docs.json untouched
  ok    second run is a no-op

Preview mode
  ok    exits 0
  ok    year file untouched
  ok    candidate written
  ok    --preview with --write is refused

A release id that doesn't say which year
  ok    exits 1
  ok    says why and how to fix it
  ok    writes nothing

A release in a year with no file yet
  ok    exits 2
  ok    year file created
  ok    added to the sidebar
  ok    placed above the previous year
  ok    2026 untouched

Guards (sabotaged insert logic)
  ok    a published block is dropped — refuses
  ok    a published block is dropped — says so
  ok    a published block is dropped — writes nothing
  ok    a published block's text is altered — refuses
  ok    a published block's text is altered — says so
  ok    a published block's text is altered — writes nothing

All release-note tests passed.

Labels derived from pubDate
  ok    Thu, 25 Jun 2026 -> WK26-26  (matches the repo)
  ok    Thu, 07 May 2026 -> WK19-26  (matches the repo)
  ok    Thu, 19 Mar 2026 -> WK12-26  (matches the repo)
  ok    Thu, 26 Feb 2026 -> WK09-26  (matches the repo)
  ok    Thu, 01 Oct 2026 -> WK40-26  (blog title says WK26-40)
  ok    1 Oct 2026 is in ISO week 40
  ok    a Sunday belongs to the week that started on the Monday
  ok    1 Jan 2027 belongs to ISO week 53 of 2026
  ok    prettyDate formats as the year files do

Transposed titles
  ok    reads WK26-40 out of the title
  ok    reads WK09-26 with a leading zero
  ok    no code in a feature post title
  ok    title and date disagree for the transposed post

Image paths
  ok    blog CDN -> repo path
  ok    nested month folders survive
  ok    a foreign host is left alone
  ok    a non-image blog URL is left alone
  ok    junk does not throw

Converting a post
  ok    the post's h1 is dropped
  ok    h2 becomes ###
  ok    the What's-new lead-in is removed
  ok    the opening paragraph survives
  ok    the sign-off survives
  ok    both images found
  ok    both rewritten to repo paths
  ok    images wrapped in Frame
  ok    figcaption became alt text
  ok    missing alt counted
  ok    bug-fix section detected
  ok    braces in prose are escaped for MDX
  ok    no raw < left in prose

The rendered block
  ok    opens in the live format
  ok    has an rss line
  ok    carries the source link
  ok    has the bold summary line
  ok    closes
  ok    body is indented two spaces
  ok    no line is left with trailing spaces

End to end, against a year file
  ok    a post already in the year file is skipped
  ok    and the file is untouched
  ok    dry run exits 0 and writes nothing
  ok    the transposed title is reported
  ok    the accordion gap is reported
  ok    missing alt text is reported
  ok    exits 2 for 'wrote changes'
  ok    one block added
  ok    the hand-written block is byte-for-byte identical
  ok    the new block is first
  ok    filed under the right label, not the title's
  ok    line endings preserved — no bare LF
  ok    images point at the repo, not the blog
  ok    no blog.pitchprint.com image URL left behind
  ok    docs.json untouched
  ok    re-running is a no-op
  ok    a failed image download refuses rather than writing a broken note
  ok    and nothing was written
  ok    an unreadable pubDate is refused, not guessed
  ok    and nothing was written
  ok    preview exits 0
  ok    preview leaves the year file alone
  ok    preview writes the candidate
  ok    --preview with --write is refused

All blog release-note tests passed.

A correct block
  ok    passes
  ok    is clean — nothing for a person to do
  ok    scores 100%
  ok    no problems listed

The import comment is prose, not markup
  ok    a comment mentioning <AccordionGroup> is not read as a tag

Content loss
  ok    a whole heading and its section dropped — rejected
  ok    a whole heading and its section dropped — says why
  ok    an image dropped — rejected
  ok    an image dropped — says why
  ok    an external link dropped — rejected
  ok    an external link dropped — says why
  ok    half the prose cut away — rejected
  ok    half the prose cut away — says why
  ok    the body duplicated — rejected
  ok    the body duplicated — says why

House style
  ok    a component that is not in the allowlist — rejected
  ok    a component that is not in the allowlist — says why
  ok    an unbalanced component — rejected
  ok    an unbalanced component — says why
  ok    a heading at the wrong level — rejected
  ok    a heading at the wrong level — says why
  ok    an image left pointing at the blog — rejected
  ok    an image left pointing at the blog — says why
  ok    an image outside a Frame — rejected
  ok    an image outside a Frame — says why
  ok    an unescaped brace in prose — rejected
  ok    an unescaped brace in prose — says why
  ok    the Update header mangled — rejected
  ok    the Update header mangled — says why
  ok    the rss line removed — rejected
  ok    the rss line removed — says why

Passes the gate but still needs a person
  ok    missing alt text does not fail the gate
  ok    but it is not clean
  ok    and it says so
  ok    an un-accordioned bug-fix section does not fail the gate
  ok    but it is not clean
  ok    and it says so

The floor is a dial, not a constant
  ok    rejected at 99%
  ok    accepted at 50%
  ok    same score either way
  ok    the score is between 50 and 99

proseWords ignores markup, not words
  ok    strips tags
  ok    keeps link text
  ok    drops our import comment

All release-note gate tests passed.
```

### fetch

```

> helpscout-docs-client@1.0.0 example
> node --env-file=.env scripts/example.js

Fetching all articles with content...
  1/151 fetched  2/151 fetched  3/151 fetched  4/151 fetched  5/151 fetched  6/151 fetched  7/151 fetched  8/151 fetched  9/151 fetched  10/151 fetched  11/151 fetched  12/151 fetched  13/151 fetched  14/151 fetched  15/151 fetched  16/151 fetched  17/151 fetched  18/151 fetched  19/151 fetched  20/151 fetched  21/151 fetched  22/151 fetched  23/151 fetched  24/151 fetched  25/151 fetched  26/151 fetched  27/151 fetched  28/151 fetched  29/151 fetched  30/151 fetched  31/151 fetched  32/151 fetched  33/151 fetched  34/151 fetched  35/151 fetched  36/151 fetched  37/151 fetched  38/151 fetched  39/151 fetched  40/151 fetched  41/151 fetched  42/151 fetched  43/151 fetched  44/151 fetched  45/151 fetched  46/151 fetched  47/151 fetched  48/151 fetched  49/151 fetched  50/151 fetched  51/151 fetched  52/151 fetched  53/151 fetched  54/151 fetched  55/151 fetched  56/151 fetched  57/151 fetched  58/151 fetched  59/151 fetched  60/151 fetched  61/151 fetched  62/151 fetched  63/151 fetched  64/151 fetched  65/151 fetched  66/151 fetched  67/151 fetched  68/151 fetched  69/151 fetched  70/151 fetched  71/151 fetched  72/151 fetched  73/151 fetched  74/151 fetched  75/151 fetched  76/151 fetched  77/151 fetched  78/151 fetched  79/151 fetched  80/151 fetched  81/151 fetched  82/151 fetched  83/151 fetched  84/151 fetched  85/151 fetched  86/151 fetched  87/151 fetched  88/151 fetched  89/151 fetched  90/151 fetched  91/151 fetched  92/151 fetched  93/151 fetched  94/151 fetched  95/151 fetched  96/151 fetched  97/151 fetched  98/151 fetched  99/151 fetched  100/151 fetched  101/151 fetched  102/151 fetched  103/151 fetched  104/151 fetched  105/151 fetched  106/151 fetched  107/151 fetched  108/151 fetched  109/151 fetched  110/151 fetched  111/151 fetched  112/151 fetched  113/151 fetched  114/151 fetched  115/151 fetched  116/151 fetched  117/151 fetched  118/151 fetched  119/151 fetched  120/151 fetched  121/151 fetched  122/151 fetched  123/151 fetched  124/151 fetched  125/151 fetched  126/151 fetched  127/151 fetched  128/151 fetched  129/151 fetched  130/151 fetched  131/151 fetched  132/151 fetched  133/151 fetched  134/151 fetched  135/151 fetched  136/151 fetched  137/151 fetched  138/151 fetched  139/151 fetched  140/151 fetched  141/151 fetched  142/151 fetched  143/151 fetched  144/151 fetched  145/151 fetched  146/151 fetched  147/151 fetched  148/151 fetched  149/151 fetched  150/151 fetched  151/151 fetched
Done. 151 articles fetched.
Saved full content to /home/runner/work/docs/docs/data/articles.json

Sample — #25 "Frequently asked questions":
<div class="entry clearfix"> <article id="faq-27" class="faq clearfix"> <header> <span id="faq-27" class="faq-title active"> <a href="#faq-title-27"> What is PitchPrint? </a> </span> </header> <d...
```

### convert

```

> helpscout-docs-client@1.0.0 convert
> node scripts/convert-to-markdown.js

Converted 137 articles into /home/runner/work/docs/docs/data/markdown
  documentation/ — 28 pages
  tutorial/ — 90 pages
  api-reference/ — 19 pages
Skipped 0 legacy article(s); 9 had no body content.
Applied 37 section override(s) from scripts/sections.json.
Excluded 14 article(s) via scripts/exclude.json.
    - backup-of-how-to-install-pitchprint-on-opencart-draft [Installation guide]
    - integration [Legacy (v8)]
    - initialization-parameters [Legacy (v8)]
    - fetch-pdf [Legacy (v8)]
    - designer-ready-method [Legacy (v8)]
    - events [Legacy (v8)]
    - introduction [Legacy (v8)]
    - generate-your-auth-keys [Legacy (v8)]
    - after-save [Legacy (v8)]
    - fetch-designs [Legacy (v8)]
    - authentication [Legacy (v8)]
    - fetch-project-source [Legacy (v8)]
    - fetch-design-source [Legacy (v8)]
    - fetch-raster [Legacy (v8)]
Injected 5/5 video embed(s) from scripts/videos.json.
```

### drift

```

> helpscout-docs-client@1.0.0 drift
> node scripts/report-drift.js

## Help Scout drift — 3 article(s) need attention

These changed in Help Scout. The published docs are hand-written and were **not** modified — port anything worth keeping by hand, then run `npm run baseline` to acknowledge.

### New in Help Scout (3)

- **Colour Chain** — `documentation/colour-chain`
- **Image Chain** — `documentation/image-chain`
- **Item Chain** — `documentation/item-chain`

Converted copies for comparison are under `data/markdown/` (not committed).
```

### registry

```

> helpscout-docs-client@1.0.0 registry
> node scripts/registry.js

# Help Scout → repo registry

Generated 2026-10-27 from `data/markdown/` and `docs/`.

| State | Count |
| --- | --- |
| Published | 129 |
| Deliberately not publishing | 5 |
| Needs a decision | 0 |
| **Untracked — would be proposed on the next sync** | **3** |
| Pages with no Help Scout article | 2 |

## Untracked

Not published, and no recorded decision. The next `npm run ingest -- --write` would propose these. Add an entry to `scripts/unpublished.json` to hold one back.

- **Colour Chain** — `documentation/colour-chain` *(new since the baseline)*
- **Image Chain** — `documentation/image-chain` *(new since the baseline)*
- **Item Chain** — `documentation/item-chain` *(new since the baseline)*

## Deliberately not publishing

Recorded in `scripts/unpublished.json`. The sync will never propose these.

- **How to Install PitchPrint on EKM** — `documentation/how-to-install-pitchprint-on-ekm`
- **How To Install PitchPrint On Odoo** — `documentation/how-to-install-pitchprint-on-odoo`
- **How to install PitchPrint on WIX** — `documentation/how-to-install-pitchprint-on-wix`
- **How To Install PitchPrint On Magento** — `documentation/magento-installation`
- **Upgrading to Version 9** — `documentation/upgrading-to-version-9`

## Published pages with no Help Scout article

Normal for hand-authored pages. Anything unexpected here usually means an article was renamed in Help Scout, leaving the old page stranded.

- `docs/documentation/quickstart.mdx`
- `docs/tutorial/overview.mdx`

## Everything

| Article | Key | State |
| --- | --- | --- |
| Adding Pages Programmatically | `api-reference/adding-pages-programmatically` | published |
| After Save | `api-reference/after-save` | published |
| Auth Signature | `api-reference/auth-signature` | published |
| Clone Project | `api-reference/clone-project` | published |
| My Account - Saved Projects | `api-reference/custom-integration-my-account` | published |
| Designer ready method | `api-reference/designer-ready-method` | published |
| Events | `api-reference/events` | published |
| Fetch Design | `api-reference/fetch-design` | published |
| Fetch Design Categories | `api-reference/fetch-design-categories` | published |
| Fetch Design Previews | `api-reference/fetch-design-previews` | published |
| Fetch Designs | `api-reference/fetch-designs` | published |
| Fetch Project | `api-reference/fetch-project` | published |
| Fetch User Projects | `api-reference/fetch-user-projects` | published |
| Generate your auth keys | `api-reference/generate-your-auth-keys` | published |
| Initialization Options | `api-reference/initialization-options` | published |
| Integration | `api-reference/integration` | published |
| Introduction | `api-reference/introduction` | published |
| PPCLIENT PROPS | `api-reference/ppclient-props` | published |
| Render PDF & Raster | `api-reference/render-pdf-raster` | published |
| 3D Business card | `documentation/3d` | published |
| 3D Studio | `documentation/3d-studio` | published |
| 3D View Introduction | `documentation/3d-view-introduction` | published |
| 3D Views | `documentation/3d-views` | published |
| BigCommerce user Guide | `documentation/bigcommerce` | published |
| Browser Compatibility | `documentation/browser-compatibility` | published |
| Colour Chain | `documentation/colour-chain` | UNTRACKED |
| Frequently asked questions | `documentation/faq` | published |
| How to Add a Placeholder image for Mask Shapes | `documentation/how-to-add-a-placeholder-image-for-mask-shapes` | published |
| How to install PitchPrint on BigCommerce | `documentation/how-to-install-pitchprint-on-bigcommerce` | published |
| How to Install PitchPrint on ECWID | `documentation/how-to-install-pitchprint-on-ecwid` | published |
| How to Install PitchPrint on EKM | `documentation/how-to-install-pitchprint-on-ekm` | not-publishing |
| How To Install PitchPrint On Odoo | `documentation/how-to-install-pitchprint-on-odoo` | not-publishing |
| How To Install PitchPrint On OpenCart | `documentation/how-to-install-pitchprint-on-opencart` | published |
| How To Install PitchPrint On PrestaShop | `documentation/how-to-install-pitchprint-on-prestashop` | published |
| How to Install Pitchprint on VB Media | `documentation/how-to-install-pitchprint-on-vb-media` | published |
| How to install PitchPrint on WIX | `documentation/how-to-install-pitchprint-on-wix` | not-publishing |
| How To Install PitchPrint On WordPress | `documentation/how-to-install-pitchprint-on-wordpress` | published |
| Image Chain | `documentation/image-chain` | UNTRACKED |
| Item Chain | `documentation/item-chain` | UNTRACKED |
| How To Install PitchPrint On Magento | `documentation/magento-installation` | not-publishing |
| PDF Uploader | `documentation/pdf-uploader` | published |
| Picture Editor | `documentation/picture-editor` | published |
| PitchPrint For Shopify.. Getting Started | `documentation/pitchprint-for-shopify-getting-started` | published |
| PitchPrint on 3DCart | `documentation/pitchprint-on-3dcart` | published |
| Tags | `documentation/tags` | published |
| Upgrading to Version 9 | `documentation/upgrading-to-version-9` | not-publishing |
| Which shopping cart framework should I pick? | `documentation/which-framework-should-i-pick` | published |
| 3D UV Mapping | `tutorial/3d-uv-mapping` | published |
| Add Fonts - Inside Editor | `tutorial/add-fonts-inside-editor` | published |
| Add previews & project file links to Shopify email notifications | `tutorial/add-previews-project-file-links-to-shopify-email-notifications` | published |
| Adding Grommets | `tutorial/adding-grommets` | published |
| Adding QR Codes | `tutorial/adding-qr-codes` | published |
| Admin Settings | `tutorial/admin-settings` | published |
| AI-Imaginate | `tutorial/ai-image-generator` | published |
| AI Outpainting | `tutorial/ai-outpainting` | published |
| AI Sketch to Image | `tutorial/ai-sketch-to-image` | published |
| AI Smart Replace | `tutorial/ai-smart-replace` | published |
| AI Structure | `tutorial/ai-structure` | published |
| AI Upscale | `tutorial/ai-upscale` | published |
| All About Colors | `tutorial/all-about-colors` | published |
| Automation: Sending your PDF file to Printer | `tutorial/automation-sending-your-pdf-file-to-printer` | published |
| PP v10 features | `tutorial/backgrounds` | published |
| Calendar Design | `tutorial/calendar-design` | published |
| Canvas Adjuster Module | `tutorial/canvas-adjuster-module` | published |
| Color Palette | `tutorial/color-palette` | published |
| Creating Designs Using SVGs | `tutorial/creating-designs-using-svgs` | published |
| Creating Text Art | `tutorial/creating-text-art` | published |
| Custom Mask | `tutorial/custom-mask` | published |
| Data Form Module | `tutorial/data-form-module` | published |
| Data Form Video | `tutorial/data-form-video` | published |
| Design Configuration | `tutorial/design-configuration` | published |
| Admin Design Editor | `tutorial/design-editor` | published |
| Design Item and Page Tags | `tutorial/design-item-and-page-tags` | published |
| Design Observables | `tutorial/design-observables` | published |
| Design Selector Module | `tutorial/design-selector-module` | published |
| Display Modes | `tutorial/display-modes` | published |
| Colour Chain | `tutorial/element-colour-chain` | published |
| GleamPrint For WordPress | `tutorial/foil-accent` | published |
| Getting started with PitchPrint | `tutorial/getting-started-with-pitchprint` | published |
| Ghostscript Arguments | `tutorial/ghostscript-arguments` | published |
| Grommets | `tutorial/grommets` | published |
| HelpTip Bubbles | `tutorial/helptip-bubbles` | published |
| How to add your own fonts | `tutorial/how-to-add-your-own-fonts` | published |
| How to attach customer designs to email (Word Press) | `tutorial/how-to-attach-customer-designs-to-email-wp` | published |
| How to change the app labels and texts | `tutorial/how-to-change-the-app-labels-and-texts` | published |
| How To Create A Baby’s Arrival Design Template | `tutorial/how-to-create-a-baby-s-arrival-design-template` | published |
| How to create a clickable mask | `tutorial/how-to-create-a-clickable-mask` | published |
| How To Create A Collage IPhone Case Design Template | `tutorial/how-to-create-a-collage-iphone-case-design-template` | published |
| How To Create A Design | `tutorial/how-to-create-a-design` | published |
| How to create an SVG for use as a Mask | `tutorial/how-to-create-an-svg-for-use-as-mask` | published |
| How to create colour chains | `tutorial/how-to-create-colour-chains` | published |
| How to create templates using SVG shapes | `tutorial/how-to-create-templates-using-svg-shapes` | published |
| How to email artwork to customers | `tutorial/how-to-email-artwork-to-customers` | published |
| How to enable Pixabay image search | `tutorial/how-to-enable-pixabay-image-search` | published |
| How to enable the Customization Form | `tutorial/how-to-enable-the-customization-form` | published |
| How to import designs | `tutorial/how-to-import-designs` | published |
| How to save your SVGs for use in PitchPrint | `tutorial/how-to-save-your-svgs-for-use-in-pitchprint` | published |
| How to show customer design previews on email (WordPress) | `tutorial/how-to-show-customer-design-previews-on-email-wordpress` | published |
| How to update design with customer data | `tutorial/how-to-update-design-with-customer-data` | published |
| Page Count | `tutorial/how-to-use-page-count-module` | published |
| Image Chain | `tutorial/image-chain` | published |
| Integrating Canvas Adjuster To A WordPress Store | `tutorial/integrating-canvas-adjuster-to-a-wordpress-store` | published |
| Integrating Canvas Adjuster To An OpenCart Store | `tutorial/integrating-canvas-adjuster-to-an-opencart-store` | published |
| Item Chain | `tutorial/item-chain` | published |
| Item Hooks | `tutorial/item-hooks` | published |
| Layouts (version 10) | `tutorial/layouts-v10` | published |
| Localstorage Trigger | `tutorial/localstorage-trigger` | published |
| Make Reference | `tutorial/make-reference` | published |
| Managing your Designs | `tutorial/managing-your-designs` | published |
| Managing your Domains | `tutorial/managing-your-domains` | published |
| Mobile Phone Layouts | `tutorial/mobile-phone-layouts` | published |
| Page Loader Module | `tutorial/page-loader-module` | published |
| PDF Rendering | `tutorial/pdf-rendering` | published |
| Personalize button not showing? | `tutorial/personalize-button-no-showing` | published |
| Photo Print Module | `tutorial/photo-print-module` | published |
| Photo Resolution (DPI) Check | `tutorial/photo-resolution-check` | published |
| Mini Display Mode | `tutorial/reels-data-form` | published |
| Remix Module | `tutorial/remi-module` | published |
| Remove Background | `tutorial/remove-background` | published |
| Security Measures | `tutorial/security-measures` | published |
| Shuffle Module | `tutorial/shuffle-module` | published |
| Single/Double Sided Module | `tutorial/single-double-sided-module` | published |
| Smart Size Design | `tutorial/smart-size-design` | published |
| Smart Sizes | `tutorial/smart-sizes` | published |
| Spark | `tutorial/spark` | published |
| Sticky Items | `tutorial/sticky-items` | published |
| Swatch Module | `tutorial/swatch-module` | published |
| Template Color Module | `tutorial/template-color-module` | published |
| Template Colour Designs | `tutorial/template-colour-designs` | published |
| Text Box Formatting | `tutorial/text-box-formatting` | published |
| Text Styles | `tutorial/text-styles` | published |
| SVG to Text | `tutorial/text-to-svg` | published |
| Types of PitchPrint design | `tutorial/types-of-pitchprint-designs` | published |
| AI-Imaginate: Text to Image AI Tool | `tutorial/using-ai-imaginate` | published |
| Variable Data Module | `tutorial/variable-data-module` | published |
| Error Fix: web2print options missing in OpenCart Admin | `tutorial/web2print-options-missing-in-opencart-admin` | published |
| Webhooks | `tutorial/webhooks` | published |
```

### ingest

```

> helpscout-docs-client@1.0.0 ingest
> node --env-file-if-exists=.env scripts/ingest-new.js --write

Same slug in two Help Scout categories — cannot choose a group:
  image-chain: "General" vs "Tips 'n Tricks"
  item-chain: "General" vs "Tips 'n Tricks"
```
