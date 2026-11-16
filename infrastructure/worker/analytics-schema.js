/**
 * The edge router's Analytics Engine datasets (`edge_requests`, and
 * `csp_reports` below) — the single statement of each one's
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

/**
 * The `csp_reports` dataset (#8895) — one point per CSP violation the browser
 * reports to /csp-report (csp-report.js). Kept out of edge_requests on
 * purpose: those rows are one-per-request with a status and latency, and
 * edge-usage.mjs / api-failures.mjs count them; a violation is a different
 * event with a different shape.
 */
const CSP_REPORTS_BINDING = "CSP_REPORTS";
const CSP_REPORTS_DATASET = "csp_reports";

const CSP_REPORTS_COLUMNS = Object.freeze({
  directive: "blob1",
  blockedOrigin: "blob2",
  documentPath: "blob3",
  disposition: "blob4",
  index: "directive",
});

/** Build the writeDataPoint() payload for one CSP violation. */
function toCspReportDataPoint({ directive, blockedOrigin, documentPath, disposition }) {
  return {
    blobs: [directive, blockedOrigin, documentPath, disposition],
    indexes: [directive],
  };
}

/**
 * Every Analytics Engine binding the edge router writes. This is what
 * scripts/check-analytics-bindings.mjs compares wrangler.toml and the Pulumi
 * WorkersScript against.
 */
const ANALYTICS_DATASETS = Object.freeze([
  Object.freeze({ binding: ANALYTICS_BINDING, dataset: EDGE_REQUESTS_DATASET }),
  Object.freeze({ binding: CSP_REPORTS_BINDING, dataset: CSP_REPORTS_DATASET }),
]);

export {
  ANALYTICS_BINDING,
  EDGE_REQUESTS_DATASET,
  EDGE_REQUESTS_COLUMNS,
  toDataPoint,
  CSP_REPORTS_BINDING,
  CSP_REPORTS_DATASET,
  CSP_REPORTS_COLUMNS,
  toCspReportDataPoint,
  ANALYTICS_DATASETS,
};
