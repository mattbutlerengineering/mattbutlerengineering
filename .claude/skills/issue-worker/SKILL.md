---
name: issue-worker
description: Pick up the oldest open GitHub issue labeled 'ready', complete the work using mbe agent run with worktree isolation, and create a PR. Manages label lifecycle (ready → in-progress → has-pr). Invoke with /issue-worker.
user-invocable: true
---

# Issue Worker

Autonomous issue resolver. Picks up one ready issue, delegates implementation to `mbe agent run` (worktree-isolated), and manages the label lifecycle.

## Workflow

### Step 0: Governor Check

Before picking up work, check the adaptive cadence governor:

```bash
node plugins/acmm/scripts/cadence-governor.js
```

If the governor exits with code 1 (SKIP), exit cleanly: "Governor says SKIP (mode: \<MODE\>). No work this cycle."

If the governor exits with code 0 (EXECUTE), proceed to Step 1.

After completing work (Step 5a or 5b), mark that execution happened:

```bash
node plugins/acmm/scripts/cadence-governor.js --execute
```

### Step 1: Find an Issue

```bash
gh issue list --label "ready" --state open --limit 5 --sort created --json number,title,body,labels
```

Filter the results to exclude issues that also have the `agent-skip` label. Pick the first issue that passes all filters (no `agent-skip`, dependencies met, etc.).

If no issues remain after filtering, **exit cleanly** with a message: "No ready issues found. Nothing to do."

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

### Step 1c: Check Retry Count

Before claiming, check how many times this issue has already failed:

```bash
# Count previous agent-failed attempt comments on this issue
ATTEMPT_COUNT=$(gh issue view <NUMBER> --json comments --jq '[.comments[] | select(.body | test("agent-failed attempt"))] | length')

# Read maxRetries from auto-qa-tuning.json
MAX_RETRIES=$(node -e "console.log(JSON.parse(require('fs').readFileSync('.github/auto-qa-tuning.json','utf-8')).thresholds.maxRetries)")

if [ "$ATTEMPT_COUNT" -ge "$MAX_RETRIES" ]; then
  echo "Issue #<NUMBER> has failed $ATTEMPT_COUNT times (max: $MAX_RETRIES). Skipping."
  gh issue edit <NUMBER> --add-label "agent-skip" --remove-label "ready"
  gh issue comment <NUMBER> --body "**Auto-skipped** after $ATTEMPT_COUNT failed attempts (max retries: $MAX_RETRIES).

This issue needs manual review or a different approach. To retry:
\`\`\`bash
gh issue edit <NUMBER> --add-label ready --remove-label agent-skip
\`\`\`"
  # Try the next ready issue instead, or exit if none remain
fi
```

If the issue has reached `maxRetries`, skip it and move to the next candidate from the filtered list. If no candidates remain, exit cleanly.

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
- **What verification commands exist** (look for a "Verification Commands" section with ```bash blocks)

Build a clear, actionable task description from the issue content. If the issue includes verification commands, append them to the task description with: "After implementation, run these verification commands to confirm your work: <commands>"

### Step 3b: Determine Budget

Use the issue labels and description to set the right budget:
- `ci-fix` or simple issues (lint, typo, config): `--max-budget 0.50`
- `feature` or standard issues: `--max-budget 1.50`
- Complex issues (multi-file, new service, architecture): `--max-budget 2.00`

### Step 4: Delegate to Agent

Run the implementation in an isolated worktree:

```bash
mbe agent run "<task description synthesized from issue>" --max-budget <budget from step 3b> --adapter auto
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

First, determine the current attempt count:

```bash
# Count previous agent-failed attempt comments on this issue
ATTEMPT_COUNT=$(gh issue view <NUMBER> --json comments --jq '[.comments[] | select(.body | test("agent-failed attempt"))] | length')

# Read maxRetries from auto-qa-tuning.json
MAX_RETRIES=$(node -e "console.log(JSON.parse(require('fs').readFileSync('.github/auto-qa-tuning.json','utf-8')).thresholds.maxRetries)")

NEXT_ATTEMPT=$((ATTEMPT_COUNT + 1))
```

Then comment with attempt tracking and set labels based on whether max retries have been reached:

```bash
# Comment the failure details with attempt tracking
gh issue comment <NUMBER> --body "**agent-failed attempt #$NEXT_ATTEMPT** — Automated agent was unable to resolve this issue.

**Error**: <error summary>

Attempts so far: $NEXT_ATTEMPT/$MAX_RETRIES
$(if [ "$NEXT_ATTEMPT" -ge "$MAX_RETRIES" ]; then echo 'This issue will be auto-skipped on next worker run.'; else echo 'Will retry on next worker cycle.'; fi)"

# Set labels based on retry status
if [ "$NEXT_ATTEMPT" -ge "$MAX_RETRIES" ]; then
  gh issue edit <NUMBER> --add-label "agent-skip" --remove-label "in-progress"
else
  gh issue edit <NUMBER> --add-label "agent-failed" --add-label "ready" --remove-label "in-progress"
fi
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
CI_ISSUE=$(gh issue list --label "ready" --label "ci-fix" --state open --limit 5 --sort created --json number,labels -q '[.[] | select(.labels | map(.name) | index("agent-skip") | not)] | .[0].number')

if [ -n "$CI_ISSUE" ]; then
  # Work the CI fix issue
else
  # Fall back to any ready issue (excluding agent-skip)
  gh issue list --label "ready" --state open --limit 5 --sort created --json number,title,body,labels
  # Filter out issues with agent-skip label from results
fi
```

## Retry Policy

Failed issues are automatically re-queued with both `agent-failed` and `ready` labels (unless max retries have been reached). The attempt count is tracked via comments matching the `agent-failed attempt` pattern.

After `maxRetries` (from `.github/auto-qa-tuning.json`, currently 2) failed attempts, the issue is labeled `agent-skip` instead of being re-queued. This prevents infinite retry loops.

To manually retry a skipped issue:

```bash
gh issue edit <NUMBER> --add-label "ready" --remove-label "agent-skip"
```

To manually retry a failed issue that has not been auto-skipped:

```bash
gh issue edit <NUMBER> --add-label "ready" --remove-label "agent-failed"
```
