---
name: issue-worker
description: Pick up the oldest open GitHub issue labeled 'ready', complete the work using mbe agent run with worktree isolation, and create a PR. Manages label lifecycle (ready → in-progress → has-pr). Invoke with /issue-worker.
user-invocable: true
---

# Issue Worker

Autonomous issue resolver. Picks up one ready issue, delegates implementation to `mbe agent run` (worktree-isolated), and manages the label lifecycle.

## Workflow

### Step 1: Find an Issue

```bash
gh issue list --label "ready" --state open --limit 1 --sort created --json number,title,body,labels
```

If no issues are returned, **exit cleanly** with a message: "No ready issues found. Nothing to do."

### Step 1b: Check Dependencies

Before claiming, check if the issue has unresolved dependencies:

```bash
# Extract "Depends on: #N" from issue body
DEPS=$(echo "$ISSUE_BODY" | grep -oP 'Depends on: #\K\d+')

for DEP in $DEPS; do
  STATE=$(gh issue view $DEP --json state -q '.state')
  if [ "$STATE" != "CLOSED" ]; then
    echo "Blocked: issue #<NUMBER> depends on #$DEP which is still $STATE. Skipping."
    # Try the next ready issue instead
    exit 0
  fi
done
```

If any dependency is still open, skip this issue and try the next oldest `ready` issue. This prevents out-of-order execution for issues created by `/decompose`.

### Step 2: Claim the Issue

```bash
gh issue edit <NUMBER> --add-label "in-progress" --remove-label "ready"
```

This prevents other worker sessions from picking up the same issue.

### Step 3: Analyze the Issue

Read the full issue body and labels to understand:
- What needs to be fixed/built
- Which area of the codebase is affected
- What the acceptance criteria are

Build a clear, actionable task description from the issue content.

### Step 4: Delegate to Agent

Run the implementation in an isolated worktree:

```bash
mbe agent run "<task description synthesized from issue>" --max-budget 1.00
```

The `mbe agent run` command will:
1. Create a git worktree (isolated branch)
2. Spawn a Claude Code session to implement the fix
3. Commit changes
4. Push the branch
5. Create a PR

Capture the output to determine success/failure and extract the PR URL if created.

### Step 5a: On Success (PR Created)

```bash
# Add has-pr label, remove in-progress
gh issue edit <NUMBER> --add-label "has-pr" --remove-label "in-progress"

# Comment the PR link on the issue
gh issue comment <NUMBER> --body "PR created: <PR_URL>

This was automatically resolved by the issue-worker loop."

# Ensure the PR body references the issue for auto-close
# If mbe agent run didn't include it, update the PR:
gh pr edit <PR_NUMBER> --body "$(gh pr view <PR_NUMBER> --json body -q .body)

Closes #<ISSUE_NUMBER>"
```

### Step 5b: On Failure (Agent Could Not Complete)

```bash
# Add agent-failed label, remove in-progress
gh issue edit <NUMBER> --add-label "agent-failed" --remove-label "in-progress"

# Comment the failure details
gh issue comment <NUMBER> --body "Automated agent was unable to resolve this issue.

**Error**: <error summary>

This issue may require manual intervention or a more detailed task description."
```

## Safety Rules

- **One issue per run** — never pick up multiple issues
- **Never force-push** — all pushes are normal pushes to new branches
- **Never merge directly** — only create PRs against main
- **Never delete branches** — leave cleanup to the PR merge process
- **Budget cap** — `mbe agent run` is capped at $1.00 per issue
- **Label integrity** — always transition labels atomically (add new label before removing old)

## Issue Priority

When multiple issues have the `ready` label, the `--sort created` flag ensures the **oldest issue** is picked up first (FIFO queue). This prevents starvation of older issues.

Issues with the `ci-fix` label should be treated with higher urgency — if both `audit` and `ci-fix` issues are ready, prefer `ci-fix`:

```bash
# Check for ci-fix issues first
CI_ISSUE=$(gh issue list --label "ready" --label "ci-fix" --state open --limit 1 --sort created --json number -q '.[0].number')

if [ -n "$CI_ISSUE" ]; then
  # Work the CI fix issue
else
  # Fall back to any ready issue
  gh issue list --label "ready" --state open --limit 1 --sort created --json number,title,body,labels
fi
```

## Retry Policy

If an issue has the `agent-failed` label AND the `ready` label (someone manually re-queued it), the worker will pick it up again. This allows manual retry by:

```bash
gh issue edit <NUMBER> --add-label "ready" --remove-label "agent-failed"
```
