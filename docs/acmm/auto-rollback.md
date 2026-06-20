# Auto-Rollback for Agent Regressions

## How It Works

The auto-rollback mechanism closes the autonomous loop: when an AI-authored change breaks
production, the system detects the regression and opens a revert PR for fast human merge —
without waiting for manual triage.

### Deploy pipeline and health signals

Deploys flow through two GitHub Actions workflows:

- **Deploy Services** (`.github/workflows/deploy-services.yml`) — pushes to DO App Platform
  for `services/users`, `services/reservations`, `services/agent`, and shared packages.
- **Deploy Static Sites** (`.github/workflows/deploy-static.yml`) — pushes to Cloudflare Workers
  for `apps/marketing`, `apps/hospitality`, and `apps/rialto-web`.

Both trigger **Post-Deploy Check** (`.github/workflows/post-deploy-check.yml`) on completion.
Post-Deploy Check runs two parallel health-check jobs:

| Job                | Signal                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `smoke-test`       | HTTP checks for marketing, hospitality, rialto storybook, Users API `/api/v1/users/health` (DB-backed), and Users `/health` (liveness) |
| `playwright-smoke` | Playwright browser tests in `tests/smoke/` against the live site                                                                       |

If either job fails, Post-Deploy Check concludes with `failure`, which triggers `auto-rollback.yml`.

### Rollback sequence

```
Deploy Services / Deploy Static Sites
           ↓ (on push to main)
   Post-Deploy Check → FAIL
           ↓ (workflow_run conclusion=failure)
   auto-rollback.yml
           ↓
    Is HEAD commit agent-authored?
   ╱                            ╲
 Yes                              No
  ↓                               ↓
git revert HEAD              Log & skip
  ╱           ╲
Clean        Conflict
  ↓              ↓
Create PR    Create issue
(agent-      (agent-regression
regression)   + urgent)
```

## Agent Detection

A commit is classified as agent-authored if ANY of the following signals match:

| Signal         | Pattern                                                      | Example                      |
| -------------- | ------------------------------------------------------------ | ---------------------------- |
| Branch name    | `agent-*`, `worktree-agent-*`, `fix/agent-*`, `feat/agent-*` | `worktree-agent-a4f2b1`      |
| Commit message | `Co-Authored-By: Claude` (case-insensitive)                  | Standard agent commit footer |
| PR label       | PR has `has-pr` label (set by the implement-queue)           | Agent-created PRs            |

## Safety Guarantees

- Only agent commits are auto-reverted — human commits require manual rollback.
- Revert PRs require human review before merge — they are **never auto-merged**.
- No force-push is used at any point.
- If `git revert` fails due to conflicts, an issue is created instead of a partial revert.
- The `no-auto-rollback` label on a PR suppresses auto-revert creation (see Opt-out below).
- A single revert is attempted — no cascading reverts.
- Permissions are scoped per job (least privilege): `rollback-drill` needs only `contents: write`;
  `check-and-rollback` needs `contents: write`, `pull-requests: write`, `issues: write`.

## What Happens After a Revert PR Is Created

1. The revert PR is labeled `agent-regression` and is visible in the PR queue.
2. A human reviews the diff — it should be the inverse of the offending commit.
3. Merge the revert PR to restore stability.
4. Re-open (or file) an issue to retry the original change with a fix.

## Labels

| Label              | Meaning                                                             | Auto-created |
| ------------------ | ------------------------------------------------------------------- | ------------ |
| `agent-regression` | PR or issue created by auto-rollback for an agent-caused regression | Yes          |
| `urgent`           | Auto-revert failed (conflict) — manual intervention needed          | Yes          |
| `no-auto-rollback` | Applied to a PR before merge to suppress auto-rollback on failure   | No (manual)  |

## Edge Cases

| Scenario                              | Behavior                                                       |
| ------------------------------------- | -------------------------------------------------------------- |
| Multiple agent commits in one deploy  | Only HEAD commit is reverted                                   |
| Agent commit followed by human commit | HEAD is human → skipped                                        |
| Post-deploy check is flaky            | Revert PR created; reviewer closes if it is a false positive   |
| Revert itself fails CI                | Normal CI process — human investigates                         |
| Revert branch already exists          | `git checkout -b` fails; workflow fails → `ci-fix` issue filed |

## Manual Override / Opt-out

| Scenario                                         | Action                                                          |
| ------------------------------------------------ | --------------------------------------------------------------- |
| Known flaky post-deploy check                    | Close the revert PR without merging; fix the flake separately   |
| Intentional breaking change (coordinated deploy) | Apply `no-auto-rollback` to the PR **before merging**           |
| Revert would itself be dangerous                 | Close the auto-created revert PR; create a targeted fix instead |

## Monitoring

```bash
# Open revert PRs from agent regressions
gh pr list --label agent-regression

# Failed auto-reverts requiring manual intervention
gh issue list --label agent-regression --label urgent

# Recent workflow runs
gh run list --workflow=auto-rollback.yml --limit 10
```

## Drill Mode

Trigger `auto-rollback.yml` manually with `workflow_dispatch` and `drill: true` for a dry-run
that validates the mechanism without creating a real revert PR. The weekly Monday 10:17 UTC
schedule also exercises the drill path automatically — this keeps the `acmm:auto-rollback`
ACMM criterion active during quiet periods.

## Workflow File

Located at `.github/workflows/auto-rollback.yml`. Triggers:

```yaml
on:
  schedule:
    - cron: "17 10 * * 1" # Weekly Monday drill
  workflow_dispatch:
    inputs:
      drill:
        type: boolean # true = dry-run, no revert PR created
  workflow_run:
    workflows: ["Post-Deploy Check"]
    types: [completed]
```

The `workflow_run` path only activates when Post-Deploy Check **fails**
(`conclusion == 'failure'`). A passing deploy produces no rollback action.
