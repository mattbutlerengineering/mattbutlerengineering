import { useEffect } from "react";
import { Link } from "react-router";
import { NAV_SECTIONS } from "../data/nav-sections";
import { NOT_FOUND_STEM } from "../data/route-head-data";

const COMPONENT_INDEX_PATH = NAV_SECTIONS[0]?.items[0]?.path ?? "/";

/** Keeps the page out of search results while mounted; restores the shell's tag after. */
function useNoindex(): void {
  useEffect(() => {
    const existing = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const previous = existing?.getAttribute("content") ?? null;
    const tag = existing ?? document.createElement("meta");
    if (!existing) {
      tag.setAttribute("name", "robots");
      document.head.appendChild(tag);
    }
    tag.setAttribute("content", "noindex, nofollow");
    return () => {
      if (previous === null) tag.remove();
      else tag.setAttribute("content", previous);
    };
  }, []);
}

/** The `*` route: an unknown docs URL says so instead of showing the home page. */
export function NotFoundPage() {
  useNoindex();
  return (
    <main
      style={{
        maxWidth: "680px",
        margin: "0 auto",
        padding: "var(--rialto-space-2xl) var(--rialto-space-xl)",
        color: "var(--rialto-text-primary)",
        fontFamily: "var(--rialto-font-sans)",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--rialto-font-display)",
          fontSize: "var(--rialto-text-2xl)",
          fontWeight: "var(--rialto-weight-semibold)",
          marginBottom: "var(--rialto-space-sm)",
        }}
      >
        {NOT_FOUND_STEM}
      </h1>
      <p
        style={{
          fontSize: "var(--rialto-text-md)",
          lineHeight: 1.6,
          color: "var(--rialto-text-secondary)",
          marginBottom: "var(--rialto-space-lg)",
        }}
      >
        There is no page at this address. The link may be mistyped or the page may have moved.
      </p>
      <p style={{ display: "flex", gap: "var(--rialto-space-lg)" }}>
        <Link to={COMPONENT_INDEX_PATH} style={{ color: "var(--rialto-color-brand)" }}>
          Browse components
        </Link>
        <Link to="/" style={{ color: "var(--rialto-color-brand)" }}>
          Rialto home
        </Link>
      </p>
    </main>
  );
}

NotFoundPage.displayName = "NotFoundPage";
