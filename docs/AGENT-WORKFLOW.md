# AI Agent Issue Workflow

How AI agents autonomously find, fix, and verify issues in this repository.

## Issue Lifecycle

```
                  +-----------+
 /site-audit ---->|           |    /issue-worker
 /ci-monitor ---->|   ready   |-----> claimed
 /sentry-triage ->|           |         |
 /decompose ----->+-----------+         v
                       ^          +-----------+
                       |          |in-progress|
                  (retry, max 2)  +-----------+
                       |           /         \
                       |      success      failure
                       |         |            |
                       |         v            v
                       |   +---------+  +-------------+
                       +---|  has-pr |  |agent-failed  |
                           +---------+  +-------------+
                                |             |
                           CI passes    (max retries?)
                                |         /        \
                                v       no         yes
                            [CLOSED]    |           v
                                        |    +------------+
                                        +--->|agent-skip  |
                                             +------------+
                                             (manual only)
```

## Label State Machine

### Workflow labels (mutually exclusive)

| Label          | Meaning                       | Set by           | Cleared by                     |
| -------------- | ----------------------------- | ---------------- | ------------------------------ |
| `ready`        | Available for pickup          | Discovery skills | issue-worker (claim)           |
| `in-progress`  | Agent working                 | issue-worker     | issue-worker (complete/fail)   |
| `has-pr`       | PR created, awaiting CI/merge | issue-worker     | ship-loop (merge)              |
| `agent-failed` | Agent could not complete      | issue-worker     | issue-worker (retry) or manual |
| `agent-skip`   | Max retries exhausted         | issue-worker     | Manual only                    |

### Category labels (additive)

| Label              | Source              | Meaning                              |
| ------------------ | ------------------- | ------------------------------------ |
| `audit`            | `/site-audit`       | Lighthouse/Playwright finding        |
| `ci-fix`           | `/ci-monitor`       | CI failure or security vulnerability |
| `feature`          | `/decompose`        | New feature sub-task                 |
| `tracking`         | `/decompose`        | Parent issue (no `ready` label)      |
| `sentry`           | `/sentry-triage`    | Production error from Sentry         |
| `acmm`             | `/acmm-audit`       | AI Codebase Maturity Model gap       |
| `meta-improvement` | `/progress-tracker` | Process improvement suggestion       |

## mbe agent run

The CLI dispatches a Claude Code session in an isolated git worktree.

```bash
mbe agent run "Fix the login bug"        # default: sonnet, $1.00, 50 turns
  --model claude-sonnet-4-6              # model override
  --max-budget 1.50                      # USD budget cap
  --max-turns 50                         # turn limit
  --no-pr                                # skip PR creation
```

What it does:

1. Creates a git worktree (isolated branch)
2. Spawns a Claude Code session with the task
3. Commits changes, pushes, and creates a PR
4. Evaluates the diff against the issue (haiku LLM check)

Built-in resilience:

- **Stuck detection** -- 6 failure patterns, aborts early to save budget
- **Draft PRs on failure** -- partial work preserved for inspection
- **Failure memory** -- past failure context injected on retry

## Ship Loop (`/ship-loop`)

Full autonomous cycle with parallel dispatch. Invoked locally via `/loop 5m /ship-loop` or scheduled via RemoteTriggers.

**Priority: Security > Availability > New features.**

| Phase        | What happens                                                                    | Parallelism            |
| ------------ | ------------------------------------------------------------------------------- | ---------------------- |
| A. Discover  | Health check, Dependabot alerts, smoke audit, check previous PRs, Sentry triage | All parallel           |
| B. Implement | Claim up to 5 issues, launch one worktree agent per issue                       | Up to 5 parallel       |
| C. Verify    | Check CI on previous batch's PRs, merge passing PRs, health-check deploys       | Pipelined with Phase A |
| D. Loop/Stop | Continue if budget remains; circuit breaker after 3 consecutive failures        | --                     |

Key behavior:

- Phase C checks the **previous** iteration's PRs while Phase B works the current batch
- Low-risk PRs (tests, docs, config) are merged immediately on CI pass
- Security issues always get a batch slot regardless of size

## Issue Worker (`/issue-worker`)

Picks up one `ready` issue per invocation (FIFO, oldest first). Prefers `ci-fix` over other labels.

