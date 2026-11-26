import { useLayoutEffect } from "react";
import { useLocation, useNavigationType } from "react-router";

/**
 * Puts the window at the top when a client-side navigation opens a new page.
 *
 * Marketing scrolls the document, not an inner overflow container. React
 * Router keeps that offset across `<Link>` clicks, so a story opened from a
 * scrolled `/shipped` list painted at the list's position. Back and Forward
 * are POP navigations: leave them alone so the browser can restore the offset
 * it saved for that history entry.
 *
 * Hash targets (`#main-content`, other anchors) are left to the browser.
 * `global.css` makes those jumps instant under `prefers-reduced-motion`.
 *
 * The reset is `behavior: "instant"` and runs in a layout effect, before
 * paint. `<html>` sets `scroll-behavior: smooth`, which a bare `scrollTo(0, 0)`
 * would inherit — including for visitors who prefer reduced motion, because
 * that query does not by itself override `scroll-behavior`. A glide would also
 * keep the previous page's offset on screen while the next route mounts.
 */
export function useScrollToTop(): void {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  useLayoutEffect(() => {
    if (navigationType === "POP") return;
    if (hash.length > 0) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, hash, navigationType]);
}
