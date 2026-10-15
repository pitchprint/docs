// Pull the release notes off the PitchPrint blog into data/blog-releases.json.
//
// The release notes are written in Ghost at blog.pitchprint.com. The year files
// under blog/releases/ are a mirror of them, built by hand until now. This is
// the first half of automating that: fetch, parse, cache. The conversion and
// the writing happen in ingest-blog-releases.mjs.
//
// The feed is Ghost 2.16 RSS 2.0 and carries the full post HTML in
// <content:encoded>, so nothing has to be scraped from the rendered page.
//
//   node scripts/fetch-blog-releases.js
//   node scripts/fetch-blog-releases.js --raw   also keep the XML, for debugging
//
// Env:
//   BLOG_RSS_URL   default https://blog.pitchprint.com/rss/

import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(scriptDir, "..");
const dataDir = join(rootDir, "data");

const RSS_URL = process.env.BLOG_RSS_URL || "https://blog.pitchprint.com/rss/";
const KEEP_RAW = process.argv.includes("--raw");

/* ------------------------------------------------------------- parsing */

/** Pull one tag's content out of an item, CDATA-wrapped or not. */
function tag(xml, name) {
  const re = new RegExp(
    `<${name}(?:\\s[^>]*)?>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*</${name}>`
  );
  const m = xml.match(re);
  if (!m) return null;
  return (m[1] !== undefined ? m[1] : m[2] ?? "").trim();
}

/** Split the feed into <item> blocks. */
export function parseFeed(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    items.push({
      title: tag(block, "title"),
      link: tag(block, "link"),
      pubDate: tag(block, "pubDate"),
      author: tag(block, "dc:creator"),
      description: tag(block, "description"),
      html: tag(block, "content:encoded"),
    });
  }
  return items;
}

/** Only the weekly release notes, not the feature posts. */
export const isRelease = (item) =>
  /^\s*release\s+wk/i.test(item.title || "");

/* ---------------------------------------------------------------- main */

const isMain =
  process.argv[1] &&
  import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href;

if (isMain) {
  console.log(`Fetching ${RSS_URL}`);

  let xml;
  try {
    const res = await fetch(RSS_URL, {
      headers: { "user-agent": "pitchprint-docs-sync" },
      redirect: "follow",
    });
    if (!res.ok) {
      console.error(`The blog returned HTTP ${res.status} ${res.statusText}.`);
      process.exit(1);
    }
    xml = await res.text();
  } catch (err) {
    console.error(`Could not reach the blog: ${err.message}`);
    process.exit(1);
  }

  await mkdir(dataDir, { recursive: true });
  if (KEEP_RAW) {
    await writeFile(join(dataDir, "blog-rss.xml"), xml, "utf8");
    console.log("  raw XML kept at data/blog-rss.xml");
  }

  const items = parseFeed(xml);

  // Guards. A feed that parsed to nothing must fail loudly — a cache written
  // from unreadable XML would make every later run report "nothing new" and
  // the whole pipeline would go quietly dead.
  if (items.length === 0) {
    console.error(
      `\nParsed 0 items from ${xml.length} bytes of XML.\n` +
        "Either the feed moved or its shape changed. Refusing to write an empty cache.\n\n" +
        "First 400 bytes of what came back:\n" +
        xml.slice(0, 400).replace(/^/gm, "  | ")
    );
    process.exit(1);
  }

  const releases = items.filter(isRelease);
  if (releases.length === 0) {
    console.error(
      `\nParsed ${items.length} item(s) but none look like a release note.\n` +
        "Expected titles beginning \"Release WK…\". Found:\n" +
        items.slice(0, 8).map((i) => `  | ${i.title}`).join("\n")
    );
    process.exit(1);
  }

  const incomplete = releases.filter((r) => !r.html || !r.pubDate || !r.link);
  if (incomplete.length) {
    console.error(
      `\n${incomplete.length} release post(s) are missing content, a date or a link:\n` +
        incomplete.map((i) => `  | ${i.title}`).join("\n") +
        "\nRefusing to cache a partial feed."
    );
    process.exit(1);
  }

  const out = {
    _comment:
      "Release notes pulled from the PitchPrint blog's RSS feed by " +
      "scripts/fetch-blog-releases.js. Regenerated on every sync; not hand-edited.",
    source: RSS_URL,
    fetchedAt: new Date().toISOString(),
    count: releases.length,
    releases,
  };
  await writeFile(
    join(dataDir, "blog-releases.json"),
    JSON.stringify(out, null, 2) + "\n",
    "utf8"
  );

  console.log(
    `\n${releases.length} release note(s) cached to data/blog-releases.json ` +
      `(${items.length - releases.length} other post(s) ignored).`
  );
  console.log(`  newest: ${releases[0].title} — ${releases[0].pubDate}`);
}
