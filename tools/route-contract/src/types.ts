/**
 * The vocabulary the two halves of the contract meet in.
 *
 * A `ClientPair` is what `@mbe/api-client` can actually put on the wire; an
 * `Owner` is something that can answer it. The guard's whole job is the join.
 */

/** The HTTP methods `@mbe/api-client` emits. */
export const HTTP_METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

/**
 * The single opaque segment substituted for every id / slug / token the client
 * interpolates into a path.
 *
 * It must contain no `/`, `?` or `#`: a segment with a slash would silently
 * change the path's shape and could match a route the real value never would.
 * Fastify's `findRoute` does runtime path matching (the same find-my-way
 * matcher production runs), so a concrete segment is exactly what it wants —
 * the guard never re-implements `:param` matching and therefore cannot
 * disagree with production about what matches.
 */
export const PLACEHOLDER = "route-contract-placeholder";

/** One `method + path` the client can emit, and the client methods that emit it. */
export interface ClientPair {
  readonly method: HttpMethod;
  /** Query-stripped, placeholder-substituted, always absolute. */
  readonly path: string;
  /** e.g. `["floorPlans.setActive", "floorPlans.activate"]` — for the failure message. */
  readonly producedBy: readonly string[];
}

/** Everything that can answer a client pair. */
export type Owner = "reservations" | "users" | "agent" | "edge";

/**
 * What the edge Worker does with a path, classified by the response it
 * RETURNS — never by which stub fired. `handleHealthSystem` legitimately fans
 * out through both the origin `fetch` and the static bindings as part of doing
 * its job (`infrastructure/worker/edge-router.js:147-149`), so a
 * "which spy was called" oracle misreports `/health/system` as the marketing SPA.
 */
export type EdgeDisposition =
  /** The edge answers it itself. An owner. */
  | "edge-terminal"
  /** `/api` or `/public` — proxied verbatim to DO; a Fastify service must answer. */
  | "forwarded-to-origin"
  /** The marketing SPA answers. NOT an owner — this is what a 404 looks like. */
  | "static-spa";
