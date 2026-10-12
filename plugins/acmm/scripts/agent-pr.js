/**
 * The one canonical "is this PR agent work?" predicate (#6380).
 *
 * Lives in the ACMM plugin because the plugin is a self-contained package that
 * cannot import from the repo's `scripts/` tree, while `scripts/` already
 * imports from the plugin. Every other consumer (queue-efficiency, queue
 * telemetry, pr-metrics, the ai-audit workflow via `select-ai-prs.mjs`) imports
 * from here — do not re-implement the rule.
 *
 * Rule (#5852 audit finding 6):
 *   - PR has the `agent-authored` label, OR its branch starts with one of
 *     `AGENT_BRANCH_PREFIXES`
 *   - EXCLUDING bookkeeping/automation PRs (`isBookkeepingPr`) even when they
 *     carry the label. `has-pr` is an ISSUE-state coordination label and is
 *     deliberately NOT a leg: the only PRs carrying it were metrics automation.
 *
 * Accepts both PR shapes seen in the repo: labels as `string[]` or
 * `{ name }[]` (raw `gh --json`), author as a string login or `{ login }`.
 */

export const AGENT_LABEL = "agent-authored";
export const AGENT_BRANCH_PREFIXES = ["worktree-agent-", "agent-", "fix/agent-", "feat/agent-"];
/**
 * Branch prefixes that are the scorer/telemetry machinery auditing itself,
 * not agent feature/fix work — measured live (2026-09-28) via
 * `gh pr list --state merged --label agent-authored --limit 100 --json
 * headRefName,author`: `chore/acmm-daily-audit-*` / `chore/acmm-audit-*`
 * carry the `agent-authored` label despite being the daily audit committing
 * its own state, so the label alone over-counts (#5852 audit finding 6).
 */
export const BOOKKEEPING_BRANCH_PREFIXES = [
  "metrics/",
  "chore/acmm-",
  "chore/queue-telemetry-",
  "automation/",
  "dependabot/",
];
/**
 * Known automation-bot PR-author logins, in both formats observed live:
 * `gh pr list --json author` returns Bot/App actors as `app/<slug>` on this
 * repo (e.g. `app/dependabot`, `app/github-actions`), not the `<slug>[bot]`
 * suffix form the GitHub REST API and `gh pr view --json commits` use. Both
 * are listed explicitly rather than matched by a `[bot]`/`app/` heuristic,
 * because `app/claude` is the coding agent itself and must NOT be excluded
 * here — heuristic prefix matching would catch it too.
 */
export const BOOKKEEPING_AUTHOR_LOGINS = new Set([
  "github-actions",
  "github-actions[bot]",
  "app/github-actions",
  "dependabot",
  "dependabot[bot]",
  "app/dependabot",
]);

/** @typedef {{ headRefName?: string | null, labels?: Array<string | { name?: string }>, author?: string | { login?: string } | null }} AgentPrShape */

/** @param {AgentPrShape["labels"]} labels @returns {string[]} */
function labelNames(labels) {
  return (labels ?? []).map((l) => (typeof l === "string" ? l : (l?.name ?? "")));
}

/** @param {AgentPrShape["author"]} author @returns {string} */
function authorLogin(author) {
  const raw = typeof author === "string" ? author : (author?.login ?? "");
  return raw.toLowerCase();
}

/**
 * Is this PR bookkeeping/automation machinery rather than agent work —
 * a daily-audit commit, a metrics snapshot, or a dependency bump?
 *
 * @param {AgentPrShape} pr
 */
export function isBookkeepingPr(pr) {
  const branch = pr.headRefName ?? "";
  if (BOOKKEEPING_BRANCH_PREFIXES.some((p) => branch.startsWith(p))) return true;
  return BOOKKEEPING_AUTHOR_LOGINS.has(authorLogin(pr.author));
}

/**
 * Is this PR from an agent? See the module header for the rule.
 *
 * @param {AgentPrShape} pr
 * @returns {boolean}
 */
export function isAgentPr(pr) {
  if (isBookkeepingPr(pr)) return false;
  if (labelNames(pr.labels).includes(AGENT_LABEL)) return true;
  const branch = pr.headRefName ?? "";
  return AGENT_BRANCH_PREFIXES.some((p) => branch.startsWith(p));
}
