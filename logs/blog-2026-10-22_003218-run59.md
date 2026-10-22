# Release notes to blog — run 59

| | |
| --- | --- |
| When | `2026-10-22T00:32:18Z` |
| Mode | **DRY RUN** (test schedule — always a dry run) |
| Trigger | `schedule` |
| Commit | `f49356a821a780bebd0bae78ade454c0f3348da1` |
| Result | **success** |
| Quality gate | needs review |
| Run | https://github.com/pitchprint/docs/actions/runs/39700258398 |

## Steps

| Step | Outcome |
| --- | --- |
| Install | ok |
| Tests | ok |
| Fetch feed | ok |
| Benchmark | ok |
| Preview | ok |
| Branch guard | – |
| Import | – |
| Additions-only guard | – |
| Broken links | – |
| Pull request | – |
| Auto-merge | – |

## Output

### install

```

added 3 packages, and audited 4 packages in 703ms

found 0 vulnerabilities
```

### tests

```
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
  ok    a failed image download refuses rather than writing a broken note
  ok    and nothing was written
  ok    an unreadable pubDate is refused, not guessed
  ok    and nothing was written
  ok    preview exits 0
  ok    preview leaves the year file alone
  ok    preview writes the candidate
  ok    --preview with --write is refused

All blog release-note tests passed.

A correct block
  ok    passes
  ok    is clean — nothing for a person to do
  ok    scores 100%
  ok    no problems listed

The import comment is prose, not markup
  ok    a comment mentioning <AccordionGroup> is not read as a tag

Content loss
  ok    a whole heading and its section dropped — rejected
  ok    a whole heading and its section dropped — says why
  ok    an image dropped — rejected
  ok    an image dropped — says why
  ok    an external link dropped — rejected
  ok    an external link dropped — says why
  ok    half the prose cut away — rejected
  ok    half the prose cut away — says why
  ok    the body duplicated — rejected
  ok    the body duplicated — says why

House style
  ok    a component that is not in the allowlist — rejected
  ok    a component that is not in the allowlist — says why
  ok    an unbalanced component — rejected
  ok    an unbalanced component — says why
  ok    a heading at the wrong level — rejected
  ok    a heading at the wrong level — says why
  ok    an image left pointing at the blog — rejected
  ok    an image left pointing at the blog — says why
  ok    an image outside a Frame — rejected
  ok    an image outside a Frame — says why
  ok    an unescaped brace in prose — rejected
  ok    an unescaped brace in prose — says why
  ok    the Update header mangled — rejected
  ok    the Update header mangled — says why
  ok    the rss line removed — rejected
  ok    the rss line removed — says why

Passes the gate but still needs a person
  ok    missing alt text does not fail the gate
  ok    but it is not clean
  ok    and it says so
  ok    an un-accordioned bug-fix section does not fail the gate
  ok    but it is not clean
  ok    and it says so

The floor is a dial, not a constant
  ok    rejected at 99%
  ok    accepted at 50%
  ok    same score either way
  ok    the score is between 50 and 99

proseWords ignores markup, not words
  ok    strips tags
  ok    keeps link text
  ok    drops our import comment

All release-note gate tests passed.
```

### fetch

```

> helpscout-docs-client@1.0.0 blog-fetch
> node scripts/fetch-blog-releases.js

Fetching https://blog.pitchprint.com/rss/

13 release note(s) cached to data/blog-releases.json (2 other post(s) ignored).
  newest: Release WK26-40 — Thu, 01 Oct 2026 14:02:58 GMT
```

### benchmark

```

> helpscout-docs-client@1.0.0 blog-benchmark
> node scripts/ingest-blog-releases.mjs --benchmark

Conversion compared against the hand-written blocks.

  WK40-26  (1 October 2026)
    words     790 hand-written vs 790 converted  (100%)
    headings  0 vs 0
    images    4 vs 4  (4 in the post)
    accordion yes vs yes

  WK26-26  (25 June 2026)
    words     668 hand-written vs 594 converted  (89%)
    headings  7 vs 0
    images    5 vs 5  (5 in the post)
    accordion yes vs yes

  WK19-26  (7 May 2026)
    words     907 hand-written vs 949 converted  (105%)
    headings  6 vs 0
    images    8 vs 10  (10 in the post)
    accordion yes vs yes

  WK12-26  (19 March 2026)
    words     583 hand-written vs 502 converted  (86%)
    headings  6 vs 0
    images    6 vs 6  (6 in the post)
    accordion yes vs yes

  WK09-26  (26 February 2026)
    words     565 hand-written vs 463 converted  (82%)
    headings  5 vs 0
    images    6 vs 6  (6 in the post)
    accordion yes vs yes

  WK48-25  (27 November 2025)
    words     711 hand-written vs 694 converted  (98%)
    headings  3 vs 0
    images    3 vs 3  (3 in the post)
    accordion yes vs yes

  WK45-25  (6 November 2025)
    words     640 hand-written vs 553 converted  (86%)
    headings  4 vs 0
    images    9 vs 9  (9 in the post)
    accordion yes vs yes

  WK41-25  (9 October 2025)
    words     491 hand-written vs 446 converted  (91%)
    headings  4 vs 0
    images    4 vs 4  (4 in the post)
    accordion yes vs yes

  WK35-25  (28 August 2025)
    words     576 hand-written vs 496 converted  (86%)
    headings  3 vs 0
    images    7 vs 7  (7 in the post)
    accordion yes vs yes

  WK32-25  (7 August 2025)
    words     630 hand-written vs 534 converted  (85%)
    headings  2 vs 0
    images    9 vs 9  (9 in the post)
    accordion yes vs yes

  WK30-25  (24 July 2025)
    words     788 hand-written vs 705 converted  (89%)
    headings  4 vs 0
    images    8 vs 8  (8 in the post)
    accordion no vs yes

  WK23-25  (5 June 2025)
    words     903 hand-written vs 802 converted  (89%)
    headings  6 vs 0
    images    6 vs 6  (6 in the post)
    accordion yes vs yes

  WK17-25  (24 April 2025)
    words     675 hand-written vs 560 converted  (83%)
    headings  5 vs 0
    images    4 vs 4  (4 in the post)
    accordion yes vs yes

13 post(s) compared. Words near 100% with matching headings and images
means the conversion carries the content. The accordion row is the known
gap, and is flagged on every run.
```

### preview

```

> helpscout-docs-client@1.0.0 blog-sync
> node scripts/ingest-blog-releases.mjs

  skipped WK40-26 — already in blog/releases/2026.mdx
  skipped WK26-26 — already in blog/releases/2026.mdx
  skipped WK19-26 — already in blog/releases/2026.mdx
  skipped WK12-26 — already in blog/releases/2026.mdx
  skipped WK09-26 — already in blog/releases/2026.mdx
  skipped WK48-25 — already in blog/releases/2025.mdx
  skipped WK45-25 — already in blog/releases/2025.mdx
  skipped WK41-25 — already in blog/releases/2025.mdx
  skipped WK35-25 — already in blog/releases/2025.mdx
  skipped WK32-25 — already in blog/releases/2025.mdx
  skipped WK30-25 — already in blog/releases/2025.mdx
  skipped WK23-25 — already in blog/releases/2025.mdx
  skipped WK17-25 — already in blog/releases/2025.mdx

  NOTE  "Release WK26-40" was published 1 October 2026, which is WK40-26. Filed as WK40-26 — the digits in the post title look transposed.

Every release note on the blog is already in the docs. Nothing to add.
```
