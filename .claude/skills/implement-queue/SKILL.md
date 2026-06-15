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

**Claim up to 3:**

```bash
gh issue edit <N> --add-label "in-progress" --remove-label "ready"
```

## Phase 2: Implement in Parallel

**Resolve each issue's model first.** Per-issue routing beats a one-size model — trivial deps/docs run on haiku, complex refactors on opus-4.8:

```bash
mbe check-model --issue <N>   # prints the tier on stdout (model ID/reason on stderr)
```

It honors an explicit `model:` in the issue's ```yaml agent block, otherwise routes by labels + title + body via `model-router.ts` (single source of truth — no inline copy of the rules here).

Dispatch one subagent per issue — **all in a single message** — using the Agent tool with `subagent_type: "implement-queue-worker"`, `isolation: "worktree"`, and `model:` set to the resolved **tier** from `check-model` (`opus`/`sonnet`/`haiku` — the Agent `model:` parameter is a tier enum, not a full model ID). (If `check-model` fails for an issue, omit `model:` — the worker's `sonnet` default applies.)

Each agent prompt MUST include:

1. The issue number, title, and full body.
2. **First step: `pnpm install --frozen-lockfile`** (worktrees have no `node_modules`).
3. TDD: failing test first, then minimal implementation, per vertical slice.
4. Gates on affected packages before declaring done: `pnpm lint`, `pnpm typecheck`, `pnpm test` (vitest does NOT typecheck — typecheck is mandatory).
5. Push branch and open a PR with `Closes #<N>` in the body; **verify the PR's base ref is `main`** (worktree agents can branch from the wrong base). Do NOT merge.
6. Security rules (non-negotiable):
   > Never introduce hardcoded secrets, SQL injection, XSS, or other OWASP Top 10 vulnerabilities. Never commit `.env` files, credentials, or tokens. Parameterized queries only. Validate external data at boundaries. If you discover an existing vulnerability, stop feature work and fix it first.

**Outcome labels as each agent finishes:**

| Outcome                      | Labels                               |
| ---------------------------- | ------------------------------------ |
| PR created, gates green      | `has-pr`, remove `in-progress`       |
| Partial work (draft PR)      | `needs-review`, remove `in-progress` |
| No usable changes            | `agent-failed`, remove `in-progress` |
| Second failure on same issue | add `stealable`                      |

## Phase 3: Serial Merge Train

Merge one PR at a time, oldest green first. **Exactly one merge train may run at a time across all sessions** — concurrent trains race and duplicate-fix the same branch, burning CI runs and tokens. This is enforced by a lock, not the honor system.

### Acquire the merge-train lock (before merging anything)

The lock lives in the shared git common dir, so it is visible to every worktree/session of this repo. Acquisition is an atomic `mkdir`; a lock whose mtime is older than 45 min is treated as crashed and reclaimed.

```bash
LOCK="$(git rev-parse --git-common-dir)/mbe-merge-train.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +45 2>/dev/null)" ]; then
    rm -rf "$LOCK" && mkdir "$LOCK"        # stale (>45m, crashed owner) → reclaim
  else
    echo "merge-train lock held by another session — SKIP Phase 3 this iteration."
    # Do NOT run the merge train. Drop to monitor-only (report open PR state) and
    # go to Phase 4. Another session owns the train; racing it is the bug we are preventing.
  fi
fi
```

If you did not acquire the lock, **skip the entire merge loop below** and proceed to Phase 4 in monitor-only mode (report PR state; merge nothing).

If you did acquire it: `touch "$LOCK"` at the **start of each PR iteration** as a heartbeat (keeps a legitimately long train from being reclaimed), and **release it when the train ends** — on completion, on circuit-break, or on any abort:

```bash
rm -rf "$LOCK"
```

For each green PR (lock held):

1. **If behind main:** `gh pr update-branch <N>` — **unless `package.json` changed on either side**. In that case update-branch can desync `pnpm-lock.yaml` and break main post-merge; instead rebase the branch locally, run `pnpm install --lockfile-only`, commit, push.
2. Wait for CI (`gh pr checks <N> --watch` or poll).
3. **Reviewer sub-agent (non-low-risk PRs only).** Before the specialized diff-matched reviewers, run the general-purpose Reviewer sub-agent:

   ```bash
   gh pr diff <N>   # → diff for ReviewInput
   gh pr diff <N> --name-only   # → changedFiles for ReviewInput
   ```

   Build a `ReviewInput` from the worker output and dispatch the Reviewer
   via the Agent tool with `subagent_type: "reviewer"`, `isolation: "none"`,
   model: `haiku` (or `sonnet` for security-sensitive changes), budget: `$0.05`.

   The Reviewer's prompt MUST include:
   - The full [Reviewer Contract](../.claude/skills/implement-queue/REVIEWER_CONTRACT.md)
   - The serialised `ReviewInput` (diff, verification output, task description,
     acceptance criteria, changed files, commit message)

   **On `"flag"` verdict:** apply the retry policy (see contract — default:
   one retry, then file issue). Label the linked issue accordingly and
   **do not merge this PR** — move to the next PR in the train.

   **On timeout/error:** log warning, proceed to merge (fail-open).

   After the Reviewer passes, proceed to the specialized reviewers.

4. **Diff-matched specialized review gate.** Compute the reviewers for the diff:

   ```bash
   gh pr diff <N> --name-only   # → reviewersForDiff() in @mbe/agent-core maps these to reviewer agents
   ```

   For each returned reviewer (`migration-reviewer`, `adr-compliance-reviewer`, `rialto-prop-drift-detector`, `dependency-update-reviewer`), dispatch it via the Agent tool with that `subagent_type` against the PR diff. CI can't catch a drop-column migration paired with code that still reads the column, or an ADR violation that isn't a regex match — these can. **A reviewer `block` verdict holds the PR:** label the linked issue `needs-review`, skip the merge, move to the next PR. Most PRs match 0–1 reviewers.

5. `gh pr merge <N> --auto --squash --delete-branch` — **`main` requires the GitHub merge queue**, so `--auto` adds the PR to the queue rather than merging directly (a bare `gh pr merge --squash` is rejected). GitHub then builds the `merge_group`, runs `CI Gate` against it, and squash-merges when green; the linked issue closes via `Closes #N`. You do **not** need to `update-branch` first (step 1) or pre-merge-wait — the queue rebases and tests each entry. Enqueue the reviewed PR and move on; the queue serialises the actual merges.

**Low-risk fast path:** if ALL changed files (`gh pr diff <N> --name-only`) are tests (`*.test.*`/`*.spec.*`), docs (`*.md`, `docs/**`), dependency manifests (`package.json`, lockfiles), or config (`.github/**`, `.claude/**`, `turbo.json`, `*.config.*`) — skip the review gate and merge immediately on green, even mid-batch. (`isLowRiskPR` in `@mbe/agent-core` implements this check; `reviewersForDiff` is its sibling.)

If CI fails on a PR: one fix attempt in the main session (small fixes) or create a `ci-fix` issue and label the original `agent-failed`. Counts toward the circuit breaker.

## Phase 4: Loop or Stop

- **Release the merge-train lock** (`rm -rf "$(git rev-parse --git-common-dir)/mbe-merge-train.lock"`) before looping or stopping — if you acquired it in Phase 3. (A crash leaves it for the 45-min staleness reclaim; releasing explicitly frees the next session immediately.)
- More `ready` issues and time/budget remain → back to Phase 0.
- **Circuit breaker:** 3 consecutive failures (agents or merge-train CI) → release the lock, then stop and report.
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
