/**
 * Ghost -> Mintlify migration.
 *
 *   node scripts/migrate-ghost.mjs _import/pitchprint-blog.ghost.2026-07-28.json [--no-images]
 *
 * Emits:
 *   posts/<slug>.mdx        standalone articles, one page each
 *   releases/<year>.mdx     weekly release notes, one <Update> per release
 *   index.mdx               blog home, generated from the newest content
 *   images/<y>/<m>/<file>   every image referenced by a post
 *   docs.json               navigation + redirects from the old Ghost URLs
 *
 * See README.md for the conversion decisions this encodes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import TurndownService from 'turndown';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_HOST = 'https://blog.pitchprint.com';
const EXPORT = process.argv[2];
const SKIP_IMAGES = process.argv.includes('--no-images');

if (!EXPORT) {
  console.error('usage: node scripts/migrate-ghost.mjs <ghost-export.json> [--no-images]');
  process.exit(1);
}

/** Ghost tags that only mean "this is a weekly release note". */
const RELEASE_TAGS = new Set(['week', 'wk', 'weekly', 'release', 'notes']);

/**
 * Release-tagged posts that read as announcements, not weekly notes.
 * These become standalone articles instead.
 */
const FORCE_ARTICLE = new Set([
  'new-admin-portal',
  'pitchprint-bigcommerce',
  'version-10-release',
]);

/** Ghost tags worth surfacing as a sidebar tag on an article page. */
const ARTICLE_TAG_LABEL = {
  featured: 'Featured',
  engineering: 'Engineering',
  spark: 'Spark',
  module: 'Modules',
  event: 'Event',
  '3dcart': '3dcart',
  bigcommerce: 'BigCommerce',
  wix: 'Wix',
  shopify: 'Shopify',
  web2print: 'Web2Print',
};

// ---------------------------------------------------------------- load + index

const db = JSON.parse(fs.readFileSync(EXPORT, 'utf8')).db[0].data;

const tagSlugById = new Map(db.tags.map((t) => [t.id, t.slug]));
const userNameById = new Map(db.users.map((u) => [u.id, u.name]));

const tagsByPost = new Map();
for (const pt of [...db.posts_tags].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
  const slug = tagSlugById.get(pt.tag_id);
  if (!slug) continue;
  if (!tagsByPost.has(pt.post_id)) tagsByPost.set(pt.post_id, []);
  tagsByPost.get(pt.post_id).push(slug);
}

const authorByPost = new Map(
  db.posts_authors.map((pa) => [pa.post_id, userNameById.get(pa.author_id)]),
);

// ------------------------------------------------------------ html -> markdown

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '_',
});

/**
 * Ghost stored no alt text on any image, so fall back to the title of the post
 * being converted — screenshots here are informative, not decorative.
 */
let altFallback = '';

/**
 * Ghost wraps media in <figure>. Three shapes matter:
 *   kg-image-card   — one <img>
 *   kg-gallery-card — several <img> (two posts have 9 and 7)
 *   kg-embed-card   — no <img> at all: a YouTube iframe or a tweet blockquote
 *
 * Returning '' for the no-image case silently drops embeds, so fall through to
 * the converted children instead.
 */
turndown.addRule('figure', {
  filter: 'figure',
  replacement: (content, node) => {
    // Turndown's DOM returns an array-like NodeList with no iterator, so no spread.
    const imgs = Array.from(node.querySelectorAll?.('img') ?? []).filter((i) =>
      i.getAttribute('src'),
    );
    const caption = (node.querySelector?.('figcaption')?.textContent || '').trim();

    if (!imgs.length) {
      const inner = (content || '').trim();
      return inner ? `\n\n${inner}\n\n` : '';
    }

    const frame = (img, withCaption) => {
      const alt = (img.getAttribute('alt') || '').trim() || caption || altFallback;
      const attrs = `src="${img.getAttribute('src')}" alt="${escapeAttr(alt)}"`;
      return withCaption
        ? `<Frame caption="${escapeAttr(caption)}">\n  <img ${attrs} />\n</Frame>`
        : `<Frame>\n  <img ${attrs} />\n</Frame>`;
    };

    // A gallery shares one caption, so emit it once as a line of its own.
    if (imgs.length > 1) {
      const frames = imgs.map((img) => frame(img, false)).join('\n\n');
      return `\n\n${frames}${caption ? `\n\n_${caption}_` : ''}\n\n`;
    }
    return `\n\n${frame(imgs[0], Boolean(caption))}\n\n`;
  },
});

