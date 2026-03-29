---
name: ship-loop
description: "Full cycle: audit site, check Dependabot alerts, fix issues, push, verify CI, deploy, close. Prioritizes Security > Availability > New features."
user-invocable: true
---

# Ship Loop

Autonomous continuous improvement loop. Audits the live site, checks security alerts, picks up issues, implements fixes in worktree agents, pushes to main, verifies CI, and confirms deploys.

**Priority principle: Security > Availability > New features.**

## Phase A: Discover Work

### A1. CI Health Check

```bash
# Check for failing CI workflows
gh run list --branch main --limit 5 --json status,conclusion,name,databaseId \
  | jq '[.[] | select(.conclusion == "failure")]'
```

If failures exist, create `ci-fix` issues (or pick up existing ones).

### A2. Security Audit — Dependabot Alerts

Check for open Dependabot security alerts before any feature work.

```bash
# Count critical/high severity open alerts
gh api repos/{owner}/{repo}/dependabot/alerts \
  --jq '[.[] | select(.state=="open") | select(.security_advisory.severity=="critical" or .security_advisory.severity=="high")] | length'

# List details of critical/high alerts
gh api repos/{owner}/{repo}/dependabot/alerts \
  --jq '[.[] | select(.state=="open") | select(.security_advisory.severity=="critical" or .security_advisory.severity=="high")] | .[] | {number, severity: .security_advisory.severity, package: .security_vulnerability.package.name, summary: .security_advisory.summary}'
```

For each critical/high alert without an existing issue:

```bash
gh issue create \
  --title "fix(security): <package> — <summary>" \
  --body "Dependabot alert #<number>. Severity: <severity>.\n\n<details from alert>" \
  --label "ci-fix,ready"
```

### A3. Gather Issues

```bash
# Fetch all actionable issues, ordered by priority
gh issue list --label "ready" --json number,title,labels --limit 20
```

**Priority order for issue selection:**

1. **Security vulnerabilities** — Dependabot critical/high alerts (label: `ci-fix` + title starts with `fix(security):`)
2. **CI failures** — Other `ci-fix` labeled issues
3. **Feature issues** — `feature` labeled issues
4. **Audit findings** — `ready` + `audit` labeled issues

Pick the highest-priority issue that is not labeled `in-progress`.

### A4. Claim Issue

```bash
gh issue edit <number> --add-label "in-progress" --remove-label "ready"
```

## Phase B: Implement in Worktree Agent

Launch a worktree agent for the claimed issue:

```bash
mbe agent run "<issue title> (closes #<number>)" \
  --model claude-sonnet-4-6 \
  --max-budget 1.00 \
  --max-turns 50
```

### Security Instructions for ALL Worktree Agents

Every worktree agent prompt MUST include the following security guidance:

> **Security rules (non-negotiable):**
>
> - Never introduce hardcoded secrets, SQL injection, XSS, or other OWASP Top 10 vulnerabilities.
> - Never commit `.env` files, credentials, API keys, tokens, or secrets of any kind.
> - Run security checks on all changed files before committing.
> - Use parameterized queries for all database operations.
> - Sanitize all user input before rendering in HTML.
> - Validate all external data at system boundaries.
> - Follow the security checklist in `~/.claude/rules/common/security.md`.
> - For any changes touching auth, crypto, or input handling, use the **security-reviewer** agent.
> - If you discover an existing security vulnerability, stop feature work and fix it first.

### Agent Outcome Handling

- **Success** (PR created): Label issue `has-pr`, remove `in-progress`.
- **Failure**: Label issue `agent-failed`, remove `in-progress`. Log failure reason.

```bash
# On success
gh issue edit <number> --add-label "has-pr" --remove-label "in-progress"

# On failure
gh issue edit <number> --add-label "agent-failed" --remove-label "in-progress"
```

## Phase C: Verify and Deploy

### C1. Wait for CI

```bash
# Watch the latest run on main
gh run list --branch main --limit 1 --json databaseId,status,conclusion
gh run watch <run-id>
```

### C2. Verify Deploy

```bash
# Check deploy workflows completed
gh run list --workflow=deploy-static.yml --limit=1
gh run list --workflow=deploy-services.yml --limit=1
```

### C3. Smoke Test

If Playwright is available, run a quick smoke test against the live site:

```bash
npx playwright test --grep @smoke
```

Otherwise, verify key endpoints manually:

```bash
curl -sf https://mattbutlerengineering.com/ > /dev/null && echo "Marketing OK"
curl -sf https://mattbutlerengineering.com/hospitality > /dev/null && echo "Hospitality OK"
curl -sf https://api.mattbutlerengineering.com/api/v1/users/health > /dev/null && echo "Users API OK"
```

### C4. Close Issue

```bash
gh issue close <number> --comment "Deployed and verified on production."
```

## Phase D: Loop or Stop

- If time/budget remains, return to **Phase A**.
- If circuit breaker triggers (3 consecutive failures), stop and report.
- Log iteration metrics for `/progress-tracker`.

## Safety Rails

### Security Rails (highest priority)

- **Security > Availability > New features.** Always fix security issues before other work.
- Never commit `.env` files, credentials, or secrets. If detected, abort the commit and alert.
- Use the **security-reviewer** agent for any changes to auth, crypto, or input handling.
- Follow the mandatory security checklist in `~/.claude/rules/common/security.md`.
- Dependabot critical/high alerts block all feature work until resolved.
- Every worktree agent inherits the security instructions from Phase B above.

### General Rails

- Never force-push to `main`.
- Never skip CI checks or pre-commit hooks.
- Never delete production data or resources.
- One issue per iteration — do not batch unrelated changes.
- If CI fails after push, create a `ci-fix` issue and handle it next iteration.
- Maximum 3 consecutive agent failures triggers circuit breaker — stop and report.
- Keep commits small and focused — easier to review and revert.

## GitHub Labels (State Machine)

| Label | Meaning |
|-------|---------|
| `ready` | Available for agent pickup |
| `in-progress` | Agent is working on it |
| `has-pr` | PR created, awaiting merge/review |
| `agent-failed` | Agent could not complete — needs manual review |
| `audit` | Found by site-audit |
| `ci-fix` | CI failure or security vulnerability needing fix |
| `feature` | New feature (created by `/decompose`) |
| `tracking` | Parent issue tracking multi-part feature |
| `meta-improvement` | Process improvement suggestion |
