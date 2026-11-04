/**
 * Runtime routes and precache globs for the marketing service worker.
 *
 * Google Fonts are not listed. The document loads the stylesheet through a
 * `<link>` (style-src allows fonts.googleapis.com) and the font files through
 * `@font-face` (font-src allows fonts.gstatic.com). A CacheFirst route would
 * `fetch()` those URLs from the worker, and that fetch is governed by
 * connect-src, which deliberately does not include either host. Every page
 * then logs a CSP rejection ("Fetch API cannot load …", "no-response" from
 * sw.js). Widening connect-src would let any script on the origin fetch those
 * hosts. Leaving the request to the browser keeps the fonts loading, keeps
 * the browser HTTP cache, and leaves same-origin precaching unchanged.
 */

export interface ServiceWorkerRuntimeRoute {
  readonly urlPattern: RegExp | string;
  readonly handler:
    "CacheFirst" | "CacheOnly" | "NetworkFirst" | "NetworkOnly" | "StaleWhileRevalidate";
}

/** No cross-origin runtime routes. Same-origin build assets are precached. */
export const workboxRuntimeCaching: readonly ServiceWorkerRuntimeRoute[] = [];

/** Hashed build assets only. HTML stays network-first (`navigateFallback: null`). */
export const workboxPrecacheGlobPatterns: readonly string[] = [
  "**/*.{js,css,ico,png,svg,woff,woff2}",
];

const DOCUMENT_FONT_HOSTS: ReadonlySet<string> = new Set([
  "fonts.googleapis.com",
  "fonts.gstatic.com",
]);

/** True for the stylesheet and font-file requests the document loads itself. */
export function isDocumentFontRequest(url: string): boolean {
  try {
    return DOCUMENT_FONT_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** True when a runtime route would `fetch()` this URL from the service worker. */
export function routeListClaims(
  routes: readonly ServiceWorkerRuntimeRoute[],
  url: string
): boolean {
  return routes.some((route) => {
    if (typeof route.urlPattern === "string") return url.includes(route.urlPattern);
    return route.urlPattern.test(url);
  });
}

export function serviceWorkerClaimsUrl(url: string): boolean {
  return routeListClaims(workboxRuntimeCaching, url);
}
