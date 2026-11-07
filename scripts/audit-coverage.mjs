/**
 * Per-surface audit coverage, derived from what the weekly live sweep saw
 * (#8419). `.audit-state/inventory.json` is gitignored and lives only on the
 * runner that wrote it, so the egress-less /ideate routine could never tell
 * that a whole zone (`gen`) had never been checked. The sweep now reduces its
 * results to one committed row in `metrics/audit-coverage.jsonl`
 * (record-summary-rows.yml, same mechanism as #7581's lighthouse row);
 * `neverRecordedZones()` answers "which zones has no row ever covered".
 *
 * Status vocabulary per surface:
 *   available  — reachable (2xx/3xx), no auth wall
 *   auth-gated — auth0 surface reachable only at its public login page
 *   error      — non-2xx/3xx or unreachable
 *   unchecked  — the sweep did not visit it
 */

// Deliberately no @mbe/agent-core import: sensors-registry.mjs loads this in
// scheduled checkouts where agent-core's dist is not built. Callers that have
// the registry (record-summary-row.mjs) pass it in.

/** Statuses that count as a recorded check (everything except `unchecked`). */
export const RECORDED_STATUSES = ["available", "auth-gated", "error"];

/**
 * @param {{ code: string|number }} result
 * @param {{ auth: "none"|"auth0" }} surface
 * @returns {{ status: "available"|"auth-gated"|"error", detail: string }}
 */
export function classifySweepResult(result, surface) {
  const code = String(result.code);
  if (!/^[23]\d\d$/.test(code)) return { status: "error", detail: `HTTP ${code}` };
  if (surface.auth === "auth0") {
    return { status: "auth-gated", detail: `availability at public login page (HTTP ${code})` };
  }
  return { status: "available", detail: `HTTP ${code}` };
}

/**
 * Parse the sweep's `url<TAB>code<TAB>seconds` lines. Malformed lines are
 * dropped rather than guessed at.
 *
 * @param {string} text
 * @returns {Array<{ url: string, code: string }>}
 */
export function parseSweepResults(text) {
  return text
    .split("\n")
    .map((line) => line.split("\t"))
    .filter(([url, code]) => /^https?:\/\//.test(url ?? "") && /^\d{3}$/.test(code ?? ""))
    .map(([url, code]) => ({ url, code }));
}

const stripTrailingSlash = (url) => (url.length > 1 ? url.replace(/\/+$/, "") : url);

/**
 * One row covering every registry surface. Returns `null` when the sweep
 * visited no registry surface, so no hollow row passes for a measurement.
 *
 * @param {Array<{ url: string, code: string }>} results
 * @param {{ date: string, commit: string }} meta
 * @param {readonly { id: string, zone: string, url: string, auth: string }[]} registry
 */
export function buildAuditCoverageRow(results, { date, commit }, registry) {
  const byUrl = new Map(results.map((r) => [stripTrailingSlash(r.url), r]));

  const surfaces = registry.map((surface) => {
    const result = byUrl.get(stripTrailingSlash(surface.url));
    if (!result) return { id: surface.id, zone: surface.zone, status: "unchecked" };
    return { id: surface.id, zone: surface.zone, ...classifySweepResult(result, surface) };
  });
  if (!surfaces.some((s) => s.status !== "unchecked")) return null;

  const zones = {};
  for (const s of surfaces) {
    const z = (zones[s.zone] ??= { surfaces: 0, recorded: 0 });
    z.surfaces += 1;
    if (s.status !== "unchecked") z.recorded += 1;
  }
  return { date, commit, zones, surfaces };
}

/**
 * Zones with no recorded surface in any committed row — the "zone never
 * recorded" signal. A zone absent from every row (or with no rows at all) is
 * never recorded.
 *
 * @param {Array<{ zones?: Record<string, { recorded: number }> }>} rows
 * @param {readonly string[]} [zones] Defaults to the zones the latest row covers.
 * @returns {string[]}
 */
export function neverRecordedZones(rows, zones = Object.keys(rows.at(-1)?.zones ?? {})) {
  return zones.filter((zone) => !rows.some((row) => (row?.zones?.[zone]?.recorded ?? 0) > 0));
}
