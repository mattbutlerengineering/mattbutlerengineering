/**
 * The one canonical "is this an agent-authored PR?" predicate (#6380).
 *
 * Rule: NOT bookkeeping AND (`agent-authored` label OR a known agent branch
 * prefix). The legacy `has-pr` label is an ISSUE-state coordination label and
 * does not count on its own (#5852).
 *
 * `plugins/acmm/scripts/pr-outcomes.js` is self-contained and cannot import
 * from `scripts/`, so it carries a vendored copy of this rule;
 * `scripts/__tests__/agent-pr.test.mjs` runs the same table against both and
 * fails if they diverge. Change the rule in both places.
 */

export const AGENT_LABEL = "agent-authored";

export const AGENT_BRANCH_PREFIXES = ["worktree-agent-", "agent-", "fix/agent-", "feat/agent-"];

/** Scorer/telemetry/automation machinery, not agent feature work (#5852). */
export const BOOKKEEPING_BRANCH_PREFIXES = [
  "metrics/",
  "chore/acmm-",
  "chore/queue-telemetry-",
  "automation/",
  "dependabot/",
];

/**
 * Known automation-bot logins in both formats `gh` emits. Listed explicitly:
 * `app/claude` is the coding agent itself and must NOT be excluded.
 */
export const BOOKKEEPING_AUTHOR_LOGINS = new Set([
  "github-actions",
  "github-actions[bot]",
  "app/github-actions",
  "dependabot",
  "dependabot[bot]",
  "app/dependabot",
]);

/** @param {unknown} labels @returns {string[]} label names from strings or `{name}` objects */
function labelNames(labels) {
  if (!Array.isArray(labels)) return [];
  return labels
    .map((l) => (typeof l === "string" ? l : l?.name))
    .filter((n) => typeof n === "string");
}

/** @param {unknown} author @returns {string} lower-cased login from a string or `{login}` */
function authorLogin(author) {
  const raw = typeof author === "string" ? author : author?.login;
  return typeof raw === "string" ? raw.toLowerCase() : "";
}

/**
 * @param {{ headRefName?: string|null, author?: string|{login?: string}|null }} pr
 * @returns {boolean}
 */
export function isBookkeepingPr(pr) {
  const branch = pr?.headRefName ?? "";
  if (BOOKKEEPING_BRANCH_PREFIXES.some((p) => branch.startsWith(p))) return true;
  return BOOKKEEPING_AUTHOR_LOGINS.has(authorLogin(pr?.author));
}

/**
 * @param {{ headRefName?: string|null, labels?: Array<string|{name?: string}>, author?: string|{login?: string}|null }} pr
 * @returns {boolean}
 */
export function isAgentPr(pr) {
  if (!pr || isBookkeepingPr(pr)) return false;
  if (labelNames(pr.labels).includes(AGENT_LABEL)) return true;
  const branch = pr.headRefName ?? "";
  return AGENT_BRANCH_PREFIXES.some((p) => branch.startsWith(p));
}
