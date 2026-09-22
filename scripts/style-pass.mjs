// Rewrite a mechanically-tidied article into house style using an LLM, then
// verify it did not lose or invent anything.
//
// Used by scripts/ingest-new.js. Optional: with no ANTHROPIC_API_KEY the ingest
// keeps the mechanical version, so the pipeline degrades rather than breaks.
//
// The model is given three things:
//   1. scripts/house-style.md — the rules, derived from the real pages
//   2. an exemplar: a real hand-written page from the same section
//   3. Mintlify's own component reference, fetched once per run
//
// That last item is the useful version of "embed the Mintlify link": a URL in
// the MDX would be inert, but handing the model Mintlify's component docs makes
// the output conform to the components that actually exist.
//
// Nothing here trusts the model. validate() enforces the constraints that matter
// — frontmatter intact, no lost images or links, no invented components, no
// content quietly deleted — and the caller falls back on any failure.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));

const API = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
const MINTLIFY_COMPONENTS = "https://www.mintlify.com/docs/components.md";

// Frontmatter keys an ingested page may carry.
//
// Deliberately narrower than the repo at large: 11 api-reference pages carry an
// `openapi:` key that drives the interactive playground, and that is correct for
// a hand-written page. But an ingested Help Scout article is prose — an
// `openapi:` key the model added would point at a spec path that does not exist,
// so it counts as an invention here.
const ALLOWED_FRONTMATTER = ["title", "description"];

// Components the style guide permits. Anything else is an invention.
//
// Also narrower than the repo: `ReleaseLink` is a bespoke component used on one
// release page. Hand-written pages may use it; an automated pass may not.
// `Tree.Folder` and `Tree.File` are checked by their `Tree` base.
const ALLOWED = new Set([
  "Steps", "Step", "Frame", "Note", "Tip", "Warning", "Danger", "Info",
  "Card", "CardGroup", "Accordion", "AccordionGroup", "Tabs", "Tab",
  "CodeGroup", "Badge", "Tree", "ResponseField", "img", "br",
]);

