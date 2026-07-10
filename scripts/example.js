// Runnable example: fetch EVERY article across all collections, WITH full
// content (the `text` body), and save them to data/articles.json.
// Run with:  npm run example

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getAllArticlesWithContent } from "./helpscout.js";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const outFile = join(outDir, "articles.json");

console.log("Fetching all articles with content...");
const articles = await getAllArticlesWithContent(5, (done, total) => {
  process.stdout.write(`\r  ${done}/${total} fetched`);
});
console.log(`\nDone. ${articles.length} articles fetched.`);

await mkdir(outDir, { recursive: true });
await writeFile(outFile, JSON.stringify(articles, null, 2), "utf8");
console.log(`Saved full content to ${outFile}`);

// Show a quick sample so you can see content came through.
const sample = articles[0];
if (sample) {
  console.log(`\nSample — #${sample.number} "${sample.name}":`);
  console.log(sample.text.slice(0, 200).replace(/\s+/g, " ") + "...");
}
