---
name: ci-monitor
description: Check GitHub CI status on main branch and open PRs. Fix simple failures directly via mbe agent run, create issues for complex ones. Monitors agent-created PRs for failing checks. Invoke with /ci-monitor.
user-invocable: true
---

# CI Monitor

Monitor GitHub Actions CI health and respond to failures. Fixes simple issues automatically, escalates complex ones to the issue queue.

## Workflow

### Step 1: Check Main Branch CI

```bash
gh run list --branch main --limit 5 --json status,conclusion,databaseId,headBranch,name,createdAt
```

Examine the results:

- If all 5 runs have `conclusion: "success"` → **main is healthy**, proceed to Step 3
- If any run has `conclusion: "failure"` → proceed to Step 2

### Step 2: Diagnose Failure

For each failed run:

```bash
gh run view <databaseId> --log-failed 2>&1 | head -200
```

#### 2a: Check for Existing Fix

```bash
gh issue list --label "ci-fix" --state open --search "<error keyword>" --json number,title
```

If an open `ci-fix` issue already exists for this failure, **skip it** — it is already being tracked.

#### 2b: Classify the Failure

**Simple failures** (auto-fixable):

- Lint errors (`eslint`, `prettier`)
- Type errors (`tsc`, missing imports, wrong types)
- Missing Prisma client generation (`prisma generate`)
- Test failures with obvious fixes (snapshot updates, assertion mismatches from recent changes)

**Complex failures** (escalate to issue):

- Flaky tests (passes on retry)
- Infrastructure failures (Docker, database connectivity)
- Multi-file refactoring needed
- Dependency conflicts

#### 2c: Auto-Fix Simple Failures

```bash
mbe agent run "Fix CI failure: <concise description of error from logs>" --max-budget 0.50 --adapter auto
```

The agent will create a PR with the fix. After completion:

```bash
# Verify the fix by checking if CI passes on the new PR
gh pr checks <PR_NUMBER> --watch --fail-fast
```

#### 2d: Escalate Complex Failures

```bash
gh issue create \
  --title "[CI] <failure type>: <brief description>" \
  --label "ci-fix" --label "ready" \
  --body "## CI Failure

**Workflow**: <workflow name>
**Run**: <run URL>
**Branch**: main

## Error Log

\`\`\`
<relevant error output, truncated to key lines>
\`\`\`

## Analysis

<brief analysis of what went wrong and potential fix approaches>

---
*Created by automated CI monitor on $(date +%Y-%m-%d)*"
```

### Step 3: Check Open PR Health

```bash
gh pr list --state open --json number,title,headRefName,statusCheckRollup --limit 10
```

For each open PR:

1. Check if any status checks are failing
2. Focus on PRs created by the agent (branch names starting with `agent/`)

```bash
# For each PR with failing checks:
gh pr checks <NUMBER> --json name,state,conclusion --jq '.[] | select(.conclusion == "FAILURE")'
```

If an agent-created PR has failing checks:

```bash
# Get the failure details
gh pr checks <NUMBER> --json name,state,conclusion

# Attempt a fix on the PR branch
mbe agent run "Fix failing CI checks on PR #<NUMBER>: <failure description>" --max-budget 0.50 --adapter auto
```

### Step 4: Report Status

If any actions were taken (fixes attempted, issues created), provide a brief summary.

If everything is green, exit with: "CI is healthy. All recent runs passing, no PR check failures."

## CI Workflow Reference

The CI pipeline (`.github/workflows/ci.yml`) has these jobs:

| Job              | What It Checks                                               |
| ---------------- | ------------------------------------------------------------ |
| `lint-typecheck` | ESLint, TypeScript compilation, Prisma client generation     |
| `build`          | Full monorepo build, registry.json validation, catalog drift |
| `test`           | Vitest test suite with coverage                              |
| `migrations`     | Prisma migrations against test PostgreSQL database           |

Common failure patterns:

- **lint-typecheck**: Usually a missing `import type`, unused variable, or formatting issue
- **build**: Often a missing export, broken dependency chain, or stale generated file
- **test**: Snapshot mismatches, assertion failures from behavior changes, mock drift
- **migrations**: Schema drift, migration ordering issues, SQL syntax errors

## Safety Rules

- **Never retry a run** — diagnose and fix the root cause instead
- **Budget cap** — $0.50 per auto-fix attempt
- **Max 2 auto-fix attempts per run** — escalate if more than 2 failures need fixing
- **Never modify CI workflow files** — if the workflow itself is broken, create an issue
- **Never skip or disable tests** — fix the test or the code, not the test runner config