/** Bare <img> outside a figure. */
turndown.addRule('img', {
  filter: 'img',
  replacement: (_content, node) => {
    const src = node.getAttribute('src');
    if (!src) return '';
    const alt = escapeAttr((node.getAttribute('alt') || '').trim() || altFallback);
    return `\n\n<Frame>\n  <img src="${src}" alt="${alt}" />\n</Frame>\n\n`;
  },
});

/** Keep YouTube embeds, drop social-script embeds (they cannot work in MDX). */
turndown.addRule('iframe', {
  filter: 'iframe',
  replacement: (_content, node) => {
    const src = node.getAttribute('src') || '';
    if (!/youtube|youtu\.be|vimeo/.test(src)) return '';
    return `\n\n<iframe\n  className="w-full aspect-video rounded-xl"\n  src="${src}"\n  title="${escapeAttr(node.getAttribute('title') || 'Video')}"\n  frameBorder="0"\n  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"\n  allowFullScreen\n/>\n\n`;
  },
});

/**
 * Drop only the embed loader scripts. The tweet text lives in a sibling
 * <blockquote>, which turndown renders fine — dropping that too loses content.
 */
turndown.addRule('dropEmbedScripts', {
  filter: (node) => node.nodeName === 'SCRIPT',
  replacement: () => '',
});

function escapeAttr(s) {
  return s.replace(/"/g, '&quot;');
}

// ------------------------------------------------------------ html preprocess

const imageRefs = new Set();

/**
 * 74 of 89 release notes mark their sections with `<p><strong>Title</strong> - body</p>`
 * rather than a real heading. Mintlify builds the changelog table of contents and the
 * RSS entries from headings, so those have to become real headings or every release
 * lands as one unnavigable wall of text.
 */
/** Headings keep emoji but shed the trailing commas and colons Ghost authors used. */
function cleanHeading(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\s,;:.]+$/, '')
    .trim();
}

function promoteStrongHeadings(html, level) {
  const h = `h${level}`;
  return (
    html
      // whole paragraph is bold, with optional trailing punctuation/emoji
      .replace(
        /<p>\s*<strong>([^<]{2,90}?)<\/strong>\s*([^\w<]{0,6})\s*<\/p>/g,
        (_m, title, trail) => `<${h}>${cleanHeading(`${title} ${trail}`)}</${h}>`,
      )
      // bold lead-in followed by a dash or colon, then the body text
      .replace(
        /<p>\s*<strong>([^<]{2,90}?)<\/strong>\s*[-–—:]\s*([\s\S]*?)<\/p>/g,
        (_m, title, rest) => `<${h}>${cleanHeading(title)}</${h}><p>${rest}</p>`,
      )
      // real Ghost headings pick up the same trailing-colon habit
      .replace(
        /<(h[1-6])>([\s\S]*?)<\/\1>/g,
        (_m, tag, inner) => `<${tag}>${inner.replace(/[\s,;:]+$/, '')}</${tag}>`,
      )
  );
}

