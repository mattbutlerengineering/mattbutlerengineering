---
name: issue-worker
description: Pick oldest ready, implement via mbe agent run, create PR. ready→in-progress→has-pr. Invoke: /issue-worker.
user-invocable: true
---

# Issue Worker

One issue/run, worktree-isolated.

## Governor

```bash
node plugins/acmm/scripts/cadence-governor.js
```

Exit 1 (SKIP) → exit. Exit 0 → continue.

After work: `node plugins/acmm/scripts/cadence-governor.js --execute`

## Find

```bash
gh issue list --label "ready" --state open --limit 5 --sort created --json number,title,body,labels
```

Filter `agent-skip`. Pick first. No candidates → exit.

## Dependencies

```bash
DEPS=$(echo "$ISSUE_BODY" | grep -oP 'Depends on: #\K\d+')
for DEP in $DEPS; do
  [ "$(gh issue view $DEP --json state -q '.state')" != "CLOSED" ] && exit 0
done
```

Unresolved → skip, next.

## Retry Count

```bash
ATTEMPT=$(gh issue view <NUM> --json comments --jq '[.comments[] | select(.body | test("agent-failed attempt"))] | length')
MAX=$(node -e "console.log(JSON.parse(require('fs').readFileSync('.github/auto-qa-tuning.json','utf-8')).thresholds.maxRetries)")

if [ "$ATTEMPT" -ge "$MAX" ]; then
  gh issue edit <NUM> --add-label "agent-skip" --remove-label "ready"
  gh issue comment <NUM> --body "**Auto-skipped** after $ATTEMPT (max: $MAX). Manual retry:
\`\`\`bash
gh issue edit <NUM> --add-label ready --remove-label agent-skip
\`\`\`"
fi
```

Max hit → skip, next.

## Claim

```bash
gh issue edit <NUM> --add-label "in-progress" --remove-label "ready"
```

## Analyze

Body/labels: what, area, criteria, **verification commands**.

Task + commands: "After implementation, run: <commands>"

## Budget

- Simple/`ci-fix`: `0.50`
- Standard/`feature`: `1.50`
- Complex: `2.00`

## Frontmatter

```bash
FRONTMATTER=$(gh issue view <NUM> --json body -q .body | mbe agent frontmatter)
```

## Delegate

```bash
eval "mbe agent run \"\$TASK\" --max-budget <budget> --adapter auto $FRONTMATTER"
```

Last flags win (override budget/adapter). Safe (enum/numeric).

`--adapter auto` enables rate-limit failover: claude → gemini → opencode on 429. Applies to haiku/sonnet-tier runs. Opus-tier issues should include `--adapter claude` in their frontmatter `agent:` block to stay on the Claude provider.

## Success

```bash
gh issue edit <NUM> --add-label "has-pr" --remove-label "in-progress"
gh issue comment <NUM> --body "PR: <URL>"
gh pr edit <PR> --body "$(gh pr view <PR> --json body -q .body)

Closes #<NUM>"
```

## Failure

```bash
ATTEMPT=$(gh issue view <NUM> --json comments --jq '[.comments[] | select(.body | test("agent-failed attempt"))] | length')
MAX=$(node -e "console.log(JSON.parse(require('fs').readFileSync('.github/auto-qa-tuning.json','utf-8')).thresholds.maxRetries)")
NEXT=$((ATTEMPT + 1))

gh issue comment <NUM> --body "**agent-failed attempt #$NEXT** — Unable.

**Error**: <summary>

Attempts: $NEXT/$MAX
$([ "$NEXT" -ge "$MAX" ] && echo 'Auto-skipped next.' || echo 'Will retry next cycle.')"

if [ "$NEXT" -ge "$MAX" ]; then
  gh issue edit <NUM> --add-label "agent-skip" --remove-label "in-progress"
else
  gh issue edit <NUM> --add-label "agent-failed" --add-label "ready" --remove-label "in-progress"
fi
```

## Priority

FIFO: `--sort created`. Prefer `ci-fix`:

```bash
CI=$(gh issue list --label "ready" --label "ci-fix" --state open --limit 5 --sort created --json number,labels -q '[.[] | select(.labels | map(.name) | index("agent-skip") | not)] | .[0].number')
[ -n "$CI" ] && WORK_CI || WORK_ANY
```

## Retry

Failed auto-re-queue: `agent-failed`+`ready` (unless max).

After `maxRetries` (`.github/auto-qa-tuning.json`, 2): `agent-skip`.

Manually retry skipped:

```bash
gh issue edit <NUM> --add-label "ready" --remove-label "agent-skip"
```

Manually retry failed:

```bash
gh issue edit <NUM> --add-label "ready" --remove-label "agent-failed"
```

## Rules

- One/run
- No force-push
- PRs main only
- No delete
- Budget: $1.00 max
- Atomic (add before remove)
