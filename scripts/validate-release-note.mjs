// The quality gate for an imported release note.
//
// TWO DIFFERENT THINGS, DELIBERATELY KEPT APART
//
// 1. STRUCTURE — pass or fail, no percentage. Does the block obey the house
//    rules: allowlisted components, balanced tags, images in <Frame> pointing
//    at this repo, headings at the level the year file expects, nothing that
//    would break the MDX build. A block that fails any of these is dropped.
//
// 2. FIDELITY — a real percentage, and the one the 95% bar is set against.
//    The conversion is supposed to carry the post across unchanged, so the
//    block should retain essentially all of the post's prose. This is the
//    opposite of the docs rewrite, where measuring word overlap was wrong
//    *because* the model was meant to rephrase. Here rephrasing would be a
//    bug, so the overlap is exactly the right thing to measure.
//
// Losing a heading, an image or an external link is not scored at all — it is
// a flat failure, because no percentage of a post that silently dropped a
// feature section is acceptable.
//
// A rejected block costs you a missing release note, which someone will
// notice. A wrong one costs you a published page nobody checks again.

/** Components the style guide permits inside a release note. */
const ALLOWED = new Set([
  "Update", "Frame", "Note", "Tip", "Warning", "Danger", "Info",
  "Card", "CardGroup", "Accordion", "AccordionGroup", "Tabs", "Tab",
  "CodeGroup", "Badge", "Steps", "Step", "img", "br",
]);

/** Words of prose, with MDX/markdown syntax stripped. Mirrors style-pass.mjs. */
export function proseWords(mdx) {
  return mdx
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ") // our own import comment
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/&#?[a-z0-9]+;/gi, " ")
    .replace(/[#*`_>|-]/g, " ")
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w) && w.length > 2)
    .map((w) => w.toLowerCase());
}

