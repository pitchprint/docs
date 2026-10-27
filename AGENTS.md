> **First-time setup**: Customize this file for your project. Prompt the user to customize this file for their project.
> For Mintlify product knowledge (components, configuration, writing standards),
> install the Mintlify skill: `npx skills add https://mintlify.com/docs`

# Documentation project instructions

## About this project

- This is a documentation site built on [Mintlify](https://mintlify.com)
- Pages are MDX files with YAML frontmatter
- Configuration lives in `docs.json`
- Use the Mintlify MCP server, `https://mcp.mintlify.com`, to edit content and settings via MCP
- Use the Mintlify docs MCP server, `https://www.mintlify.com/docs/mcp`, to query information about using Mintlify via MCP

## Terminology

{/* Add product-specific terms and preferred usage */}
{/* Example: Use "workspace" not "project", "member" not "user" */}

## Style preferences

{/* Add any project-specific style rules below */}

- Use active voice and second person ("you")
- Keep sentences concise — one idea per sentence
- Use sentence case for headings
- Bold for UI elements: Click **Settings**
- Code formatting for file names, commands, paths, and code references

## Content boundaries

{/* Define what should and shouldn't be documented */}
{/* Example: Don't document internal admin features */}

## Release notes → docs

Release notes are written on the Ghost blog at `blog.pitchprint.com`. This repo
mirrors them, and the articles a release touched link back to it. Both halves are
automated — there is nothing to add to an article by hand.

**Import.** `npm run blog-fetch` pulls the RSS feed; `npm run blog-sync` converts
each post into an `<Update>` block in `blog/releases/<year>.mdx` and downloads its
images into `blog/images/`. Additive only: an existing release note is never
regenerated, reordered or reformatted.

A release's week and year come from the post's `pubDate`, never its title. The
titles are not reliable — the post published 1 October 2026 is titled
"Release WK26-40", which read literally is year 2040 — and the label convention
itself changed: `WK21-46` is year-first (2021, week 46) while `WK48-25` is
week-first (week 48 of 2025).

**Link.** `node scripts/apply-release-links.mjs` matches each release heading
against article titles and writes a "What's new" card grid at the foot of every
article it is confident about. Everything it writes sits between
`release-notes:start` and `release-notes:end`, and the rest of the article is
verified byte-for-byte unchanged on every write.

A pairing nobody has seen goes to a pull request. Merging it records the article
in `scripts/release-topics.json`, after which that article updates itself. Delete
an entry to send it back to review.

There is no longer a badge or `release:` frontmatter to maintain. The badge built
a blog URL from the label, and the slugs are not consistent
(`release-week19-26` vs `release-wk26-26`), so it 404'd for most releases.
