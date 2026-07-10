# Help Scout Docs API client

A small, zero-dependency Node.js client for the [Help Scout Docs API](https://developer.helpscout.com/docs-api/), used to pull PitchPrint's help articles (and their full content) out of Help Scout.

## What this does

- Authenticates to the Docs API using **HTTP Basic Auth**.
- Reads all credentials from a local **`.env`** file — nothing is hardcoded.
- Fetches **collections** and **articles** with automatic **pagination**.
- Downloads **every article across every collection, including full body content**, and saves them to `data/articles.json`.

As of the last run: **147 articles** fetched (144 with body content), saved to `data/articles.json` (~607 KB).

## Files

| File | Purpose |
| --- | --- |
| `.env` | Real credentials (gitignored — never committed). |
| `.env.example` | Template showing which variables are required. |
| `scripts/helpscout.js` | The API client — auth, requests, pagination, bulk fetch. |
| `scripts/example.js` | Runnable demo: fetch all articles with content → `data/articles.json`. |
| `data/` | Generated output (gitignored). |

## Setup

1. Copy the template and fill in your key:

   ```bash
   cp .env.example .env
   ```

2. Set the values in `.env`:

   ```
   HELPSCOUT_BASE_URL="https://docsapi.helpscout.net/v1"
   HELPSCOUT_API_KEY="your_api_key_here"
   HELPSCOUT_API_PASSWORD="X"
   ```

   > **Basic Auth convention:** the API key is the *username*; the *password* can be any value (Help Scout ignores it for reads — `X` is the usual placeholder). Quote the value if it contains a `#`, or dotenv will treat the rest of the line as a comment.

3. Requires **Node.js >= 20.6** (uses the built-in `--env-file` flag and `process.loadEnvFile()` — no `dotenv` package needed).

## Run

```bash
npm run example
```

This fetches every article with content and writes `data/articles.json`, printing live progress and a sample.

## How authentication works

HTTP Basic Auth sends the header:

```
Authorization: Basic base64("<API_KEY>:<PASSWORD>")
```

`helpscout.js` builds this once at load time from the `.env` values. It's the exact same header an HTTP client like Postman or Bruno generates from its Username/Password fields.

## API functions (`scripts/helpscout.js`)

| Function | Description |
| --- | --- |
| `request(path, options?)` | Low-level authenticated `fetch` against the Docs API. Returns parsed JSON. |
| `getArticle(id)` | Fetch one article by id — the **only** call that returns the full `text` body. |
| `listArticles(collectionId, page?)` | One page of a collection's articles (metadata only). |
| `listCollections(page?)` | One page of collections. |
| `getAllArticlesInCollection(collectionId)` | All articles in a collection, across all pages. |
| `getAllArticles()` | Every article across every collection (metadata only). |
| `getAllArticlesWithContent(concurrency?, onProgress?)` | Every article **with full body content**. Fetches each article by id, `concurrency` at a time (default 5). |

### Why two "get all" functions?

The list endpoints (`/collections/{id}/articles`) return article **metadata only** — no `text` body. To get the actual content you must call `GET /articles/{id}` per article. So:

- `getAllArticles()` → fast, metadata only (titles, ids, status, …).
- `getAllArticlesWithContent()` → gets the ids, then fetches each article's full record. More requests, but includes the HTML body.

## How pagination works

Every Help Scout list response is wrapped and paginated:

```json
{ "articles": { "page": 1, "pages": 4, "count": 73, "items": [ ... ] } }
```

`fetchAllPages()` reads the `pages` field and loops from page 1 until it has fetched the last page — bounded by `pages`, so there's no risk of an infinite loop and no wasted "empty" request to discover the end.

## How the bulk fetch stays fast

`getAllArticlesWithContent()` uses `mapWithConcurrency()` — a small worker pool that keeps at most N requests in flight at once (default 5). This is ~5× faster than fetching one-by-one while staying well within Help Scout's rate limits. If you ever see HTTP `429`, lower the concurrency; to go faster, raise it (e.g. `getAllArticlesWithContent(10)`).

## Example usage in code

```javascript
import {
  getArticle,
  getAllArticles,
  getAllArticlesWithContent,
} from "./scripts/helpscout.js";

// One article, full content
const { article } = await getArticle(98);

// All article metadata (fast)
const summaries = await getAllArticles();

// All articles WITH body content (147 requests, 5 at a time)
const full = await getAllArticlesWithContent(5, (done, total) =>
  console.log(`${done}/${total}`)
);
```

## Security notes

- `.env` and `data/` are **gitignored** — real credentials and downloaded content are never committed.
- Never expose the API key in browser/front-end code; Basic Auth belongs on the server side only.
- If the API key or password was ever committed or shared, **rotate it** in Help Scout.
</content>