function preprocess(html, { headingLevel }) {
  let out = html;

  // Ghost Koenig card markers carry no meaning once the HTML is converted.
  out = out.replace(/<!--\s*kg-card-(?:begin|end):[^>]*-->/g, '');
  out = out.replace(/&nbsp;/g, ' ');

  out = promoteStrongHeadings(out, headingLevel);

  // Rewrite Ghost image paths to local ones and record them for download.
  out = out.replace(/(src|srcset)="([^"]+)"/g, (match, attr, value) => {
    if (attr === 'srcset') return ''; // Ghost srcsets point at responsive variants we do not mirror
    if (!value.startsWith('/content/images/')) return match;
    const rel = value.replace(/^\/content\/images\//, '');
    imageRefs.add(rel);
    return `src="/images/${rel}"`;
  });

  return out;
}

/** MDX parses `{` as an expression and `<` as JSX, so escape them outside code. */
function escapeMdx(md) {
  const ALLOWED = /^\/?(?:Frame|Note|Tip|Warning|Info|Check|Steps|Step|Card|CardGroup|Update|iframe|img|br)\b/;
  const segments = md.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
  return segments
    .map((seg, i) => {
      if (i % 2 === 1) return seg; // code fence or inline code, leave alone
      return seg
        .replace(/[{}]/g, (c) => `\\${c}`)
        .replace(/<(\/?[A-Za-z][^\s>/]*)/g, (m, tag) => (ALLOWED.test(tag) ? m : `&lt;${tag}`));
    })
    .join('');
}

