/**
 * Pure per-row telemetry reconciler. Completes a queue-telemetry row from
 * injected source facts and records WHY any field stays null
 * (`unknown_reasons`), so a silent gap and an honest unknown are distinct.
 *
 * Rules: an existing non-null value always wins; a filled field's stale
 * reason is cleared; the input is never mutated.
 */

import { RECONCILABLE_FIELDS, TELEMETRY_UNKNOWN_REASONS } from "./queue-telemetry-store.mjs";

const isNull = (v) => v === null || v === undefined;

/**
 * What the PR source says about each PR-derived field: `{ value }` when it
 * can supply one, `{ reason }` when it cannot.
 */
function prFacts(row, pr) {
  const none = (reason) => ({
    merged: { reason },
    merged_at: { reason },
    ci_first_pass: { reason },
    reviewer_verdict: { reason },
  });
  if (pr == null) return none(row.pr_number == null ? "no-pr" : "pr-not-found");
  if ("error" in pr) return none("source-error");
  if (pr.state === "OPEN") return none("pr-open");
  const merged = pr.state === "MERGED";
  return {
    merged: { value: merged },
    // A closed-unmerged PR has no merge time: there is no merged PR.
    merged_at: merged && pr.mergedAt ? { value: pr.mergedAt } : { reason: "no-pr" },
    ci_first_pass: isNull(pr.ciGateFirstPass)
      ? { reason: "no-ci-gate-run" }
      : { value: pr.ciGateFirstPass },
    reviewer_verdict: isNull(pr.reviewerVerdict)
      ? { reason: "no-verdict-comment" }
      : { value: pr.reviewerVerdict },
  };
}

function costFacts(cost) {
  const missing = { reason: "no-ledger-row" };
  if (cost == null) return { cost_usd: missing, model_tier: missing };
  const known = (r) => (TELEMETRY_UNKNOWN_REASONS.includes(r) ? r : "no-ledger-row");
  const why = known(cost.reason);
  return {
    cost_usd: isNull(cost.costUsd) ? { reason: why } : { value: cost.costUsd },
    model_tier: isNull(cost.modelTier)
      ? { reason: cost.reason ? why : "unmapped-model" }
      : { value: cost.modelTier },
  };
}

/**
 * @param {object} row - telemetry row (not mutated)
 * @param {{ pr?: object|null, cost?: object|null }} sources
 * @returns {object} new row
 */
export function reconcileTelemetryRow(row, { pr = null, cost = null } = {}) {
  const facts = { ...prFacts(row, pr), ...costFacts(cost) };
  const out = { ...row };
  const reasons = {};

  for (const field of RECONCILABLE_FIELDS) {
    if (!isNull(row[field])) continue;
    const fact = facts[field];
    if (fact.reason === undefined) out[field] = fact.value;
    else {
      out[field] = null;
      reasons[field] = fact.reason;
    }
  }

  if (Object.keys(reasons).length > 0) out.unknown_reasons = reasons;
  else delete out.unknown_reasons;
  return out;
}
