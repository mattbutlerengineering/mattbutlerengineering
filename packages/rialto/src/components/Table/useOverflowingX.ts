import { useEffect, useState } from "react";

/**
 * Reports whether an element's content is wider than its box, re-measured
 * whenever the element or its first child changes size. Returns a callback ref
 * to attach and the current answer.
 *
 * Used so a horizontally scrolling wrapper becomes a keyboard tab stop only
 * while it really scrolls (axe `scrollable-region-focusable`) instead of adding
 * a tab stop to every table that fits. Without `ResizeObserver` (server render,
 * old browsers) it stays `false`.
 */
export function useOverflowingX(): readonly [(node: HTMLElement | null) => void, boolean] {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    if (node === null || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => setOverflowing(node.scrollWidth > node.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    return () => observer.disconnect();
  }, [node]);

  return [setNode, overflowing];
}