function toMdx(html, { headingLevel, alt = '' }) {
  altFallback = alt;
  const md = turndown.turndown(preprocess(html, { headingLevel }));
  return escapeMdx(md)
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

// ------------------------------------------------------------------- metadata

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function longDate(iso) {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function readTime(plaintext) {
  const words = (plaintext || '').split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.round(words / 200))} min read`;
}

function yamlString(s) {
  return `"${String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Prefer Ghost's own excerpt, then its SEO description, then the opening prose.
 * 19 of 100 posts have neither excerpt nor meta description.
 */
function description(post) {
  const raw = (post.custom_excerpt || post.meta_description || '').replace(/\s+/g, ' ').trim();
  const text = raw || firstSentences(post.plaintext);
  if (!text) return '';
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}...` : text;
}

/**
 * First sentence or two of the body, skipping the "Hi all 👋" style greeting.
 * Ghost hard-wraps `plaintext` at ~80 columns, so paragraphs are separated by a
 * blank line and single newlines are just wrapping — collapse those to spaces.
 */
function firstSentences(plaintext) {
  const paras = (plaintext || '')
    .split(/\n\s*\n/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 40 && !/^hi (all|there|everyone)/i.test(s));
  if (!paras.length) return '';
  const sentences = paras[0].match(/[^.!?]+[.!?]+/g) || [paras[0]];
  let out = '';
  for (const s of sentences) {
    if (out && (out + s).length > 160) break;
    out += s;
  }
  return out.trim();
}

/**
 * Release titles come in four shapes across eight years:
 *   "Release WK26-26" (67x) | "Release #WEEK 34" (12x)
 *   "Release #WEEK 34-21" (2x) | "March Release Notes" and friends
 * Normalise them to a single WK<week>-<yy> label so the anchors are predictable.
 */
function releaseLabel(post) {
  const yy = post.published_at.slice(2, 4);
  const title = post.title.trim();

  let m = title.match(/WK\s*(\d{1,2})\s*-\s*(\d{2})/i);
  if (m) return `WK${m[1].padStart(2, '0')}-${m[2]}`;

  m = title.match(/#?WEEK\s*(\d{1,2})\s*-\s*(\d{2})/i);
  if (m) return `WK${m[1].padStart(2, '0')}-${m[2]}`;

  m = title.match(/#?WEEK\s*(\d{1,2})/i);
  if (m) return `WK${m[1].padStart(2, '0')}-${yy}`;

  // Month-name notes and one-offs: keep the human title, minus redundant words.
  return title.replace(/\s*Release Notes\s*/i, ' ').replace(/\s+/g, ' ').trim() ||
    `Release ${longDate(post.published_at)}`;
}

function anchorFor(label) {
  return label
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

// ------------------------------------------------------------------ classify

const posts = db.posts
  .filter((p) => p.status === 'published')
  .sort((a, b) => b.published_at.localeCompare(a.published_at))
  .map((p) => ({
    ...p,
    tags: tagsByPost.get(p.id) ?? [],
    author: authorByPost.get(p.id) ?? userNameById.get(p.author_id) ?? 'PitchPrint',
  }));

const releases = [];
const articles = [];
for (const p of posts) {
  const isRelease = p.tags.some((t) => RELEASE_TAGS.has(t)) && !FORCE_ARTICLE.has(p.slug);
  (isRelease ? releases : articles).push(p);
}

// ------------------------------------------------------------------ write out

function write(rel, body) {
  const abs = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body.endsWith('\n') ? body : `${body}\n`, 'utf8');
}

// --- articles -----------------------------------------------------------------

for (const p of articles) {
  const desc = description(p);
  const label = ARTICLE_TAG_LABEL[p.tags.find((t) => ARTICLE_TAG_LABEL[t])];

  const fm = [
    `title: ${yamlString(p.title)}`,
    p.title.length > 34 ? `sidebarTitle: ${yamlString(shortTitle(p.title))}` : null,
    desc ? `description: ${yamlString(desc)}` : null,
    label ? `tag: ${yamlString(label)}` : null,
    `author: ${yamlString(p.author)}`,
    `date: ${yamlString(p.published_at.slice(0, 10))}`,
  ].filter(Boolean);

  const body = [
    '---',
    ...fm,
    '---',
    '',
    'import PostMeta from "/snippets/post-meta.mdx";',
    '',
    `<PostMeta author=${yamlString(p.author)} date=${yamlString(longDate(p.published_at))} readTime=${yamlString(readTime(p.plaintext))} />`,
    '',
    p.feature_image && p.feature_image.startsWith('/content/images/')
      ? featureFrame(p)
      : null,
    toMdx(p.html || '', { headingLevel: 2, alt: p.title }),
  ]
    .filter((x) => x !== null)
    .join('\n');

  write(`posts/${p.slug}.mdx`, body);
}

function featureFrame(p) {
  const rel = p.feature_image.replace(/^\/content\/images\//, '');
  imageRefs.add(rel);
  return `<Frame>\n  <img src="/images/${rel}" alt=${yamlString(p.title)} />\n</Frame>\n`;
}

function shortTitle(title) {
  return title
    .replace(/^(Introducing|Under the Hood:)\s*/i, '')
    .replace(/^(the\s+New\s+)/i, '')
    .replace(/\s*[🖼🎨🎅]\s*/g, '')
    .trim();
}

// --- releases, one page per year ---------------------------------------------

const byYear = new Map();
for (const p of releases) {
  const year = p.published_at.slice(0, 4);
  if (!byYear.has(year)) byYear.set(year, []);
  byYear.get(year).push(p);
}

const years = [...byYear.keys()].sort((a, b) => b.localeCompare(a));
const currentYear = years[0];

/**
 * Assign each release its final label, guaranteeing unique anchors within a page.
 *
 * The source numbering is not self-consistent: 2021 titles read WK<yy>-<week>
 * ("Release WK21-44" in November 2021) while every other year reads
 * WK<week>-<yy> ("Release WK48-25" in November 2025). Rather than guess, keep the
 * title's own numbering and disambiguate on the rare within-year collision.
 */
const labelCollisions = [];
for (const year of years) {
  const seen = new Map();
  for (const p of byYear.get(year)) {
    const base = releaseLabel(p);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    p.label = n === 1 ? base : `${base} (${longDate(p.published_at)})`;
    if (n > 1) labelCollisions.push(`${year}: ${base} -> ${p.label}`);
  }
}

for (const year of years) {
  const entries = byYear.get(year); // already newest-first
  const fm = [
    '---',
    `title: ${yamlString(`${year} releases`)}`,
    `description: ${yamlString(`PitchPrint release notes from ${year} — new features, improvements, and bug fixes.`)}`,
    // Only the current year needs a feed; that is where new entries land.
    year === currentYear ? 'rss: true' : null,
    '---',
  ].filter(Boolean);

  const intro =
    year === currentYear
      ? 'Releases ship weekly on Thursdays. Subscribe with the RSS button above to get each one as it lands.'
      : `Release notes published during ${year}.`;

  const updates = entries.map((p) => {
    const body = toMdx(p.html || '', { headingLevel: 3, alt: `${p.label} — ${p.title}` })
      .split('\n')
      .map((line) => (line.trim() ? `  ${line}` : ''))
      .join('\n');
    return `<Update label=${yamlString(p.label)} description=${yamlString(longDate(p.published_at))}>\n${body}\n</Update>`;
  });

  write(`releases/${year}.mdx`, [...fm, '', intro, '', updates.join('\n\n')].join('\n'));
}

// --- home page ----------------------------------------------------------------
// Delegated to build-home.mjs so there is one implementation. That script reads
// posts/ and releases/ from disk, so the home page also picks up posts written
// directly as MDX rather than imported from Ghost.

spawnSync(process.execPath, [path.join(import.meta.dirname, 'build-home.mjs')], {
  stdio: 'inherit',
});

// --- docs.json navigation + redirects ----------------------------------------

const docs = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs.json'), 'utf8'));

const articlePages = articles.map((p) => `posts/${p.slug}`);
docs.navigation = {
  tabs: [
    {
      tab: 'Blog',
      icon: 'newspaper',
      groups: [
        { group: 'Latest', pages: ['index'] },
        { group: 'Articles', icon: 'star', expanded: true, pages: articlePages },
      ],
    },
    {
      tab: 'Releases',
      icon: 'rocket',
      groups: [
        { group: 'Release notes', pages: years.map((y) => `releases/${y}`) },
      ],
    },
  ],
};

// Preserve every Ghost permalink.
docs.redirects = [
  ...articles.map((p) => ({ source: `/${p.slug}`, destination: `/posts/${p.slug}` })),
  ...releases.map((p) => ({
    source: `/${p.slug}`,
    destination: `/releases/${p.published_at.slice(0, 4)}#${anchorFor(p.label)}`,
  })),
  { source: '/rss', destination: `/releases/${currentYear}/rss.xml` },
  { source: '/rss/', destination: `/releases/${currentYear}/rss.xml` },
];

