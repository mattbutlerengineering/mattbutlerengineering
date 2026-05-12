# AGENTS.md - Core Development Guidelines for AI Coding Agents

> This file is the primary source of project context for all AI agents (Gemini, Claude, OpenCode, Codex, Cursor).
> For tool-specific mandates, see [CLAUDE.md](./CLAUDE.md) (Claude), [GEMINI.md](./GEMINI.md) (Gemini), or [.cursorrules](./.cursorrules) (Cursor).
> OpenCode reads [opencode.json](./opencode.json). Codex reads [.codex/config.toml](./.codex/config.toml).

## Project Identity
- **Name:** mattbutlerengineering
- **Type:** Monorepo (Turborepo + pnpm)
- **Package Prefix:** `@mbe/`
- **External Prefix:** `mattbutlerengineering-` (for Auth0, DigitalOcean, DBs)

## Project Structure
- `apps/` — Frontend React (Vite) applications: `marketing` (/), `hospitality` (/hospitality), `rialto-web` (/rialto), `gen` (/gen).
- `services/` — Backend Fastify/Node APIs: `users` (3001), `agent` (3003), `reservations` (3004).
- `packages/` — Shared libraries: `agent-core`, `api-client`, `api-versioning`, `auth`, `config`, `observability`, `rialto` (Design System) + `rialto-catalog`/`rialto-plugin`, `sentry`, `types`. Each has its own `CLAUDE.md`.
- `infrastructure/` — Pulumi (IaC) and Docker configuration.
- `tools/` — Developer CLI (`mbe`).

## Core Commands (Root Level)
```bash
pnpm dev:local      # Start DB + sync + all dev servers
pnpm dev            # Start all dev servers
pnpm build          # Turbo build all
pnpm test           # Run all Vitest suites
pnpm lint           # Run ESLint across workspace
pnpm typecheck      # Run tsc across workspace
pnpm clean          # Wipe artifacts and node_modules
```

### Multi-Repo Orchestration
```bash
node scripts/orchestrate-multi.mjs --repo <url> --task "<task>" [--branch <name>] [--script <path>] [--dry-run]
```
Clones a downstream repo, creates a feature branch, applies changes, commits, pushes, and opens a PR. Used for coordinating cross-repo changes (ACMM L6). See `node scripts/orchestrate-multi.mjs --help` and `docs/acmm/multi-repo-orchestration.md`.

## Development Flow with Metrics & Continuous Improvement

