/**
 * automation-pr.mjs — shared automation-PR identification constants (#3982).
 *
 * Extracted out of `scripts/rescue-automation-prs.mjs` specifically to avoid
 * a circular import: `rescue-automation-prs.mjs` calls into
 * `scripts/approve-automation-runs.mjs`'s `approvePendingRuns` (AC2 — a
 * PR's update-branch merge commit parks at `action_required` exactly like
 * its original commit did), and `approve-automation-runs.mjs` needs this
 * same automation/*-branch + auto-merge-label identification
 * `rescue-automation-prs.mjs` already defined. Both modules import from
 * here instead of from each other.
 */

/** Branch prefix every automation-PR producer opens its PR from. */
export const AUTOMATION_BRANCH_PREFIX = "automation/";

/**
 * Label the four opt-in producers (production-feedback, drift-fix,
 * pr-metrics, acmm-regression) apply to their PR. `auto-qa-tune.yml`
 * deliberately omits it (touches `.github/`, needs a human merge).
 */
export const AUTOMATION_LABEL = "auto-merge";

/** True if `pr` carries `labelName` (supports `["x"]` or `[{name:"x"}]`). */
export function hasLabel(pr, labelName) {
  const labels = pr?.labels ?? [];
  return labels.some((label) => (typeof label === "string" ? label : label?.name) === labelName);
}
