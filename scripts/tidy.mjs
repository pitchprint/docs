// Mechanical conversion of Help-Scout-converted Markdown toward house style.
//
// Everything here is deterministic and cannot misread the content: no facts are
// invented, nothing is dropped. The AI pass in style-pass.mjs does the judgement
// work (good step titles, alt text, callout choice) on top of this; when there is
// no API key, this is what ships.

/** Turndown escapes and Help Scout run-ons. */
function fixSyntax(body, note) {
  const sub = (label, re, to) => {
    const before = body;
    body = body.replace(re, to);
    if (body !== before) note(label);
  };

  // Split run-on images FIRST. Help Scout glues an image to the text after it
  // ("![](url)3\. Once you..."), and the ordinal fix below is anchored to line
  // start — so unescaping before the split leaves the glued ordinal escaped,
  // and it never becomes a <Step>. Order matters here.
  sub("run-on images", /(!\[[^\]]*\]\([^)\s]+\))(?=[^\s\n])/g, "$1\n\n");
  // "1\. Navigate" -> "1. Navigate"
  sub("list ordinals", /^(\s*\d+)\\\./gm, "$1.");
  // "**\[POST\]**" -> "**[POST]**"
  sub("escaped brackets", /\\([[\]])/g, "$1");
  // h4/h5/h6 -> h3; Mintlify's page nav reads h2/h3
  sub("heading levels", /^#{4,6}\s+/gm, "### ");
  sub("blank line before headings", /([^\n])\n(#{2,3}\s)/g, "$1\n\n$2");
  sub("blank line runs", /\n{4,}/g, "\n\n\n");

  return body;
}

/** Markdown images become Frame-wrapped img, which is the house pattern. */
function framesForImages(body, note) {
  let count = 0;
  let missingAlt = 0;

  const out = body.replace(
    /^([ \t]*)!\[([^\]]*)\]\(([^)\s]+)\)[ \t]*$/gm,
    (_m, indent, alt, src) => {
      count += 1;
      if (!alt.trim()) missingAlt += 1;
      return (
        `${indent}<Frame>\n` +
        `${indent}  <img src="${src}" alt="${alt.replace(/"/g, "&quot;")}" />\n` +
        `${indent}</Frame>`
      );
    }
  );

  if (count) note(`${count} image(s) wrapped in Frame`);
  return { body: out, missingAlt };
}

const CALLOUTS = [
  [/^(?:\*\*)?(?:Please note|Note that|Note)(?:\*\*)?\s*[:—-]\s*/i, "Note"],
  [/^(?:\*\*)?Important(?:\*\*)?\s*[:—-]\s*/i, "Warning"],
  [/^(?:\*\*)?Warning(?:\*\*)?\s*[:—-]\s*/i, "Warning"],
  [/^(?:\*\*)?Tip(?:\*\*)?\s*[:—-]\s*/i, "Tip"],
];

/** "Note: x" paragraphs become the matching callout component. */
function calloutsForPrefixes(blocks, note) {
  let count = 0;
  const out = blocks.map((b) => {
    if (b.startsWith("<") || b.startsWith("#") || /^\d+\.\s/.test(b)) return b;
    for (const [re, tag] of CALLOUTS) {
      if (re.test(b)) {
        count += 1;
        const text = b.replace(re, "").trim();
        return `<${tag}>\n  ${text.replace(/\n/g, "\n  ")}\n</${tag}>`;
      }
    }
    return b;
  });
  if (count) note(`${count} paragraph(s) converted to callouts`);
  return out;
}

/** A short imperative-ish title from the first clause of a step. */
function stepTitle(text) {
  let t = text
    .replace(/^\d+\.\s*/, "")
    .replace(/<[^>]+>/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*`_]/g, "")
    .trim();

  const stop = t.search(/[.:;!?]\s|\.$/);
  if (stop > 12) t = t.slice(0, stop);
  t = t.split("\n")[0].trim();
  if (t.length > 62) t = t.slice(0, 62).replace(/\s+\S*$/, "");
  t = t.replace(/[,;:.\s]+$/, "");
  return t || "Step";
}

/**
 * A run of "1. 2. 3." blocks becomes <Steps>. Blocks that are not numbered but
 * sit inside the run (images, extra prose) attach to the step above them, which
 * is how Help Scout authors lay screenshots out.
 */
function stepsForNumberedRun(blocks, note) {
  const isNumbered = (b) => /^\d+[.)]\s/.test(b);
  const first = blocks.findIndex(isNumbered);
  if (first === -1) return blocks;

  // The run ends at the last numbered block, so trailing prose stays outside.
  let last = -1;
  for (let i = blocks.length - 1; i >= first; i--) {
    if (isNumbered(blocks[i])) { last = i; break; }
  }
  const numbered = blocks.slice(first, last + 1).filter(isNumbered).length;
  if (numbered < 2) return blocks;

  const steps = [];
  for (let i = first; i <= last; i++) {
    const b = blocks[i];
    if (isNumbered(b)) steps.push({ title: stepTitle(b), body: [b.replace(/^\d+[.)]\s*/, "")] });
    else if (steps.length) steps[steps.length - 1].body.push(b);
    else return blocks; // shouldn't happen, but never reorder content on a surprise
  }

  const indent = (s) => s.split("\n").map((l) => (l ? "    " + l : l)).join("\n");
  const rendered =
    "<Steps>\n" +
    steps
      .map(
        (s) =>
          `  <Step title="${s.title.replace(/"/g, "&quot;")}">\n` +
          s.body.map(indent).join("\n\n") +
          `\n  </Step>`
      )
      .join("\n\n") +
    "\n</Steps>";

  note(`${steps.length} numbered item(s) wrapped in Steps`);
  return [...blocks.slice(0, first), rendered, ...blocks.slice(last + 1)];
}

/**
 * Tidy one article body. Returns { body, applied, warnings }.
 */
export function tidy(text) {
  const applied = [];
  const warnings = [];
  const note = (m) => applied.push(m);

  let body = fixSyntax(text, note);

  const framed = framesForImages(body, note);
  body = framed.body;
  if (framed.missingAlt) {
    warnings.push(`${framed.missingAlt} image(s) have no alt text — needs a human or the AI pass`);
  }

  let blocks = body.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  blocks = calloutsForPrefixes(blocks, note);
  blocks = stepsForNumberedRun(blocks, note);

  if (/&lt;/.test(body)) {
    warnings.push("escaped markup (&lt;…&gt;) left as text — worth a fenced code block");
  }

  return { body: blocks.join("\n\n").trim() + "\n", applied, warnings };
}

/** A description that ends on a sentence rather than mid-word. */
export function tidyDescription(desc) {
  if (!desc) return null;
  let d = desc.replace(/\s*\.{3}$/, "").trim();
  const sentence = d.match(/^(.{20,200}?[.!?])(\s|$)/);
  if (sentence) d = sentence[1];
  if (d.length > 160) d = d.slice(0, 157).replace(/\s+\S*$/, "") + ".";
  return d;
}
