#!/usr/bin/env node
/**
 * Merge the PitchPrint blog repo into the docs repo and convert both to
 * path-based hosting:
 *
 *   pitchprint.com/docs/...   (was pitchprint.com/docs/... via base path)
 *   pitchprint.com/blog/...   (new)
 *
 * Run from inside a clean clone of pitchprint/docs:
 *
 *   node scripts/migrate-to-path-based.mjs --blog=../blog
 *   node scripts/migrate-to-path-based.mjs --blog=../blog --dry-run
 *
 * Docs page URLs are preserved exactly. After running, set the Mintlify
 * "Host at" base path to OFF (domain = pitchprint.com, no /docs suffix).
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const DRY = args.includes('--dry-run')
const FORCE = args.includes('--force')
const layoutArg = args.find((a) => a.startsWith('--layout='))
const LAYOUT = layoutArg ? layoutArg.slice('--layout='.length) : 'products'
if (!['products', 'tabs'].includes(LAYOUT)) {
  console.error(`Unknown --layout=${LAYOUT}. Use "products" (default) or "tabs".`)
  process.exit(1)
}
const blogArg = args.find((a) => a.startsWith('--blog='))
const BLOG = path.resolve(blogArg ? blogArg.slice('--blog='.length) : '../blog')
const ROOT = process.cwd()

// Page directories, by destination tree. First path segment of a root-relative
// link determines which prefix it gets.
const DOCS_PAGE_DIRS = ['api-reference', 'documentation', 'tutorial']
const BLOG_PAGE_DIRS = ['posts', 'releases']

const log = (...a) => console.log(...a)
const warn = (...a) => console.warn('  ! ', ...a)
const stats = { moved: 0, copied: 0, filesRewritten: 0, refsRewritten: 0, redirects: 0 }

function git(...a) {
  return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function run(...a) {
  if (DRY) { log('  [dry] git', a.join(' ')); return }
  git(...a)
}

/* ---------------------------------------------------------------- preflight */

function preflight() {
  log('== Preflight ==')
  for (const f of ['docs.json', 'index.mdx', 'api-reference']) {
    if (!fs.existsSync(path.join(ROOT, f))) {
      throw new Error(`Not in the docs repo root: missing ${f}. cd into your pitchprint/docs clone first.`)
    }
  }
  for (const f of ['docs.json', 'posts', 'releases']) {
    if (!fs.existsSync(path.join(BLOG, f))) {
      throw new Error(`Blog repo not found at ${BLOG} (missing ${f}). Pass --blog=<path-to-blog-clone>.`)
    }
  }
  // An EMPTY docs/ or brand/ is debris from an aborted run, not a completed
  // migration — tolerate it so a retry does not need manual cleanup.
  for (const d of ['docs', 'brand', 'blog']) {
    const p = path.join(ROOT, d)
    if (!fs.existsSync(p)) continue
    if (fs.readdirSync(p).length === 0) { if (!DRY) fs.rmSync(p, { recursive: true }); continue }
    throw new Error(
      `A non-empty "${d}/" directory already exists — this migration has probably run before.\n` +
      'Reset with:  git checkout . && git clean -fd'
    )
  }

  // A stale lock blocks every git mv below; fail early with the fix.
  if (fs.existsSync(path.join(ROOT, '.git', 'index.lock'))) {
    throw new Error(
      'Stale .git/index.lock present — git mv will fail.\n' +
      'Close any editor or git GUI holding the repo, then:\n' +
      '    Remove-Item .git\\index.lock      (PowerShell)\n' +
      '    rm .git/index.lock                (bash)'
    )
  }

  // Untracked files (this script included) do not interfere with git mv, so
  // only tracked modifications matter here.
  const dirty = git('status', '--porcelain', '--untracked-files=no')
  if (dirty && !FORCE) {
    const entries = dirty.split('\n').filter(Boolean)
    const detail = entries.slice(0, 10).map((e) => '    ' + e).join('\n') +
      (entries.length > 10 ? `\n    ... and ${entries.length - 10} more` : '')

    // A pure line-ending diff has identical added/removed counts on every file.
    const numstat = git('diff', '--numstat').split('\n').filter(Boolean).map((l) => l.split('\t'))
    const lineEndingOnly = numstat.length > 0 && numstat.every(([a, d]) => a !== '-' && a === d)

    throw new Error(
      `${entries.length} tracked file(s) modified:\n${detail}\n\n` +
      (lineEndingOnly
        ? 'Every one has identical added and removed line counts, so this is a CRLF\n' +
          'line-ending artifact rather than real edits. Clear it with:\n' +
          '    git checkout .\n' +
          'then re-run. (To migrate with them in place anyway, pass --force.)'
        : 'These look like real edits. Commit or stash them first, then re-run.\n' +
          'Override with --force only if you are sure.')
    )
  }

  const branch = git('branch', '--show-current')
  if (branch === 'main' && !FORCE) {
    throw new Error('Refusing to run on main. Create a branch first:\n  git checkout -b consolidate-blog')
  }
  log(`  repo:   ${ROOT}`)
  log(`  blog:   ${BLOG}`)
  log(`  branch: ${branch}`)
  log(`  layout: ${LAYOUT}${DRY ? '   (DRY RUN — nothing will be written)' : ''}`)
}

