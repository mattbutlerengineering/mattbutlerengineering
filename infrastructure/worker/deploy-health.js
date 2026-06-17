/**
 * Deploy-health protocol — shared schema and interpreter.
 *
 * Single owner for the deploy/KV record schema used by:
 *   - .github/actions/report-deploy-health (writer, via curl)
 *   - edge-router.js interpretDeployHealth (reader)
 *
 * Changing this file is the only place you need to update the protocol.
 */

/**
 * Canonical conclusion values the report-deploy-health action can write.
 * The edge router must recognize all of these.
 */
export const DEPLOY_HEALTH_CONCLUSIONS = {
  SUCCESS: "success",
  FAILURE: "failure",
  CANCELLED: "cancelled",
  ROLLED_BACK: "rolled_back",
};

/**
 * Records older than this are treated as stale regardless of conclusion.
 * 72 hours — deploy workflows are change-driven, not daily.
 */
export const STALENESS_THRESHOLD_MS = 72 * 60 * 60 * 1_000;

/**
 * Interpret a single deploy KV record.
 *
 * @param {object|null|undefined} kvData - Raw JSON from KV (or null if missing).
 * @param {number} now - Current timestamp in ms (Date.now()).
 * @returns {{ status: "healthy"|"unhealthy"|"stale", last_run: object|null }}
 */
export function interpretDeployHealth(kvData, now) {
  if (!kvData) {
    return { status: "stale", last_run: null };
  }

  const age = now - new Date(kvData.updated_at).getTime();
  if (age > STALENESS_THRESHOLD_MS) {
    return { status: "stale", last_run: kvData };
  }

  const status = kvData.conclusion === DEPLOY_HEALTH_CONCLUSIONS.SUCCESS ? "healthy" : "unhealthy";
  return { status, last_run: kvData };
}
