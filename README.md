# PitchPrint Documentation

The official [PitchPrint](https://pitchprint.com) product documentation, built on
[Mintlify](https://mintlify.com). It covers the design editor, the admin
dashboard, e‑commerce installation guides, and the developer/API reference.

Most pages were migrated from PitchPrint's Help Scout knowledge base by the
pipeline in [`scripts/`](scripts/README.md), then refined by hand.

## Site structure

| Path | What it holds |
| --- | --- |
| `docs.json` | Site config — navigation, tabs, theme colours, logo, favicon. |
| `documentation/` | **Documentation** tab — product & module reference (33 pages). |
| `tutorial/` | **Tutorial** tab — install guides, admin guide, tips 'n tricks, sample solutions (82 pages). |
| `api-reference/` | **API Reference** tab — integration + Designer/Runtime APIs, and legacy v8 (32 pages). |
| `logo/` | `light.svg` / `dark.svg` wordmarks shown in the nav bar. |
| `favicon.svg` | Browser-tab icon. |
| `assets/` | Brand source assets — logos & icons in SVG/PNG/PDF across colours and sizes. |
| `scripts/` | Help Scout → Mintlify migration pipeline. See [`scripts/README.md`](scripts/README.md). |
| `data/` | Generated + hand-authored source for the pipeline (git-ignored, not served). |

Navigation is organised into three tabs, each split into groups — see the
`navigation` block in `docs.json`.

## Branding

The site uses PitchPrint's brand palette, defined under `colors` in `docs.json`:

- Primary **`#6022E7`** (purple), with light/dark variants for each mode.

The nav-bar logos (`logo/light.svg`, `logo/dark.svg`) and the favicon are taken
from the source files in `assets/`.

## Local development

Install the [Mintlify CLI](https://www.npmjs.com/package/mint):

```bash
npm i -g mint
```

Preview locally from the project root (where `docs.json` lives):

```bash
mint dev      # preview at http://localhost:3000
```

Before pushing, validate your changes:

```bash
mint validate       # strict build check — fails on warnings or errors
mint broken-links   # verify every internal link resolves
```

Run `mint update` if the CLI is out of date.

## Content source & the migration pipeline

The `documentation/`, `tutorial/`, and `api-reference/` pages are produced by the
Help Scout → Mintlify pipeline in [`scripts/`](scripts/README.md):

```
Help Scout API → data/articles.json → data/markdown/ → served pages + docs.json
   npm run example     npm run convert        npm run publish
```

> ⚠️ **Heads-up on manual edits.** `npm run publish` regenerates the served pages
> (and the `docs.json` navigation) from `data/`. Hand edits made directly to files
> under `documentation/`, `tutorial/`, or `api-reference/` can be overwritten on
> the next publish. For durable changes, update the source in `data/` (or the
> convert script), or avoid re-running `publish`. Pages that must survive a
> republish belong in `data/pages/<section>/`.

## Publishing

Changes deploy automatically once merged to the default branch, via the Mintlify
GitHub app — install it from the
[Mintlify dashboard](https://dashboard.mintlify.com/settings/organization/github-app).

## Troubleshooting

- Dev server won't start → run `mint update`.
- A page 404s → confirm you're running from the folder that contains `docs.json`,
  and that the page is listed in the `docs.json` navigation.

## Resources

- [Mintlify documentation](https://mintlify.com/docs)
- [Migration scripts README](scripts/README.md)
