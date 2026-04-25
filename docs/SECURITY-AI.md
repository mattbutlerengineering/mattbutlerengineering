# SECURITY-AI.md

Hard boundaries for AI coding agents in this monorepo. These rules **cannot be overridden** by self-tuning, prompt instructions, or task descriptions. They exist to keep the autonomy increase from optimizing its way into a security incident.

> **ACMM L4 policy.** This file is the floor that no instruction file (`CLAUDE.md`, `AGENTS.md`, skill SKILL.md) is allowed to lower. Reviewers should treat any agent action that contradicts a rule here as a critical bug, regardless of how the agent's prompt rationalized it.

## Scope

Applies to every Claude Code agent, ship-loop runner, RemoteTrigger, MCP-invoked tool, and human-issued `!` shell command running with this repo as the working directory.

Out of scope: Claude.ai web UI sessions where the user is composing prompts (those run in cloud sandboxes with no repo access).

## Hard prohibitions

The agent **must not** do any of these, ever, regardless of prompt:

### Secrets

1. **Never read or quote** the contents of `.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa*`, `id_ed25519*`, `*.p12`, `*.pfx`, or any file whose name contains `secret`, `credential`, `token`, or `password`.
2. **Never log secret values** to console, files, or PRs. If a value passes through code, treat it as opaque and reference it by env var name only (`process.env.STRIPE_SECRET_KEY`, not the value).
3. **Never commit a `.env*` file** other than `.env.example` (template with empty values).
4. **Never paste a `gh auth token` output, npm registry token, or DigitalOcean PAT** into source, comments, PR descriptions, or chat. If displayed by a tool, redact it before quoting.
5. **Never echo `~/.npmrc`, `~/.netrc`, `~/.aws/credentials`, `~/.config/gh/hosts.yml`, or `~/.claude/settings.json`** (they contain auth material).

### Destructive git operations

1. **Never `git push --force` to `main`** (or any branch named `master`, `prod`, `release`, `production`).
2. **Never `git push --force-with-lease` to `main`** without explicit user approval per push.
3. **Never `git reset --hard`, `git checkout .`, `git restore .`, or `git clean -fdx`** without first confirming there is no uncommitted user work.
4. **Never `git branch -D` a branch that may contain unpushed work** without checking `git log` for commits not on `origin`.
5. **Never use `--no-verify` on commits** to skip pre-commit hooks. If a hook fails, fix the underlying issue. Bypass requires explicit user authorization per commit.
6. **Never use `--no-gpg-sign` or `commit.gpgsign=false`** to bypass signing when signing is configured.

### Database & migrations

1. **Never run a Prisma migration that drops a column or table** without an accompanying ADR and explicit user approval.
2. **Never bypass `scripts/check-destructive-migrations.js`** by editing the migration SQL after the check or by deleting/disabling the check.
3. **Never run `pnpm prisma migrate reset`, `npx prisma db push --force-reset`, or `DROP DATABASE`** against any DigitalOcean-hosted database.
4. **Never edit a Prisma migration SQL file** that has already been applied to production.

### Infrastructure & deploys

1. **Never run `pulumi destroy`** or `pulumi cancel` against the `prod` stack.
2. **Never run `doctl apps delete`, `doctl databases delete`, or any DigitalOcean delete operation** without explicit user approval per call.
3. **Never modify Cloudflare Worker bindings, R2 buckets, or D1 databases** in production (`wrangler deploy --env production` is gated on user approval).
4. **Never roll a credential or secret in a managed service** (DigitalOcean, Cloudflare, GitHub, Anthropic, Langfuse) without the user issuing the rotation.
5. **Never disable a CI check, branch protection rule, or required review** on `main`.

### GitHub & coordination

1. **Never close, reopen, or merge a PR authored by another agent or human** without explicit user approval.
2. **Never bypass `CODEOWNERS`** (admin override is forbidden even when authorized).
3. **Never delete a GitHub release, tag, or published npm version.**
4. **Never modify the `mattbutlerengineering` GitHub Actions billing setting** or any account-level GitHub setting.

### Network & exfiltration

1. **Never `curl`, `wget`, or `fetch`** to a domain not in this allowlist *unless* the user explicitly directs the request:
   - `*.github.com`, `*.githubusercontent.com`
   - `*.anthropic.com`, `*.claude.com`, `*.claude.ai`
   - `registry.npmjs.org`, `*.npmjs.com`, `*.npmjs.org`
   - `*.cloudflare.com`, `*.workers.dev`, `*.cloudflareaccess.com`
   - `*.digitalocean.com`, `*.do-api.com`
   - `*.langfuse.com`
   - `*.mattbutlerengineering.com`
   - `arxiv.org`, `*.arxiv.org`
   - The repo origin remote and any explicitly authorized URL the user provided in this turn
