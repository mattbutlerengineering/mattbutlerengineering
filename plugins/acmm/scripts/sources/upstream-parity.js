/**
 * Upstream-parity bookkeeping (#5851/#5853 AC9).
 *
 * `upstream-snapshot.json` is a point-in-time capture of every criterion id
 * from kubestellar/console `web/src/lib/acmm/sources/*` at commit `2005b199`
 * (id, level, scannable only — detection patterns were not diffed, matching
 * the #5851 audit's own caveat). Refresh it with:
 *
 *   gh api "repos/kubestellar/console/contents/web/src/lib/acmm/sources/acmm.criteria.ts?ref=<sha>" --jq .content | base64 -d
 *   (repeat for fullsend.ts, agentic-engineering-framework.ts, claude-reflect.ts)
 *
 * then re-extract `{ id, level, scannable }` per criterion (scannable defaults
 * to `true` when the upstream object omits the field) and re-run
 * `findUpstreamParityIssues` below.
 */

/**
 * Ids item 6 (#5853) deleted as duplicates — each was either an identical
 * detection under a different name (folded into a surviving id) or a target
 * with no reader/writer (removed outright). Every key here must be a real
 * upstream id (verified against `upstream-snapshot.json`); a local-only
 * invention that gets removed does not belong in this map — it was never in
 * the snapshot to begin with, so the parity check never asks about it.
 */
export const DROPPED_UPSTREAM_IDS = {
  "acmm:router-skills": "merged into acmm:simple-skills — identical `.claude/skills/` check",
  "acmm:structured-rca": "merged into acmm:simple-skills — identical `.claude/skills/` check",
  "acmm:structured-workflows": "merged into acmm:simple-skills — identical `.claude/skills/` check",
  "acmm:tdd-workflows": "merged into acmm:simple-skills — identical `.claude/skills/` check",
  "acmm:layered-safety":
    "merged into acmm:structural-gates — identical `.claude/settings.json` check",
  "acmm:mechanical-enforcement":
    "merged into acmm:structural-gates — identical `.claude/settings.json` check",
  "acmm:cross-repo-skills":
    "removed — `.claude/settings.json` existence proves nothing about cross-repo sharing",
  "acmm:github-coordination": "merged into acmm:prereq-cicd — identical `.github/workflows/` check",
  "acmm:cross-session-knowledge":
    "merged into acmm:reflection-log — identical docs/reflections/ check",
  "acmm:preference-index": "removed — .claude/preferences.json has no reader",
  "acmm:task-ledger": "removed — .claude/task-log.jsonl has had no writer since 2026-05-12",
  "fullsend:ci-cd-maturity": "merged into acmm:prereq-cicd — same signal",
  "fullsend:test-coverage": "merged into acmm:prereq-coverage-gate — substance moved with it",
  "fullsend:rollback-drill": "merged into acmm:rollback-drill — same file, looser regex",
  "fullsend:observability-runbook":
    "merged into acmm:observability-runbook — substance moved with it",
  "fullsend:production-feedback": "merged into acmm:production-feedback — same signal",
  "fullsend:risk-assessment":
    "merged into acmm:tier-classifier — same signal as aef:change-classification",
  "aef:task-traceability": "removed — docs/agent-tasks/ holds only a README",
  "aef:session-continuity": "removed — identical to the L2 acmm:agent-instructions OR-group",
  "aef:audit-trail": "merged into acmm:audit-trail — same signal",
  "aef:cross-tool-config": "merged into acmm:agents-md — same signal",
  "aef:change-classification":
    "merged into acmm:tier-classifier — same signal as fullsend:risk-assessment",
  "claude-reflect:correction-capture": "merged into acmm:correction-capture — same signal",
  "claude-reflect:positive-reinforcement": "merged into acmm:positive-reinforcement — same signal",
  "claude-reflect:session-summary": "merged into acmm:session-summary — same signal",
  "claude-reflect:claude-md-sync": "merged into acmm:claude-md-auto-sync — same signal",
  "claude-reflect:reflection-review": "merged into acmm:periodic-reflection — same signal",
  "claude-reflect:preference-index": "removed — same dead .claude/preferences.json target",
};

/**
 * The only gating `acmm`-source ids allowed to exist outside the upstream
 * catalog — the four "evidence-backed" local extensions item 3 (#5853) kept
 * gating after tightening their detection. Anything else gating and absent
 * from upstream is either an oversight or should have moved to `local:`.
 */
export const LOCAL_GATING_EXTENSIONS = [
  "acmm:instruction-sync-gate",
  "acmm:instruction-rot-detection",
  "acmm:accessibility-ai-check",
  "acmm:auto-rollback",
];

/**
 * Compute upstream-parity issues (empty array = clean).
 *
 * Two independent checks:
 *  1. Every upstream id is present locally with the same level/scannable, OR
 *     is listed in `droppedIds` with a reason.
 *  2. Every gating `acmm`-source criterion (level 2-6, `scannable !== false`)
 *     not found in the upstream snapshot is in `localExtensions`.
 *
 * @param {Array<{id: string, source: string, level?: number, scannable?: boolean}>} allCriteria
 * @param {Array<{id: string, level: number, scannable: boolean}>} upstreamSnapshot
 * @param {Record<string, string>} droppedIds
 * @param {string[]} localExtensions
 * @returns {string[]} human-readable issue descriptions; empty when parity holds
 */
export function findUpstreamParityIssues(
  allCriteria,
  upstreamSnapshot,
  droppedIds,
  localExtensions
) {
  const issues = [];
  const byId = new Map(allCriteria.map((c) => [c.id, c]));

  for (const entry of upstreamSnapshot) {
    if (Object.prototype.hasOwnProperty.call(droppedIds, entry.id)) continue;
    const local = byId.get(entry.id);
    if (!local) {
      issues.push(`${entry.id}: upstream id is missing locally and not in DROPPED_UPSTREAM_IDS`);
      continue;
    }
    if ((local.level ?? null) !== entry.level) {
      issues.push(`${entry.id}: level mismatch (local ${local.level} vs upstream ${entry.level})`);
    }
    const localScannable = local.scannable !== false;
    if (localScannable !== entry.scannable) {
      issues.push(
        `${entry.id}: scannable mismatch (local ${localScannable} vs upstream ${entry.scannable})`
      );
    }
  }

  const upstreamIds = new Set(upstreamSnapshot.map((e) => e.id));
  for (const c of allCriteria) {
    if (c.source !== "acmm") continue;
    if (typeof c.level !== "number" || c.level < 2 || c.level > 6) continue;
    if (c.scannable === false) continue;
    if (upstreamIds.has(c.id)) continue;
    if (!localExtensions.includes(c.id)) {
      issues.push(
        `${c.id}: gates the level, absent from upstream, and not in LOCAL_GATING_EXTENSIONS`
      );
    }
  }

  return issues;
}
