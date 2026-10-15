---
merge: auto
max_workers: 3
required_check: CI Gate
hold_labels: [needs-review]
priority: [security, ci-fix, feature, audit]
---

# Implement-queue profile — mattbutlerengineering

This repo's queue profile for the `idea-to-prod` plugin's
[`implement-queue`](https://github.com/mattbutlerengineering/skills/blob/main/skills/implement-queue/SKILL.md)
skill. The skill is the loop; every section below is a **hook** it reads by
name. The frontmatter is the Owner's standing consent to auto-merge
(`merge: auto`, skills ADR-0087): a PR merges only with `CI Gate` present and
green, every reviewer passing, no `needs-review` label, and no gate-path file
(`docs/adr/**`, `docs/design/**`, `**/prd.md`, `**/architecture.md`).

Cloud routines and GitHub Actions cannot load the plugin (#6332), so they clone
the public skills repo and follow `skills/implement-queue/SKILL.md` by path,
with this file as the profile. Local sessions run `/idea-to-prod:implement-queue`
(recurring: `/loop 30m /idea-to-prod:implement-queue`).

**Priority principle: Security > CI fixes > Features > Audit findings.** Security
covers `fix(security):` titles and Dependabot-sourced `ci-fix`.

## preflight

```bash
gh run list --branch main --limit 5 --json status,conclusion,name,databaseId \
  | jq '[.[] | select(.conclusion == "failure")]'
```

Any entry means main is red (green-main policy): fixing it IS the iteration.

## transition

State transitions (`ready`/`in-progress`/`has-pr`/`agent-failed`/`agent-skip`) always go through `mbe issue transition <N> --to <state>` — it wraps `@mbe/gh-client`'s tested label machine, the single source of truth for which labels come off on each edge. If `mbe` isn't on PATH (fresh worktree/CI), build once: `pnpm build --filter @mbe/cli...`, then `node tools/cli/dist/index.js issue transition <N> --to <state>`.

## compose

**Compose the batch — spread across zones (ADR-023, amended by ADR-027).** Feed the priority-sorted, independence-filtered candidates into `selectZoneSpreadBatch` (`scripts/issue-zone.mjs`) so the batch maximizes **distinct** merge-train zones. Same-zone stacking incurs an N² `update-branch`/CI re-run tax against `strict` main (ADR-016): each merge makes its siblings out-of-date. The selector consumes the priority tiers as its input order (security > ci-fix > feature > audit), takes at most one issue per zone when main is strict (`null` = global counts as a single occupancy — two globals are never co-scheduled), and defers same-zone surplus to a later batch.

**Probe main's strictness every iteration** (branch protection is repo state, not code) with `scripts/main-strictness.mjs` and pass the result as `strictMain`. The probe fails closed: only a successfully parsed literal `strict: false` yields `strictMain: false`; an error, non-JSON, or missing field yields `true`. When `strictMain` is `false`, a zone may admit further issues whose extracted file paths are non-empty and prefix-aware disjoint from those already admitted in that zone; the per-zone merge-train lock still serializes the merges themselves.

```js
import { selectZoneSpreadBatch } from "./scripts/issue-zone.mjs";
import { probeMainStrictness } from "./scripts/main-strictness.mjs";

// `ready` = candidates already priority-sorted (Sort above) and
// independence-filtered, each { number, title, labels, body }.
const { strictMain } = probeMainStrictness(); // CLI: node scripts/main-strictness.mjs
const batch = selectZoneSpreadBatch(ready, { maxWorkers: 3, strictMain });
// → ≤3 issues, priority order preserved; distinct zones when strict.
```

Each issue's zone is estimated from its conventional-commit scope via `issueZone(issue)`, which reuses the shared zone vocabulary (`scripts/zone-vocabulary.mjs`, `WORKSPACE_ROOTS` + `zoneForPath`) — there is no second, divergent zone list.

## base-freshness

**Before dispatching, verify this checkout's own base** — worktrees are cut from its object store, so its staleness is inherited by every worker (measured 2026-09-20: the main checkout sat 368 commits behind `origin/main` with a divergent local commit, and every worktree cut from it started there):

```bash
node scripts/worktree-base-freshness.mjs check
# exit 0 -> base shares history with a recent origin/main
# exit 1 -> "unrelated" | "stale" | "unknown", all fail closed
```

On exit 1, remediate before dispatching — for a worker starting fresh work the fix is `git fetch origin && git reset --hard origin/main`, which is also exactly what the worker's own step 0 re-runs in its worktree. This is the same fail-closed posture as `scripts/agent-core-build-freshness.mjs check` in the worker→train boundary below, on a different input: `unrelated` (#5296 — no common ancestor, so `git merge` answers `fatal: refusing to merge unrelated histories` and `gh pr update-branch` cannot repair it) must never be softened into `stale`, and an undeterminable base is never read as usable.

## model

```bash
mbe check-model --issue <N>   # prints the tier on stdout (model ID/reason on stderr)
```

It honors an explicit `model:` in the issue's ```yaml agent block, otherwise routes by labels + title + body via `model-router.ts` (single source of truth — no inline copy of the rules here).

Dispatch one subagent per issue — **all in a single message** — using the Agent tool with `subagent_type: "implement-queue-worker"`, `isolation: "worktree"`, and `model:` set to the resolved **tier** from `check-model` (`opus`/`sonnet`/`haiku` — the Agent `model:` parameter is a tier enum, not a full model ID). (If `check-model` fails for an issue, omit `model:` — the worker's `sonnet` default applies.)

**Adapter by tier** — when the worker prompt calls `mbe agent run` internally (e.g. for sub-tasks):

- `haiku` / `sonnet` tiers: use `--adapter auto` — enables rate-limit failover cascade (claude → gemini → opencode on 429), preventing stalls on busy days.
- `opus` tier: pin `--adapter claude` — stays on the Claude provider; failover to gemini/opencode is inappropriate for deep architecture tasks.

## worker

Dispatch with `subagent_type: "implement-queue-worker"` (`.claude/agents/implement-queue-worker.md`),
`isolation: "worktree"`, and `model:` set to the tier from the `model` hook.

**Dispatch is decoupled from the merge train.** Spawning workers must NEVER wait on the merge-train lock — a long merge train for one zone should not stall picking up fresh `ready` issues. Dispatch is gated **only** by worker capacity: dispatch another worker while fewer than 3 are active (the same "claim up to 3" batch size), independent of any in-flight merge train.

Each agent prompt MUST include:

1. The issue number, title, and full body.
2. **First step: `node scripts/worktree-base-freshness.mjs check`, then `pnpm install --frozen-lockfile`** (a worktree's base can be stale or disconnected; worktrees also have no `node_modules`).
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

## ci-status

**Wait for PR-level CI green — but first assert `CI Gate` actually exists.** `gh pr checks <N> --watch` reports `fail=0 pend=0` both when CI is genuinely green AND when the `pull_request` event never fired at all (a real, observed transient GitHub-side failure — see #3969; PR #3968 opened with zero `pull_request` runs, only an unrelated `pull_request_target` Dependabot skip, and sat `BLOCKED` with nothing red). Those two states are not the same and must not be conflated: classify the rollup with `classifyCiGateStatus` (`scripts/ci-gate-status.mjs`) before trusting a "green" read.

`classifyCiGateStatus` reads **two sources**, not one: the PR's `statusCheckRollup` (what branch protection's merge evaluation actually reads) and the head SHA's raw check-runs API (`gh api repos/{owner}/{repo}/commits/{sha}/check-runs`, which also picks up `workflow_dispatch`-produced runs the rollup structurally cannot see). The CLI fetches both automatically:

```bash
gh pr checks <N> --watch
node scripts/ci-gate-status.mjs check --pr <N>   # → {"state": "green"|"failed"|"pending"|"gate-missing"|"gate-unattributed"|"unknown", "reason": "..."}
```

- `state: "green"` → proceed to the `fast-path` hook.
- `state: "failed"` → fix the failure (or `agent-failed` the linked issue if unfixable this iteration); do not enqueue.
- `state: "pending"` → keep polling; do not enqueue.
- `state: "gate-missing"` → **never enqueue.** `CI Gate` is absent from _both_ the rollup and the head-SHA check-runs — genuinely no CI ran. Dispatch CI directly on the branch and re-run the classifier — this is the documented `workflow_dispatch` escape hatch `ci.yml` already carries a bare trigger for (see `check-ci-dispatch.mjs`):

  ```bash
  gh workflow run ci.yml --ref <branch>
  ```

  Then re-poll from the top of this step. Do not stall silently and do not treat the absence of failures as green.

- `state: "gate-unattributed"` → **never enqueue, and do NOT re-dispatch.** This means `CI Gate` genuinely ran (present in the head-SHA check-runs, possibly via a prior `workflow_dispatch`) but is absent from `statusCheckRollup` — the source branch protection's merge evaluation actually reads. Confirmed live on PR #4011 (#4023): `gh pr merge --auto` was accepted with a dispatch-produced `CI Gate: success` on the head SHA, and the PR sat `mergeStateStatus=BLOCKED` for 6+ minutes without merging. **The `workflow_dispatch` escape hatch above does NOT unblock a PR by itself** — it produces a check run neither the rollup nor branch protection counts, so dispatching again on a `gate-unattributed` PR cannot help; the new run is just as invisible. This state needs a human, or the separate (not-yet-implemented) fix of `ci.yml` publishing a commit _status_ named `CI Gate` in addition to the check run.

  **#4028 fix:** this state used to be masked whenever the rollup had ANY other entry not yet `COMPLETED` — a genuinely in-flight check (e.g. CodeQL still running) is expected to self-heal, but a check permanently parked awaiting external approval (`WAITING` — the rollup-visible GraphQL `CheckStatusState` for #3684's `action_required` failure mode; verified `ACTION_REQUIRED` itself is a `conclusion`, only ever set alongside `status: "COMPLETED"`, so it was never the masking culprit) never resolves, and the classifier reported `pending` forever instead of escalating. `classifyCiGateStatus` now excludes only that structurally-non-progressing status from its "still running" check, so a parked unrelated check no longer hides `gate-unattributed` — a genuinely in-flight one still reports `pending` as before (pinned by a regression test using PR #4027's measured live shape: ~29 checks in flight, no `CI Gate` entry yet, must NOT read as `gate-unattributed`).

- `state: "unknown"` → **never enqueue, and do NOT re-dispatch.** `CI Gate` is absent from the rollup and the head-SHA check-runs fetch itself failed, so `gate-missing` (re-dispatch) cannot be told apart from `gate-unattributed` (abstain) — abstain. Re-poll; escalate if it persists (#6290).

## fast-path

**Low-risk fast path.** `tier:*` labels do **not** gate implement-queue's merges — see [No tier hold](#no-tier-hold) below. Check the `needs-review` label, which still holds a PR:

```bash
gh pr view <N> --json labels -q '[.labels[].name]'   # → labelNames
```

If `needs-review` is present, the fast path is off-limits — fall through to the `reviewers` hook (Reviewer sub-agent).

**Before the first classifier call this iteration, verify the built `@mbe/agent-core` dist is trustworthy.** Both `isLowRiskPR` and `reviewersForDiff` (the `reviewers` hook's specialist gate) run from the **built** `packages/agent-core/dist/` — gitignored, so a session inherits whatever the last build in this checkout produced. A stale dist doesn't error; it exports working functions that return confident, wrong (narrower) answers — on PR #3988 a 77-minute-stale dist made `reviewersForDiff` return `[]` for a diff that should have dispatched `e2e-selector-drift-reviewer` (#3989). Run once per session before trusting either function:

```bash
node scripts/agent-core-build-freshness.mjs check
# exit 0 -> dist proven newer than every src/** file (rebuilt automatically if it wasn't) — safe to classify
# exit 1 -> still can't prove freshness after a rebuild attempt — FAIL CLOSED (see below)
```

`exit 1` means: do **not** trust `isLowRiskPR`/`reviewersForDiff` for this PR at all. Skip the fast path unconditionally (fall through to the `reviewers` hook) and treat its specialist gate as if every specialist reviewer applies — dispatch the full reviewer set rather than trusting an empty/narrow `reviewersForDiff` result. A dist that fails to prove itself fresh must never be read as "low risk" or "no specialists match".

Only when `needs-review` is absent, no changed file matches a gate path (`docs/adr/**`, `docs/design/**`, `**/prd.md`, `**/architecture.md` — those always hold for a human merge, ADR-0087), the freshness check exited 0, AND `qualifiesForLowRiskFastPath(changedFiles)` (`@mbe/agent-core`, `gh pr diff <N> --name-only` for `changedFiles`) returns `true` — skip review and enqueue immediately:

```bash
gh pr merge <N> --auto --squash --delete-branch
```

`qualifiesForLowRiskFastPath` requires **both** `isLowRiskPR(files)` **and** `reviewersForDiff(files).length === 0` — the specialist gate wins. `isLowRiskPR` and `reviewersForDiff` are independent functions over the same file list and can both fire on the same diff: a pure dependency bump (every file matches `isLowRiskFile` in `packages/agent-core/src/file-classifier.ts`) can simultaneously match `dependency-update-reviewer` via `reviewersForDiff` (`packages/agent-core/src/pr-risk-classifier.ts`) — PR #4058 is exactly this shape. Calling `isLowRiskPR` alone would enqueue that PR with zero review, silently dropping the specialist its own sibling function selected (#4063). A low-risk-but-specialist-matched PR falls through to step 4 (specialists) even though step 3's universal reviewer is still skipped. This doc intentionally does not enumerate the underlying globs so the doc and the code cannot drift apart (see #3887, #3916) — `qualifiesForLowRiskFastPath` is the single composed predicate; reference it here rather than restating the two-part boolean. Move to the next PR.

## reviewers

**Reviewer sub-agent (non-low-risk PRs).** Build `ReviewInput` from the PR diff and dispatch:

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

- The full [Reviewer Contract](../docs/agents/reviewer-contract.md)
- The serialised `ReviewInput` (diff, verification output, task description,
  acceptance criteria, changed files, commit message)

**On timeout/error:** record `reviewer_verdict: "error"` on the issue's
telemetry row, re-dispatch once, and if that also errors **hold the PR for a
human — do not enqueue** (the plugin skill's rule, ADR-0087; this repo used to
fail open here, and a reviewer dispatch that died on host sleep let a real
defect through). The `error` value is load-bearing: a dispatch that never
resolved is not a review, and recording it as `pass` is indistinguishable from
a real one.

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

**Diff-matched specialized review gate.** Reuses the same freshness check from the `fast-path` hook — do not call `reviewersForDiff` again against an untrusted dist. For each reviewer returned by `reviewersForDiff(changedFiles)` (`packages/agent-core/src/pr-risk-classifier.ts` — the single source of truth for which specialist covers which changed-file pattern; this doc intentionally does not enumerate them so the two cannot drift apart, see #3916), dispatch via Agent tool against the PR diff. CI can't catch a drop-column migration paired with code that still reads the column, or an ADR violation that isn't a regex match — these can. **A `block` verdict holds the PR.** Most PRs match 0–1 reviewers. Apply the same before/after `git status --porcelain` guard from step 3 to each specialist dispatch — snapshot before, compare after, treat any mismatch as a failed review and re-dispatch rather than trusting a verdict from a reviewer that mutated the tree it read.

## merge-command

**On all-pass verdict:** enqueue immediately — a review-gate pass plus green CI is the whole bar, unless a changed file matches a gate path (`docs/adr/**`, `docs/design/**`, `**/prd.md`, `**/architecture.md`), which holds the PR for a human merge:

```bash
gh pr merge <N> --auto --squash --delete-branch
```

GitHub merges once CI Gate is green and the branch is up to date. The session does not wait — it moves to the next PR (or Phase 3). Do **not** re-check `tier:*` here; see [No tier hold](#no-tier-hold).

**If the merge call itself is denied by the session runtime** (`denied, reason: [Merge Without Review]` — seen in Claude Code Remote sessions, #6125): do not retry it, via this or any other tool, for the rest of the session. Post the review verdict as a PR comment and record the PR as "reviewed, green, awaiting human merge" in the run summary, then continue with the remaining PRs' review gates. See [gotchas.md § Claude Code Remote](rules/gotchas.md#claude-code-remote--cloud-sessions).

**On `"flag"` verdict (Reviewer) or `block` (specialized reviewer):** apply the retry policy (default: one retry — dispatch a new worker session on the same branch with `--no-pr`; if retry also flags, label the linked issue `needs-review` and **do not enqueue**). See [Reviewer Contract](../docs/agents/reviewer-contract.md) for the full policy.

**Manual verification path (after `needs-review`):** the Reviewer's full output is in the PR comment. A human (or a new agent session pointed at the issue) reads the flagged issues, fixes the code, pushes to the branch, and manually enqueues with `gh pr merge <N> --auto --squash --delete-branch` once satisfied.

### No tier hold

<a id="no-tier-hold"></a>

**`tier:standard` / `tier:sensitive` / `tier:critical` do NOT block a merge from implement-queue.** Matt's standing policy (2026-07-12, reaffirmed 2026-08-06): a PR that passes the review gate with green CI merges without waiting for a human.

The distinction that matters is **reviewed vs. unreviewed**, not tier:

| Path                             | Review gate                         | Tier blocks?                |
| -------------------------------- | ----------------------------------- | --------------------------- |
| `implement-queue` (this profile) | Reviewer + diff-matched specialists | **no**                      |
| `merge-queue.yml`                | none                                | yes (`isAutoMergeEligible`) |
| `auto-merge.yml`                 | none                                | yes (see #3857)             |

`docs/change-tiers.md`'s "T2+ requires Matt's personal approval" is **advisory for agent sessions that run the review gate**, and binding for the unreviewed workflow paths. `isAutoMergeEligible` still exists and is still correct — it just isn't this skill's gate. Do not reintroduce a tier check into Phase 2; it deadlocked the queue on 2026-08-06 (three review-gate-passed PRs parked, nothing merged).

What still holds a PR: a `flag` verdict (Reviewer), a `block` verdict (specialized reviewer), a reviewer that errored again after one re-dispatch, a changed gate-path file, a `needs-review` label, or red CI Gate.

## update-branch

1. **Update branch:** `gh pr update-branch <N>` — **unless `package.json` changed on either side**. In that case update-branch can desync `pnpm-lock.yaml` and break main post-merge; instead rebase the branch locally, run `pnpm install --lockfile-only`, commit, push.

The PR re-enters GitHub's auto-merge flow and merges once CI Gate is green on the updated branch.

If CI fails on the updated branch: one fix attempt in the main session (small fixes) or create a `ci-fix` issue and label the original `agent-failed`. Counts toward the circuit breaker.

## lock

PRs are pre-enqueued (with `--auto`) in Phase 2 after the review gate passes. Phase 3 **unsticks stragglers** — PRs that fell behind `main` after a sibling merged (GitHub will not auto-merge an out-of-date branch). **At most one update-branch may run per zone across all sessions** — concurrent branch-updates in the same zone can collide. This is enforced by a per-zone lock, not the honor system. Non-overlapping zones (e.g. `apps/hospitality` vs `packages/rialto`) update concurrently.

### Acquire the merge-train lock (before updating branches)

The lock lives in the shared git common dir, so it is visible to every worktree/session of this repo. The guard is `scripts/merge-train-lock.mjs`, a CLI keyed by a **durable owner token** (the session id) — not a PID. Every call is a short-lived `node` process, so a PID would be dead before the next session looked; the owner is whatever string you pass as `--owner`. Staleness is mtime-only (45-min window, kept alive by `heartbeat`). `release` and `heartbeat` only act for the owner that holds the lock.

**Session id (owner token).** Use the Claude Code session id, `$CLAUDE_CODE_SESSION_ID`. If it is unset, generate one id ONCE at the start of the session (`SESSION_ID=$(uuidgen)`) and reuse that same value for every `acquire`/`heartbeat`/`release` — a fresh id per call defeats the lock.

**Pick the zone from the PR's changed files** with `zoneForPaths()` (`scripts/zone-vocabulary.mjs`). A PR confined to one workspace area (`apps/<x>`, `packages/<x>`, `services/<x>`, or `root` for top-level/config/docs/scripts) locks only that zone; a cross-cutting PR (`zoneForPaths` returns `null`) takes the **global** lock (omit `--zone`), serializing against everything — the safe, conservative default.

```bash
OWNER="${CLAUDE_CODE_SESSION_ID:-$SESSION_ID}"   # one id per session, never per call

# ZONE from: zoneForPaths(<gh pr diff <N> --name-only>)  (omit --zone when null)
node scripts/merge-train-lock.mjs acquire --zone "$ZONE" --owner "$OWNER"
# exit 0 → {"acquired":true,"owner":"…"}   exit 1 → {"acquired":false,"owner":"<holder>"}
```

Exit codes (all three subcommands): `0` success, `1` refused (held by another owner / you are not the owner), `2` usage error. Output is one JSON object.

If `acquire` exits `1`, **skip updating branches in that zone** and continue with PRs in other (acquirable) zones; report the blocked zone's PR state in monitor-only mode. Do NOT `update-branch` a PR whose zone lock is held by another owner. Re-acquiring a lock you already own is idempotent.

If `acquire` exits `0`: run `node scripts/merge-train-lock.mjs heartbeat --zone "$ZONE" --owner "$OWNER"` at the **start of each PR iteration** for that zone (keeps a legitimately long train from being reclaimed), and **release it when the train ends** — on completion, on circuit-break, or on any abort:

```bash
node scripts/merge-train-lock.mjs release --zone "$ZONE" --owner "$OWNER"
```

## reap

- **Release every merge-train lock you acquired** (`node scripts/merge-train-lock.mjs release --zone "$ZONE" --owner "$OWNER"`, once per zone you locked in Phase 3) before looping or stopping. (A crash leaves a lock for the 45-min staleness reclaim; releasing explicitly frees the next session immediately.)
- **Reap merged workers' worktrees.** A successful worker's worktree is never auto-removed (Claude Code's `isolation: "worktree"` only reclaims an _unchanged_ worktree, and every successful worker commits) — #3950. After Phase 3 merges, run the reaper to reclaim any now-eligible `.claude/worktrees/*` worktree — both `agent-*` and hand-created:

  ```bash
  DRY_RUN=false node scripts/reap-worktrees.mjs
  ```

  Its safety gate (`decideWorktreeReap` in `scripts/reap-worktrees.mjs`) refuses any worktree with an open PR, a live owning process, or recent filesystem activity — see the module header for the liveness definition. Beyond those refusals, EVERY worktree (agent and hand-created alike, since 2026-08-28) needs positive merged-PR evidence (`gh pr list --state all` reporting a non-null `mergedAt`, never git ancestry — PRs squash-merge) before it's eligible; no evidence means it's retained, fail closed (#4122 for hand-created; a live worker measured reaped through all three absence-of-evidence gates extended the same rule to agent worktrees). Known cost: a worker that dies before pushing, or whose PR closes unmerged, is never auto-reaped — sweep those by hand. Worktrees registered outside `.claude/worktrees/`, or present on disk but never registered with git, are reported in the summary but never touched. Dry-run by default; safe to run every iteration, a no-op when nothing is eligible.

- More `ready` issues and time/budget remain → back to Phase 0.
- **Circuit breaker:** 3 consecutive failures (agents or merge-train CI) → release the lock(s), then stop and report.
- **Persist telemetry before stopping:** if `metrics/queue-telemetry.jsonl` has uncommitted appended rows (`git diff --stat -- metrics/queue-telemetry.jsonl`), commit ONLY that path on a branch and open a PR titled `chore(metrics): queue telemetry <YYYY-MM-DD>` labeled `has-pr`. A PR that touches only `metrics/**` satisfies `isLowRiskPR` (see Phase 2 step 2) and auto-merges via the low-risk fast path — but only if every changed file is metrics-only; a mixed diff (e.g. also touching a non-allowlisted file) falls through to the reviewer gate like any other PR. Ephemeral cloud checkouts lose uncommitted rows forever. This step is now best-effort, not the only path: `.github/workflows/metrics-collectors.yml` runs `scripts/collect-queue-telemetry-from-github.mjs` daily on a runner and PRs in a pending row for every merged agent PR the file lacks (#5921). Those rows carry null tokens/tool_uses/duration_ms/model_tier/reviewer_verdict (unrecoverable from GitHub), so persisting the in-session row is still worth doing for full fidelity — the in-session row wins because dedupe is by `pr_number`.
- Report per iteration: issues claimed, PRs created, PRs merged, failures.

Recurring use: `/loop 30m /idea-to-prod:implement-queue`.

## telemetry

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
- `reviewer_verdict` is `pass` | `flag` | `skipped` (low-risk fast path, the `fast-path` hook) | `error` (the reviewer could not run). **Never record a fail-open as `pass`** — `review_coverage` in `scripts/collect-queue-efficiency.mjs` counts only `pass`/`flag` as covered, so an `error` logged as `pass` hides a dead merge gate behind a flattering pass rate.
- The row is idempotent per `(issue_number, pr_number)` — safe to retry on transient errors.
- Outcome fields (`merged`, `merged_at`, `ci_first_pass`, `rework_cycles`) are null at write time; `scripts/reconcile-queue-telemetry.mjs` (run by `/optimize-implement-queue` Step 0) fills them from GitHub later.
- `metrics/queue-telemetry.jsonl` is a **tracked file** (merge=union) — rows appended in ephemeral checkouts must be committed before the session ends (see Phase 4).
- `cost_usd`, when provided, lets `collect-queue-efficiency.mjs` use precise per-issue cost instead of the coarse ccusage-daily ÷ issues estimate.
- **This row is the worker's spend record (#5885).** Agent-tool workers never enter `@mbe/agent-core`, so `recordSpend` and `.claude/agent-spend/sessions.jsonl` never see them. The `agentCost` sensor (`scripts/sensors-registry.mjs`) reads `subagent_tokens`/`cost_usd` from this row instead. Always pass the completion `<usage>` tokens. Never also call `recordSpend` for a worker (that counts it twice), and never estimate `cost_usd` from tokens: leave it `null` when `<usage>` has no cost. `scripts/__tests__/queue-spend-attribution.test.mjs` runs the snippet above verbatim and fails if the row stops being attributed.

## Labels

`stealable` is applied raw (not through `mbe issue transition`). `ci-fix`,
`feature` (from `/decompose`) and `audit` (from `/site-audit`) feed the
priority order. Discovery lives in `/ci-monitor`, `/site-audit` and
`/sentry-triage`; they feed this queue.
