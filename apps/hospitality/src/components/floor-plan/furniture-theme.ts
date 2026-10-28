/**
 * The active furniture theme, shared by every table on the canvas.
 *
 * One module-level `MutationObserver` on `data-theme` feeds every subscriber
 * through `useSyncExternalStore`, rather than each table and chair opening its
 * own observer. The hook lives inside the furniture art, so `TableShape`'s
 * props and memoization are unaffected by a theme flip.
 */

import { useSyncExternalStore } from "react";
import type { FurnitureTheme } from "./furniture-tokens.js";

const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;

function readTheme(): FurnitureTheme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!observer) {
    observer = new MutationObserver(() => listeners.forEach((notify) => notify()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      observer?.disconnect();
      observer = null;
    }
  };
}

/** `"dark"` when `<html data-theme="dark">`, else `"light"`; re-renders on change. */
export function useFurnitureTheme(): FurnitureTheme {
  return useSyncExternalStore(subscribe, readTheme, () => "light");
}
