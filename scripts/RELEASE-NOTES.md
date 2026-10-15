# Release notes → blog

The same shape as the Help Scout sync, applied to `blog/releases/`.

## The problem with the old workflow

`release-to-blog.yml` could never have run successfully. It pushed generated
posts to a separate blog repository whose name was still the placeholder
`pitchprint/CHANGE-ME-blog-repo`, and it fired on **every push to main**. The
blog is in this repository, so that is where it writes now.

The generator also produced the wrong shape. It wrote one standalone
`release-<id>.mdx` per release, with its own frontmatter and a `## What's new 🚀`
heading. The live blog is **one file per year** — `blog/releases/2026.mdx` —
holding several `<Update>` blocks, newest first. The year files are what
`docs.json` lists in the sidebar. A per-release file would not have appeared on
the site at all.

## What it does now

Once a week it looks for docs articles carrying a `release:` value, works out
which release note each belongs to, and for any release with no `<Update>` block
yet, opens a pull request adding a **draft** one.

```
docs article with release: "wk44-26"
        │
        ├─ WK44-26 already in blog/releases/2026.mdx  ──► skipped, forever
        │
        └─ no WK44-26 block                           ──► draft <Update> inserted
                                                          at the top ──► pull request
```

## Why it only ever drafts

All the generator knows about a release is the `release_summary` line on each
article — one sentence. The published notes are several hundred words with an
opening paragraph in the company's voice and annotated screenshots. Compare
what it could know about WK26-26:

> You can now set predefined and custom canvas values at the same time.

with the four paragraphs, two headings and two screenshots the published WK26-26
block actually has. If the generator were allowed to regenerate a block it would
replace that writing with the stub, every time.

So it never touches an existing block — not to reformat it, not to reorder it,
not to refresh it. The year file is its own record: if a block with that label
exists, the release is done. That stays true after someone has rewritten the
block past recognition, because only the label is matched.

## What stops it going wrong

Four independent layers, in order:

1. **The script refuses** if inserting would change the pre-existing text. It
   keeps everything from the first existing `<Update>` onwards and requires the
   new file to end with it byte for byte, and separately requires the block
   count to rise by exactly the number being added.
2. **It re-reads from disk after writing** and checks the same thing again,
   rather than trusting the value it just wrote.
3. **The workflow checks independently**: only `blog/releases/<year>.mdx` and
   `docs.json` may differ, nothing may be deleted, and no year file may *lose*
   a line — a removed line means a published note was edited.
4. **The pull request**, which is the only thing that reaches `main`.

`npm test` includes 41 checks for this, six of which deliberately sabotage the
insert logic and assert that nothing reaches disk. The two sabotages fail
different checks, which is why both guards exist.

The branch is rebuilt and force-pushed each run, so the workflow refuses to run
if a human has committed to it — on this pipeline that commit *is* the writing,
so the guard matters more here than on the docs sync.

## Article frontmatter

```yaml
---
title: "Canvas Adjuster Module"
release: "wk26-26"              # which release note this belongs to
release_summary: "Set predefined and custom values at the same time."
release_date: "25 June 2026"    # optional — otherwise the Thursday of that
                                # ISO week, since releases ship Thursdays
release_year: 2027              # optional — only if the id isn't WKnn-yy
---
```

The `WKnn-yy` form is what tells it which year file to use. An id it can't read
is refused with a message saying how to fix it, rather than filed under a
guessed year.

## Running it

```bash
npm run release-notes                      # what would be added?   dry run
npm run release-notes -- --preview .draft  # write the blocks somewhere safe to read
npm run release-notes -- --write           # apply to blog/releases/
npm run blog-summaries                     # just print the blocks, touch nothing
```

Exit codes: `0` nothing to do, `1` refused, `2` wrote changes.

## Testing it

Five levels, each one riskier than the last. Stop wherever you have seen
enough — nothing below level 5 can reach the live site.

### 1. The guards themselves — touches nothing

```bash
npm test
```

41 checks on a throwaway fixture in your temp folder. Six of them sabotage the
insert logic and assert nothing reaches disk. No network, no keys, no repo
contact.

### 2. Dry run against the real repo — reads only

```bash
npm run release-notes
```

Right now this correctly reports *"Every release already has a note"*, because
WK26-26 is the only release tagged and it is already written up. That is the
right answer, but it proves nothing — so:

### 3. Give it something to find

Tag a docs article with a release that has no note yet. **Commit the tag**, so
the working tree matches what CI sees:

```bash
# add to docs/documentation/3d-views.mdx frontmatter:
#   release: "wk44-26"
#   release_summary: "Rotate and inspect any design in three dimensions."
git add -A && git commit -m "temp: test the release-note sync"

npm run release-notes                       # should now list wk44-26
npm run release-notes -- --preview .draft   # write the block somewhere safe
cat .draft/2026-wk44-26.mdx
```

`--preview` touches nothing in `blog/`. Check the derived date is the Thursday
you expect — week 44 of 2026 is 29 October.

### 4. Write it locally and read the diff

```bash
npm run release-notes -- --write
git diff --stat blog/releases/2026.mdx
```

**This is the test that matters.** You are looking for one thing:

```
 blog/releases/2026.mdx | 14 ++++++++++++++
 1 file changed, 14 insertions(+)
```

Insertions only. A single `-` anywhere in `git diff blog/releases/` means a
published release note was edited, and nothing else about the run matters.

Run it a second time — it must report "Every release already has a note" and
leave the file alone.

Then put everything back:

```bash
git checkout -- . && rm -rf .draft && git reset --hard HEAD~1
```

### 5. The workflow, in CI, opening no pull request

The workflow file has to be on `main` first — GitHub only offers
`workflow_dispatch` for workflows on the default branch.

**Actions → Release notes to blog → Run workflow → tick "Preview only".**

It installs, runs the preflight and the dry run, stops before writing, and
publishes a log. Read it with:

```bash
git fetch origin sync-logs
git show origin/sync-logs:logs/blog-latest.md
```

### 6. A real pull request

Same button, **untick** "Preview only", with a test release tagged on `main`.
It opens a PR you can read and then close. Delete the branch afterwards:

```bash
git push origin --delete release-notes-sync
```

Close the PR before re-running — the branch guard refuses to force-push over a
branch a human has committed to, which is what you want but will look like a
failure if you have forgotten the open PR is there.

## January

When the first release of a new year appears, there is no year file for it. The
script creates `blog/releases/<year>.mdx` from the standard header **and adds it
to the sidebar in `docs.json`**, immediately above the previous year. Without
that, the automation would quietly stop working every January. If it can't place
the nav entry it still writes the file and says loudly that the entry needs
adding by hand.

## Logs

Shared with the docs sync, on the `sync-logs` branch, under a `blog-` prefix:

```bash
git fetch origin sync-logs
git show origin/sync-logs:logs/blog-latest.md
```

## Setup

None. No secrets and no API keys — it reads only this repository. The one
requirement is **Settings → Actions → General → Workflow permissions → "Allow
GitHub Actions to create and approve pull requests"**, which the Help Scout sync
already needs.
