/**
 * Pages of the rialto-web SPA that really exist (#10000). Its static Worker
 * falls back to index.html with HTTP 200 for every unknown path, so the edge
 * router answers any other HTML page under /rialto/ with 404 (body unchanged,
 * so the SPA still renders its not-found page).
 *
 * The list is generated from the route inventory by
 * scripts/generate-rialto-routes.mjs; never edit it by hand.
 */
import { RIALTO_ROUTES } from "./rialto-routes.generated.js";

const SEGMENT = "[^/]+";
const toPattern = (route) =>
  new RegExp(
    `^${route
      .split("/")
      .map((part) => (part.startsWith(":") ? SEGMENT : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
      .join("/")}$`
  );

const PATTERNS = RIALTO_ROUTES.map(toPattern);

/** @param {string} pathname `url.pathname` of a request routed to the rialto app. */
export function isKnownRialtoPath(pathname) {
  const unmounted = pathname.replace(/^\/rialto(?=\/|$)/, "") || "/";
  const path = unmounted.length > 1 ? unmounted.replace(/\/+$/, "") : unmounted;
  return PATTERNS.some((pattern) => pattern.test(path));
}
