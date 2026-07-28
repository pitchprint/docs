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

## Release notes → blog

Release notes live **only on the blog site**, not here. Each docs article is one
topic; the blog groups the topics that shipped together into one release note.

To include an article in a release, add two things:

1. **Frontmatter** — the `release` value is the link between the article, the
   blog release note, and the badge:

   ```yaml
   ---
   title: "Canvas Adjuster Module"
   release: "wk26-26"                 # groups this topic into Release WK26-26
   release_summary: "One-line summary of what changed."   # optional; falls back to description
   ---
   ```

2. **Badge** — links the article to its release note (add both lines):

   ```mdx
   import { ReleaseLink } from "/snippets/release-link.jsx";

   <ReleaseLink release="wk26-26" />
   ```

On push, [`scripts/generate-blog-summaries.js`](scripts/generate-blog-summaries.js)
groups every article sharing a `release` value into one `release-<id>.mdx` (one
section per topic, each linking back here) and the workflow publishes it to the
blog. See [`scripts/README.md`](scripts/README.md) for the pipeline details.
