import type { RestContext } from "./rest-http.js";
import { apiRequest } from "./rest-http.js";

/**
 * Fetches pages of `basePath` (adding `per_page`/`page` query params) until
 * `limit` items are collected or the API reports no more. `itemsKey` unwraps
 * a paginated envelope (`{ items: [...] }` for Search, `{ workflow_runs: [...] }`
 * for Actions runs); omit it for endpoints that return a bare array.
 */
export function fetchAllPages(
  ctx: RestContext,
  basePath: string,
  limit: number,
  itemsKey?: string
): unknown[] {
  const results: unknown[] = [];
  const separator = basePath.includes("?") ? "&" : "?";

  for (let page = 1; results.length < limit; page++) {
    const perPage = Math.min(100, limit - results.length);
    const { json } = apiRequest(
      ctx,
      "GET",
      `${basePath}${separator}per_page=${perPage}&page=${page}`
    );
    const pageItems = itemsKey
      ? ((json as Record<string, unknown>)?.[itemsKey] ?? [])
      : (json ?? []);
    if (!Array.isArray(pageItems) || pageItems.length === 0) break;

    results.push(...pageItems);
    if (pageItems.length < perPage) break;
  }

  return results.slice(0, limit);
}