/* -------------------------------------------------------------- file moves */

function moveDocsContent() {
  log('\n== Moving docs content into docs/ ==')
  if (!DRY) fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true })

  // Page content and its images move under docs/. Brand assets move to brand/
  // so a single copy serves both trees.
  const moves = [
    ['api-reference', 'docs/api-reference'],
    ['documentation', 'docs/documentation'],
    ['tutorial', 'docs/tutorial'],
    ['index.mdx', 'docs/index.mdx'],
    ['images', 'docs/images'],
    ['logo', 'brand/logo'],
    ['favicon.svg', 'brand/favicon.svg'],
  ]

  if (!DRY) fs.mkdirSync(path.join(ROOT, 'brand'), { recursive: true })

  for (const [from, to] of moves) {
    if (!fs.existsSync(path.join(ROOT, from))) { warn(`skip ${from} (not present)`); continue }
    run('mv', from, to)
    log(`  ${from} -> ${to}`)
    stats.moved++
  }
}

function copyBlogContent() {
  log('\n== Copying blog content into blog/ ==')
  const copies = [
    ['posts', 'blog/posts'],
    ['releases', 'blog/releases'],
    ['index.mdx', 'blog/index.mdx'],
    ['images', 'blog/images'],
    ['snippets/post-meta.mdx', 'snippets/post-meta.mdx'],
    ['scripts/build-home.mjs', 'scripts/blog/build-home.mjs'],
    ['scripts/migrate-ghost.mjs', 'scripts/blog/migrate-ghost.mjs'],
    ['scripts/verify-migration.mjs', 'scripts/blog/verify-migration.mjs'],
  ]

  for (const [from, to] of copies) {
    const src = path.join(BLOG, from)
    const dest = path.join(ROOT, to)
    if (!fs.existsSync(src)) { warn(`skip ${from} (not in blog repo)`); continue }
    if (fs.existsSync(dest)) { warn(`COLLISION: ${to} already exists — left untouched, merge by hand`); continue }
    if (!DRY) {
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.cpSync(src, dest, { recursive: true })
    }
    log(`  ${from} -> ${to}`)
    stats.copied++
  }
  if (!DRY) git('add', '-A', 'blog', 'snippets', 'scripts')
}

/* ----------------------------------------------------------- link rewriting */

/**
 * Rewrite one root-relative reference. `tree` is 'docs' or 'blog' and decides
 * where bare /images/... resolves to.
 */
