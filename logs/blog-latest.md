# Release notes to blog — run 8

| | |
| --- | --- |
| When | `2026-10-15T22:56:25Z` |
| Mode | **DRY RUN** (requested by hand with dry_run) |
| Trigger | `workflow_dispatch` |
| Commit | `f611f06e372efab6fc732573461f40a5d67d2c69` |
| Result | **failure** |
| Run | https://github.com/pitchprint/docs/actions/runs/38819776313 |

## Steps

| Step | Outcome |
| --- | --- |
| Install | ok |
| Tests | **FAILED** |
| Fetch feed | – |
| Benchmark | – |
| Preview | – |
| Branch guard | – |
| Import | – |
| Additions-only guard | – |
| Broken links | – |
| Pull request | – |

## Output

### install

```

added 3 packages, and audited 4 packages in 597ms

found 0 vulnerabilities
```

### tests

```

> helpscout-docs-client@1.0.0 test
> node scripts/test-tidy.mjs && node scripts/test-validate.mjs && node scripts/test-style-pass.mjs && node scripts/test-release-notes.mjs && node scripts/test-blog-releases.mjs

ok    an image glued to the next ordinal still becomes a step
ok    no escaped ordinal survives
ok    both images are kept
ok    a bare image is wrapped in Frame
ok    a missing alt is reported
ok    a Note: prefix becomes a Note callout
ok    an Important: prefix becomes a Warning
ok    h5 is demoted to h3
ok    escaped brackets are unescaped
ok    a lone numbered item is left alone
ok    prose after the last step stays outside Steps
ok    a truncated description is cut at the sentence
ok    an empty description stays null
ok    an over-long description is capped

All tidy() tests passed.
ok    a legitimately restructured page is accepted
ok    an image dropped entirely  (image dropped: https://s3.amazonaws.com/helpscout.net/docs/assets/file-BBB2)
ok    an image URL rewritten (CDN swap)  (image dropped: https://s3.amazonaws.com/helpscout.net/docs/assets/file-AAA1)
ok    an external link dropped  (link dropped: https://pitchprint.com/register)
ok    frontmatter removed  (frontmatter missing)
ok    an extra frontmatter key added  (extra frontmatter keys: sidebarTitle)
ok    the title reworded  (title changed)
ok    a component invented  (component not in the allowlist: Columns)
ok    an unclosed component  (unbalanced <Steps>: 1 open, 0 closed)
ok    the body summarised away  (content loss: output is 23% the length of the source (need 70%))
ok    a whole step deleted  (image dropped: https://s3.amazonaws.com/helpscout.net/docs/assets/file-BBB2)
ok    the model answering in prose instead of MDX  (frontmatter missing)
ok    an image-free page passes unchanged
ok    a middle step deleted with no image to betray it  (specifics dropped (1): "Modules → PitchPrint → Configure")
ok    the last step deleted  (specifics dropped (1): "Advanced Parameters → Performance")
ok    a whole section dropped  (specifics dropped (1): "443")
ok    a 12-step procedure collapsed to 2 is rejected  (steps lost: 12 in source, 2 in output (floor 9))
ok    demoting 1 of 14 steps to a callout is allowed
ok    a version number changed  (specifics dropped (1): "1.7")
ok    a UI path reworded away  (specifics dropped (1): "Advanced Parameters → Performance")
ok    a code identifier de-emphasised but kept is accepted
ok    a code identifier removed outright  (specifics dropped (1): "pitchprint.zip")
ok    the port number dropped  (specifics dropped (1): "443")
ok    bold reformatted but the label kept is accepted

ok    132 real hand-written pages accepted (bar the known divergences)

All validate() tests passed.
ok    no API key keeps the mechanical version
ok    no API key explains itself
ok    a good response is applied
ok    the applied output has no leading blank line
ok    a fenced response is unwrapped and applied
ok    a chatty preamble is rejected
ok    a dropped step is rejected and the input kept
ok    the rejection names the reason
ok    a 429 falls back without throwing
ok    the 429 is reported
ok    a network failure falls back
ok    the network failure is reported
ok    an empty response is rejected

All stylePass() tests passed.

Date derivation
  ok    ISO week 26 of 2026 is Thursday 25 June
  ok    ISO week 9 of 2026 is Thursday 26 February
  ok    ISO week 1 of 2027 is Thursday 7 January
  ok    yearFor('wk26-26') is 2026
  ok    yearFor('WK02-27') is 2027
  ok    yearFor('spring-launch') refuses
  ok    release_year overrides the id
  ok    weekFor('wk44-26') is 44

A release that already has a note
  ok    exits 0
  ok    says it skipped
  ok    file untouched

A release with no note yet
  ok    dry run exits 0
  ok    dry run writes nothing
  ok    exits 2 for 'wrote changes'
  ok    one block added
  ok    every pre-existing block is byte-for-byte identical
  ok    the new block is first
  ok    the tail of the original file survives verbatim
  ok    line endings preserved — no bare LF introduced
  ok    marked as a draft
  ok    both topics present
  ok    date derived from the week
  ok    docs.json untouched
  ok    second run is a no-op

Preview mode
  ok    exits 0
  ok    year file untouched
  ok    candidate written
  ok    --preview with --write is refused

A release id that doesn't say which year
  ok    exits 1
  ok    says why and how to fix it
  ok    writes nothing

A release in a year with no file yet
  ok    exits 2
  ok    year file created
  ok    added to the sidebar
  ok    placed above the previous year
  ok    2026 untouched

Guards (sabotaged insert logic)
  ok    a published block is dropped — refuses
  ok    a published block is dropped — says so
  ok    a published block is dropped — writes nothing
  ok    a published block's text is altered — refuses
  ok    a published block's text is altered — says so
  ok    a published block's text is altered — writes nothing

All release-note tests passed.

Labels derived from pubDate
  ok    Thu, 25 Jun 2026 -> WK26-26  (matches the repo)
  ok    Thu, 07 May 2026 -> WK19-26  (matches the repo)
  ok    Thu, 19 Mar 2026 -> WK12-26  (matches the repo)
  ok    Thu, 26 Feb 2026 -> WK09-26  (matches the repo)
  ok    Thu, 01 Oct 2026 -> WK40-26  (blog title says WK26-40)
  ok    1 Oct 2026 is in ISO week 40
  ok    a Sunday belongs to the week that started on the Monday
  ok    1 Jan 2027 belongs to ISO week 53 of 2026
  ok    prettyDate formats as the year files do

Transposed titles
  ok    reads WK26-40 out of the title
  ok    reads WK09-26 with a leading zero
  ok    no code in a feature post title
  ok    title and date disagree for the transposed post

Image paths
  ok    blog CDN -> repo path
  ok    nested month folders survive
  ok    a foreign host is left alone
  ok    a non-image blog URL is left alone
  ok    junk does not throw

Converting a post
  ok    the post's h1 is dropped
  ok    h2 becomes ###
  ok    the What's-new lead-in is removed
  ok    the opening paragraph survives
  ok    the sign-off survives
  ok    both images found
  ok    both rewritten to repo paths
  ok    images wrapped in Frame
  ok    figcaption became alt text
  ok    missing alt counted
  ok    bug-fix section detected
  ok    braces in prose are escaped for MDX
  ok    no raw < left in prose

The rendered block
  ok    opens in the live format
  ok    has an rss line
  ok    carries the source link
  ok    has the bold summary line
  ok    closes
  ok    body is indented two spaces
  ok    no line is left with trailing spaces

End to end, against a year file
  ok    a post already in the year file is skipped
  ok    and the file is untouched
  ok    dry run exits 0 and writes nothing
  ok    the transposed title is reported
  ok    the accordion gap is reported
  ok    missing alt text is reported
  ok    exits 2 for 'wrote changes'
  ok    one block added
  ok    the hand-written block is byte-for-byte identical
  ok    the new block is first
  ok    filed under the right label, not the title's
  ok    line endings preserved — no bare LF
  ok    images point at the repo, not the blog
  ok    no blog.pitchprint.com image URL left behind
  ok    docs.json untouched
  ok    re-running is a no-op
  FAIL  a failed image download refuses rather than writing a broken note
          exit 2
  FAIL  and nothing was written
  ok    an unreadable pubDate is refused, not guessed
  ok    and nothing was written
  ok    preview exits 0
  ok    preview leaves the year file alone
  ok    preview writes the candidate
  ok    --preview with --write is refused

2 blog release-note check(s) failed.
```
