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

Merge one PR at a time, oldest green first. Never merge two PRs concurrently and never run two implement-queue sessions at once — concurrent merge trains race and duplicate-fix branches.

For each green PR:

1. **If behind main:** `gh pr update-branch <N>` — **unless `package.json` changed on either side**. In that case update-branch can desync `pnpm-lock.yaml` and break main post-merge; instead rebase the branch locally, run `pnpm install --lockfile-only`, commit, push.
2. Wait for CI (`gh pr checks <N> --watch` or poll).
3. **Diff-matched review gate (non-low-risk PRs only).** Compute the reviewers for the diff:

   ```bash
   gh pr diff <N> --name-only   # → reviewersForDiff() in @mbe/agent-core maps these to reviewer agents
   ```

   For each returned reviewer (`migration-reviewer`, `adr-compliance-reviewer`, `rialto-prop-drift-detector`, `dependency-update-reviewer`), dispatch it via the Agent tool with that `subagent_type` against the PR diff. CI can't catch a drop-column migration paired with code that still reads the column, or an ADR violation that isn't a regex match — these can. **A reviewer `block` verdict holds the PR:** label the linked issue `needs-review`, skip the merge, move to the next PR. Most PRs match 0–1 reviewers.

4. `gh pr merge <N> --squash --delete-branch` — the linked issue closes via `Closes #N`.

**Low-risk fast path:** if ALL changed files (`gh pr diff <N> --name-only`) are tests (`*.test.*`/`*.spec.*`), docs (`*.md`, `docs/**`), dependency manifests (`package.json`, lockfiles), or config (`.github/**`, `.claude/**`, `turbo.json`, `*.config.*`) — skip the review gate and merge immediately on green, even mid-batch. (`isLowRiskPR` in `@mbe/agent-core` implements this check; `reviewersForDiff` is its sibling.)

If CI fails on a PR: one fix attempt in the main session (small fixes) or create a `ci-fix` issue and label the original `agent-failed`. Counts toward the circuit breaker.

## Phase 4: Loop or Stop

- More `ready` issues and time/budget remain → back to Phase 0.
- **Circuit breaker:** 3 consecutive failures (agents or merge-train CI) → stop and report.
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