fs.writeFileSync(path.join(ROOT, 'docs.json'), `${JSON.stringify(docs, null, 2)}\n`, 'utf8');

// --- images -------------------------------------------------------------------

async function downloadImages() {
  const missing = [...imageRefs].filter(
    (rel) => !fs.existsSync(path.join(ROOT, 'images', rel)),
  );
  if (!missing.length) return { ok: 0, failed: [] };

  let ok = 0;
  const failed = [];
  const queue = [...missing];
  const workers = Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const rel = queue.pop();
      const url = `${SOURCE_HOST}/content/images/${rel}`;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const abs = path.join(ROOT, 'images', rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, Buffer.from(await res.arrayBuffer()));
        ok++;
      } catch (err) {
        failed.push(`${rel} (${err.message})`);
      }
    }
  });
  await Promise.all(workers);
  return { ok, failed };
}

const images = SKIP_IMAGES ? { ok: 0, failed: [], skipped: true } : await downloadImages();

// --------------------------------------------------------------------- report

console.log(`articles   ${articles.length} -> posts/`);
console.log(`releases   ${releases.length} -> releases/{${years.join(',')}}.mdx`);
console.log(`redirects  ${docs.redirects.length} written to docs.json`);
console.log(
  images.skipped
    ? `images     ${imageRefs.size} referenced (download skipped)`
    : `images     ${images.ok} downloaded, ${images.failed.length} failed, ${imageRefs.size} referenced`,
);
for (const f of images.failed) console.log(`  ! ${f}`);
for (const c of labelCollisions) console.log(`  ~ disambiguated duplicate label ${c}`);
