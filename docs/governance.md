# Governance & Branch Protection

This document defines the branch protection rules, review policies, and merge governance for the mattbutlerengineering monorepo.

## Branch Protection: `main`

The `main` branch enforces the following protections:

### Required Status Checks

All PRs must pass these checks before merge:

| Check | Source | Purpose |
|-------|--------|---------|
| **Lint** | `ci.yml` | ESLint across workspace |
| **Typecheck** | `ci.yml` | TypeScript compilation |
| **Test** | `ci.yml` | Vitest suite (unit + integration) |
| **Security Scan** | `ci.yml` / Semgrep | SAST via Semgrep rules |
| **Tier Classifier** | `tier-classifier.yml` | Risk tier label assignment |

### Merge Rules

- **Require pull request reviews:** at least 1 approving review
- **Require status checks to pass:** all checks listed above
- **Require linear history:** squash merges preferred
- **Require signed commits:** recommended but not enforced
- **No force pushes** to `main`
- **No deletions** of `main`

### Merge Queue

A merge queue (`merge-queue.yml`) is enabled for verified PRs. PRs that pass all status checks enter the queue and are merged in order, preventing merge conflicts from concurrent approvals.

## CODEOWNERS

Critical paths have explicit ownership defined in `.github/CODEOWNERS`:

| Path | Owner | Rationale |
|------|-------|-----------|
| `*` (default) | @mattbutlerengineering | Single-maintainer project |
| `/infrastructure/` | @mattbutlerengineering | IaC changes affect production |
| `/.github/` | @mattbutlerengineering | CI/CD and governance |
| `/services/*/` | @mattbutlerengineering | Backend API surface |
| `/packages/auth/` | @mattbutlerengineering | Authentication/authorization |
| `/.claude/skills/` | @mattbutlerengineering | Agent behavior definitions |

## Agent PR Policy

AI agents (Claude Code, Codex, OpenCode) create PRs as part of the autonomous development loop. Their PRs follow these rules:

### Auto-Merge Eligible (Tier 1 only)

When CI passes, these agent PRs may be auto-merged without human review:

- Documentation-only changes (`*.md` outside governance files)
- Test-only additions (no production code changes)
- Comment and JSDoc updates
- Auto-generated files (`llms.txt`, `llms-full.txt`)
- Editor/tooling config (`.editorconfig`, `.vscode/*`)

### Human Review Required

The following changes always require human review, regardless of agent or author:

| Category | Examples | Minimum Review |
|----------|----------|----------------|
| **Security** | Auth middleware, CODEOWNERS, secret templates | Owner + security scan |
| **Infrastructure** | Pulumi stacks, Dockerfiles, wrangler.toml | Owner approval |
| **Database migrations** | `prisma/migrations/*`, schema changes | Owner + migration-reviewer agent |
| **CI/CD workflows** | `.github/workflows/*` | Owner approval |
| **Production deploy config** | DO app spec, Cloudflare routes | Owner approval |
| **Dependency changes** | `package.json` deps, `pnpm.overrides` | Owner + dependency review |

### Escalation Path

1. **Agent fails:** Issue labeled `agent-failed` for manual triage
2. **Reviewer disagrees:** Comment with objection; agent must not force-merge
3. **Security concern:** Block merge, notify owner, file security issue
4. **Unclear risk tier:** Escalate to next higher tier

## Audit Trail

All governance decisions are traceable:

- **PR labels** indicate tier classification (`tier:trivial` through `tier:critical`)
- **Agent sessions** are traced in Langfuse with task metadata
- **GitHub Issues** track the full lifecycle: `ready` -> `in-progress` -> `has-pr` -> merged/closed
- **ADRs** in `docs/adr/` document architectural decisions

## Cross-References

- `docs/change-tiers.md` — Detailed classification rules for each risk tier
- `docs/change-classification.md` — Change classification policy and review routing
- `docs/review-criteria.md` — What reviewers look for at each tier
- `docs/SECURITY-AI.md` — Security policies for AI-generated code
- `.github/CODEOWNERS` — Path-based ownership definitions
