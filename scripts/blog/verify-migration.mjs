/**
 * Verify the migration did not lose content.
 *
 *   node scripts/verify-migration.mjs _import/<export>.json
 *
 * Compares each generated page against Ghost's own `plaintext` rendering of the
 * same posts, token by token, and checks image counts. Reports any word that
 * exists in the source but not in the output.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const EXPORT = process.argv[2];
if (!EXPORT) {
  console.error('usage: node scripts/verify-migration.mjs <ghost-export.json>');
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(EXPORT, 'utf8')).db[0].data;
const tagSlugById = new Map(db.tags.map((t) => [t.id, t.slug]));
const tagsByPost = new Map();
for (const pt of db.posts_tags) {
  const slug = tagSlugById.get(pt.tag_id);
  if (!slug) continue;
  if (!tagsByPost.has(pt.post_id)) tagsByPost.set(pt.post_id, []);
  tagsByPost.get(pt.post_id).push(slug);
}

const RELEASE_TAGS = new Set(['week', 'wk', 'weekly', 'release', 'notes']);
const FORCE_ARTICLE = new Set(['new-admin-portal', 'pitchprint-bigcommerce', 'version-10-release']);

const posts = db.posts.filter((p) => p.status === 'published');

/** Words only — punctuation, case and whitespace differences are not content loss. */
function tokens(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/[^a-z0-9'"$%/.\-_]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Strip the MDX scaffolding we added so only migrated prose remains. */
function mdxProse(mdx) {
  return mdx
    .replace(/^---[\s\S]*?\n---\n/, '') // frontmatter
    .replace(/^import .*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '') // comments
    .replace(/<PostMeta[^>]*\/>/g, '')
    .replace(/<Update label="[^"]*" description="[^"]*">/g, '')
    // Figure captions are migrated content held in an attribute — keep the text.
    .replace(/<Frame\s+caption="([^"]*)"\s*>/g, ' $1 ')
    .replace(/<\/?(?:Update|Frame|CardGroup|Card|Note|Tip|Warning|Info|Steps|Step)[^>]*>/g, '')
    .replace(/<img[^>]*\/>/g, '') // alt text is generated, not migrated
    // Keep the iframe title and src: both come from the source embed.
    .replace(/<iframe([\s\S]*?)\/>/g, (_m, attrs) => ` ${attrs.replace(/\w+=|["/]/g, ' ')} `)
    .replace(/\\([{}])/g, '$1');
}

function multiset(list) {
  const m = new Map();
  for (const t of list) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

/** Source tokens absent from the output, respecting repetition counts. */
function missing(srcTokens, outTokens) {
  const out = multiset(outTokens);
  const gaps = [];
  for (const [tok, n] of multiset(srcTokens)) {
    const have = out.get(tok) ?? 0;
    if (have < n) gaps.push({ tok, want: n, have });
  }
  return gaps;
}

const groups = [];

// One group per article page.
for (const p of posts) {
  const tags = tagsByPost.get(p.id) ?? [];
  const isRelease = tags.some((t) => RELEASE_TAGS.has(t)) && !FORCE_ARTICLE.has(p.slug);
  if (isRelease) continue;
  groups.push({ file: `posts/${p.slug}.mdx`, posts: [p] });
}

// One group per release year page.
const byYear = new Map();
for (const p of posts) {
  const tags = tagsByPost.get(p.id) ?? [];
  const isRelease = tags.some((t) => RELEASE_TAGS.has(t)) && !FORCE_ARTICLE.has(p.slug);
  if (!isRelease) continue;
  const y = p.published_at.slice(0, 4);
  if (!byYear.has(y)) byYear.set(y, []);
  byYear.get(y).push(p);
}
for (const [y, ps] of byYear) groups.push({ file: `releases/${y}.mdx`, posts: ps });

// ------------------------------------------------------------------- compare

let totalSrc = 0;
let totalGaps = 0;
const report = [];

for (const g of groups.sort((a, b) => a.file.localeCompare(b.file))) {
  const abs = path.join(ROOT, g.file);
  if (!fs.existsSync(abs)) {
    report.push({ file: g.file, status: 'MISSING FILE', srcWords: 0, gaps: [] });
    continue;
  }
  const src = g.posts.map((p) => p.plaintext || '').join('\n\n');
  const out = mdxProse(fs.readFileSync(abs, 'utf8'));

  const srcTokens = tokens(src);
  const gaps = missing(srcTokens, tokens(out));
  const lost = gaps.reduce((s, x) => s + (x.want - x.have), 0);

  // Images: every <img> in the source HTML should become a <Frame> image.
  const srcImgs = g.posts.reduce(
    (n, p) => n + ((p.html || '').match(/<img\b/g) || []).length,
    0,
  );
  const outImgs = (fs.readFileSync(abs, 'utf8').match(/<img\b/g) || []).length;

  totalSrc += srcTokens.length;
  totalGaps += lost;
  report.push({
    file: g.file,
    posts: g.posts.length,
    srcWords: srcTokens.length,
    lost,
    coverage: srcTokens.length ? (1 - lost / srcTokens.length) * 100 : 100,
    srcImgs,
    outImgs,
    gaps: gaps.slice(0, 12),
  });
}

// ---------------------------------------------------------------------- print

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('page', 26), pad('posts', 6), pad('words', 8), pad('coverage', 10), 'images');
console.log('-'.repeat(70));
for (const r of report) {
  const imgFlag = r.srcImgs === r.outImgs ? `${r.outImgs}` : `${r.outImgs}/${r.srcImgs} MISMATCH`;
  console.log(
    pad(r.file, 26),
    pad(r.posts ?? '-', 6),
    pad(r.srcWords, 8),
    pad(`${r.coverage.toFixed(2)}%`, 10),
    imgFlag,
  );
}
console.log('-'.repeat(70));
console.log(
  `TOTAL  ${posts.length} posts, ${totalSrc} source words, ` +
    `${totalGaps} missing (${((1 - totalGaps / totalSrc) * 100).toFixed(3)}% coverage)`,
);

const withGaps = report.filter((r) => r.gaps.length);
if (withGaps.length) {
  console.log('\nunmatched tokens (source -> output):');
  for (const r of withGaps) {
    console.log(`\n  ${r.file}`);
    for (const g of r.gaps) console.log(`    ${JSON.stringify(g.tok)}  want ${g.want}, have ${g.have}`);
  }
}