const headingsOf = (s) =>
  [...s.matchAll(/^\s*#{2,4}\s+(.+?)\s*$/gm)].map((m) =>
    m[1].replace(/[*_`]/g, "").trim().toLowerCase()
  );

const linksOf = (s) =>
  new Set([...s.matchAll(/\]\((https?:\/\/[^)\s]+)/g)].map((m) => m[1]));

/**
 * Judge one rendered <Update> block against the post it came from.
 *
 * @param block    the rendered <Update>…</Update>
 * @param source   { markdown, images, missingAlt, hasFixes } from convertPost
 * @param opts     { floor = 95 } the fidelity percentage required
 * @returns { ok, clean, score, problems, warnings }
 */
export function validateReleaseNote(block, source, opts = {}) {
  const floor = opts.floor ?? 95;
  const problems = [];
  const warnings = [];

  /* ---------------------------------------------------- 1. structure */

  if (!/^<Update\s+label="[^"]+"\s+description="[^"]*"/.test(block)) {
    problems.push("does not open with <Update label=… description=…>");
  }
  if (!/rss=\{\{\s*title:/.test(block)) {
    problems.push("missing the rss={{ title, description }} line");
  }
  if (!block.trimEnd().endsWith("</Update>")) {
    problems.push("does not close with </Update>");
  }

  // Everything below scans the block with MDX comments removed. The import
  // comment this pipeline writes mentions <AccordionGroup> in prose, and
  // counting that as an open tag reported every single block as unbalanced —
  // the gate's first run rejected a perfectly good note for it.
  const scannable = block.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");

  // Allowlisted and balanced.
  const opens = [...scannable.matchAll(/<([A-Z][A-Za-z.]*)(?=[\s/>])/g)].map((m) => m[1]);
  const closes = [...scannable.matchAll(/<\/([A-Z][A-Za-z.]*)>/g)].map((m) => m[1]);
  const selfClosing = [...scannable.matchAll(/<([A-Z][A-Za-z.]*)[^>]*\/>/g)].map((m) => m[1]);
  for (const tag of new Set(opens)) {
    const base = tag.split(".")[0];
    if (!ALLOWED.has(base)) problems.push(`component not in the allowlist: ${tag}`);
    const o = opens.filter((t) => t === tag).length - selfClosing.filter((t) => t === tag).length;
    const c = closes.filter((t) => t === tag).length;
    if (o !== c) problems.push(`unbalanced <${tag}>: ${o} open, ${c} closed`);
  }

  // Headings inside a block must be ###. A # or ## would outrank the year
  // file's own structure and break the page's navigation.
  for (const m of scannable.matchAll(/^\s*(#{1,6})\s+/gm)) {
    if (m[1].length !== 3) {
      problems.push(`heading at level ${m[1].length}; release-note headings must be ###`);
      break;
    }
  }

  // Every image wrapped in <Frame> and served from this repo.
  const imgs = [...scannable.matchAll(/<img\s[^>]*src="([^"]+)"[^>]*>/g)];
  const framed = [...scannable.matchAll(/<Frame>[\s\S]*?<\/Frame>/g)].join("\n");
  for (const [tagText, src] of imgs) {
    if (!framed.includes(tagText)) problems.push(`image not wrapped in <Frame>: ${src}`);
    if (/^https?:\/\//i.test(src)) {
      problems.push(`image still points off-site: ${src}`);
    } else if (!src.startsWith("/blog/images/")) {
      problems.push(`image is not under /blog/images/: ${src}`);
    }
  }

  // MDX build hazards: a brace or a stray < outside code and components.
  const stripped = block
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/rss=\{\{[\s\S]*?\}\}>/g, " ")
    .replace(/<\/?[A-Za-z][^>]*>/g, " ");
  if (/[{}]/.test(stripped)) problems.push("unescaped { or } in prose — the MDX build will fail");
  if (/<(?![\s=])/.test(stripped)) problems.push("unescaped < in prose — the MDX build will fail");

  /* ----------------------------------------------------- 2. fidelity */

  const srcMd = source.markdown || "";
  const srcWords = proseWords(srcMd);
  const outWords = proseWords(block);

  // Nothing structural may vanish. These are not scored — they are flat fails.
  const srcHeads = headingsOf(srcMd);
  const outHeads = headingsOf(scannable);
  for (const h of srcHeads) {
    if (!outHeads.includes(h)) problems.push(`heading dropped: "${h}"`);
  }

  const srcImgCount = (source.images || []).length;
  if (imgs.length !== srcImgCount) {
    problems.push(`images: ${srcImgCount} in the post, ${imgs.length} in the block`);
  }

  const srcLinks = linksOf(srcMd);
  const outLinks = linksOf(block);
  for (const l of srcLinks) {
    if (!outLinks.has(l)) problems.push(`external link dropped: ${l}`);
  }

  // The score. A bag-of-words retention check: how much of the post's prose
  // survived. Counted with multiplicity so a dropped paragraph of repeated
  // words still registers.
  const have = new Map();
  for (const w of outWords) have.set(w, (have.get(w) || 0) + 1);
  let kept = 0;
  for (const w of srcWords) {
    const n = have.get(w) || 0;
    if (n > 0) {
      kept++;
      have.set(w, n - 1);
    }
  }
  const score = srcWords.length ? Math.round((kept / srcWords.length) * 1000) / 10 : 100;

  if (srcWords.length && score < floor) {
    problems.push(
      `fidelity ${score}% of the source post's prose (need ${floor}%) — ` +
        `${srcWords.length - kept} word(s) of ${srcWords.length} did not survive`
    );
  }

  // Padding is as bad as loss: a converter that duplicates a section scores
  // 100% on retention while doubling the post.
  if (srcWords.length && outWords.length > srcWords.length * 1.4) {
    problems.push(
      `the block is ${Math.round((outWords.length / srcWords.length) * 100)}% the ` +
        "length of the post — content looks duplicated"
    );
  }

  /* ------------------------------------------------- 3. needs a human */

  // Not failures: the block is correct, but a person still has work to do.
  // These are what stop a block being auto-merged.
  if (source.missingAlt) warnings.push(`${source.missingAlt} image(s) have no alt text`);
  if (source.hasFixes) warnings.push("the bug-fix section is not wrapped in an <AccordionGroup>");

  return {
    ok: problems.length === 0,
    clean: problems.length === 0 && warnings.length === 0,
    score,
    problems,
    warnings,
  };
}
