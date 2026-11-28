import { useEffect } from "react";
import { Link } from "react-router";
import { EmptyState } from "@mattbutlerengineering/rialto";
import { NOT_FOUND_STEM } from "../data/route-head-data";

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

/**
 * The `*` route: an unknown docs URL says so instead of showing the home page.
 * Rendered inside ShowcaseLayout, which supplies <main>, the sidebar (the
 * component index) and the skip link, so this renders no landmark of its own.
 */
export function NotFoundPage() {
  useNoindex();
  return (
    <EmptyState
      heading={NOT_FOUND_STEM}
      headingLevel={1}
      description="There is no page at this address. The link may be mistyped or the page may have moved. Pick a component from the sidebar, or head back to the Rialto home."
      action={
        <Link to="/" style={{ color: "var(--rialto-link-color)" }}>
          Rialto home
        </Link>
      }
    />
  );
}

NotFoundPage.displayName = "NotFoundPage";
