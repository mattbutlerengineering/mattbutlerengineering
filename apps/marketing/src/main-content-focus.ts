import { useEffect, useRef } from "react";

/**
 * Marks a Suspense fallback that has no tab stops. Focusing `<main>` while
 * one of these is showing makes Chrome continue Tab from after `<main>`, so
 * the first stops are the footer links.
 */
export const routeFallbackProps = { "data-route-fallback": "" } as const;

const ROUTE_FALLBACK_SELECTOR = "[data-route-fallback]";

/**
 * Focus `#main-content` once its route fallback is gone. Returns a cleanup
 * that stops waiting when the navigation is superseded.
 */
function focusMainWhenReady(main: HTMLElement): () => void {
  const focusIfReady = (): boolean => {
    if (!main.isConnected) return true;
    if (window.location.hash) return true;
    if (main.querySelector(ROUTE_FALLBACK_SELECTOR)) return false;
    main.focus({ preventScroll: true });
    return true;
  };

  if (focusIfReady()) return () => {};

  const observer = new MutationObserver(() => {
    if (focusIfReady()) observer.disconnect();
  });
  observer.observe(main, { childList: true, subtree: true });
  return () => observer.disconnect();
}

/**
 * Move focus to `#main-content` after a client-side navigation the user
 * started (a click, or Back/Forward), once the next page has replaced its
 * skeleton.
 *
 * The initial load is left at the document start. Issue #123 focused
 * `<main>` on mount so cross-app loads would not leave keyboard users on
 * `<body>`, but that runs while the lazy route is still a non-tabbable
 * skeleton, and the next Tab then lands on the footer — ahead of the skip
 * link. A fresh document's first Tab stop is the skip link; in-app route
 * changes are the case where focus should follow the new page.
 */
export function useMainContentFocus(pathname: string, hash: string): void {
  const previousPathnameRef = useRef(pathname);
  const userNavigatedRef = useRef(false);

  useEffect(() => {
    const mark = () => {
      userNavigatedRef.current = true;
    };
    window.addEventListener("click", mark, true);
    window.addEventListener("popstate", mark);
    return () => {
      window.removeEventListener("click", mark, true);
      window.removeEventListener("popstate", mark);
    };
  }, []);

  useEffect(() => {
    const changed = previousPathnameRef.current !== pathname;
    previousPathnameRef.current = pathname;
    if (!changed) return;

    const fromUser = userNavigatedRef.current;
    userNavigatedRef.current = false;
    if (!fromUser) return;
    if (hash.length > 0 || window.location.hash) return;

    const main = document.getElementById("main-content");
    if (!main) return;
    return focusMainWhenReady(main);
  }, [pathname, hash]);
}
