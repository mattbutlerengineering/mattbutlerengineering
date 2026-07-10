import { useSyncExternalStore } from "react";

/**
 * Live design-token reading utilities for the token documentation pages.
 *
 * The token docs must display the *resolved* value of each `--rialto-*` custom
 * property exactly as it cascades in the running app — never a hardcoded literal
 * that can silently drift from the stylesheet. These helpers read straight from
 * the live cascade via `getComputedStyle(document.documentElement)` and re-read
 * whenever the active theme changes, so the documentation is self-updating.
 */

const THEME_ATTR = "data-theme";
const DEFAULT_THEME = "light";

function subscribeTheme(onChange: () => void): () => void {
  if (typeof MutationObserver === "undefined" || typeof document === "undefined") {
    return () => {};
  }
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [THEME_ATTR],
  });
  return () => observer.disconnect();
}

function readThemeSnapshot(): string {
  if (typeof document === "undefined") return DEFAULT_THEME;
  return document.documentElement.getAttribute(THEME_ATTR) ?? DEFAULT_THEME;
}

/**
 * Reactive current document theme (e.g. `"light"` | `"dark"`), derived from the
 * `data-theme` attribute on the document root. Updates whenever the app theme
 * toggle flips that attribute, so consumers re-render against the live cascade.
 */
export function useDocumentTheme(): string {
  return useSyncExternalStore(subscribeTheme, readThemeSnapshot, () => DEFAULT_THEME);
}

/** Resolve a single `--rialto-*` custom property's live value from the document root. */
export function readTokenValue(name: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Resolve the live values of the given custom properties, re-reading whenever the
 * document theme changes. Values are derived at render time from the live cascade
 * (the pattern preferred over storing snapshots in state), so they always reflect
 * the compiled stylesheet and can never drift.
 *
 * `names` is expected to be a stable, module-level constant per page.
 */
export function useLiveTokenValues(names: readonly string[]): Record<string, string> {
  // Subscribe to theme flips so the values re-derive against the live cascade.
  useDocumentTheme();
  const resolved: Record<string, string> = {};
  for (const name of names) {
    resolved[name] = readTokenValue(name);
  }
  return resolved;
}
