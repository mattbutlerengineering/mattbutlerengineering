# Change Classification Policy

This document defines how changes are classified by risk level, who reviews each tier, and how to escalate when the classification is unclear.

> For the detailed file-path classification rules and modifiers, see `docs/change-tiers.md`.
> For what reviewers look for once a tier is assigned, see `docs/review-criteria.md`.

## Risk Tiers

### Tier 1 — Low Risk (Auto-Merge Eligible)

**What qualifies:**

- Documentation changes (`*.md` outside governance/security files)
- Test additions with no production code changes
- Comment and JSDoc updates
- Changeset files (`.changeset/*.md`)
- Auto-generated files (`llms.txt`, `llms-full.txt`, exports map)
- Editor config (`.editorconfig`, `.vscode/*`, `.cursorrules`)
- Metrics log appends (`metrics/*.jsonl`)

**Review requirement:** Pre-commit hooks only (lint, typecheck, Semgrep). Auto-merge eligible when all CI checks pass.

**Who reviews:** Automated checks only. No human approval needed.

---

### Tier 2 — Medium Risk (1 Reviewer)

**What qualifies:**

- New components, utilities, or hooks (non-breaking additions)
- Bug fixes with accompanying tests
- Changes to app source code (`apps/*/src/`) not touching auth or deploy config
- New ADRs (`docs/adr/`, status: proposed)
- DevDependency-only `pnpm.overrides` changes
- Route handler changes that do not alter auth/validation surface

**Review requirement:** 1 human reviewer approval + all CI checks.

**Who reviews:** Code owner (@mattbutlerengineering). The `code-reviewer` agent provides an initial review applying Tier 1 and 2 criteria from `docs/review-criteria.md`.

---

### Tier 3 — High Risk (2 Reviewers + Specialist)

**What qualifies:**

- New routes or middleware in `services/*` (auth, validation, error handling)
- Rialto component contract changes (props, behavior, events)
- Production dependency changes (`package.json` dependencies)
- Root-level build/lint config (`eslint.config.js`, `tsconfig*.json`, `turbo.json`)
- Cloudflare Worker config (`wrangler.toml`)
- Database migrations that add columns or tables (non-destructive)
- Pre-commit hook changes (`.husky/*`)
- Test file deletions or `it.skip`/`describe.skip` additions

**Review requirement:** 1 human reviewer + at least 1 specialist agent review + all CI checks.

**Who reviews:** Code owner (@mattbutlerengineering) plus the relevant specialist agent:

- `migration-reviewer` — for database schema changes
- `adr-compliance-reviewer` — for architectural decisions
- `silent-failure-hunter` — for error handling changes

---

### Tier 4 — Critical (Admin Approval)

**What qualifies:**

- Destructive database migrations (drop column/table, rename without backfill)
- Auth and authorization code (`services/users/src/auth/`, `packages/auth/`)
- Infrastructure changes affecting prod (`infrastructure/pulumi/` prod stack)
- Governance files (`.github/CODEOWNERS`, merge-gating workflows)
- Security policy files (`docs/SECURITY-AI.md`)
- Secret rotation via repo changes (env templates, `wrangler.toml` bindings)
- Cross-cutting changes touching 5+ services/apps simultaneously

**Review requirement:** All specialist agents + ADR reference in PR body + admin (Matt) personal approval.

**Who reviews:** All relevant specialist agents spawn in parallel. Code owner (@mattbutlerengineering) must personally approve. An ADR documenting the rationale is required.

## How to Classify a Change

1. **Automatic:** The `tier-classifier.yml` workflow runs on PR open and on every push, assigning a `tier:*` label based on file-path rules in `docs/change-tiers.md`.
2. **Manual override:** If the automatic classification seems wrong, update the PR label and leave a comment explaining why.
3. **When in doubt:** Escalate to the next higher tier. Over-classifying is safe; under-classifying is risky.

## Escalation Modifiers

These signals automatically escalate a PR regardless of file paths:

| Signal                                                           | Effect           |
| ---------------------------------------------------------------- | ---------------- |
| PR mentions "secret", "credential", "rotate", "leak", "incident" | Escalate to T4   |
| PR asks to bypass a check                                        | Escalate to T4   |
| First PR from a new agent type                                   | Escalate to T4   |
| Diff > 1000 lines added                                          | Escalate +1 tier |
| PR from a fork                                                   | Escalate +1 tier |
| Force-push after approval                                        | Escalate +1 tier |
| Test file removed                                                | Escalate +1 tier |

De-escalation (capped at T2):

| Signal                                       | Effect              |
| -------------------------------------------- | ------------------- |
| Diff < 20 lines, only T1 file globs          | De-escalate -1 tier |
| Dependabot devDependency patch bump          | De-escalate -1 tier |
| Lockfile-only diff with no behavioral change | De-escalate -1 tier |

## Cross-References

- `docs/change-tiers.md` — Detailed file-path classification rules
- `docs/governance.md` — Branch protection and merge policies
- `docs/review-criteria.md` — Review rubric for each tier
- `.github/workflows/tier-classifier.yml` — Automated classification workflow
