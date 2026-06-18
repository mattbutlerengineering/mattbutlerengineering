# Auto-Rollback for Agent Regressions

## How It Works

When the Post-Deploy Check workflow fails:

1. The `auto-rollback.yml` workflow triggers automatically
2. It checks if the failing commit was authored by an agent (branch name or author)
3. If agent-authored: creates a revert PR with `agent-regression` label
4. If revert fails (merge conflict): creates an issue for manual intervention
5. Non-agent failures are skipped (human-authored code is not auto-reverted)

## Flow

```
Deploy → Post-Deploy Smoke Tests → FAIL
                                     ↓
                              Is agent commit?
                             ╱              ╲
                           Yes               No
                            ↓                ↓
                     git revert HEAD    Log & skip
                     ╱           ╲
                  Clean        Conflict
                    ↓              ↓
              Create PR       Create issue
              (agent-        (agent-regression
              regression)      + urgent)
```

## Agent Detection

A commit is classified as agent-authored if ANY of:

| Signal      | Pattern                                                 | Example                      |
| ----------- | ------------------------------------------------------- | ---------------------------- |
| Branch name | `agent-*` or `worktree-agent-*`                         | `agent-fix-login-bug-a4f2b1` |
| Author name | Contains `bot`, `agent`, or `claude` (case-insensitive) | `mbe-agent[bot]`             |

## Labels

| Label              | Meaning                                       | Auto-created      |
| ------------------ | --------------------------------------------- | ----------------- |
| `agent-regression` | PR or issue from an agent-caused regression   | Yes (by workflow) |
| `urgent`           | Auto-revert failed, needs manual intervention | Yes (by workflow) |

## What Happens After a Revert PR is Created

1. **The revert PR requires human review** — it is NOT auto-merged
2. A human reviews the revert to confirm it's safe
3. After merge, the original issue should be re-opened or a new issue filed
4. The original agent change should be investigated before retrying

## Safety Guarantees

- Only agent commits are auto-reverted — human commits require manual rollback
- Revert PRs still require review before merge (not auto-merged)
- If `git revert` fails due to conflicts, an issue is created instead of a broken revert
- The workflow only triggers on Post-Deploy Check failures, not CI failures
- A single revert is attempted — no cascading reverts

## Edge Cases

| Scenario                              | Behavior                                           |
| ------------------------------------- | -------------------------------------------------- |
| Multiple agent commits in one deploy  | Only the HEAD commit is reverted                   |
| Agent commit followed by human commit | HEAD is human → skipped (no auto-revert)           |
| Post-deploy check is flaky            | Revert PR created, but reviewer can close if flake |
| Revert itself fails CI                | Normal CI process — human investigates             |

## Monitoring

- Check for `agent-regression` labeled PRs: `gh pr list --label agent-regression`
- Check for failed reverts: `gh issue list --label agent-regression,urgent`
- Trend tracking via `/progress-tracker` regression count

## Manual Override / Opt-out

Auto-rollback only fires for agent commits — human-authored commits are never auto-reverted. For cases where the automatic revert should be suppressed:

| Scenario                                         | Action                                                          |
| ------------------------------------------------ | --------------------------------------------------------------- |
| Known flaky post-deploy check                    | Close the revert PR without merging; fix the flake separately   |
| Intentional breaking change (coordinated deploy) | Add the `no-auto-rollback` label to the PR before merging       |
| Revert would itself be dangerous                 | Close the auto-created revert PR; create a targeted fix instead |

### `no-auto-rollback` label

Apply this label to any PR before it merges to suppress automatic revert creation if post-deploy checks fail. The workflow checks for this label on the originating PR before creating the revert.

### Testing the mechanism without a real failure

Trigger `auto-rollback.yml` with `workflow_dispatch` and `drill: true` for a dry-run that simulates rollback without creating a live revert PR. The weekly Monday schedule also exercises the drill path automatically.

## Testing

To test the workflow without a real production failure:

1. Create a branch that deliberately breaks a smoke test endpoint
2. Push it with an `agent-` branch prefix
3. Merge to main (admin merge to skip checks)
4. Wait for post-deploy-check to run and fail
5. Verify: `auto-rollback.yml` triggers, detects agent commit, creates revert PR
6. Clean up: close the revert PR, revert your deliberate break

## Workflow File

Located at `.github/workflows/auto-rollback.yml`. Triggers on:

```yaml
on:
  schedule:
    - cron: "17 10 * * 1" # Weekly Monday drill — keeps ACMM criterion active
  workflow_dispatch:
    inputs:
      drill:
        type: boolean # Set true for a dry-run drill
  workflow_run:
    workflows: ["Post-Deploy Check"]
    types: [completed]
```

The `workflow_run` path only activates when the Post-Deploy Check workflow **fails** (`conclusion == 'failure'`).

The `schedule` path runs the drill job automatically every Monday at 10:17 UTC. This ensures the `acmm:auto-rollback` ACMM criterion stays active even during quiet periods with no real regressions — the ACMM scanner checks `gh run list --workflow=auto-rollback.yml` for a successful run within 365 days.