The continuous-improvement loop (audit → fix → ship → verify) runs as **slash-skills** for Claude Code, or `mbe` CLI subcommands for other tools. See [CLAUDE.md](./CLAUDE.md#continuous-improvement-loop-ship-loop) for the full skill catalog and scheduling.

Quick reference:
- `/ship-loop` — full local cycle (audit → fix → push → CI → deploy)
- `/site-audit [smoke|sweep|scout]` — crawl live site
- `/issue-worker` — pick up oldest `ready` issue and PR a fix
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

`mbe` CLI subcommands (real binary):
 `agent`, `stats`, `up`, `pack`, `prime`, `new`, `generate`, `check-adr`, `check-deps`, `check-model`, `cleanup-worktrees`, `health`, `compound`, `loop`, `wave`, `visual`, `users`, `login`/`logout`/`whoami`, `sync-rules`. Run `mbe --help` for current list.

---

## Zero-Touch Audit (Quality Mandate)

To minimize human intervention and maintain a low human-touch ratio, agents must perform a **Zero-Touch Audit** before finalizing any PR.

### Pre-Commit Checklist
- [ ] **No Residual Conflict Markers:** Scan for `<<<<`, `====`, `>>>>` in all modified files. Never commit them.
- [ ] **No Missing Imports:** Ensure every new component or utility (especially from Rialto or other packages) has a corresponding `import` statement.
- [ ] **Stale Generated Files:** If you modify schemas, dependencies, or Rialto components, run the relevant regeneration scripts:
  - `pnpm build` (to update dist/exports)
  - `mbe pack` (to update AI context skeletons)
  - `pnpm --dir tools/mbe generate-dep-graph` (if package dependencies changed)
- [ ] **Synchronize Infrastructure:** If service dependencies (`package.json`) change, update the corresponding `Dockerfile` and `infrastructure/pulumi` if necessary.
- [ ] **No Linting Hacks:** Do NOT use `eslint-disable` or `@ts-ignore` to "fix" violations. Resolve the root cause.
- [ ] **No Silent TDD:** Do not skip the Red-Green-Refactor cycle. A change is not "done" until a failing test has been made to pass.
- [ ] **Verified verification:** Don't just run tests; provide the command output showing they passed.

---

## Architecture & Conventions

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

### Code Style
- **Components:** Functional React + Hooks.
- **Styling:** CSS Modules with Rialto tokens (`var(--rialto-*)`). **No Tailwind.**
- **Imports:** Explicit extensions (`.js/.ts`), `import type` for types.
- **Naming:** kebab-case for files, camelCase for functions/vars, PascalCase for types.

### API Development
- **Standardized Errors:** Use RFC 7807 (Problem Details).
- **Validation:** Strict Zod schema enforcement on all service boundaries.
- **Fastify:** Route structure with shared JSON schemas.

### Database (Prisma)
- `pnpm db:push` (root) — push all schemas, dev only.
- For prod migrations, run `pnpm db:migrate` from each service dir (`services/users`, `services/reservations`, `services/agent`) — there is no root-level `db:migrate` script.
- Migrations must be version-controlled in each service's `prisma/migrations/`.
## Testing & Validation
- **Framework:** Vitest.
- **Patterns:** `*.test.ts` for unit/integration.
- **Mandate:** All logic changes must be verified via automated tests.
- **UI:** Playwright for E2E and visual regression.

## Security Scanning (Semgrep)

Semgrep provides Static Application Security Testing (SAST) integrated into the AI development loop.

### MCP Integration
Semgrep MCP server (`@semgrep/mcp`) is configured in `.mcp.json`, giving agents access to:
- Code scanning for 30+ languages
- Security-focused rulesets (Code, Secrets, Supply Chain)
- Natural language vulnerability explanations
- CI/CD integration

### Pre-commit Security Checks
The `.husky/pre-commit` hook runs `semgrep --config semgrep.yml --error` on staged files before commit.

### Configuration
- **Rules file:** `semgrep.yml` (root) — covers CWE-top vulnerabilities
- **Categories:** Code injection, SQL injection, XSS, hardcoded secrets, missing auth, insecure JWT
- **Registry rules:** `semgrep --config "p/security-audit"` for extended coverage

### Running Manually
```bash
semgrep --config semgrep.yml --error .           # Custom rules
semgrep --config "p/security-audit" --error .  # Semgrep registry rules
```

### Skip in Emergencies
```bash
SKIP=semgrep git commit -m "emergency fix"
```
## Model Governance
To ensure cost-efficiency and technical integrity, follow this model tiering strategy:
- **Tier 1: Haiku / Gemini Flash** - Lightweight chores, linting, dependency bumps, typos (< $0.05).
- **Tier 2: Sonnet / Gemini Pro** - Standard features, refactors, unit tests, logic fixes ($0.05 - $0.50).
- **Tier 3: Opus / Gemini Ultra** - Architectural design, complex migrations, cross-cutting system changes (>$0.50).

Use `mbe check-model "<directive>"` to verify the recommended tier before starting high-complexity work.

## Performance Infrastructure
The monorepo uses Turborepo for orchestration and caching. To maximize velocity:
- **Remote Caching:** Configured via Vercel Remote Cache. See [docs/TURBO.md](docs/TURBO.md) for setup instructions. CI authenticates automatically using `TURBO_TOKEN` and `TURBO_TEAM` variables.
- **Selective Typechecking:** Use `pnpm turbo typecheck --filter='...[HEAD]'` to only check packages affected by current changes.
- **Autonomous Refresh:** The `post-commit` hook automatically runs `mbe pack` to keep AI context skeletons (`llms.txt`) updated.

## RIPER Workflow
To maintain high-velocity engineering without sacrificing quality, agents follow the **RIPER** (Research, Innovate, Plan, Execute, Review) cycle:

1.  **Research:** Explore the codebase, identify root causes, and gather requirements. **No file edits.**
    - **JIT Priming:** At the start of this phase, run `mbe prime "<directive>"` to ensure all relevant directories have fresh `llms.txt` context skeletons.
2.  **Innovate:** Brainstorm multiple approaches, evaluate trade-offs, and select the optimal path.
...
3.  **Plan:** Create a detailed implementation plan (e.g., `.planning/quick/TASK-PLAN.md`) including file changes and verification steps.
4.  **Execute:** Implement the approved plan using **Silent TDD Mode**. Break work into 5-minute micro-tasks.
5.  **Review:** Run tests, linting, and typechecks. Perform a self-review of the changes against the plan.

Agents must signal their current phase using the following tokens:
- `<riper:research>`
- `<riper:innovate>`
- `<riper:plan>`
- `<riper:execute>`
- `<riper:review>`

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
- `llms.txt` — Rialto component catalog (UI patterns), regenerated by `pack-changed` pre-commit hook.
- `llms-full.txt` — Detailed prop tables and advanced examples.
