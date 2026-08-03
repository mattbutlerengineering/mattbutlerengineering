import { useEffect } from "react";
import type { RefObject } from "react";
import { useLocation, useNavigationType } from "react-router";

/**
 * Resets scroll to the top whenever the route pathname changes.
 *
 * Targets the given container when a ref is provided (for layouts whose
 * scroll container is an inner `overflow: auto` element rather than the
 * window); otherwise scrolls the window.
 *
 * - Skips POP navigations (back/forward) so scroll restoration wins.
 * - Skips navigations targeting an in-page anchor (`#hash`).
 */
export function useScrollToTop(containerRef?: RefObject<HTMLElement | null>): void {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType === "POP") {
      return;
    }
    if (hash) {
      return;
    }

    const container = containerRef?.current;
    if (container) {
      container.scrollTo(0, 0);
    } else {
      window.scrollTo(0, 0);
    }
  }, [pathname, hash, navigationType, containerRef]);
}
