// Reusable badge that links a docs article to its blog release note.
//
// Usage in any article (add both lines):
//   import { ReleaseLink } from "/snippets/release-link.jsx";
//
//   <ReleaseLink release="wk26-26" />
//
// The `release` value must match the `release:` frontmatter you set on the
// article — that's the same key the blog-summary generator groups by, so the
// article, the release note, and this badge all stay in sync.

export const ReleaseLink = ({ release }) => {
  // TODO: point this at the new Mintlify blog once it exists. Defaults to the
  // current Ghost blog's URL pattern (e.g. blog.pitchprint.com/release-wk26-26)
  // so the link already works today. Change this ONE line when the blog moves.
  const BLOG_RELEASE_BASE = "https://blog.pitchprint.com";

  const label = (release || "").toUpperCase();
  const href = `${BLOG_RELEASE_BASE}/release-${release}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
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
      🚀 Shipped in Release {label}
    </a>
  );
};
