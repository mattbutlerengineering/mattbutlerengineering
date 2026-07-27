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
 * Age beyond which a per-service migration record is treated as stale
 * (used by the migration-health check in health/system.js). 72 hours —
 * migrations are change-driven, not daily. Deploy and CI health are
 * classified by their last-run conclusion rather than age; see
 * interpretDeployHealth.
 */
export const STALENESS_THRESHOLD_MS = 72 * 60 * 60 * 1_000;

/**
 * Interpret a single deploy KV record into a health status.
 *
 * A definitive last-run conclusion determines health regardless of the
 * record's age: a change-driven deploy pipeline whose last run SUCCEEDED is
 * healthy even after days idle (nothing new needed deploying — not a fault).
 * Failures and rollbacks map to unhealthy immediately; a missing record is
 * `stale` (this pipeline has never been observed running).
 *
 * @param {object|null|undefined} kvData - Raw JSON from KV (or null if missing).
 * @returns {{ status: "healthy"|"unhealthy"|"stale", last_run: object|null }}
 */
export function interpretDeployHealth(kvData) {
  if (!kvData) {
    return { status: "stale", last_run: null };
  }

  if (kvData.conclusion === DEPLOY_HEALTH_CONCLUSIONS.SUCCESS) {
    return { status: "healthy", last_run: kvData };
  }
  // A cancelled deploy is the DO+Pulumi dual-deploy race artifact (every
  // `doctl apps create-deployment` triggers a paired "app spec updated"
  // deployment that gets superseded/cancelled). Treat it as stale so it
  // surfaces as `degraded`, not a false `unhealthy` alarm. Real failures
  // and rollbacks still map to unhealthy.
  if (kvData.conclusion === DEPLOY_HEALTH_CONCLUSIONS.CANCELLED) {
    return { status: "stale", last_run: kvData };
  }
  return { status: "unhealthy", last_run: kvData };
}
