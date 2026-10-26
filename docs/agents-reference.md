# AGENTS.md reference

Reference material moved out of the root [AGENTS.md](../AGENTS.md) so it doesn't load into every agent session (and into `.cursorrules`, which `mbe sync-rules` generates from it). AGENTS.md keeps the mandates; read this when you need a package inventory, a tool list, or the routing/deploy/caching facts.

## Repository

### Packages

- `packages/` — Shared libraries: `agent-core` (incl. `./testing` test doubles), `api-client`, `auth`, `availability` (pure availability engine, no IO or clock), `cancellation-policy` (pure cancellation-fee/deposit decision engine), `config`, `database` (Prisma/Postgres pool wrapper), `gh-client` (typed GitHub wrapper + coordination-label state machine), `rialto` (Design System) + `rialto-catalog`/`rialto-plugin`, `sentry`, `service-bootstrap` (API versioning, service scaffolding, telemetry/health/readiness), `types`, `ui-quality-capture` (shared Playwright capture helper for the ui-quality loop). Each has its own `CLAUDE.md`.

### Multi-Repo Orchestration

`scripts/orchestrate-multi.mjs` (clone downstream repo → branch → commit → push → PR) was deleted as dead code in #3044. There is no scripted replacement — coordinating changes with external consumers (e.g. published `@mattbutlerengineering/rialto` versions) is manual today. See `docs/acmm/multi-repo-orchestration.md` for the current coordination strategy. <!-- rot-ignore: scripts/orchestrate-multi.mjs -->

## Continuous-improvement quick reference

Quick reference:

- `/idea-to-prod:implement-queue` — drain ready backlog (claim batch → parallel TDD worktree agents → PRs → serial merge train)
- `/site-audit [smoke|sweep|scout]` — crawl live site
- `/ci-monitor` — auto-fix simple CI failures
- `/progress-tracker` — metrics + circuit breaker
- `/acmm-audit` — score repo against AI Codebase Maturity Model

### ACMM Audit (All Agents)

The AI Codebase Maturity Model audit is a plain Node.js script — no Claude Code plugin required:

```bash
node plugins/acmm/scripts/audit.js              # Dry run — scores repo, writes report
node plugins/acmm/scripts/audit.js --apply       # Also files GitHub issues for next-level gaps
node plugins/acmm/scripts/audit.js --badge        # Also rewrites README badge
node plugins/acmm/scripts/audit.js --apply --badge # Full run
node plugins/acmm/scripts/audit.js --trend        # Print level history from state.json
node plugins/acmm/scripts/evals/index.js --report # Print instruction regression results
```

Output: `.claude/acmm/state.json` (machine-readable) and `.claude/acmm/report.md` (human-readable scorecard). Tests: `node --test plugins/acmm/scripts/__tests__/`.

### Synthetic Bug Audit (#1191)

The system includes a **Chaos Agent** and **Revert RCA Loop** to ensure high signal quality and continuous learning:

- **Chaos Agent:** Scheduled script (`scripts/chaos-agent.mjs`) that seeds detectable non-breaking bugs (console errors, Lighthouse regressions, a11y violations) to verify that audit loops catch them.
- **Revert RCA Loop:** Automatic trigger (`scripts/revert-rca.mjs`) that fires when an AI PR is reverted. It creates a critical RCA issue tasked for an agent to perform a Root Cause Analysis and update `.claude/rules/gotchas.md`.

### `mbe` CLI

`mbe` CLI subcommands (real binary):
`agent`, `pack`, `pack-changed`, `check-adr`, `check-deps`, `check-model`, `issue`, `loop`, `users`, `login`/`logout`/`whoami`, `sync-rules`. Run `mbe --help` for current list.

## Routing, Auth0 and Deployment

### Routing & URLs

- Served via Cloudflare Worker `edge-router` at `mattbutlerengineering.com`.
- Apps use path-prefix routing (e.g., `apps/hospitality` -> `/hospitality`).
- API services at `api.mattbutlerengineering.com` (DO App Platform).

### Auth0 Configuration

- Domain: `dev-ytbgmz5ls3wh4xdx.us.auth0.com`
- API Identifier: `https://api.mattbutlerengineering.com`

### Deployment

- Static sites (`apps/*`): `wrangler deploy` to Workers Static Assets.
- API Services (`services/*`): DO App Platform via `doctl`.
- Infrastructure: Pulumi (TypeScript).

## Semgrep configuration

### Configuration

- **Rules file:** `semgrep.yml` (root) — covers CWE-top vulnerabilities
- **Categories:** Code injection, SQL injection, XSS, hardcoded secrets, missing auth, insecure JWT
- **Registry rules:** `semgrep --config "p/security-audit"` for extended coverage

### Running Manually

```bash
semgrep --config semgrep.yml --error .           # Custom rules
semgrep --config "p/security-audit" --error .  # Semgrep registry rules
```

## Performance Infrastructure

The monorepo uses Turborepo for orchestration and caching. To maximize velocity:

- **Remote Caching:** Configured via Vercel Remote Cache. See [docs/TURBO.md](TURBO.md) for setup instructions. CI authenticates automatically using `TURBO_TOKEN` and `TURBO_TEAM` variables.
- **Selective Typechecking:** Use `pnpm turbo typecheck --filter='...[HEAD]'` to only check packages affected by current changes.
- **Autonomous Refresh:** `.husky/pre-commit` runs `scripts/precommit-llms-stage.mjs` to regenerate and stage AI context skeletons (`llms.txt`) for the packages affected by the staged commit; `.husky/post-checkout` runs `mbe pack-changed --mode checkout` after a branch switch. (The old `post-commit` hook was removed in #6633.)

## AI Context Catalog

Files agents should know about (in load order):

- `AGENTS.md` (this file) — primary cross-tool project context.
- `CLAUDE.md` — Claude Code mandates, skill catalog, deploy commands.
- `GEMINI.md` — Gemini-specific mandates (Silent TDD, Extreme Speed).
- `.cursorrules` — Cursor AI rules and project context.
- `opencode.json` — OpenCode configuration (models, permissions, MCP servers).
- `.codex/config.toml` — Codex CLI configuration (model, approval policy, sandbox).
- `.claude/rules/gotchas.md` — session-tested traps (pre-commit, CI, releases, Prisma).
- `packages/*/CLAUDE.md` and `services/*/CLAUDE.md` — domain-specific authoring rules.
- `llms.txt` — Rialto component catalog (UI patterns), regenerated by the pre-commit `precommit-llms-stage.mjs` hook (and `pack-changed` on checkout).
- `llms-full.txt` — Detailed prop tables and advanced examples.

## Installing the ai-tooling marketplace

**Install the ai-tooling marketplace:**

```bash
claude plugin marketplace add https://github.com/mattbutlerengineering/ai-tooling.git
claude plugin install ai-tooling
```