1. **Governor check** -- adaptive cadence governor can skip this cycle
2. **Find issue** -- oldest `ready` issue, excluding `agent-skip`
3. **Check dependencies** -- skip if `Depends on: #N` is still open
4. **Check retries** -- skip and label `agent-skip` if max retries exceeded (default: 2)
5. **Claim** -- swap `ready` to `in-progress`
6. **Delegate** -- `mbe agent run "<task>"` with budget based on complexity
7. **On success** -- label `has-pr`, comment PR link
8. **On failure** -- label `agent-failed` + `ready` (or `agent-skip` if max retries hit)

## CI Monitor (`/ci-monitor`)

Watches GitHub Actions and open PRs for failures.

| Step             | Action                                                           |
| ---------------- | ---------------------------------------------------------------- |
| Check main CI    | `gh run list --branch main --limit 5`                            |
| Diagnose         | Read failed logs, classify as simple or complex                  |
| Auto-fix simple  | `mbe agent run` with $0.50 budget (lint, type errors, snapshots) |
| Escalate complex | Create `ci-fix` + `ready` issue (infra, flaky tests, multi-file) |
| Check open PRs   | Find agent PRs with failing checks, attempt fix                  |

Safety: max 2 auto-fix attempts per run; never modify CI workflow files; never skip tests.

## Site Audit (`/site-audit`)

Three modes for discovering issues via Lighthouse and Playwright.

| Mode    | Trigger    | Scope                                    | Frequency   |
| ------- | ---------- | ---------------------------------------- | ----------- |
| `smoke` | Per-commit | Changed surfaces only                    | Every merge |
| `sweep` | Weekly     | Full zone (rotates across 7 zones)       | Weekly      |
| `scout` | Monthly    | Trend analysis + improvement suggestions | Monthly     |

Creates issues with `audit` + `ready` labels. Regressions also get `ci-fix`.

## Sentry Triage (`/sentry-triage`)

Queries Sentry MCP for production errors, filters by severity/frequency, deduplicates against open issues, creates max 3 `sentry` + `ready` issues per run.

## Learning Loop (`/learning-loop`)

Closed-loop improvement: collect sensor data, detect regressions, verify past fixes, self-tune.

| Step      | What                                                                |
| --------- | ------------------------------------------------------------------- |
| Collect   | Run 7 sensors (ACMM, PRs, cost, CI, Lighthouse, issues, sessions)   |
| Verify    | Check issues closed in last 48h -- reopen if metric did not improve |
| Triage    | Create max 3 issues for new regressions                             |
| Analyze   | Weekly: scan session logs for repeated patterns, propose new skills |
| Self-tune | Track false positive rate and fix effectiveness                     |

## RemoteTriggers (Scheduled Agents)

Managed at https://claude.ai/code/scheduled. All times Pacific.

| Trigger                | Schedule       | Skill                           |
| ---------------------- | -------------- | ------------------------------- |
| `mbe-deep-audit`       | Mon 8:23am     | `/site-audit sweep`             |
| `mbe-light-audit`      | Tue-Sun 9:41am | `/site-audit smoke`             |
| `mbe-issue-worker`     | Every 2h       | `/issue-worker` + `/ci-monitor` |
| `mbe-progress-tracker` | Daily 5:11pm   | `/progress-tracker`             |
| `mbe-acmm-audit`       | Daily 10:00am  | `/acmm-audit --apply --badge`   |
| `mbe-learning-loop`    | Daily 11:00am  | `/learning-loop`                |

## Manual Intervention

### When to intervene

- **`agent-skip` issues** -- exhausted max retries. Review the failure comments, improve the issue description or fix manually.
- **`agent-failed` issues stuck >3 days** -- progress-tracker auto-retries these, but persistent failures need human review.
- **Circuit breaker triggered** -- 3+ consecutive batch failures or >50% agent failure rate over 3 days. Check `/progress-tracker` log.
- **Tracking issues stalled** -- parent feature issue with blocked sub-issues.

### Recovery commands

```bash
# Re-queue a skipped issue for retry
gh issue edit <N> --add-label "ready" --remove-label "agent-skip"

# Re-queue a failed issue
gh issue edit <N> --add-label "ready" --remove-label "agent-failed"

# Check current queue state
gh issue list --label "ready" --state open
gh issue list --label "agent-failed" --state open
gh issue list --label "agent-skip" --state open

# View progress tracker log
cat .claude/improvement-loop/log.md | tail -50
```
