// Ghost post HTML -> a Mintlify <Update> block. Pure functions, no I/O, so the
// tests can exercise them without a network or a repository.
//
// Used by ingest-blog-releases.mjs.

import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

export const BLOG_HOST = "blog.pitchprint.com";

/* -------------------------------------------------------------- dates */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** ISO week number, and the year that week belongs to. */
export function isoWeek(date) {
  const t = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const dayNum = t.getUTCDay() || 7; // Monday=1 … Sunday=7
  t.setUTCDate(t.getUTCDate() + 4 - dayNum); // the Thursday of this week
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return { week, year: t.getUTCFullYear() };
}

/**
 * "WK40-26" from a publication date.
 *
 * The label comes from the date, never the post title. Every label in the repo
 * is week-then-year — WK26-26 is week 26 of 2026, WK48-25 is week 48 of 2025 —
 * and the post published on 1 October 2026 is titled "Release WK26-40", which
 * taken literally reads as year 2040. Verified against the four labels already
 * in blog/releases/2026.mdx: all four derive correctly from their pubDate.
 */
export function labelFor(date) {
  const { week, year } = isoWeek(date);
  return `WK${String(week).padStart(2, "0")}-${String(year % 100).padStart(2, "0")}`;
}

export const prettyDate = (d) =>
  `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

/** The WKnn-yy code written in a post title, if any — only to report mismatch. */
export function labelInTitle(title) {
  const m = String(title).match(/wk\s*(\d{1,2})\s*-\s*(\d{2})/i);
  return m ? `WK${m[1].padStart(2, "0")}-${m[2]}` : null;
}

/* ---------------------------------------------------------- turndown */

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "_",
});
turndown.use(gfm);

// Ghost wraps images in <figure class="kg-card kg-image-card"> with an optional
// <figcaption>. Turndown's default flattens that to a bare ![](), losing the
// caption — which is often the only alt text the post has.
turndown.addRule("ghostFigure", {
  filter: (node) => node.nodeName === "FIGURE",
  replacement: (_content, node) => {
    const img = node.querySelector && node.querySelector("img");
    if (!img) return "";
    const cap = node.querySelector("figcaption");
    const alt = (cap && cap.textContent.trim()) || img.getAttribute("alt") || "";
    return `\n\n<<<IMAGE|${img.getAttribute("src") || ""}|${alt}>>>\n\n`;
  },
});

turndown.addRule("bareImage", {
  filter: "img",
  replacement: (_c, node) =>
    `\n\n<<<IMAGE|${node.getAttribute("src") || ""}|${node.getAttribute("alt") || ""}>>>\n\n`,
});

/* ------------------------------------------------------------- mdx */

/** Escape the characters MDX treats as syntax, leaving real code alone. */
export function sanitizeMdx(markdown) {
  const parts = [];
  const stash = (m) => {
    parts.push(m);
    return `@@PROTECTED_${parts.length - 1}@@`;
  };
  let out = markdown
    .replace(/```[\s\S]*?```/g, stash)
    .replace(/(?<!\\)`[^`\n]+`/g, stash);
  out = out.replace(/</g, "&lt;").replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");
  return out.replace(/@@PROTECTED_(\d+)@@/g, (_, i) => parts[Number(i)]);
}

/** A blog image URL -> the path this repo serves it from, or null if foreign. */
export function localImagePath(src) {
  try {
    const u = new URL(src, `https://${BLOG_HOST}`);
    if (u.hostname !== BLOG_HOST) return null;
    const m = u.pathname.match(/^\/content\/images\/(.+)$/);
    return m ? `/blog/images/${m[1]}` : null;
  } catch {
    return null;
  }
}

/**
 * Ghost post HTML -> the body of an <Update> block, plus what it references.
 *
 * Deliberately does NOT rebuild the <AccordionGroup> the hand-written blocks
 * use for bug fixes. Where that section ends is genuinely ambiguous — the
 * closing paragraph and the sign-off have the same shape as a fix entry — and
 * wrapping it wrong would bury the sign-off inside a collapsed panel. Its
 * presence is reported instead, on every run and in every pull request.
 */
export function convertPost(html, { headingLevel = 3 } = {}) {
  let md = turndown.turndown(html || "");

  const images = [];
  md = md.replace(/<<<IMAGE\|([^|]*)\|([^>]*)>>>/g, (_m, src, alt) => {
    const local = localImagePath(src);
    images.push({ src, local });
    const cleanAlt = (alt || "").replace(/"/g, "'").trim();
    return `\n\n<Frame>\n  <img src="${local || src}" alt="${cleanAlt}" />\n</Frame>\n\n`;
  });

  // Protect the Frame blocks from MDX escaping, then escape the prose.
  const frames = [];
  md = md.replace(/<Frame>[\s\S]*?<\/Frame>/g, (m) => {
    frames.push(m);
    return `@@FRAME_${frames.length - 1}@@`;
  });
  md = sanitizeMdx(md);
  md = md.replace(/@@FRAME_(\d+)@@/g, (_, i) => frames[Number(i)]);

  // The post's <h1> is its title, which the block already carries as its label.
  md = md
    .split("\n")
    .filter((l) => !/^#\s/.test(l))
    .map((l) => l.replace(/^#{2,6}\s+/, "#".repeat(headingLevel) + " "))
    .join("\n");

  // Ghost posts open with a bold "What's new 🚀" lead-in; the block builds its
  // own bold summary from the headings, so this would be a second one.
  md = md.replace(/^\*\*what'?s new[^\n]*\*\*\s*$/gim, "");

  const hasFixes = /^_?we also fixed[^\n]*_?$/im.test(md);
  const missingAlt = (md.match(/alt=""/g) || []).length;

  return {
    markdown: md.replace(/\n{3,}/g, "\n\n").trim(),
    images,
    hasFixes,
    missingAlt,
  };
}

/** The `###` headings, in order. */
export const headingsIn = (md) =>
  [...md.matchAll(/^#{3}\s+(.+)$/gm)].map((m) => m[1].trim());

const quoted = (v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** Assemble the whole <Update> block, in the live blog/releases format. */
export function renderBlock({ label, date, markdown, link }) {
  const heads = headingsIn(markdown);
  const summary = heads.length ? heads.join(", ") + "." : "";
  const rssTitle = `${label} — ${heads.slice(0, 2).join(", ")}`;

  const I = "  ";
  const body = markdown
    .split("\n")
    .map((l) => (l.trim() ? I + l : ""))
    .join("\n");

  return [
    `<Update label=${quoted(label)} description=${quoted(date)}`,
    `${I}rss={{ title: ${quoted(rssTitle)}, description: ${quoted(summary)} }}>`,
    `${I}{/* Imported from ${link} — check the bug-fix section reads as an <AccordionGroup>, and that every image has real alt text. */}`,
    "",
    ...(summary ? [`${I}**${summary}**`, ""] : []),
    body,
    "",
    "</Update>",
  ].join("\n");
}
