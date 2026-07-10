// Help Scout Docs API client using HTTP Basic Auth.
//
// Basic Auth for the Docs API: the API key is the username and the password can
// be any value (Help Scout convention is "X"). The Authorization header is
// `Basic <base64("key:X")>`.
//
// Reads credentials from environment variables (see .env / .env.example):
//   HELPSCOUT_BASE_URL, HELPSCOUT_API_KEY, HELPSCOUT_API_PASSWORD

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Load the project's .env file into process.env so the API key and password are
// imported from the environment file automatically — regardless of how the
// script is launched. If .env is absent (e.g. in production), fall back to the
// real environment variables already present in process.env.
const envPath = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

// All values come from the .env file — nothing is hardcoded here.
const { HELPSCOUT_BASE_URL, HELPSCOUT_API_KEY, HELPSCOUT_API_PASSWORD } =
  process.env;

const missing = [
  ["HELPSCOUT_BASE_URL", HELPSCOUT_BASE_URL],
  ["HELPSCOUT_API_KEY", HELPSCOUT_API_KEY],
  ["HELPSCOUT_API_PASSWORD", HELPSCOUT_API_PASSWORD],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length > 0) {
  throw new Error(
    `Missing ${missing.join(", ")} in .env. Copy .env.example to .env and fill in the values.`
  );
}

// Pre-build the Authorization header once, at module load.
// HTTP Basic Auth = the literal word "Basic" followed by base64("username:password").
// Here username = API key, password = HELPSCOUT_API_PASSWORD. This is the exact
// same header your HTTP client (Postman/Bruno) generates from its auth fields.
const authHeader =
  "Basic " +
  Buffer.from(`${HELPSCOUT_API_KEY}:${HELPSCOUT_API_PASSWORD}`).toString(
    "base64"
  );

/**
 * Make an authenticated request against the Help Scout Docs API.
 * @param {string} path - Path relative to the base URL, e.g. "/articles/98".
 * @param {RequestInit} [options] - Additional fetch options (method, body, ...).
 * @returns {Promise<any>} Parsed JSON response.
 */
export async function request(path, options = {}) {
  // Build the absolute URL from the base URL in .env + the caller's path.
  const url = `${HELPSCOUT_BASE_URL}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: authHeader, // attach Basic Auth to every request
      Accept: "application/json",
      "Content-Type": "application/json",
      ...options.headers, // caller can override/add headers
    },
  });

  // Read the body as text first so we can include it in an error message if the
  // request failed (e.g. the 401 body when the API key is wrong).
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Help Scout API error ${res.status} on ${path}: ${text}`);
  }

  // Some endpoints (e.g. DELETE) return an empty body — guard against JSON.parse("").
  return text ? JSON.parse(text) : null;
}

/** Fetch a single article by id. */
export function getArticle(id) {
  return request(`/articles/${id}`);
}

/** List articles in a collection. */
export function listArticles(collectionId, page = 1) {
  return request(`/collections/${collectionId}/articles?page=${page}`);
}

/** List all collections. */
export function listCollections(page = 1) {
  return request(`/collections?page=${page}`);
}

/**
 * Page through a Help Scout list endpoint until every page is fetched.
 * List responses look like: { <key>: { page, pages, count, items: [...] } }
 * @param {(page: number) => Promise<any>} fetchPage - Fetches one page.
 * @param {string} key - The wrapper key, e.g. "articles" or "collections".
 * @returns {Promise<any[]>} All items across every page.
 */
async function fetchAllPages(fetchPage, key) {
  const items = [];
  let page = 1;
  let totalPages = 1; // updated from the first response; assume 1 until we know

  do {
    const body = await fetchPage(page);
    const data = body?.[key] ?? {}; // unwrap e.g. body.articles / body.collections
    items.push(...(data.items ?? [])); // collect this page's items
    totalPages = data.pages ?? 1; // the API tells us how many pages exist
    page += 1;
  } while (page <= totalPages); // stop once we've fetched the last page

  return items;
}

/** Get every article in a single collection (all pages). */
export function getAllArticlesInCollection(collectionId) {
  return fetchAllPages((page) => listArticles(collectionId, page), "articles");
}

/**
 * Get EVERY article across EVERY collection.
 * There is no global "all articles" endpoint, so this pages through all
 * collections, then pages through the articles of each collection.
 * @returns {Promise<any[]>} A flat array of all articles.
 */
export async function getAllArticles() {
  const collections = await fetchAllPages(
    (page) => listCollections(page),
    "collections"
  );

  const all = [];
  for (const collection of collections) {
    const articles = await getAllArticlesInCollection(collection.id);
    all.push(...articles);
  }
  return all;
}

/**
 * Run an async mapper over items with a bounded number of concurrent workers.
 * Preserves input order in the returned array.
 * @param {any[]} items
 * @param {(item: any, index: number) => Promise<any>} mapper
 * @param {number} concurrency
 */
async function mapWithConcurrency(items, mapper, concurrency = 5) {
  const results = new Array(items.length);
  let next = 0; // shared cursor: the index of the next item to process

  // Each worker pulls the next unclaimed item, processes it, and repeats until
  // the list is exhausted. Because `next++` is atomic within a single-threaded
  // event loop, no two workers ever grab the same index.
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await mapper(items[index], index); // keep results in order
    }
  }

  // Start N workers that all drain the same queue → at most N requests in flight.
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers); // resolve once every worker has finished
  return results;
}

/**
 * Get EVERY article across EVERY collection, WITH full content (the `text`
 * body). The list endpoints don't include `text`, so this fetches each article
 * individually by id.
 * @param {number} [concurrency=5] - Max simultaneous article requests.
 * @param {(done: number, total: number) => void} [onProgress] - Optional callback.
 * @returns {Promise<any[]>} Full article objects, each including `text`.
 */
export async function getAllArticlesWithContent(concurrency = 5, onProgress) {
  const summaries = await getAllArticles();

  let done = 0;
  return mapWithConcurrency(
    summaries,
    async (summary) => {
      const body = await getArticle(summary.id);
      done += 1;
      onProgress?.(done, summaries.length);
      return body.article; // unwrap { article: {...} }
    },
    concurrency
  );
}