/** Words of prose, with MDX/markdown syntax stripped — for content-volume checks. */
function proseWords(mdx) {
  return mdx
    .replace(/^---\n[\s\S]*?\n---/, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*`_>|-]/g, " ")
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w) && w.length > 2)
    .map((w) => w.toLowerCase());
}

const imagesIn = (s) => new Set([...s.matchAll(/(?:src=["']|!\[[^\]]*\]\()([^"')\s]+)/g)].map((m) => m[1]));
const linksIn = (s) => new Set([...s.matchAll(/\]\((https?:\/\/[^)\s]+)/g)].map((m) => m[1]));

/**
 * Specifics a rewrite has no licence to lose: inline code, fenced blocks, bold
 * UI labels, and any token carrying a digit (versions, ports, quantities).
 *
 * Word-for-word overlap is the wrong measure for a rewriting task — a good
 * rewrite legitimately rephrases most sentences. These are the tokens that
 * carry the facts, so they must survive even when the prose around them does
 * not.
 *
 * Matching is substring-based and whitespace-normalised, so it is lenient by
 * design: a short token like "2" will be found somewhere on almost any page.
 * That is the intended trade-off — this is a best-effort net over the facts,
 * while the exact guarantees live in the image, link and structure checks.
 */
function specificsIn(mdx) {
  const body = mdx.replace(/^---\n[\s\S]*?\n---/, "");
  const out = new Set();
  const add = (s) => {
    const t = s.replace(/\s+/g, " ").trim();
    if (t.length > 1) out.add(t);
  };

  for (const m of body.matchAll(/`([^`\n]+)`/g)) add(m[1]);
  for (const m of body.matchAll(/```[a-z]*\n([\s\S]*?)```/g)) add(m[1]);
  for (const m of body.matchAll(/\*\*([^*\n]+)\*\*/g)) add(m[1]);
  for (const m of body.matchAll(/\b(?=[a-z]*\d)[a-z0-9][a-z0-9.]*\b/gi)) add(m[0]);

  return out;
}

/** Structural elements that must not shrink: steps and headings. */
function structureOf(mdx) {
  return {
    steps: [...mdx.matchAll(/<Step(?=[\s>])/g)].length,
    headings: [...mdx.matchAll(/^#{2,3}\s+\S/gm)].length,
  };
}

/**
 * Check the model's output. Returns [] when acceptable, or a list of reasons.
 * These are correctness checks; style is the model's job, not ours.
 */
export function validate(before, after, title) {
  const problems = [];

  // Normalise line endings first. Every check below anchors on \n, and the repo
  // is checked out CRLF on Windows — without this, a page read from disk during
  // a local `npm run ingest` reports "frontmatter missing" and every rewrite is
  // rejected for a reason that has nothing to do with its content.
  before = before.replace(/\r\n/g, "\n");
  after = after.replace(/\r\n/g, "\n");

  const fm = after.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) problems.push("frontmatter missing");
  else {
    const keys = [...fm[1].matchAll(/^([a-zA-Z]+):/gm)].map((m) => m[1]);
    const extra = keys.filter((k) => !ALLOWED_FRONTMATTER.includes(k));
    if (extra.length) problems.push(`extra frontmatter keys: ${extra.join(", ")}`);
    if (!new RegExp(`title:\\s*"?${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"?`).test(fm[1])) {
      problems.push("title changed");
    }
  }

  // Every image and external link in the source must survive.
  for (const img of imagesIn(before)) {
    if (!after.includes(img)) problems.push(`image dropped: ${img.slice(0, 60)}`);
  }
  for (const href of linksIn(before)) {
    if (!after.includes(href)) problems.push(`link dropped: ${href.slice(0, 60)}`);
  }

  // Balanced, allowlisted components only.
  const opens = [...after.matchAll(/<([A-Z][A-Za-z.]*)(?=[\s/>])/g)].map((m) => m[1]);
  const closes = [...after.matchAll(/<\/([A-Z][A-Za-z.]*)>/g)].map((m) => m[1]);
  const selfClosing = [...after.matchAll(/<([A-Z][A-Za-z.]*)[^>]*\/>/g)].map((m) => m[1]);
  for (const tag of new Set(opens)) {
    const base = tag.split(".")[0];
    if (!ALLOWED.has(base)) problems.push(`component not in the allowlist: ${tag}`);
    const o = opens.filter((t) => t === tag).length - selfClosing.filter((t) => t === tag).length;
    const c = closes.filter((t) => t === tag).length;
    if (o !== c) problems.push(`unbalanced <${tag}>: ${o} open, ${c} closed`);
  }

  // Content loss. The model may restructure and rephrase freely, so word-for-
  // word overlap is not the test. Three narrower ones instead:

  // 1. Structure may grow, never shrink. Losing a <Step> or a heading is the
  //    signature of a step quietly dropped.
  // A tolerance rather than equality. The mechanical pass wraps every numbered
  // item as a <Step>, including ones that are not steps at all — Help Scout
  // authors end procedures with things like "You can always reach out to us via
  // email". Demoting those is exactly the editorial judgement the AI pass is
  // for, so demanding one Step out per Step in would reject good rewrites.
  //
  // This is not the primary defence against a quietly deleted step: the
  // specifics and volume checks below measure lost content directly. This one
  // catches gross structural collapse — a 14-step procedure flattened to three.
  const floor = (n) => n - Math.max(1, Math.floor(n * 0.25));
  const sb = structureOf(before);
  const sa = structureOf(after);
  if (sb.steps && sa.steps < floor(sb.steps)) {
    problems.push(`steps lost: ${sb.steps} in source, ${sa.steps} in output (floor ${floor(sb.steps)})`);
  }
  if (sb.headings && sa.headings < floor(sb.headings)) {
    problems.push(`headings lost: ${sb.headings} in source, ${sa.headings} in output (floor ${floor(sb.headings)})`);
  }

  // 2. The facts survive: code, bold UI labels, anything with a digit in it.
  //    Both sides are whitespace-normalised — specificsIn() collapses runs of
  //    whitespace inside multi-line code blocks, so the haystack must be
  //    collapsed too or every fenced block reports as missing.
  const afterFlat = after.replace(/\s+/g, " ");
  const missing = [...specificsIn(before)].filter((s) => !afterFlat.includes(s));
  if (missing.length) {
    problems.push(
      `specifics dropped (${missing.length}): ` +
        missing.slice(0, 4).map((s) => JSON.stringify(s.slice(0, 40))).join(", ")
    );
  }

  // 3. Volume: a rewrite trims filler, it does not summarise. Cutting more than
  //    a third of the prose means the page got shorter, not better.
  const bw = proseWords(before).length;
  const aw = proseWords(after).length;
  if (bw && aw / bw < 0.7) {
    problems.push(`content loss: output is ${Math.round((aw / bw) * 100)}% the length of the source (need 70%)`);
  }

  return problems;
}

let componentDocs = null;
async function mintlifyComponentDocs() {
  if (componentDocs !== null) return componentDocs;
  try {
    const res = await fetch(MINTLIFY_COMPONENTS, { signal: AbortSignal.timeout(15000) });
    componentDocs = res.ok ? (await res.text()).slice(0, 24000) : "";
  } catch {
    componentDocs = "";
  }
  return componentDocs;
}

/**
 * Conform one article. Returns { mdx, applied, problems }.
 * `applied` is false when the mechanical version was kept.
 */
export async function stylePass({ mdx, title, section, exemplar }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { mdx, applied: false, problems: ["no ANTHROPIC_API_KEY — mechanical version kept"] };

  const styleGuide = await readFile(join(scriptDir, "house-style.md"), "utf8");
  const components = await mintlifyComponentDocs();

  const system =
    "You rewrite documentation into an established house style. You restructure " +
    "and rephrase; you never invent facts and never drop content. You output MDX " +
    "and nothing else — no preamble, no explanation, no code fence around the document.";

  const prompt = [
    "# House style",
    "",
    styleGuide,
    components ? "\n# Mintlify component reference\n\n" + components : "",
    "",
    `# Exemplar — an existing hand-written page from the ${section} section`,
    "",
    "Match this page's structure, tone and component usage.",
    "",
    exemplar,
    "",
    "# Article to rewrite",
    "",
    "This was converted from Help Scout and is mechanically tidied but not yet in",
    "house style. Rewrite it. Keep every step, image and link. Do not change any",
    "image or external URL. Output only the finished MDX.",
    "",
    mdx,
  ].join("\n");

  let text;
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        temperature: 0,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      const body = await res.text();
      return {
        mdx,
        applied: false,
        problems: [`API ${res.status}: ${body.slice(0, 200)}`],
      };
    }
    const json = await res.json();
    text = (json.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  } catch (err) {
    return { mdx, applied: false, problems: [`request failed: ${err.message}`] };
  }

  // Strip a wrapping fence if the model added one despite instructions.
  let out = text.trim().replace(/^```(?:mdx|markdown)?\n([\s\S]*)\n```$/, "$1").trim() + "\n";

  const problems = validate(mdx, out, title);
  if (problems.length) return { mdx, applied: false, problems };

  return { mdx: out, applied: true, problems: [] };
}
