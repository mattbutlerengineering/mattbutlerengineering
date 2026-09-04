/**
 * The `edge_requests` Analytics Engine dataset — the single statement of its
 * binding name, dataset name, and column layout. Everything that writes or
 * reads the dataset imports this module instead of restating the layout:
 *
 *   - edge-router.js                        writes one point per request
 *   - scripts/edge-usage.mjs                reads it back over the SQL API
 *   - scripts/check-analytics-bindings.mjs  checks wrangler.toml and the Pulumi
 *                                           WorkersScript agree with the two
 *                                           constants below
 *
 * Analytics Engine stores positional columns (blob1..blob20, double1..double20,
 * index1). A writer and a reader that each hard-code "blob4 is the pathname"
 * drift silently; keeping the map here and pinning toDataPoint() against it in
 * analytics-schema.test.js is what stops that.
 *
 * Plain ESM with zero imports: esbuild inlines it into dist/edge-router.js
 * (pulumi-up.yml) exactly as it does ./circuit-breaker.js, and Node scripts
 * import it by relative path.
 */

const ANALYTICS_BINDING = "ANALYTICS";
const EDGE_REQUESTS_DATASET = "edge_requests";

/**
 * Field → Analytics Engine column. `index` names which FIELD is the sampling
 * index (stored as index1), not a column of its own.
 */
const EDGE_REQUESTS_COLUMNS = Object.freeze({
  route: "blob1",
  method: "blob2",
  country: "blob3",
  pathname: "blob4",
  status: "double1",
  elapsedMs: "double2",
  index: "route",
});

/**
 * Build the writeDataPoint() payload for one edge request. The array order
 * here IS the layout EDGE_REQUESTS_COLUMNS documents — the test derives
 * positions from the map and asserts they match.
 */
function toDataPoint({ route, method, country, pathname, status, elapsedMs }) {
  return {
    blobs: [route, method, country, pathname],
    doubles: [status, elapsedMs],
    indexes: [route],
  };
}

export { ANALYTICS_BINDING, EDGE_REQUESTS_DATASET, EDGE_REQUESTS_COLUMNS, toDataPoint };
