# Claude Code reference

Reference tables and mechanics moved out of the root [CLAUDE.md](../CLAUDE.md) so they don't load into every session. Read this when you need a skill, subagent, `mbe` command, label, or learning-loop detail.

The Skills, Subagents and `mbe` CLI tables below are guarded against drift from the repo tree by `scripts/check-claude-md-table-drift.mjs` (in `repo-audit`) — keep their headings exact.

### Skill Directory

Claude Code loads project skills from **`.claude/skills/`** (alongside `~/.claude/skills/` and plugins). It holds both project-automation and general-engineering advisor skills. All skills are invocable via `/skill-name` and discoverable via the system's skill registry.

### Plugin-provided skills

Generic lifecycle skills (idea, prd, architect, implement, review, ship, automate, and the rest) come from the `idea-to-prod` plugin, enabled in `.claude/settings.json` and invoked as `/idea-to-prod:<name>`. Repo-local skills are kept only when repo-specific (#6332). `scripts/check-skill-references.mjs` resolves these qualified references against its declared plugin skill list.

### Skills

**Project Automation** (`.claude/skills/`)

| Skill                            | Purpose                                                                                                                                                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/ideate`                        | Autonomous feature ideation: advance the batch cycle (vetoes → decompose → completion sweep), then propose 4-5 charter-grounded features when the batch is done                                                                                                     |
| `/site-audit`                    | Crawl live site with Playwright + Lighthouse, create issues                                                                                                                                                                                                         |
| `/ci-monitor`                    | Check CI health, auto-fix simple failures, escalate complex ones                                                                                                                                                                                                    |
| `/progress-tracker`              | Metrics, self-tuning circuit breaker, trend analysis                                                                                                                                                                                                                |
| `/learning-loop`                 | Sensor-driven improvement: collect metrics → detect regressions → create issues → verify fixes → self-tune                                                                                                                                                          |
| `/sentry-triage`                 | Query Sentry for production errors, filter by severity/frequency, deduplicate, create GitHub issues for implement-queue                                                                                                                                             |
| `/acmm-audit`                    | Score repo against canonical AI Codebase Maturity Model (6 levels, 100+ criteria from ACMM/Fullsend/AEF/Reflect), file next-level-gap issues, update README badge — now ships as the `plugins/acmm` plugin (extracted in #818), not a `.claude/skills/` entry       |
| `/chaos-agent`                   | Seed non-breaking but detectable bugs (lint violations, dead links) to verify autonomous audit/lint loops catch and file issues; runs weekly                                                                                                                        |
| `/claude-md-improver`            | Audit CLAUDE.md / AGENTS.md / `.claude/rules/*` for dangling paths, skill-table drift, mandates that don't resolve, and undocumented surfaces; runs monthly                                                                                                         |
| `/claude-automation-recommender` | Audit `.claude/hooks`, `.claude/agents`, `.claude/skills`, `.github/workflows` for guards that never fire, fire wrongly, or are missing; runs monthly                                                                                                               |
| `/decompose`                     | Break a feature into ordered, agent-sized GitHub issues implement-queue can work through sequentially                                                                                                                                                               |
| `/dep-bump`                      | Batch-apply pnpm.overrides for CVE fixes across multiple Dependabot alerts in a single PR                                                                                                                                                                           |
| `/local-ci-precheck`             | Run lint + typecheck + architecture-audit + drift checks locally and in parallel before opening or pushing a PR                                                                                                                                                     |
| `/md-audit`                      | Weekly semantic pass over human-facing markdown (README, CONTRIBUTING, docs/\*\*) — finds prose claims the repo no longer satisfies; the mechanical half is `pnpm check:markdown` (`scripts/audit-markdown.mjs`), both driven by `.github/workflows/docs-audit.yml` |
| `/optimize-implement-queue`      | Daily loop: measure implement-queue efficiency via the queueEfficiency sensor, log trend, file de-duplicated issues on regression                                                                                                                                   |
| `/perf-budget`                   | Check bundle size impact of current changes against size-limit baselines                                                                                                                                                                                            |
| `/revert-rca-loop`               | Detect AI-authored PR reverts, match to the original PR, trigger a Reflection session for root-cause analysis; runs hourly                                                                                                                                          |
| `/ship-pr`                       | Run the full merge boundary on one open PR — build-freshness, CI-gate classification, diff-matched specialist review plus the universal reviewer, then merge                                                                                                        |

**User-level skills** (not in this repo): `/caveman`, `/diagnose`, `/grill-with-docs`, `/improve`, `/improve-codebase-architecture`, `/tdd`, `/to-issues`, `/triage`, and `/write-a-skill` were retired from `.claude/skills/` by PR #3323 and are not installed anywhere as of 2026-10-16 — don't expect them to resolve. The Communication section's caveman _mode_ is a standing instruction to follow directly, not a call to the retired `/caveman` skill.

**Plugin-provided replacements** (`idea-to-prod@skills`, enabled in `.claude/settings.json`; local sessions only — cloud routines and GitHub Actions do not load the plugin, #6332): `/implement-queue` moved to the plugin as `/idea-to-prod:implement-queue` (skills#720, ADR-0087); everything repo-specific — label transitions, the `CI Gate` classifier, specialist reviewers, merge-train lock, reaper, telemetry, and `merge: auto` — is in its queue profile [`.claude/implement-queue.md`](../.claude/implement-queue.md). Cloud routines and `scheduled-issue-completion.yml` clone the public skills repo and follow `skills/implement-queue/SKILL.md` by path. `/prisma-migrations` was retired in favour of `/idea-to-prod:prisma-migrations` (skills#691 rewrote it with a "Must never" list and copyable CI/CD assets; the repo-local copy was the pre-plugin original, skills#934). `/gotcha-harvest` was retired in favour of `/idea-to-prod:knowledge-base`'s transcript harvest (`kb.py harvest <repo root> --days N`, proposes bullets for `.claude/rules/gotchas.md`). Pass the **main checkout's** root path, not a worktree's — from a worktree path the transcript lookup finds nothing (measured).

### Subagents

`.claude/agents/` holds 9 specialist subagents (8 reviewers + 1 worker), dispatched via the `Agent` tool with `subagent_type: <name>` — `<name>` is each file's frontmatter `name:` field (not its filename; they happen to match here, but the registry keys on `name:`). Reviewers are typically spawned with a diff or list of changed files (e.g. `git diff --name-only origin/main...HEAD`); "when to invoke" below is derived verbatim from each agent's own frontmatter `description:`.

| Subagent                                  | Catches                                                                                                                                                                                                                                                                                                                     | When to invoke                                                                                                                                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adr-compliance-reviewer`                 | Semantic ADR violations beyond `check-adr`'s regex `prohibited_patterns` (e.g. `fetch` used directly where an ADR mandates `@mbe/api-client`)                                                                                                                                                                               | A commit or PR touches code that might violate an active ADR (`docs/adr/*.md`, `status: active`)                                                                                               |
| `dependency-update-reviewer`              | Unsafe dependency version bumps, `pnpm.overrides` changes — see [gotchas.md § Dependencies](../.claude/rules/gotchas.md#dependencies)                                                                                                                                                                                       | Dependabot PRs arrive, `pnpm.overrides` change, or manual dependency upgrades are proposed                                                                                                     |
| `e2e-selector-drift-reviewer`             | Strict-mode Playwright selector collisions, volatile-text locators, stateful-mock gaps — the class that took Hospitality E2E from 31→7 failing specs across #2709/#2711/#2713/#2718                                                                                                                                         | Playwright E2E spec files under `apps/*/e2e/**` (e.g. `apps/hospitality/e2e/*.spec.ts`) are added or modified                                                                                  |
| `generated-artifact-determinism-reviewer` | `llms.txt`/`llms-full.txt`/`generated-schemas.ts`/dep-graph drift and cross-platform non-determinism that only surfaces in CI's `Integrity` job — this class wedged the #2195→#2217 merge train; see [gotchas.md § Build / pnpm / turbo](../.claude/rules/gotchas.md#build--pnpm--turbo)                                    | A PR touches `**/llms.txt`, `**/llms-full.txt`, `**/generated-schemas.ts`, `infrastructure/worker/dep-graph.json`, `docs/architecture/dependency-graph.md` or `tools/cli/src/commands/pack.ts` |
| `implement-queue-worker`                  | (worker, not reviewer) implements a single GitHub issue in an isolated worktree via TDD — installs deps, writes a failing test first, implements, runs lint/typecheck/test gates, commits, pushes, and opens a PR targeting `main`; see [gotchas.md § Build / pnpm / turbo](../.claude/rules/gotchas.md#build--pnpm--turbo) | Designed to be spawned by `/idea-to-prod:implement-queue` with `isolation: "worktree"` — not invoked directly for review                                                                       |
| `migration-reviewer`                      | Destructive operations, scope creep, and — critically — semantic mismatches between a Prisma migration and the code change it accompanies (e.g. a drop-column migration paired with code that still reads that column)                                                                                                      | A Prisma migration SQL file or a Prisma schema is added or modified                                                                                                                            |
| `reviewer`                                | Hallucinations, regressions, gate bypasses, and acceptance-criteria gaps in a worker agent's diff, scored 0–10 pass/flag — see [gotchas.md § CI](../.claude/rules/gotchas.md#ci) (auto-merge bullet)                                                                                                                        | At the implement-queue worker→train boundary, after PR CI is green and before `gh pr merge --auto`                                                                                             |
| `rialto-prop-drift-detector`              | Test-vs-component prop signature mismatches in `packages/rialto` — the class of bug behind commit `e08792a` (accessibility tests calling `<AppBar title="...">` long after the component switched to `<AppBar logo={...}>`)                                                                                                 | `packages/rialto/src/components/**` changes, or tests in `packages/rialto/src/test/**` or `packages/rialto/src/**/*.test.tsx` reference rialto components                                      |
| `stripe-flow-reviewer`                    | Missing webhook signature verification, dropped idempotency keys, float/integer money-handling bugs, and broken refund/deposit/charge state-machine transitions                                                                                                                                                             | A PR touches payment, webhook, deposit, charge, or refund files — or any file whose name contains "stripe"                                                                                     |

## mbe CLI Commands

All top-level commands registered in `tools/cli/src/command-loaders.ts`:

| Command        | Subcommands                                                                                                | Purpose                                                                                                                                                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent`        | `run`, `start`, `list`, `status`, `logs`, `cancel`, `delete`, `cost`, `orchestrate`, `eval`, `frontmatter` | Run autonomous coding agents (local via `@mbe/agent-core` or API-backed via agent service)                                                                                                                                                                                 |
| `check-model`  | —                                                                                                          | Resolve model selection for a directive (dry-run) or a GitHub issue (`--issue <number>`)                                                                                                                                                                                   |
| `check-adr`    | —                                                                                                          | Validate codebase against active Architecture Decision Records (ADRs)                                                                                                                                                                                                      |
| `check-deps`   | —                                                                                                          | Audit dependency version consistency across the monorepo                                                                                                                                                                                                                   |
| `issue`        | `transition`                                                                                               | GitHub issue coordination commands — **note:** `issue transition` cannot run in Claude Code Remote sessions (GraphQL-backed `gh` subcommands answer HTTP 403 there); see [gotchas.md § Claude Code Remote](../.claude/rules/gotchas.md#claude-code-remote--cloud-sessions) |
| `login`        | —                                                                                                          | Authenticate with the API                                                                                                                                                                                                                                                  |
| `logout`       | —                                                                                                          | Clear stored credentials                                                                                                                                                                                                                                                   |
| `loop`         | —                                                                                                          | Run an agent directive in an autonomous loop (Ralph Wiggum pattern)                                                                                                                                                                                                        |
| `pack`         | —                                                                                                          | Generate AI context (llms.txt) for a service or package                                                                                                                                                                                                                    |
| `pack-changed` | —                                                                                                          | Automatically run `mbe pack` on changed directories (git hook)                                                                                                                                                                                                             |
| `sync-rules`   | —                                                                                                          | Synchronize agent rules from AGENTS.md to tool-specific files                                                                                                                                                                                                              |
| `users`        | `list`, `get`                                                                                              | User management commands                                                                                                                                                                                                                                                   |
| `whoami`       | —                                                                                                          | Show current user info                                                                                                                                                                                                                                                     |

### GitHub Labels (coordination state machine)

Two families, and they do different jobs. The **issue-state** labels below drive which issues an agent picks up; the **PR merge-gate** labels in the next table decide whether a PR is allowed to merge. A session driving the merge train needs both.

#### Issue state

| Label              | Meaning                                                               |
| ------------------ | --------------------------------------------------------------------- |
| `ready`            | Available for agent pickup                                            |
| `in-progress`      | Agent is working on it                                                |
| `has-pr`           | PR created, awaiting merge/review                                     |
| `agent-failed`     | Agent could not complete — needs manual review or retry               |
| `agent-skip`       | Exhausted max retries — needs manual review or different approach     |
| `audit`            | Found by site-audit                                                   |
| `ci-fix`           | CI failure needing fix                                                |
| `feature`          | New feature (created by `/decompose`)                                 |
| `tracking`         | Parent issue tracking multi-part feature                              |
| `meta-improvement` | Process improvement suggestion                                        |
| `acmm`             | AI Codebase Maturity Model finding (created by `/acmm-audit --apply`) |
| `sentry`           | Production error triaged from Sentry                                  |

#### PR merge gates

These are the labels that actually decide whether a PR merges. `tier:*` is applied by `.github/workflows/tier-classifier.yml`: the **base** tier comes from changed file paths, but title/body prose can **escalate** it — a bare-word match on `secret(s)`, `credential(s)`, `rotate`, `leak`/`leaked`/`leaking`/`leaks`, or `incident(s)` bumps the tier by one when it is an incident signal (the keyword in the title, or in a body sentence that also carries a cue such as leaked/exposed/compromised/breached/revoked or "rotate the…"; a merely descriptive body mention does not escalate), or hard-sets T4 if a changed file already matched a T3/T4 sensitive-path rule. A diff over 1000 added lines also bumps one tier, counting review-surface lines only (generated files such as `llms*.txt`, lockfile, `registry.json` and `docs/features/**` run artifacts are excluded). Both decisions are the pure `scripts/tier-escalation.mjs`. Boilerplate checklist lines (`- [ ]`/`- [x]`) are stripped before this scan, so filling in `PULL_REQUEST_TEMPLATE.md`'s "No hardcoded secrets or credentials" item does not by itself escalate a PR. The tier policy itself lives in [docs/change-tiers.md](../docs/change-tiers.md), and the eligibility decision is the pure, unit-tested `scripts/merge-queue-eligibility.mjs`.

| Label            | Meaning                                                                                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auto-merge`     | Opts a PR into `auto-merge.yml` / the automation merge train. Applied by the automation PR producers (drift-fix, pr-metrics, production-feedback, acmm-regression); `auto-qa-tune` deliberately does not |
| `needs-review`   | Blocks auto-merge — a human must look at this PR                                                                                                                                                         |
| `tier:trivial`   | T1. Auto-mergeable when CI is green                                                                                                                                                                      |
| `tier:standard`  | T2. **Blocks auto-merge** — reviewer agent + 1 human review                                                                                                                                              |
| `tier:sensitive` | T3. **Blocks auto-merge** — reviewer + a specialist subagent + 1 human review                                                                                                                            |
| `tier:critical`  | T4. **Blocks auto-merge** — all of T3, plus Matt personally, plus an ADR or `meta-improvement` issue documenting why                                                                                     |

> A PR carrying **no** `tier:*` label keeps the pre-#3787 behaviour rather than being blocked. `tier-classifier.yml` triggers on `pull_request` natively, and also accepts a `workflow_dispatch` escape hatch (#4070) that the four automation producers (drift-fix, production-feedback, pr-metrics, acmm-regression) call directly and wait on, so it now runs reliably on `GITHUB_TOKEN`/`AUTOMATION_PAT`-authored automation PRs too. Residual risk: `AUTOMATION_PAT` is still not configured as a repo secret (see [docs/SECRETS.md](../docs/SECRETS.md)), so the action-required-approval step those same producers rely on for their other `pull_request`-triggered checks still falls back to a `GITHUB_TOKEN` no-op. See [gotchas.md § CI](../.claude/rules/gotchas.md#ci) for the consequences.

## Session Learning & Feedback Loop

Four `.claude/` directories work together to capture agent learning across sessions, distinguish between human-driven and loop-discovered insights, and feed them back into project guidance: `.claude/memory/`, `.claude/reflections/`, `.claude/improvement-loop/`, and `.claude/sessions/`. See `.claude/memory/README.md`, `.claude/reflections/README.md`, and `.claude/sessions/README.md` for local documentation.

(`.claude/agent-spend/` and `.claude/state/` also live under `.claude/` but are plain data caches — agent spend telemetry and a Dependabot cache respectively, neither read nor written as part of the learning loop — so they're deliberately out of scope here.)

### `.claude/memory/` — Corrections and Reinforcements

**Holds:**

- `corrections/` — capture files when the agent makes mistakes
- `reinforcements/` — capture files when the agent succeeds

**What writes to it:**

- A human (or an agent at the human's request) writing the capture file directly — see [Capturing a correction by hand](#capturing-a-correction-by-hand) below. **There is no `/reflect` skill**: these docs named one for months and it has never existed in this repo's history or in `~/.claude/skills/` (measured, https://github.com/mattbutlerengineering/mattbutlerengineering/issues/5586)
- Manual session notes captured by the user

**What reads it:**

- Claude Code loads recent corrections at session start to bias against recurring mistakes

**Structure:**
Each file is named `YYYY-MM-DD-<slug>.md` with frontmatter:

- `date`, `session`, `trigger` (what went wrong), `correction` (fix), `root_cause` (why), `prevention` (how to avoid)
- For reinforcements: `action`, `context`, `pattern`
- Corrections include `feeds_back_into:` field linking to where they were promoted (e.g. `.claude/rules/gotchas.md#releases-changesets--rialto`)

**Examples of promoted entries:** Four corrections became gotchas entries:

- **2026-03-27** CDN-cache/Workers constraint → `gotchas.md § Deploy / static sites` ("Static sites must deploy as Cloudflare Workers...")
- **2026-04-23** changesets push-ordering rule → `gotchas.md § Releases` ("Push before you version...")
- **2026-04-25** zsh `$status` reserved-variable trap → `gotchas.md § Shell (zsh)` ("Never use `status` as a shell variable name...")
- Rialto setState-in-useEffect ban → `gotchas.md § Pre-commit / lint` ("Rialto components must NOT call `setState`...")

### `.claude/reflections/` — Session Summaries and Root-Cause Analysis

**Holds:**

- `README.md` — format documentation
- `YYYY-MM-DD-<slug>.md` — individual reflections captured after sessions or multi-retry debugging

**What writes to it:**

- A human writing the reflection file at session end, synthesizing corrections and reinforcements into actionable insights (same hand-written path as `corrections/` — no `/reflect` skill exists)
- `/revert-rca-loop` skill files RCA documents after AI-authored PRs are reverted (e.g. `RCA-PR-3588.md`)

**What reads it:**

- Claude Code loads active reflections (< 6 months old) at session start for context
- Manual review to understand past debugging paths and architecture decisions

**Distinction from memory:** Reflections are the analytical layer. A memory correction is raw ("user said X was wrong"). The reflection synthesizes it ("why that happened, what changed, what prevents recurrence").

### `.claude/improvement-loop/` — Autonomous Loop Telemetry

**Holds:**

- `log.md` — append-only daily run log of autonomous loop sensors (ACMM score, CI health, issue feedback, etc.)
- `revert-log.md` — append-only log of detected PR reversions

**What writes to it:**

- Scheduled loops (`/learning-loop`, `/ideate`, etc.) append a dated entry with sensor state, regressions detected, and verification results
- `/revert-rca-loop` appends reversion detections to `revert-log.md`

**What reads it:**

- `/claude-md-improver` scans `log.md` for recurring gotcha-discovery patterns (e.g. the ten separate entries on "missing `gh` in cloud sessions" before it earned a gotchas bullet)

**Purpose:** Append-only record of autonomous-loop health and sensor trends. Used to detect regressions, discover repeat problems, and bootstrap new gotchas. The log does **not** contain detailed reasoning (that goes to reflections); it's a summary of facts and thresholds.

### `.claude/sessions/` — Per-Session Summaries

**Holds:** one archived summary per session, named `YYYY-MM-DD-<slug>.md`.

**What writes to it:** during a session, the agent maintains `.claude/session-summary.md` as a scratchpad (started from `.claude/session-summary.template.md`). At session end, the `session-archive.sh` Stop hook copies it here as `YYYY-MM-DD-HHMMSS.md` unless it's still byte-identical to the template; renaming to the slug convention is a manual step the hook can't do for you.

**What reads it:** `plugins/acmm/scripts/substance.js`, for the `acmm:session-summary` and `acmm:session-continuity` criteria — both read the frontmatter `date:` only (never a body date) and require an entry within the last 90 days.

**Distinct from `.claude/session-logs/`** — a similarly-named but unrelated directory holding JSON session transcripts written by the `session-logger.sh` hook and pruned by the `session-log-rotate.sh` SessionStart hook (90-day/500-file cap). Nothing cross-references the two.

Full mechanics, including a guard bug that silently disabled the archive hook for most of its life (#910 → #5598): [`.claude/sessions/README.md`](../.claude/sessions/README.md).

### Promotion Path: Corrections → Gotchas

The `.claude/rules/gotchas.md` file is the canonical source for project-specific traps. Entries come from two sources:

| Source                                                           | How it lands in gotchas                                                                                | Approval gate                                      | Example                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Human error** (hand-written correction)                        | Manual PR to CLAUDE.md after user says "this should be documented"                                     | User review during PR                              | Rialto setState-in-useEffect ban                                              |
| **Loop discovery** (from `/idea-to-prod:knowledge-base` harvest) | The harvest mines session transcripts for failed-then-fixed arcs, proposes entries, user reviews in PR | The harvest proposes (human approves in PR review) | Missing `gh` CLI in cloud sessions (discovered 10 times in logs before entry) |

`gotchas.md` restates this in its own header — read it there rather than from a copy here. This paragraph used to quote that header verbatim and drifted from it twice (it still named `/ship-loop`, removed in #5592, and `/reflect`, which never existed), so the quote is deliberately gone: a duplicated sentence that must be kept in sync is a drift generator, not documentation.

**Why the distinction?** Hand-written corrections are interactive — the human has the transcript and is capturing intentional feedback. The knowledge-base harvest (`/idea-to-prod:knowledge-base`) runs after a session ends and discovers patterns the human never said out loud. Hand-written corrections land in `corrections/`; harvested lessons land in `gotchas.md` as project traps.

### Capturing a correction by hand

`.claude/memory/corrections/` is written with an ordinary file write — no tooling stands between you and it, so growing the corpus depends entirely on someone remembering to do it. [#5585](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/5585) found the corpus had sat frozen for four months while `plugins/acmm/scripts/substance.js`'s `acmm:correction-capture` check kept scoring it as healthy; the fix (#5593) made that check require a qualifying entry within the last 90 days, not merely one that exists — it does not make the writing itself automatic. Verify the corpus's actual freshness with `ls .claude/memory/corrections/ | sort | tail -3` rather than trusting a date pinned here, since any date in this sentence goes stale the day after the next entry lands. Create `YYYY-MM-DD-<slug>.md` with the `date` / `session` / `trigger` / `correction` / `root_cause` / `prevention` frontmatter that [`.claude/memory/README.md`](../.claude/memory/README.md) specifies, and add `feeds_back_into:` once the lesson is promoted into `gotchas.md`. `plugins/acmm/scripts/substance.js` reads those frontmatter dates, so an entry with a body date but no frontmatter date does not count.

## Cross-Session Memory

- **claude-mem** (`/mem-search`, `/smart-explore`, `/make-plan`, `/do`, `/timeline-report`, `/babysit`): Persistent cross-session memory of code patterns, architecture decisions, debugging outcomes. **Unavailable by default** — not installed in this repo or in fresh checkouts; run `npx claude-mem install` first to make these commands resolve.

## Continuous Improvement Loop

Moved from the root [CLAUDE.md § Continuous Improvement Loop](../CLAUDE.md#continuous-improvement-loop), which keeps the rules (Conductor consent, RemoteTrigger editing, "trust live output").

| Mode                             | How                                       | Pushes to                         | Best for                                 |
| -------------------------------- | ----------------------------------------- | --------------------------------- | ---------------------------------------- |
| **Scheduled** (conservative)     | RemoteTriggers on claude.ai               | PRs for review                    | Background maintenance                   |
| **Implement Queue** (aggressive) | `/loop 30m /idea-to-prod:implement-queue` | Auto-merges green PRs             | Active development sprints               |
| **Conductor** (Owner-attended)   | `/idea-to-prod:conduct #N...` locally     | Merges only on the Owner's answer | A named batch of issues, priced up front |

- **Conductor** is stamped here as tools only (#6364): `python3 tools/factory/conductor.py <plan|open|next|answer|run|merge|close>`, config in `.github/factory.json` → `conductor` (gate `scripts/conductor-gate.sh`; `standing_consent` off, so every merge needs the Owner's in-session answer). Batch state: `docs/factory/batches/<batch>/ledger.jsonl` on `conductor/<batch>`; resuming a batch is `next` again. Local only.
- **Conductor upgrades (stamped at idea-to-prod 0.20.0):** `python3 <plugin>/factory_init.py update .`, where `<plugin>` is `~/.claude/plugins/cache/skills/idea-to-prod/<version>`. It refreshes only what `factory/manifest.json` lists (`"install": "tools-only"`) and keeps `.github/factory.json` (ours; reconcile by hand if the payload's changes are wanted). Verify with `python3 tools/factory/gates.py --selftest` and check `gates.py` reports no `E:` line. Never edit `.github/factory.json` or `docs/factory/` as part of an upgrade, and update the version recorded here.
- **Skills, plugins and subagents:** see [docs/claude-reference.md](../docs/claude-reference.md). Generic lifecycle skills come from the `idea-to-prod` plugin (local sessions only — cloud routines and Actions don't load it, #6332). The implement-queue's repo-specific behaviour lives in its profile [`.claude/implement-queue.md`](../.claude/implement-queue.md). `/caveman`, `/tdd`, `/diagnose`, `/reflect` and the other retired user-level skills resolve nowhere; caveman _mode_ above is a standing instruction, not a skill call.

## MCP Servers & Observability

The Stripe test-mode-only rule stays in the root [CLAUDE.md § MCP Servers & Observability](../CLAUDE.md#mcp-servers--observability).

- **Langfuse:** agent sessions traced when `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY` are set; unset = zero overhead.
- **Semgrep:** CLI only (pre-commit + CI), no MCP server.
- **Playwright:** shared browser tooling via `.mcp.json` for `/site-audit` and E2E.
