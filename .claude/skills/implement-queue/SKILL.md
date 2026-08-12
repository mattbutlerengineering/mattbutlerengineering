---
name: implement-queue
description: "Drain the ready-issue backlog with quality: claim a batch of independent issues, implement each in parallel TDD worktree subagents, then serially merge green PRs. Replaces ship-loop. Use when the user says 'work the queue', 'drain the backlog', 'implement the ready issues', or invokes /implement-queue (optionally via /loop)."
user-invocable: true
---

# Implement Queue

Work through the `ready` issue backlog: parallel implementation, serial merging.

**Priority principle: Security > CI fixes > Features > Audit findings.**
**Quality principle: every issue goes through the full implement-issue pipeline (TDD, gates, review) inside its worker. No shortcuts.**

```
Phase 0: Pre-flight (main green? open PRs?)
Phase 1: Claim batch (≤3 independent ready issues)
Phase 2: Implement in parallel worktree subagents → PRs
Phase 3: Serial merge train (oldest green PR first)
Phase 4: Loop or stop
```

## Phase 0: Pre-flight

**Main must be green** before any new work (green-main policy):

```bash
gh run list --branch main --limit 5 --json status,conclusion,name,databaseId \
  | jq '[.[] | select(.conclusion == "failure")]'
```

If main is red: fixing it IS the iteration. Create/pick up a `ci-fix` issue, fix, and skip to Phase 3.

**Open PRs come before new issues.** Unfinished PRs are higher-value than fresh work:

```bash
gh pr list --state open --json number,title,headRefName,statusCheckRollup,mergeStateStatus
```

- CI green → feed into the Phase 3 merge train now.
- CI pending → note PR number; merge train will pick it up.
- CI failed → fix the failure (or label the linked issue `agent-failed` if unfixable this iteration).

Only proceed to Phase 1 once no open PR is in a failed state.

## Phase 1: Claim Batch

```bash
gh issue list --label "ready" --state open --json number,title,body,labels --limit 20
```

**Sort:** 1) security (`fix(security):` titles, Dependabot-sourced `ci-fix`), 2) other `ci-fix`, 3) `feature`, 4) `audit`. Oldest first within a tier. Security issues always get a slot.

**Filter for independence** — skip issues that:

- have unresolved `Depends on: #N` (N still open)
- share a zone/files with another issue already in this batch (merge-conflict prevention — when two conflict, take the higher-priority one)
- are labeled `in-progress` or `stealable`

**Compose the batch — spread across zones (ADR-023).** Feed the priority-sorted, independence-filtered candidates into `selectZoneSpreadBatch` (`scripts/issue-zone.mjs`) so the batch maximizes **distinct** merge-train zones instead of stacking same-zone PRs. Same-zone stacking incurs an N² `update-branch`/CI re-run tax against `strict` main (ADR-016): each merge makes its siblings out-of-date. The selector consumes the priority tiers as its input order (security > ci-fix > feature > audit), takes at most one issue per zone (`null` = global counts as a single occupancy — two globals are never co-scheduled), and defers same-zone surplus to a later batch:

```js
import { selectZoneSpreadBatch } from "./scripts/issue-zone.mjs";

// `ready` = candidates already priority-sorted (Sort above) and
// independence-filtered, each { number, title, labels, body }.
const batch = selectZoneSpreadBatch(ready, { maxWorkers: 3 });
// → ≤3 issues in distinct zones, priority order preserved.
```

Each issue's zone is estimated from its conventional-commit scope via `issueZone(issue)`, which reuses the merge-train-lock zone vocabulary (`scripts/merge-train-lock.mjs`, `WORKSPACE_ROOTS` + `zoneForPath`) — there is no second, divergent zone list.
**Claim the composed batch** (each selected issue → `in-progress`):

```bash
mbe issue transition <N> --to in-progress
```

State transitions (`ready`/`in-progress`/`has-pr`/`agent-failed`/`agent-skip`) always go through `mbe issue transition <N> --to <state>` — it wraps `@mbe/gh-client`'s tested label machine, the single source of truth for which labels come off on each edge. If `mbe` isn't on PATH (fresh worktree/CI), build once: `pnpm build --filter @mbe/cli...`, then `node tools/cli/dist/index.js issue transition <N> --to <state>`.

