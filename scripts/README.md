# Help Scout → Mintlify migration scripts

A small, near-zero-dependency Node.js pipeline that pulls PitchPrint's help
articles out of the [Help Scout Docs API](https://developer.helpscout.com/docs-api/),
converts them from HTML to Markdown, and publishes them into this Mintlify site.

## The pipeline

Three stages, run in order:

```
Help Scout API  ──►  data/articles.json  ──►  data/markdown/<section>/  ──►  <root>/<section>/ + docs.json
   npm run example         npm run convert            npm run publish
```

| Step | Command | Input | Output |
| --- | --- | --- | --- |
| 1. Fetch | `npm run example` | Help Scout API | `data/articles.json` (147 raw articles, full HTML) |
| 2. Convert | `npm run convert` | `data/articles.json` | `data/markdown/{documentation,tutorial,api-reference}/*.mdx` |
| 3. Publish | `npm run publish` | `data/markdown/` | served pages at repo root + updated `docs.json` navigation |

Current output: **134 pages** (147 fetched − 13 legacy articles excluded), split into
Documentation (33), Tutorial (82), API Reference (19).

## Files

| File | Purpose |
| --- | --- |
| `.env` | Real Help Scout credentials (gitignored — never committed). |
| `.env.example` | Template showing the required variables. |
| `scripts/helpscout.js` | API client — Basic Auth, requests, pagination, bulk fetch. |
| `scripts/example.js` | Step 1: fetch all articles with content → `data/articles.json`. |
| `scripts/convert-to-markdown.js` | Step 2: HTML → MDX, chunked into section folders under `data/markdown/`. |
| `scripts/publish-to-docs.js` | Step 3: copy into the served docs tree + build `docs.json` nav. |
| `data/` | Generated source data (mintignored so it isn't served as pages). |

## Setup

1. Copy the template and fill in your key:

   ```bash
   cp .env.example .env
   ```

   ```
   HELPSCOUT_BASE_URL="https://docsapi.helpscout.net/v1"
   HELPSCOUT_API_KEY="your_api_key_here"
   HELPSCOUT_API_PASSWORD="X"
   ```

   > **Basic Auth convention:** the API key is the *username*; the *password* can
   > be any value (Help Scout ignores it for reads — `X` is the usual
   > placeholder). Quote the value if it contains a `#`, or dotenv treats the
   > rest of the line as a comment.

2. Requires **Node.js >= 20.6** (uses the built-in `--env-file` flag and
   `process.loadEnvFile()`).

3. Install the one build-time dependency (Turndown, for HTML→Markdown):

   ```bash
   npm install
   ```

## Running the pipeline

```bash
npm run example   # 1. fetch articles from Help Scout   -> data/articles.json
npm run convert   # 2. convert HTML to MDX              -> data/markdown/<section>/
npm run publish   # 3. publish into the site + nav      -> /documentation, /tutorial, /api-reference
mint dev          #    preview at http://localhost:3000
```

You only need step 1 again when the source content in Help Scout changes.

## How articles are chunked

There is no global "all articles" endpoint — articles live in **collections**,
each with **categories**. `convert-to-markdown.js` maps each article to one of
three section folders:

- **API Reference** — everything in the Developer Hub / Developer Knowledge Base collections.
- **Tutorial** — Documentation-collection articles in how-to categories:
  Installation guide, Tips 'n Tricks, Admin Guide, Sample Solutions.
- **Documentation** — the remaining Documentation-collection articles.

The legacy `Developer Hub (v8 - old - DO NOT USE)` collection (13 articles) is
excluded. The mapping lives in clearly-labeled config blocks (`COLLECTION`,
`TUTORIAL_CATEGORY_IDS`) at the top of the script — change the split by moving a
category id in or out.

## MDX safety

Mintlify compiles `.mdx` through a strict MDX parser, so stray `{`, `}`, and `<`
in prose (template code like `${...}` / `{{ liquid }}`, or HTML shown as
examples) would break the build. `sanitizeMdx()` escapes those characters, but
only **outside** code spans/blocks, where they're already literal. This is why
`mint broken-links` compiles all 134 pages with no syntax errors.

## API functions (`scripts/helpscout.js`)

| Function | Description |
| --- | --- |
| `request(path, options?)` | Low-level authenticated `fetch`. Returns parsed JSON. |
| `getArticle(id)` | Fetch one article by id — the only call that returns the full `text` body. |
| `listArticles(collectionId, page?)` | One page of a collection's articles (metadata only). |
| `listCollections(page?)` | One page of collections. |
| `getAllArticlesInCollection(collectionId)` | All articles in a collection, across all pages. |
| `getAllArticles()` | Every article across every collection (metadata only). |
| `getAllArticlesWithContent(concurrency?, onProgress?)` | Every article **with full body content**, fetched `concurrency` at a time (default 5). |

The list endpoints omit the `text` body, so `getAllArticlesWithContent()` fetches
each article individually — using a bounded worker pool for speed while staying
within Help Scout's rate limits. If you hit HTTP `429`, lower the concurrency.

## Security notes

- `.env` and `data/` handling: `.env` is gitignored. Never expose the API key in
  browser/front-end code — Basic Auth belongs on the server side only.
- If the API key or password was ever committed or shared, **rotate it** in Help Scout.

## Known limitations

- A few API Reference articles stored code as prose (not `<pre>` blocks) in Help
  Scout, so it renders as escaped inline text rather than code blocks.
- Images still point at Help Scout's S3 URLs, and internal links use
  `docs.pitchprint.com` URLs — neither is rewritten to local/relative paths yet.
