// A badge near the top of an article that jumps to its "What's new" cards.
//
// Usage in any article (add both lines):
//   import { ReleaseLink } from "/snippets/release-link.jsx";
//
//   <ReleaseLink />
//
// WHY IT NO LONGER LINKS TO THE BLOG
//
// It used to build a Ghost URL from the release label — `release-${release}`
// — and that was broken for most releases. The slugs are not consistent:
// WK19-26 lives at /release-week19-26 and WK12-26 at /release-week12-26
// ("week", not "wk"), while WK26-26 is at /release-wk26-26. Three of the five
// 2026 releases would have 404'd. It only ever appeared on one article, with
// the one label where the guess happened to hold.
//
// There is nothing to guess now. The release notes live on this site, and
// scripts/apply-release-links.mjs writes a "What's new" section at the foot of
// every article a release touched. This badge is the teaser for that section,
// so it is an in-page jump — no external URL, no slug, nothing to break.
//
// Props:
//   release   optional label to show, e.g. "wk26-26". Omit it and the badge
//             reads "See what's new", which cannot drift out of step with the
//             cards below. Passing one is a hand-maintained claim: the cards
//             are generated from the release notes, so a label typed here can
//             name a different release than the ones actually listed.
//   anchor    optional override, default "#whats-new" — the id Mintlify gives
//             the generated `## What's new` heading.

export const ReleaseLink = ({ release, anchor = "#whats-new", children }) => {
  const label = release
    ? `Shipped in Release ${String(release).toUpperCase()}`
    : "See what's new";

  return (
    <a
      href={anchor}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.4em",
        padding: "0.35em 0.75em",
        borderRadius: "9999px",
        border: "1px solid #6022E7",
        color: "#6022E7",
        fontSize: "0.85em",
        fontWeight: 600,
        textDecoration: "none",
      }}
    >
      🚀 {children || label}
    </a>
  );
};
