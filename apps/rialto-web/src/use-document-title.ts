import { useEffect } from "react";
import { HOME_TITLE, TITLE_SUFFIX } from "./data/route-head-data.js";

/** The title `index.html` ships with; every route without its own falls back to it. */
export const BASE_TITLE = HOME_TITLE;

/**
 * Titles the tab for one route and restores `BASE_TITLE` when it unmounts.
 * Page layouts call this so a page rendered outside the router (unit tests)
 * still names the tab. `useRouteHead` owns canonical and social tags.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = `${title}${TITLE_SUFFIX}`;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [title]);
}
