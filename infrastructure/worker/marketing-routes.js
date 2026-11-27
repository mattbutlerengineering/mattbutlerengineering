/**
 * Pages of the marketing SPA that really exist (#9977). The marketing static
 * Worker falls back to index.html with HTTP 200 for every unknown path, so the
 * edge router answers any other HTML page with 404 (body unchanged, so the
 * SPA still renders its not-found page).
 *
 * Keep in step with apps/marketing/src/utils/route-meta-data.ts and the
 * marketing entries of public/sitemap.xml; marketing-routes.test.js pins both.
 * `/shipped/<slug>` stories are matched by shape, not by slug list.
 */
// "/weekly" is a retired page App.tsx still redirects to "/" (#8949); keep it 200.
const KNOWN_PATHS = new Set([
  "/",
  "/status",
  "/metrics",
  "/acmm",
  "/ai-health",
  "/shipped",
  "/weekly",
]);
const SHIPPED_STORY = /^\/shipped\/[^/]+$/;

/** @param {string} pathname `url.pathname` of a request routed to the marketing app. */
export function isKnownMarketingPath(pathname) {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  return KNOWN_PATHS.has(path) || SHIPPED_STORY.test(path);
}
