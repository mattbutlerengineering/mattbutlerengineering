import { describe, expect, it } from "vitest";
import { listWorkflowFiles, loadWorkflow } from "../lib/workflow.mjs";

/**
 * Every workflow that re-runs on a PR push must cancel its own superseded run.
 *
 * Measured 2026-11-28 on the `ci.yml` pull_request runs of the previous 11 h:
 * a PR's push -> `CI Gate` wall time was 44.3 min at p50 and 63.7 min at p90,
 * of which 34.7 min was time jobs spent queued for a runner, not working
 * (prepare 4.6 min + the slowest fan-out leg 13.9 min + `CI Gate` 17.6 min).
 * The account's concurrent-job cap is the binding constraint (#10009), so
 * every runner-minute another workflow spends lengthens that queue.
 *
 * A workflow without a `concurrency` group spends those minutes twice. When a
 * second push lands, GitHub starts a fresh run and leaves the first one
 * executing to completion even though nothing will ever read its verdict:
 *
 *   - apps-visual.yml: 25 of 100 runs (11.4 h window) were still executing
 *     when a newer push to the same branch arrived; they spent 87 runner-min
 *     after that point, 20% of the workflow's total runner time (~183/day).
 *   - rialto-web-e2e.yml: 19 of 100 runs (75.3 h window), 118 runner-min
 *     after the superseding push, 11% of its runner time (~38/day).
 *
 * Cancelling a superseded run removes no protection: the push that superseded
 * it runs the same suite on the newer code, and the merge gate only ever reads
 * the newest head SHA.
 *
 * A `pull_request` trigger limited to `types: [closed]` is exempt — a closed-PR
 * event is not superseded by a push, and cancelling it would drop bookkeeping
 * (promote-unblocked-issues.yml, revert-watchdog.yml).
 *
 * This asserts only that superseded runs are cancelled, not how the group key
 * is spelled: a workflow that must serialize on a shared external resource
 * (storybook.yml deploys to GitHub Pages) keeps its own group.
 */

/** PR event types that a later push to the same branch supersedes. */
const SUPERSEDABLE_TYPES = ["opened", "synchronize", "reopened"];

/** GitHub's default `pull_request` types when the trigger names none. */
const DEFAULT_PR_TYPES = SUPERSEDABLE_TYPES;

function prWorkflowsThatRerunOnPush() {
  return listWorkflowFiles()
    .map((file) => ({ file, workflow: loadWorkflow(file) }))
    .filter(({ workflow }) => {
      const pr = workflow.on.pull_request;
      if (!pr) return false;
      const types = pr.types ?? DEFAULT_PR_TYPES;
      return types.some((type) => SUPERSEDABLE_TYPES.includes(type));
    });
}

describe("pull_request workflows cancel their superseded runs", () => {
  const candidates = prWorkflowsThatRerunOnPush();

  it("finds the pull_request workflows to check", () => {
    // Guards the predicate itself: a parser or trigger change that empties
    // this list would make every assertion below vacuously pass.
    expect(candidates.length).toBeGreaterThan(5);
    expect(candidates.map((c) => c.file)).toContain("ci.yml");
  });

  it.each(candidates.map((c) => c.file))("%s declares a concurrency group", (file) => {
    expect(loadWorkflow(file).concurrency?.group).toBeTruthy();
  });

  it.each(candidates.map((c) => c.file))("%s cancels the in-progress run", (file) => {
    // `ci.yml` writes an expression that is false only on main, where a push
    // must finish; anything non-empty other than a literal `false` cancels.
    expect(String(loadWorkflow(file).concurrency?.["cancel-in-progress"] ?? "")).not.toBe("");
    expect(String(loadWorkflow(file).concurrency?.["cancel-in-progress"])).not.toBe("false");
  });

  /**
   * A workflow that also runs on `push` must not let one push to main cancel
   * the previous one — on a push event `github.event.pull_request.number` is
   * empty, so a group keyed on it alone collapses every main push into one
   * group. apps-visual.yml and rialto-web-e2e.yml publish their visual
   * baselines on main (scripts/visual-baselines.mjs), so a cancelled main run
   * loses the baseline ref the next PR fetches.
   *
   * Two spellings satisfy this and both are already in the repo: a per-run
   * fallback in the group key (`|| github.run_id`, six workflows), or
   * `cancel-in-progress` evaluated false on main (ci.yml). Dropping the
   * fallback to the bare `github.event.pull_request.number` that
   * ai-attribution.yml and auto-review.yml use is safe only because neither of
   * those runs on push — which is exactly why this is asserted here and not
   * left to a reader to notice.
   */
  const PUSH_GROUP_EXEMPT = {
    "storybook.yml":
      "serializes on a shared external resource: `group: pages` is GitHub's " +
      "documented key for Pages deployments, and its deploy job is " +
      "`if: github.event_name != 'pull_request'`. A PR build sharing that group " +
      "can still cancel a main Pages deploy — a real hole, but it predates the " +
      "concurrency blocks this file was added for and changing Pages " +
      "serialization is its own decision (#10204).",
  };

  const pushCandidates = candidates
    .filter(({ workflow }) => workflow.on.push)
    .map(({ file }) => file)
    .filter((file) => !(file in PUSH_GROUP_EXEMPT));

  it("finds the pull_request workflows that also run on push", () => {
    expect(pushCandidates).toContain("apps-visual.yml");
    expect(pushCandidates).toContain("rialto-web-e2e.yml");
    expect(pushCandidates).toContain("ci.yml");
  });

  it.each(pushCandidates)("%s never cancels one push to main with the next", (file) => {
    const { concurrency } = loadWorkflow(file);
    const perRunFallback = String(concurrency?.group ?? "").includes("github.run_id");
    const notCancelledOnMain = String(concurrency?.["cancel-in-progress"] ?? "").includes(
      "refs/heads/main"
    );
    expect(perRunFallback || notCancelledOnMain).toBe(true);
  });
});
