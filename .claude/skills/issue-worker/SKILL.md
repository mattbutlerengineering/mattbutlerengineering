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

## Transitions

State changes use `mbe issue transition <NUM> --to <state>` (states: `ready`, `in-progress`, `has-pr`, `agent-failed`, `agent-skip`) — it wraps `@mbe/gh-client`'s tested label machine, the single source of truth for which labels come off on each edge. If `mbe` isn't on PATH (fresh worktree/CI), build once and call the CLI directly: `pnpm build --filter @mbe/cli...` then `node tools/cli/dist/index.js issue transition <NUM> --to <state>`.

## Retry Count

```bash
ATTEMPT=$(gh issue view <NUM> --json comments --jq '[.comments[] | select(.body | test("agent-failed attempt"))] | length')
MAX=$(node -e "console.log(JSON.parse(require('fs').readFileSync('.github/auto-qa-tuning.json','utf-8')).thresholds.maxRetries)")

if [ "$ATTEMPT" -ge "$MAX" ]; then
  mbe issue transition <NUM> --to agent-skip
  gh issue comment <NUM> --body "**Auto-skipped** after $ATTEMPT (max: $MAX). Manual retry:
\`\`\`bash
mbe issue transition <NUM> --to ready
\`\`\`"
fi
```

Max hit → skip, next.

## Claim

```bash
mbe issue transition <NUM> --to in-progress
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
mbe issue transition <NUM> --to has-pr
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
  mbe issue transition <NUM> --to agent-skip
else
  # Retry-eligible: canonical edge is straight back to ready (the attempt
  # count above already lives in the comment history, not the label).
  mbe issue transition <NUM> --to ready
fi
```

## Priority

FIFO: `--sort created`. Prefer `ci-fix`:

```bash
CI=$(gh issue list --label "ready" --label "ci-fix" --state open --limit 5 --sort created --json number,labels -q '[.[] | select(.labels | map(.name) | index("agent-skip") | not)] | .[0].number')
[ -n "$CI" ] && WORK_CI || WORK_ANY
```

## Retry

Failed auto-re-queue: `ready` (unless max).

After `maxRetries` (`.github/auto-qa-tuning.json`, 2): `agent-skip`.

Manually retry skipped:

```bash
mbe issue transition <NUM> --to ready
```

Manually retry failed:

```bash
mbe issue transition <NUM> --to ready
```

## Rules

- One/run
- No force-push
- PRs main only
- No delete
- Budget: $1.00 max
- Atomic (add before remove)