## Phase 2: Implement in Parallel

**Dispatch is decoupled from the merge train.** Spawning workers must NEVER wait on the merge-train lock — a long merge train for one zone should not stall picking up fresh `ready` issues. The single source of truth for "may I dispatch more workers right now?" is `canDispatchWorkers()` in `scripts/worker-dispatch.mjs`, which is gated **only** by worker capacity (`MAX_CONCURRENT_WORKERS`, default 3) and never imports or consults the merge-train lock:

```js
import { canDispatchWorkers } from "./scripts/worker-dispatch.mjs";

if (canDispatchWorkers({ activeWorkers }).allowed) {
  // dispatch the next worker — independent of any in-flight merge train
}
```

**Resolve each issue's model first.** Per-issue routing beats a one-size model — trivial deps/docs run on haiku, complex refactors on opus-4.8:

```bash
mbe check-model --issue <N>   # prints the tier on stdout (model ID/reason on stderr)
```

It honors an explicit `model:` in the issue's ```yaml agent block, otherwise routes by labels + title + body via `model-router.ts` (single source of truth — no inline copy of the rules here).

Dispatch one subagent per issue — **all in a single message** — using the Agent tool with `subagent_type: "implement-queue-worker"`, `isolation: "worktree"`, and `model:` set to the resolved **tier** from `check-model` (`opus`/`sonnet`/`haiku` — the Agent `model:` parameter is a tier enum, not a full model ID). (If `check-model` fails for an issue, omit `model:` — the worker's `sonnet` default applies.)

**Adapter by tier** — when the worker prompt calls `mbe agent run` internally (e.g. for sub-tasks):

- `haiku` / `sonnet` tiers: use `--adapter auto` — enables rate-limit failover cascade (claude → gemini → opencode on 429), preventing stalls on busy days.
- `opus` tier: pin `--adapter claude` — stays on the Claude provider; failover to gemini/opencode is inappropriate for deep architecture tasks.

Each agent prompt MUST include:

1. The issue number, title, and full body.
2. **First step: `pnpm install --frozen-lockfile`** (worktrees have no `node_modules`).
3. TDD: failing test first, then minimal implementation, per vertical slice.
4. Gates on affected packages before declaring done: `pnpm lint`, `pnpm typecheck`, `pnpm test` (vitest does NOT typecheck — typecheck is mandatory).
5. Push branch and open a PR with `Closes #<N>` in the body; **verify the PR's base ref is `main`** (worktree agents can branch from the wrong base). Do NOT merge.
6. Security rules (non-negotiable):
   > Never introduce hardcoded secrets, SQL injection, XSS, or other OWASP Top 10 vulnerabilities. Never commit `.env` files, credentials, or tokens. Parameterized queries only. Validate external data at boundaries. If you discover an existing vulnerability, stop feature work and fix it first.

**Outcome labels as each agent finishes:**

| Outcome                      | Command                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| PR created, gates green      | `mbe issue transition <N> --to has-pr`                                                                |
| Partial work (draft PR)      | `gh issue edit <N> --add-label "needs-review" --remove-label "in-progress"` (not state-machine — raw) |
| No usable changes            | `mbe issue transition <N> --to agent-failed`                                                          |
| Second failure on same issue | `gh issue edit <N> --add-label "stealable"` (not state-machine — raw)                                 |

### Worker telemetry capture

After each worker completes, append one row to `metrics/queue-telemetry.jsonl` via `appendTelemetryRow` from `scripts/collect-queue-telemetry.mjs`. The writer is a pure function with dependency injection — safe to call from the orchestrator without touching other files.

```js
import { appendTelemetryRow } from "./scripts/collect-queue-telemetry.mjs";

appendTelemetryRow({
  issue_number: 2747, // required
  labels: ["feature", "ready"],
  model_tier: "sonnet", // haiku | sonnet | opus
  subagent_tokens: usage.totalTokens, // from worker completion <usage>
  tool_uses: usage.toolUses ?? 0,
  duration_ms: Date.now() - claimedAt,
  pr_number: prNumber ?? null,
  merged: null, // reconciled by sensor later
  ci_first_pass: null, // reconciled by sensor later
  rework_cycles: null, // reconciled by sensor later
  reviewer_verdict: verdict, // "pass" | "flag" | "skipped" | "error"
  claimed_at: claimedAtIso,
  merged_at: null, // reconciled by sensor later
  cost_usd: usage.costUsd ?? null, // include when known; enables precise cost in scorecard
});
```

**Rules:**

- Write only schema fields — unknown keys (e.g. API keys, tokens) cause the writer to throw before any disk write.
- `reviewer_verdict` is `pass` | `flag` | `skipped` (low-risk fast path, step 2) | `error` (the reviewer could not run). **Never record a fail-open as `pass`** — `review_coverage` in `scripts/collect-queue-efficiency.mjs` counts only `pass`/`flag` as covered, so an `error` logged as `pass` hides a dead merge gate behind a flattering pass rate.
- The row is idempotent per `(issue_number, pr_number)` — safe to retry on transient errors.
- Outcome fields (`merged`, `merged_at`, `ci_first_pass`, `rework_cycles`) are null at write time; `scripts/reconcile-queue-telemetry.mjs` (run by `/optimize-implement-queue` Step 0) fills them from GitHub later.
- `metrics/queue-telemetry.jsonl` is a **tracked file** (merge=union) — rows appended in ephemeral checkouts must be committed before the session ends (see Phase 4).
- `cost_usd`, when provided, lets `collect-queue-efficiency.mjs` use precise per-issue cost instead of the coarse ccusage-daily ÷ issues estimate.

### Worker→train boundary (per PR, after CI green)

Once a worker opens a PR, the orchestrator waits for PR-level CI then gates before enqueue. **This is the last safety layer before GitHub auto-merges** — a PR enqueued with `--auto` merges the moment CI Gate is green, with no further gate.

For each PR opened by a worker (can overlap with remaining workers completing):

1. **Wait for PR-level CI green — but first assert `CI Gate` actually exists.** `gh pr checks <N> --watch` reports `fail=0 pend=0` both when CI is genuinely green AND when the `pull_request` event never fired at all (a real, observed transient GitHub-side failure — see #3969; PR #3968 opened with zero `pull_request` runs, only an unrelated `pull_request_target` Dependabot skip, and sat `BLOCKED` with nothing red). Those two states are not the same and must not be conflated: classify the rollup with `classifyCiGateStatus` (`scripts/ci-gate-status.mjs`) before trusting a "green" read.

   `classifyCiGateStatus` reads **two sources**, not one: the PR's `statusCheckRollup` (what branch protection's merge evaluation actually reads) and the head SHA's raw check-runs API (`gh api repos/{owner}/{repo}/commits/{sha}/check-runs`, which also picks up `workflow_dispatch`-produced runs the rollup structurally cannot see). The CLI fetches both automatically:

   ```bash
   gh pr checks <N> --watch
   node scripts/ci-gate-status.mjs check --pr <N>   # → {"state": "green"|"failed"|"pending"|"gate-missing"|"gate-unattributed", "reason": "..."}
   ```

   - `state: "green"` → proceed to step 2.
   - `state: "failed"` → fix the failure (or `agent-failed` the linked issue if unfixable this iteration); do not enqueue.
   - `state: "pending"` → keep polling; do not enqueue.
   - `state: "gate-missing"` → **never enqueue.** `CI Gate` is absent from _both_ the rollup and the head-SHA check-runs — genuinely no CI ran. Dispatch CI directly on the branch and re-run the classifier — this is the documented `workflow_dispatch` escape hatch `ci.yml` already carries a bare trigger for (see `check-ci-dispatch.mjs`):

     ```bash
     gh workflow run ci.yml --ref <branch>
     ```

     Then re-poll from the top of this step. Do not stall silently and do not treat the absence of failures as green.

   - `state: "gate-unattributed"` → **never enqueue, and do NOT re-dispatch.** This means `CI Gate` genuinely ran (present in the head-SHA check-runs, possibly via a prior `workflow_dispatch`) but is absent from `statusCheckRollup` — the source branch protection's merge evaluation actually reads. Confirmed live on PR #4011 (#4023): `gh pr merge --auto` was accepted with a dispatch-produced `CI Gate: success` on the head SHA, and the PR sat `mergeStateStatus=BLOCKED` for 6+ minutes without merging. **The `workflow_dispatch` escape hatch above does NOT unblock a PR by itself** — it produces a check run neither the rollup nor branch protection counts, so dispatching again on a `gate-unattributed` PR cannot help; the new run is just as invisible. This state needs a human, or the separate (not-yet-implemented) fix of `ci.yml` publishing a commit _status_ named `CI Gate` in addition to the check run.

     **#4028 fix:** this state used to be masked whenever the rollup had ANY other entry not yet `COMPLETED` — a genuinely in-flight check (e.g. CodeQL still running) is expected to self-heal, but a check permanently parked awaiting external approval (`WAITING` — the rollup-visible GraphQL `CheckStatusState` for #3684's `action_required` failure mode; verified `ACTION_REQUIRED` itself is a `conclusion`, only ever set alongside `status: "COMPLETED"`, so it was never the masking culprit) never resolves, and the classifier reported `pending` forever instead of escalating. `classifyCiGateStatus` now excludes only that structurally-non-progressing status from its "still running" check, so a parked unrelated check no longer hides `gate-unattributed` — a genuinely in-flight one still reports `pending` as before (pinned by a regression test using PR #4027's measured live shape: ~29 checks in flight, no `CI Gate` entry yet, must NOT read as `gate-unattributed`).

2. **Low-risk fast path.** `tier:*` labels do **not** gate this skill's merges — see [No tier hold](#no-tier-hold) below. Check the `needs-review` label, which still holds a PR:

   ```bash
   gh pr view <N> --json labels -q '[.labels[].name]'   # → labelNames
   ```

   If `needs-review` is present, the fast path is off-limits — fall through to step 3 (Reviewer sub-agent).

   **Before the first classifier call this iteration, verify the built `@mbe/agent-core` dist is trustworthy.** Both `isLowRiskPR` and `reviewersForDiff` (step 4) run from the **built** `packages/agent-core/dist/` — gitignored, so a session inherits whatever the last build in this checkout produced. A stale dist doesn't error; it exports working functions that return confident, wrong (narrower) answers — on PR #3988 a 77-minute-stale dist made `reviewersForDiff` return `[]` for a diff that should have dispatched `e2e-selector-drift-reviewer` (#3989). Run once per session before trusting either function:

   ```bash
   node scripts/agent-core-build-freshness.mjs check
   # exit 0 -> dist proven newer than every src/** file (rebuilt automatically if it wasn't) — safe to classify
   # exit 1 -> still can't prove freshness after a rebuild attempt — FAIL CLOSED (see below)
   ```

   `exit 1` means: do **not** trust `isLowRiskPR`/`reviewersForDiff` for this PR at all. Skip the fast path unconditionally (fall through to step 3) and treat step 4's specialist gate as if every specialist reviewer applies — dispatch the full reviewer set rather than trusting an empty/narrow `reviewersForDiff` result. A dist that fails to prove itself fresh must never be read as "low risk" or "no specialists match".

   Only when `needs-review` is absent, the freshness check exited 0, AND `qualifiesForLowRiskFastPath(changedFiles)` (`@mbe/agent-core`, `gh pr diff <N> --name-only` for `changedFiles`) returns `true` — skip review and enqueue immediately:

   ```bash
   gh pr merge <N> --auto --squash --delete-branch
   ```

   `qualifiesForLowRiskFastPath` requires **both** `isLowRiskPR(files)` **and** `reviewersForDiff(files).length === 0` — the specialist gate wins. `isLowRiskPR` and `reviewersForDiff` are independent functions over the same file list and can both fire on the same diff: a pure dependency bump (every file matches `isLowRiskFile` in `packages/agent-core/src/file-classifier.ts`) can simultaneously match `dependency-update-reviewer` via `reviewersForDiff` (`packages/agent-core/src/pr-risk-classifier.ts`) — PR #4058 is exactly this shape. Calling `isLowRiskPR` alone would enqueue that PR with zero review, silently dropping the specialist its own sibling function selected (#4063). A low-risk-but-specialist-matched PR falls through to step 4 (specialists) even though step 3's universal reviewer is still skipped. This doc intentionally does not enumerate the underlying globs so the doc and the code cannot drift apart (see #3887, #3916) — `qualifiesForLowRiskFastPath` is the single composed predicate; reference it here rather than restating the two-part boolean. Move to the next PR.

3. **Reviewer sub-agent (non-low-risk PRs).** Build `ReviewInput` from the PR diff and dispatch:

   ```bash
   gh pr diff <N>              # → diff for ReviewInput
   gh pr diff <N> --name-only  # → changedFiles for ReviewInput
   ```

   **Truncate before dispatch.** If `diff` exceeds 40,000 characters, clip it to the
   first 40,000 and append `\n\n... (diff truncated)`. If `verificationOutput` exceeds
   10,000 characters, clip it to the first 10,000 and append `\n... (truncated)`. These
   are the exact marker strings `.claude/agents/reviewer.md` tells the reviewer to look
   for — on seeing one, it reads the missing region from disk via Read/Grep instead of
   guessing.

   **Snapshot `git status --porcelain` before dispatch — a hard mismatch check, not a warning.**
   Reviewer agents run with `isolation: "none"` in the main checkout and each carries a
   "Read-only contract" (`.claude/agents/reviewer.md` and the seven specialist agent files)
   telling it to point any code-execution need at the worker's own worktree
   (`.claude/worktrees/agent-<taskId>/`, already checked out on the PR branch) instead of
   touching the main tree. Don't just trust the instruction — verify it:

   ```bash
   BEFORE=$(git status --porcelain)
   ```

   Dispatch via Agent tool with `subagent_type: "reviewer"`, `isolation: "none"`,
   model: `haiku` (or `sonnet` for security-sensitive changes), budget: `$0.05`.

   The Reviewer's prompt MUST include:
   - The full [Reviewer Contract](./.claude/skills/implement-queue/REVIEWER_CONTRACT.md)
   - The serialised `ReviewInput` (diff, verification output, task description,
     acceptance criteria, changed files, commit message)

   **On timeout/error:** log a warning, record `reviewer_verdict: "error"` on the
   issue's telemetry row, and proceed to enqueue (fail-open). The `error` value is
   load-bearing: a dispatch that never resolved is not a review, and recording it
   as `pass` is indistinguishable from a real one.

   **Immediately after the reviewer returns, compare:**

   ```bash
   AFTER=$(git status --porcelain)
   [ "$BEFORE" = "$AFTER" ] || echo "MISMATCH — reviewer mutated the main checkout"
   ```

   A mismatch means the reviewer wrote to, staged, or otherwise changed the main
   checkout — this is what happened in #3917, where a PR's changes were left staged
   in the index one `git commit` away from landing on an unrelated branch. Treat a
   mismatch as a **failed review, not a pass**: restore the tree to the `BEFORE` state
   (inspect what changed first — `git diff`/`git status` — before discarding anything,
   in case it overlaps work already in progress in this checkout), then re-dispatch the
   reviewer. Whatever verdict the mutating dispatch returned is invalid — it read a tree
   it had already altered.

4. **Diff-matched specialized review gate.** Reuses the same freshness check from step 2 — do not call `reviewersForDiff` again against an untrusted dist. For each reviewer returned by `reviewersForDiff(changedFiles)` (`packages/agent-core/src/pr-risk-classifier.ts` — the single source of truth for which specialist covers which changed-file pattern; this doc intentionally does not enumerate them so the two cannot drift apart, see #3916), dispatch via Agent tool against the PR diff. CI can't catch a drop-column migration paired with code that still reads the column, or an ADR violation that isn't a regex match — these can. **A `block` verdict holds the PR.** Most PRs match 0–1 reviewers. Apply the same before/after `git status --porcelain` guard from step 3 to each specialist dispatch — snapshot before, compare after, treat any mismatch as a failed review and re-dispatch rather than trusting a verdict from a reviewer that mutated the tree it read.

5. **On all-pass verdict:** enqueue immediately — a review-gate pass plus green CI is the whole bar:

   ```bash
   gh pr merge <N> --auto --squash --delete-branch
   ```

   GitHub merges once CI Gate is green and the branch is up to date. The session does not wait — it moves to the next PR (or Phase 3). Do **not** re-check `tier:*` here; see [No tier hold](#no-tier-hold).

6. **On `"flag"` verdict (Reviewer) or `block` (specialized reviewer):** apply the retry policy (default: one retry — dispatch a new worker session on the same branch with `--no-pr`; if retry also flags, label the linked issue `needs-review` and **do not enqueue**). See [Reviewer Contract](./.claude/skills/implement-queue/REVIEWER_CONTRACT.md) for the full policy.

   **Manual verification path (after `needs-review`):** the Reviewer's full output is in the PR comment. A human (or a new agent session pointed at the issue) reads the flagged issues, fixes the code, pushes to the branch, and manually enqueues with `gh pr merge <N> --auto --squash --delete-branch` once satisfied.

### No tier hold

<a id="no-tier-hold"></a>

**`tier:standard` / `tier:sensitive` / `tier:critical` do NOT block a merge from this skill.** Matt's standing policy (2026-07-12, reaffirmed 2026-08-06): a PR that passes the review gate with green CI merges without waiting for a human.

The distinction that matters is **reviewed vs. unreviewed**, not tier:

| Path                            | Review gate                         | Tier blocks?                |
| ------------------------------- | ----------------------------------- | --------------------------- |
| `/implement-queue` (this skill) | Reviewer + diff-matched specialists | **no**                      |
| `merge-queue.yml`               | none                                | yes (`isAutoMergeEligible`) |
| `auto-merge.yml`                | none                                | yes (see #3857)             |

`docs/change-tiers.md`'s "T2+ requires Matt's personal approval" is **advisory for agent sessions that run the review gate**, and binding for the unreviewed workflow paths. `isAutoMergeEligible` still exists and is still correct — it just isn't this skill's gate. Do not reintroduce a tier check into Phase 2; it deadlocked the queue on 2026-08-06 (three review-gate-passed PRs parked, nothing merged).

What still holds a PR: a `flag` verdict (Reviewer), a `block` verdict (specialized reviewer), a `needs-review` label, or red CI Gate.

## Phase 3: Serial Merge Train

PRs are pre-enqueued (with `--auto`) in Phase 2 after the review gate passes. Phase 3 **unsticks stragglers** — PRs that fell behind `main` after a sibling merged (GitHub will not auto-merge an out-of-date branch). **At most one update-branch may run per zone across all sessions** — concurrent branch-updates in the same zone can collide. This is enforced by a per-zone lock, not the honor system. Non-overlapping zones (e.g. `apps/hospitality` vs `packages/rialto`) update concurrently.

### Acquire the merge-train lock (before updating branches)

The lock lives in the shared git common dir, so it is visible to every worktree/session of this repo. The guard is implemented in `scripts/merge-train-lock.mjs` — PID-aware, stale-reclaiming (45-min mtime window), per-zone, and fully tested.

**Pick the zone from the PR's changed files** with `zoneForPaths()`. A PR confined to one workspace area (`apps/<x>`, `packages/<x>`, `services/<x>`, or `root` for top-level/config/docs/scripts) locks only that zone; a cross-cutting PR (`zoneForPaths` returns `null`) takes the **global** lock (no `zone`), serializing against everything — the safe, conservative default. Passing no `zone` is 100% backward compatible with the historical single global lock.

```js
import {
  acquireMergeTrainLock,
  releaseMergeTrainLock,
  heartbeatMergeTrainLock,
  zoneForPaths,
} from "./scripts/merge-train-lock.mjs";

// changedFiles from `gh pr diff <N> --name-only`
const zone = zoneForPaths(changedFiles); // string (per-zone) or null (global)
const result = acquireMergeTrainLock({ zone }); // { acquired: true } or { acquired: false, owner: <pid> }
if (!result.acquired) {
  console.log(
    `merge-train lock for zone ${zone ?? "<global>"} held by PID ${result.owner} — SKIP this PR's zone this iteration.`
  );
  // Do NOT update-branch a PR whose zone lock is held. Drop to monitor-only for that zone and move on.
}
```

Heartbeat and release with the **same `zone`** you acquired: `heartbeatMergeTrainLock({ zone })` / `releaseMergeTrainLock({ zone })`.

Or as a one-liner from the shell (e.g. in a bash orchestration wrapper):

```bash
node -e "
  import('./scripts/merge-train-lock.mjs').then(({ acquireMergeTrainLock }) => {
    const r = acquireMergeTrainLock();
    process.stdout.write(JSON.stringify(r) + '\n');
  });
"
```

If `acquired` is `false`, **skip updating branches in that zone** and continue with PRs in other (acquirable) zones; report the blocked zone's PR state in monitor-only mode.

If `acquired` is `true`: call `heartbeatMergeTrainLock({ zone })` at the **start of each PR iteration** for that zone (keeps a legitimately long train from being reclaimed), and **release it when the train ends** — on completion, on circuit-break, or on any abort:

```js
releaseMergeTrainLock({ zone });
```

For each enqueued PR that is behind `main` (lock held):

1. **Update branch:** `gh pr update-branch <N>` — **unless `package.json` changed on either side**. In that case update-branch can desync `pnpm-lock.yaml` and break main post-merge; instead rebase the branch locally, run `pnpm install --lockfile-only`, commit, push.

The PR re-enters GitHub's auto-merge flow and merges once CI Gate is green on the updated branch.

If CI fails on the updated branch: one fix attempt in the main session (small fixes) or create a `ci-fix` issue and label the original `agent-failed`. Counts toward the circuit breaker.

## Phase 4: Loop or Stop

- **Release every merge-train lock you acquired** (`releaseMergeTrainLock({ zone })` from `scripts/merge-train-lock.mjs`, once per zone you locked in Phase 3) before looping or stopping. (A crash leaves a lock for the 45-min staleness reclaim; releasing explicitly frees the next session immediately.)
- **Reap merged workers' worktrees.** A successful worker's worktree is never auto-removed (Claude Code's `isolation: "worktree"` only reclaims an _unchanged_ worktree, and every successful worker commits) — #3950. After Phase 3 merges, run the reaper to reclaim any now-eligible `.claude/worktrees/*` worktree — both `agent-*` and hand-created:

  ```bash
  DRY_RUN=false node scripts/reap-worktrees.mjs
  ```

  Its safety gate (`decideWorktreeReap` in `scripts/reap-worktrees.mjs`) refuses any worktree with an open PR or a live owning process — see the module header for the liveness definition. A hand-created worktree additionally needs positive merged-PR evidence (`gh pr list --state merged`, never git ancestry — PRs squash-merge) before it's eligible; no evidence means it's retained, fail closed (#4122). Worktrees registered outside `.claude/worktrees/`, or present on disk but never registered with git, are reported in the summary but never touched. Dry-run by default; safe to run every iteration, a no-op when nothing is eligible.

- More `ready` issues and time/budget remain → back to Phase 0.
- **Circuit breaker:** 3 consecutive failures (agents or merge-train CI) → release the lock(s), then stop and report.
- **Persist telemetry before stopping:** if `metrics/queue-telemetry.jsonl` has uncommitted appended rows (`git diff --stat -- metrics/queue-telemetry.jsonl`), commit ONLY that path on a branch and open a PR titled `chore(metrics): queue telemetry <YYYY-MM-DD>` labeled `has-pr`. A PR that touches only `metrics/**` satisfies `isLowRiskPR` (see Phase 2 step 2) and auto-merges via the low-risk fast path — but only if every changed file is metrics-only; a mixed diff (e.g. also touching a non-allowlisted file) falls through to the reviewer gate like any other PR. Ephemeral cloud checkouts lose uncommitted rows forever.
- Report per iteration: issues claimed, PRs created, PRs merged, failures.

Recurring use: `/loop 30m /implement-queue`.

## Rails

- One implement-queue session at a time.
- Never force-push `main`; never skip CI checks or pre-commit hooks.
- One issue per PR, one PR per agent.
- Each agent gets its own worktree — no shared state.
- Discovery (Dependabot, site audit, Sentry) lives in `/ci-monitor`, `/site-audit`, `/sentry-triage` — they feed this queue; this skill only drains it.

## Labels (state machine)

| Label          | Meaning                                               |
| -------------- | ----------------------------------------------------- |
| `ready`        | Available for pickup                                  |
| `in-progress`  | Agent working on it                                   |
| `has-pr`       | PR created, awaiting merge train                      |
| `needs-review` | Draft PR from partial work — human review             |
| `agent-failed` | Agent could not complete — manual review or retry     |
| `stealable`    | Failed twice — needs different approach or human help |
| `ci-fix`       | CI failure or security vulnerability                  |
| `feature`      | New feature (created by `/decompose`)                 |
| `audit`        | Found by site-audit                                   |
