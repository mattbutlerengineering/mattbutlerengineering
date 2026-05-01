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
                              ↓            ↓
                             Yes           No
                              ↓            ↓
                        Create revert   Log & skip
                           PR
                              ↓
                     Label: agent-regression
```

## Labels

| Label | Meaning |
|-------|---------|
| `agent-regression` | PR that reverts an agent-caused regression |
| `urgent` | Auto-revert failed, needs manual intervention |

## Safety

- Only agent commits are auto-reverted — human commits require manual rollback
- Revert PRs still require review before merge (not auto-merged)
- If `git revert` fails due to conflicts, an issue is created instead
- The workflow only triggers on Post-Deploy Check failures, not CI failures

## Testing

To test the workflow without a real failure:
1. Create a branch that deliberately breaks a smoke test
2. Merge it via the agent workflow
3. Verify the revert PR is created
