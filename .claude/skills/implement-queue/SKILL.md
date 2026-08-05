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

1. **Wait for PR-level CI green.** Poll until CI Gate passes:

   ```bash
   gh pr checks <N> --watch
   ```

2. **Low-risk fast path — gated on tier first.** A file-glob match alone is never sufficient: a `.github/workflows/**` change (e.g. to `ci.yml` or `merge-queue.yml` itself) must not skip review just because it lives under `.github/**`. Before checking file globs, gate on the PR's tier label with the same tested function `merge-queue.yml` uses (#3796) — never re-derive the tier check inline:

   ```bash
   gh pr view <N> --json labels -q '[.labels[].name]'   # → labelNames
   ```

   ```js
   import { isAutoMergeEligible } from "./scripts/merge-queue-eligibility.mjs";

   const decision = isAutoMergeEligible(labelNames);
   ```

   If `decision.eligible` is `false` (most commonly a blocked tier — `tier:standard`/`tier:sensitive`/`tier:critical`, see `BLOCKED_TIER_LABELS`), the fast path is off-limits regardless of file glob — fall through to step 3 (Reviewer sub-agent), which itself lands back at the same gate in step 5 before enqueue.

   Only when `decision.eligible` is `true` AND ALL changed files (`gh pr diff <N> --name-only`) are tests (`*.test.*`/`*.spec.*`), docs (`*.md`, `docs/**`), dependency manifests (`package.json`, lockfiles), or config (`.github/**`, `.claude/**`, `turbo.json`, `*.config.*`) — skip review and enqueue immediately:

   ```bash
   gh pr merge <N> --auto --squash --delete-branch
   ```

   (`isLowRiskPR` in `@mbe/agent-core` implements the file-glob check; `reviewersForDiff` is its sibling.) Move to the next PR.

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

4. **Diff-matched specialized review gate.** For each reviewer returned by `reviewersForDiff(changedFiles)` (`migration-reviewer`, `adr-compliance-reviewer`, `rialto-prop-drift-detector`, `dependency-update-reviewer`), dispatch via Agent tool against the PR diff. CI can't catch a drop-column migration paired with code that still reads the column, or an ADR violation that isn't a regex match — these can. **A `block` verdict holds the PR.** Most PRs match 0–1 reviewers.

5. **On all-pass verdict:** before enqueuing, re-check the tier gate — `tier-classifier` can (re)label the PR any time up to this point, and neither the Reviewer nor a specialized reviewer's verdict says anything about tier:

   ```bash
   gh pr view <N> --json labels -q '[.labels[].name]'   # → labelNames
   ```

   ```js
   import { isAutoMergeEligible } from "./scripts/merge-queue-eligibility.mjs";

   const decision = isAutoMergeEligible(labelNames);
   ```

   Only when `decision.eligible` is `true`, enqueue:

   ```bash
   gh pr merge <N> --auto --squash --delete-branch
   ```

   GitHub merges once CI Gate is green and the branch is up to date. The session does not wait — it moves to the next PR (or Phase 3). If `decision.eligible` is `false`, do NOT enqueue — apply the blocking-tier outcome documented in step 6 below instead.

6. **On `"flag"` verdict (Reviewer) or `block` (specialized reviewer):** apply the retry policy (default: one retry — dispatch a new worker session on the same branch with `--no-pr`; if retry also flags, label the linked issue `needs-review` and **do not enqueue**). See [Reviewer Contract](./.claude/skills/implement-queue/REVIEWER_CONTRACT.md) for the full policy.

   **On a blocking tier (`isAutoMergeEligible` returned `eligible: false` in step 2 or step 5):** same terminal outcome as above — label the linked issue `needs-review` and **do not enqueue**. Skip the retry loop: a `tier:standard`/`tier:sensitive`/`tier:critical` label reflects what changed, not a defect a retried worker session can fix — per `docs/change-tiers.md`, only Matt's personal approval clears it.

   **Manual verification path (after `needs-review`):** the Reviewer's full output is in the PR comment. A human (or a new agent session pointed at the issue) reads the flagged issues, fixes the code, pushes to the branch, and manually enqueues with `gh pr merge <N> --auto --squash --delete-branch` once satisfied.

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
- More `ready` issues and time/budget remain → back to Phase 0.
- **Circuit breaker:** 3 consecutive failures (agents or merge-train CI) → release the lock(s), then stop and report.
- **Persist telemetry before stopping:** if `metrics/queue-telemetry.jsonl` has uncommitted appended rows (`git diff --stat -- metrics/queue-telemetry.jsonl`), commit ONLY that path on a branch and open a PR titled `chore(metrics): queue telemetry <YYYY-MM-DD>` labeled `has-pr` (auto-merges via the low-risk fast path). Ephemeral cloud checkouts lose uncommitted rows forever.
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