function rewriteRef(target, tree) {
  const [pathPart, ...rest] = target.split(/(?=[#?])/)
  const suffix = rest.join('')
  const seg = pathPart.split('/')[1] || ''

  let out = null
  if (DOCS_PAGE_DIRS.includes(seg)) out = '/docs' + pathPart
  else if (BLOG_PAGE_DIRS.includes(seg)) out = '/blog' + pathPart
  else if (seg === 'images') out = `/${tree}` + pathPart
  else if (seg === 'logo' || pathPart === '/favicon.svg') out = '/brand' + pathPart
  else if (pathPart === '/') out = tree === 'blog' ? '/blog' : '/docs'

  return out === null ? null : out + suffix
}

function rewriteFile(file, tree) {
  const before = fs.readFileSync(file, 'utf8')
  let count = 0

  // Attribute form: href="/x", src="/x", img="/x" (and single quotes)
  let after = before.replace(
    /(\b(?:href|src|img|image|icon)=)(["'])(\/[^"'\s>]*)\2/g,
    (m, attr, q, target) => {
      const next = rewriteRef(target, tree)
      if (!next || next === target) return m
      count++
      return `${attr}${q}${next}${q}`
    }
  )

  // Markdown form: [text](/x) and ![alt](/x)
  after = after.replace(/(\]\()(\/[^)\s]*)/g, (m, open, target) => {
    const next = rewriteRef(target, tree)
    if (!next || next === target) return m
    count++
    return `${open}${next}`
  })

  if (count > 0) {
    if (!DRY) fs.writeFileSync(file, after)
    stats.filesRewritten++
    stats.refsRewritten += count
  }
  return count
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.mdx?$/.test(e.name)) out.push(p)
  }
  return out
}

function rewriteLinks() {
  log('\n== Rewriting root-relative references ==')
  for (const tree of ['docs', 'blog']) {
    const files = walk(path.join(ROOT, tree))
    let refs = 0, touched = 0
    for (const f of files) {
      const n = rewriteFile(f, tree)
      if (n) { refs += n; touched++ }
    }
    log(`  ${tree}/: ${refs} references across ${touched} files (of ${files.length} scanned)`)
  }
}

/* --------------------------------------------------------- docs.json merge */

function prefixPage(p, prefix) {
  if (typeof p === 'string') return `${prefix}/${p}`.replace(/\/+/g, '/')
  if (p && typeof p === 'object') {
    const c = { ...p }
    if (typeof c.page === 'string') c.page = `${prefix}/${c.page}`.replace(/\/+/g, '/')
    if (Array.isArray(c.pages)) c.pages = c.pages.map((x) => prefixPage(x, prefix))
    if (Array.isArray(c.groups)) c.groups = c.groups.map((g) => prefixGroup(g, prefix))
    return c
  }
  return p
}

function prefixGroup(group, prefix) {
  const g = { ...group }
  if (Array.isArray(g.pages)) g.pages = g.pages.map((p) => prefixPage(p, prefix))
  if (Array.isArray(g.groups)) g.groups = g.groups.map((x) => prefixGroup(x, prefix))
  if (typeof g.root === 'string') g.root = `${prefix}/${g.root}`.replace(/\/+/g, '/')
  return g
}

function prefixTab(tab, prefix) {
  const t = { ...tab }
  if (Array.isArray(t.groups)) t.groups = t.groups.map((g) => prefixGroup(g, prefix))
  if (Array.isArray(t.pages)) t.pages = t.pages.map((p) => prefixPage(p, prefix))
  return t
}

/** Redirect sources/destinations are site-relative, so both need the prefix. */
function prefixRedirect(r, prefix) {
  const fix = (v) => {
    if (typeof v !== 'string' || !v.startsWith('/')) return v
    if (v.startsWith(`${prefix}/`) || v === prefix) return v
    return `${prefix}${v}`.replace(/\/+/g, '/').replace(/\/(#|\?)/g, '$1')
  }
  return { ...r, source: fix(r.source), destination: fix(r.destination) }
}

/** Rewrite root-relative links embedded in config strings (e.g. 404 copy). */
function prefixInlineLinks(str, tree) {
  if (typeof str !== 'string') return str
  return str.replace(/(\]\()(\/[^)\s]*)/g, (m, open, target) => {
    const next = rewriteRef(target, tree)
    return next ? `${open}${next}` : m
  })
}

function mergeDocsJson() {
  log('\n== Merging docs.json ==')
  const docsCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs.json'), 'utf8'))
  const blogCfg = JSON.parse(fs.readFileSync(path.join(BLOG, 'docs.json'), 'utf8'))

  const merged = { ...docsCfg }

  // Brand assets moved to /brand.
  merged.logo = { light: '/brand/logo/light.svg', dark: '/brand/logo/dark.svg' }
  merged.favicon = '/brand/favicon.svg'

  // Navigation.
  const docsTabs = (docsCfg.navigation?.tabs || []).map((t) => prefixTab(t, '/docs'))
  const blogTabs = (blogCfg.navigation?.tabs || []).map((t) => prefixTab(t, '/blog'))

  if (LAYOUT === 'products') {
    // Two products = two independent sites behind one deployment. Each product
    // shows only its own navigation, and Mintlify renders a product switcher
    // instead of merging everything into one tab row.
    const blogGroups = blogTabs.flatMap((t) =>
      t.groups && t.groups.length
        ? t.groups
        : t.pages && t.pages.length
          ? [{ group: t.tab, pages: t.pages }]
          : []
    )
    const nav = { ...docsCfg.navigation }
    delete nav.tabs
    nav.products = [
      { product: 'Documentation', icon: 'book', tabs: docsTabs },
      { product: 'Blog', icon: 'newspaper', groups: blogGroups },
    ]
    merged.navigation = nav
  } else {
    merged.navigation = { ...docsCfg.navigation, tabs: [...docsTabs, ...blogTabs] }
  }

  // Redirects: prefix each side, docs first.
  const docsRedirects = (docsCfg.redirects || []).map((r) => prefixRedirect(r, '/docs'))
  const blogRedirects = (blogCfg.redirects || []).map((r) => prefixRedirect(r, '/blog'))
  merged.redirects = [...docsRedirects, ...blogRedirects]
  stats.redirects = merged.redirects.length

  // Cross-links that pointed at the old subdomains now point at siblings.
  const retarget = (obj) => {
    if (Array.isArray(obj)) return obj.map(retarget)
    if (obj && typeof obj === 'object') {
      const o = {}
      for (const [k, v] of Object.entries(obj)) {
        if (k === 'href' && typeof v === 'string') {
          o[k] = v
            .replace(/^https?:\/\/docs\.pitchprint\.com\/?/, '/docs/')
            .replace(/^https?:\/\/blog\.pitchprint\.com\/?/, '/blog/')
            .replace(/^(\/(?:docs|blog))\/$/, '$1')
        } else o[k] = retarget(v)
      }
      return o
    }
    return obj
  }
  merged.navbar = retarget(merged.navbar)
  merged.footer = retarget(blogCfg.footer ? merged.footer : merged.footer)

  // Blog footer had /posts and /releases links; fold them in, prefixed.
  if (blogCfg.footer?.links) {
    const blogFooterLinks = blogCfg.footer.links.map((section) => ({
      ...section,
      items: (section.items || []).map((it) => ({
        ...it,
        href: typeof it.href === 'string' && it.href.startsWith('/')
          ? (rewriteRef(it.href, 'blog') || it.href)
          : it.href,
      })),
    }))
    const have = new Set((merged.footer?.links || []).map((s) => s.header))
    merged.footer = {
      ...merged.footer,
      links: [...(merged.footer?.links || []), ...blogFooterLinks.filter((s) => !have.has(s.header))],
    }
  }

  // 404 copy contains root-relative links.
  if (merged.errors?.['404']?.description) {
    merged.errors = {
      ...merged.errors,
      404: {
        ...merged.errors['404'],
        description: prefixInlineLinks(merged.errors['404'].description, 'docs'),
      },
    }
  }

  const out = JSON.stringify(merged, null, 2) + '\n'
  if (!DRY) fs.writeFileSync(path.join(ROOT, 'docs.json'), out)

  if (LAYOUT === 'products') {
    const [dp, bp] = merged.navigation.products
    log(`  layout:    products (separate sites, product switcher)`)
    log(`  products:  "${dp.product}" (${dp.tabs.length} tabs) + "${bp.product}" (${bp.groups.length} groups, no tabs)`)
  } else {
    log(`  layout:    tabs (one merged tab row)`)
    log(`  tabs:      ${docsTabs.length} docs + ${blogTabs.length} blog = ${merged.navigation.tabs.length}`)
  }
  log(`  redirects: ${docsRedirects.length} docs + ${blogRedirects.length} blog = ${merged.redirects.length}`)
  log(`  logo/favicon repointed at /brand`)
}

/* -------------------------------------------------------------------- main */

try {
  preflight()
  moveDocsContent()
  copyBlogContent()
  rewriteLinks()
  mergeDocsJson()

  log('\n== Summary ==')
  log(`  paths moved:        ${stats.moved}`)
  log(`  blog paths copied:  ${stats.copied}`)
  log(`  files rewritten:    ${stats.filesRewritten}`)
  log(`  references updated: ${stats.refsRewritten}`)
  log(`  redirects in config:${stats.redirects}`)

  if (DRY) {
    log('\nDry run — nothing written. Re-run without --dry-run to apply.')
  } else {
    log('\nNext:')
    log('  1. npx mint@latest broken-links      # must be clean before you push')
    log('  2. npx mint@latest dev               # click through /docs and /blog')
    log('  3. git add -A && git commit -m "Consolidate blog into docs; path-based hosting"')
    log('  4. Mintlify -> Domain setup: turn the "Host at" base path OFF')
    log('  5. CloudFront: add /blog, /blog/*, /brand/* behaviors (see runbook)')
  }
} catch (e) {
  console.error('\nFAILED:', e.message)
  process.exit(1)
}
