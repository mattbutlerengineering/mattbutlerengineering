import { useEffect } from "react";

/** The title `index.html` ships with; every route without its own falls back to it. */
export const BASE_TITLE = "Rialto — Design System";

/**
 * Titles the tab for one route and restores `BASE_TITLE` when it unmounts.
 * A component rather than a router hook so the layouts keep rendering under a
 * plain `MemoryRouter` in their tests.
 */
export function DocumentTitle({ title }: { readonly title: string }) {
  useEffect(() => {
    document.title = `${title} — Rialto`;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [title]);
  return null;
}
