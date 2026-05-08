# Change Tiers

Risk classification for pull requests in this monorepo. Used by the `tier-classifier` workflow and by reviewers (human and agent) to decide which scrutiny each change deserves.

> **ACMM L4 governance.** Uniform review on every PR is either too strict (slow trivial work) or too loose (under-scrutinizes risky work). This file makes the policy explicit so the system can route appropriately.

## The tiers

| Tier               | Label            | Routing                                                            | Approval needed                                                                                                                          |
| ------------------ | ---------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **T1 — trivial**   | `tier:trivial`   | Auto-mergeable when CI green                                       | Pre-commit hook only                                                                                                                     |
| **T2 — standard**  | `tier:standard`  | Reviewer agent + human approval                                    | `code-reviewer` agent + 1 human review                                                                                                   |
| **T3 — sensitive** | `tier:sensitive` | Reviewer agent + specialist agents + human approval                | `code-reviewer` + at least one specialist (`adr-compliance-reviewer`, `migration-reviewer`, or `silent-failure-hunter`) + 1 human review |
| **T4 — critical**  | `tier:critical`  | All of T3, plus an ADR or `meta-improvement` issue documenting why | Same as T3, plus the user (Matt) personally                                                                                              |

The classifier assigns the **highest tier** any matched rule produces. T4 wins over T3 wins over T2 wins over T1.

## Classification rules

Rules are evaluated against the PR diff. Each rule maps a path glob (or a structural property) to a tier.

### T4 — critical

- Any file under `prisma/migrations/` that drops a column, drops a table, or renames without backfill (semantic check by `migration-reviewer`).
- Any change to `prisma/schema.prisma` that removes or renames a field on a model that has prod data.
- Any change under `infrastructure/pulumi/` that affects the `prod` stack (changes detected by Pulumi preview).
- Any change to `.github/CODEOWNERS`, `.github/workflows/codeql.yml`, `.github/workflows/coverage-gate.yml`, or any workflow that gates merge.
- Any change to `services/users/src/auth/`, `packages/auth/src/middleware/`, or files implementing authorization checks.
- Any change to `docs/SECURITY-AI.md` (this file's policy peer).
- Any rotation of secrets, tokens, or API keys via repo changes (env templates, `wrangler.toml` bindings, `pulumi/Pulumi.prod.yaml`).
- Any cross-cutting change touching ≥ 5 services or apps simultaneously (broad blast radius).

### T3 — sensitive

- New routes or middleware in `services/*` (Fastify) — auth, validation, error handling matter.
- Changes to `packages/rialto/src/components/*` that modify exported component contracts (props, behavior, events).
- Changes that modify `package.json` `dependencies` (production deps, including transitive via overrides).
- Changes to `pnpm.overrides` in the root `package.json` (CVE pins or version locks).
- Changes to `eslint.config.js`, `tsconfig*.json`, `turbo.json`, or other root-level build/lint config.
- Changes to `scripts/check-*.js` (the gate-enforcement scripts).
- Changes to `.husky/*` (pre-commit hook).
- Changes to `apps/*/wrangler.toml` (Cloudflare Worker config).
- Database migration that _adds_ a column or table (no destructive ops, but still mutates schema).
- Any `*.test.ts` deletion or `it.skip`/`describe.skip` addition (loosens test coverage).

### T2 — standard

- New components in `packages/rialto/` that don't break existing exports.
- New utility functions, hooks, or non-public helpers.
- Changes to existing route handlers that don't alter the auth/validation surface.
- Bug fixes in business logic with accompanying tests.
- Changes to `apps/*/src/` that don't touch the wrangler config or auth.
- New ADRs in `docs/adr/` (status: proposed).
- Changes to `pnpm.overrides` for `devDependencies` only.

### T1 — trivial

- Documentation-only changes: `*.md` outside `docs/SECURITY-AI.md`, `docs/change-tiers.md`, `docs/review-criteria.md`, and active ADRs.
- Comment changes, JSDoc updates, README typo fixes.
- Test-only additions (no production code change in the diff).
- Changeset additions (`.changeset/*.md`) that don't modify code.
- Editor config: `.editorconfig`, `.vscode/*`, `.cursorrules` updates.
- `metrics/*.jsonl` appends (these are append-only logs).
- Auto-generated files: `llms.txt`, `llms-full.txt`, `package.json` `exports` regeneration after `pnpm release`.

## Modifiers (escalate or de-escalate)

These signals can shift a PR's tier independent of file paths.

**Always escalate to T4:**

- PR title or body contains "secret", "credential", "rotate", "leak", "incident".
- PR body explicitly asks reviewers to bypass a check.
- Author is a new agent (first PR from a new RemoteTrigger or new agent type).

**Escalate one tier:**

- Diff is > 1000 lines added (size correlates with risk).
- PR is from a fork (external contributor).
- PR has been force-pushed since the last review approval.
- PR removes a test file.

**De-escalate one tier (cap at T2):**

- Diff is < 20 lines added AND only touches files matching T1 globs.
- PR is a Dependabot update for a `devDependencies`-only package with patch-version bump.
- PR is a `chore(deps):` security update with no behavioral change (auto-detected by lockfile-only diff).

## Auto-merge eligibility

Currently, **only T1 PRs with all CI checks green are auto-mergeable**. The merge queue workflow (`.github/workflows/merge-queue.yml`) auto-merges PRs labeled `has-pr` (and not `needs-review`) when all CI checks pass.

T2 and above always require human approval. The user (Matt) is the only required reviewer.

## How agents apply this

`tier-classifier` workflow assigns the label automatically on PR open and on every push to the PR branch.

`code-reviewer` agent reads the assigned tier from PR labels and:

1. **T1**: Skim for typos and clarity. Tier 3 nits only.
2. **T2**: Apply Tiers 1 and 2 of `docs/review-criteria.md`. Skip Tier 3.
3. **T3**: Spawn the appropriate specialist agents (in parallel, per the file-area table in `review-criteria.md`). Apply Tiers 1 and 2 fully. End with explicit verdict.
4. **T4**: Spawn all relevant specialists. Apply Tier 1 of the rubric exhaustively. Require an ADR reference in the PR body. Block merge until user (Matt) personally approves.

## When the tiers are wrong

Update this file. Don't carry implicit tier knowledge in your head, and don't manually escalate-by-comment without updating the rules — the next PR with the same shape will get classified the old way.

## Cross-references

- `docs/review-criteria.md` — what to actually look for once a tier is assigned
- `docs/SECURITY-AI.md` — hard prohibitions that apply to T1 through T4
- `.github/workflows/tier-classifier.yml` — the workflow that assigns labels
- `.claude/agents/adr-compliance-reviewer.md`
- `.claude/agents/migration-reviewer.md`
- `.claude/plugins/pr-review-toolkit/` — the agent collection