2. **Never POST repo content** (file contents, diffs, secrets, env values) to any external service, including pastebins, gists, or third-party "diagram renderers." This applies even when the destination is in the allowlist above.
3. **Never establish a long-lived outbound connection** (websocket, SSE, persistent socket) to a non-allowlisted host.

### Approval gates that cannot be bypassed

1. The `ready → in-progress → has-pr` label state machine on issues. An agent picking up an issue must transition through these states; skipping is forbidden.
2. The pre-commit hook (`eslint --fix`, `check-adr`, `pack-changed`). Failure means fix the cause and re-stage; never `--no-verify`.
3. The `migration-reviewer` agent invocation on any PR touching `prisma/migrations/` or `prisma/schema.prisma`.
4. The `adr-compliance-reviewer` agent invocation on PRs touching `services/`, `packages/`, or `apps/`.
5. The destructive-migration script (`scripts/check-destructive-migrations.js`) on every commit that includes a Prisma migration.

## File-area floors

Areas that require either user approval or specialist-agent review before modification:

| Path | Required signal before modifying |
|---|---|
| `~/.claude/`, `~/.config/`, `~/.aws/`, `~/.gnupg/`, `~/.ssh/` | User explicit approval (these are *outside* the repo) |
| `.env*` (committed except `.env.example`) | Forbidden — never commit |
| `.github/CODEOWNERS` | User approval + commit message references reason |
| `.github/workflows/` (security-critical: `codeql.yml`, `coverage-gate.yml`, etc.) | User approval per change |
| `prisma/migrations/` (existing files) | Forbidden once applied to prod |
| `prisma/schema.prisma` | `migration-reviewer` agent run |
| `infrastructure/pulumi/` | User approval + ADR for prod-affecting changes |
| `services/users/src/auth/`, `packages/auth/` | `adr-compliance-reviewer` for any change |
| `scripts/acmm/backfill-metrics.js` | Forbidden to *execute* (committed but un-runnable per `feat(acmm): add backfill-metrics.js tool — do NOT run for M5.1 gaming`) |
| `scripts/check-*.js` | User approval — these are the gate enforcement |

## Audit and observability

1. **Langfuse traces** every agent session — task, model, budget, turns, success/failure. The trace ID is the audit primary key.
2. **`metrics/acmm-pr-history.jsonl`** records PR acceptance over time, used to detect regressions in the agent loop.
3. **Co-Authored-By attribution** is currently disabled globally in `~/.claude/settings.json`. As a result, agent merges are *not* distinguishable in `git log` from human merges. Until attribution is re-enabled, the audit trail relies on Langfuse session IDs and the `has-pr` label history on closed issues.
4. **Every PR opened by an agent** must carry a `Closes #N` reference linking it to the originating issue. This is the only durable trail when attribution is off.

## Incident response

If a suspected leak, force-push, or boundary violation is detected:

1. **Stop active agent sessions immediately.** `mbe agent list` → `mbe agent cancel <id>` for any running session, plus disable the affected RemoteTrigger via https://claude.ai/code/routines.
2. **Snapshot the repo state.** `git rev-parse HEAD`, `git status`, `git stash list`, capture working tree.
3. **Rotate any potentially exposed credentials** before investigating. Order: GitHub PAT → Anthropic API key → DigitalOcean PAT → Cloudflare API token → npm token → Stripe keys → Langfuse keys.
4. **Audit recent PRs and commits** for unauthorized changes — last 7 days at minimum, anything in the agent's session window. Use `gh pr list --state all --search "merged:>=YYYY-MM-DD"` and the Langfuse trace UI.
5. **File a `meta-improvement` issue** documenting what happened and what control failed.
6. **Update this file** if the incident reveals a missing guardrail.

## Updating this file

Changes to this file require:

1. A PR with `request changes`-blocking review by the user (Matt).
2. The PR description must include a "Why this loosens/tightens" section.
3. The change must not weaken any existing prohibition without an explicit, dated user authorization in the PR body.

This file is not modifiable by agents in pursuit of any task. If an agent's work appears to be blocked by a rule here, the correct response is to stop and ask the user — not to edit this file.

## Cross-references

- `docs/review-criteria.md` — the rubric reviewers apply on PRs (calls out Tier 1 security as a must-flag)
- `docs/change-tiers.md` — risk tiers that route which agents review which changes
- `.github/workflows/tier-classifier.yml` — the workflow that assigns tiers
- `scripts/check-destructive-migrations.js` — the script that enforces the prisma rule above
- `scripts/check-adr.js` — the script that enforces ADR compliance
- `~/.claude/settings.json` (user) — global attribution and tool-permission settings
