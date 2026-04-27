# ACMM Scorecard — Level 1 · Assisted / Ad Hoc

_Generated 2026-04-26 · 1/85 criteria detected · role: **Executor**_

Canonical 6-level model ported from [kubestellar/console](https://github.com/kubestellar/console/tree/main/web/src/lib/acmm/sources). Cited from four source frameworks: ACMM, Fullsend, Agentic Engineering Framework, Claude Reflect. See [arXiv:2604.09388](https://arxiv.org/abs/2604.09388).

> **Anti-pattern at this level:** Tool-chasing: adopting every new model or IDE plugin in search of productivity that only comes from encoding judgment.

> **Next transition trigger:** "I want the rules enforced mechanically, not just written down."

## Next steps — close 3 of 3 L2 gaps

Each line below is a concrete remediation hint derived from the criterion's detection paths. The cheapest path to L2 is to satisfy the 3 cheapest items.

- **`acmm:agent-instructions`** — Agent instructions (any)
  → `touch CLAUDE.md` (or any of: `AGENTS.md`, `.github/copilot-instructions.md`, `.cursorrules`)
- **`acmm:prompts-catalog`** — Prompt catalog
  → `mkdir -p prompts/` (or any of: `.prompts/`, `docs/prompts/`, `.github/prompts/`, `.github/agents/`)
- **`acmm:editor-config`** — EditorConfig
  → `touch .editorconfig`

## Per-level threshold

Each level needs ≥70% of its scannable criteria detected (L2 needs only 1).

| Level | Detected | Required | % | Passed |
|---|---|---|---|---|
| L2 | 0 | 3 | 0% | ❌ |
| L3 | 0 | 4 | 0% | ❌ |
| L4 | 0 | 7 | 0% | ❌ |
| L5 | 0 | 6 | 0% | ❌ |
| L6 | 0 | 6 | 0% | ❌ |

Prerequisites (L0, soft indicator): **0/8**

## By source framework

| Source | Detected | Total | Citation |
|---|---|---|---|
| [AI Codebase Maturity Model](https://arxiv.org/abs/2604.09388) | 1 | 65 | Anderson, A. (2026). The AI Codebase Maturity Model. arXiv:2604.09388 |
| [Fullsend](https://github.com/fullsend-ai/fullsend) | 0 | 8 | Fullsend: Vision for fully autonomous agentic engineering. github.com/fullsend-ai/fullsend |
| [Agentic Engineering Framework](https://github.com/DimitriGeelen/agentic-engineering-framework) | 0 | 6 | Agentic Engineering Framework: Governance patterns for AI coding agents. github.com/DimitriGeelen/agentic-engineering-framework |
| [Claude Reflect](https://github.com/BayramAnnakov/claude-reflect) | 0 | 6 | Claude Reflect: A self-learning system for Claude Code that captures corrections and syncs them to CLAUDE.md. github.com/BayramAnnakov/claude-reflect |

## Signal quality

- **✅ CI flake rate (30d):** 0.0% (n=91)

_A flake = same commit produced both ✅ and ❌ on different runs. Healthy: <1%, watch: 1–5%, broken: >5%._

## Agent PR outcomes (last 30 days)

- **✅ Acceptance rate:** 96% (26 merged of 27 decided)
- **✅ Revert rate:** 0% within 7 days of merge
- **Median time-to-merge:** 0.4h
- **Human-touch ratio:** 100% of merged PRs had non-author commits
- **Sample:** 27 agent PRs (0 still open)

_Agent PR detection: branch starts with `agent-`/`worktree-agent-`/`fix/agent-`/`feat/agent-`, or has `has-pr` label._

## Cross-cutting overlay

- **Learning & feedback:** 0/1
- **Traceability & audit:** 0/1

## Level 0 (prerequisite, 0/8)

- **✗ `acmm:prereq-test-suite`** `acmm` `prerequisite` — Automated test suite
  _A test runner config and at least one test directory._
  Detection (any-of): `vitest.config.ts` · `vitest.config.js` · `jest.config.js` · `jest.config.ts` · `go.mod` · `pytest.ini` · `pyproject.toml`
- **✗ `acmm:prereq-e2e`** `acmm` `prerequisite` — End-to-end tests
  _Playwright, Cypress, or equivalent E2E test suite that verifies the system works as a whole._
  Detection (any-of): `playwright.config.ts` · `playwright.config.js` · `cypress.config.ts` · `cypress.config.js` · `e2e/` · `tests/e2e/`
- **✗ `acmm:prereq-cicd`** `acmm` `prerequisite` — CI/CD pipeline
  _A working CI/CD pipeline that runs on every PR._
  Detection (any-of): `.github/workflows/` · `.gitlab-ci.yml` · `Jenkinsfile` · `.circleci/`
- **✗ `acmm:prereq-pr-template`** `acmm` `prerequisite` — Pull request template
  _Structured PR description template that guides both humans and AI when creating or reviewing PRs._
  Detection (any-of): `.github/pull_request_template.md` · `.github/PULL_REQUEST_TEMPLATE.md`
- **✗ `acmm:prereq-issue-template`** `acmm` `prerequisite` — Issue template
  _Structured issue form that ensures every report is triageable by humans and AI._
  Detection (any-of): `.github/ISSUE_TEMPLATE/` · `.github/issue_template.md`
- **✗ `acmm:prereq-contrib-guide`** `acmm` `prerequisite` — Contributing guide
  _CONTRIBUTING.md used both by humans and AI to understand contribution rules, development setup, and workflow expectations._
  Detection (any-of): `CONTRIBUTING.md` · `.github/CONTRIBUTING.md`
- **✗ `acmm:prereq-code-style`** `acmm` `prerequisite` — Code style config
  _Committed formatter and linter configuration that enforces style mechanically rather than through instructions._
  Detection (any-of): `.eslintrc` · `.eslintrc.json` · `.eslintrc.js` · `eslint.config.js` · `.prettierrc` · `ruff.toml` · `.golangci.yml`
- **✗ `acmm:prereq-coverage-gate`** `acmm` `prerequisite` — Coverage gate workflow
  _CI workflow that fails PRs below a coverage threshold._
  Detection (any-of): `.github/workflows/coverage-gate.yml` · `.github/workflows/coverage.yml` · `.coverage-thresholds.json`

## Level 2 ✗ gaps (1/13)

- **✗ `acmm:claude-md`** `acmm` `feedback-loop` — CLAUDE.md instructions
  _Project-level instructions loaded by Claude Code at every session start._
  Detection (path): `CLAUDE.md`
- **✗ `acmm:copilot-instructions`** `acmm` `feedback-loop` — Copilot instructions
  _GitHub Copilot repository instructions loaded on every Copilot interaction._
  Detection (path): `.github/copilot-instructions.md`
- **✗ `acmm:agents-md`** `acmm` `feedback-loop` — AGENTS.md shared directives
  _Cross-tool agent instructions readable by any AI coding tool._
  Detection (path): `AGENTS.md`
- **✗ `acmm:cursor-rules`** `acmm` `feedback-loop` — Cursor rules
  _Cursor IDE project rules that guide its agent._
  Detection (any-of): `.cursor/rules` · `.cursorrules`
- **✗ `acmm:prompts-catalog`** `acmm` `feedback-loop` — Prompt catalog
  _Committed prompt templates for recurring tasks._
  Detection (any-of): `prompts/` · `.prompts/` · `docs/prompts/` · `.github/prompts/` · `.github/agents/`
- **✗ `acmm:editor-config`** `acmm` `feedback-loop` — EditorConfig
  _.editorconfig for cross-editor consistency._
  Detection (path): `.editorconfig`
- **✓ `acmm:simple-skills`** `acmm` `feedback-loop` — Simple skills
  _Skills that capture common patterns as checklists, reference lookups, or common task sequences._
  Detection (any-of): `.claude/skills/` · `.claude/commands/` · `skills/`
- **✗ `acmm:correction-capture`** `acmm` `learning` — Correction capture
  _A mechanism that captures user corrections during agent sessions and persists them so the same mistake isn't repeated._
  Detection (any-of): `.claude/memory/` · `.memory/` · `corrections.jsonl`
- **✗ `acmm:positive-reinforcement`** `acmm` `learning` — Positive reinforcement capture
  _A mechanism that captures confirmations of non-obvious correct behavior, not just corrections._
  Detection (path): `.claude/memory/`
- **✗ `fullsend:test-coverage`** `fullsend` `readiness` — Test coverage threshold
  _Documented or enforced test coverage floor._
  Detection (any-of): `codecov.yml` · `.codecov.yml` · `coverage.yml` · `.github/workflows/coverage-gate.yml`
- **✗ `fullsend:ci-cd-maturity`** `fullsend` `readiness` — CI/CD pipeline
  _A working CI/CD pipeline that runs on every PR._
  Detection (any-of): `.github/workflows/`
- **✗ `aef:structural-gates`** `agentic-engineering-framework` `governance` — Structural gates
  _Config-enforced gates that block agents from touching protected areas without review._
  Detection (any-of): `CODEOWNERS` · `.github/CODEOWNERS` · `.agent/boundaries.yml` · `docs/agent-boundaries.md`
- **✗ `aef:session-continuity`** `agentic-engineering-framework` `governance` — Session continuity doc
  _A persistent record the agent reads at session start to recover prior context._
  Detection (any-of): `CLAUDE.md` · `AGENTS.md` · `.cursorrules` · `.github/copilot-instructions.md` · `docs/agent-context.md`

## Level 3 ✗ gaps (0/21)

- **✗ `acmm:pr-acceptance-metric`** `acmm` `feedback-loop` — PR acceptance tracking
  _Scheduled job that tracks AI PR acceptance rate over time._
  Detection (any-of): `scripts/build-accm-history.mjs` · `.github/workflows/accm-history-update.yml` · `scripts/pr-metrics.mjs`
- **✗ `acmm:pr-review-rubric`** `acmm` `feedback-loop` — PR review rubric
  _Committed rubric the AI follows when reviewing PRs._
  Detection (any-of): `.github/review-rubric.md` · `docs/review-criteria.md` · `.github/prompts/review.md` · `docs/qa/`
- **✗ `acmm:quality-dashboard`** `acmm` `observability` — Quality dashboard
  _A dashboard or page that renders the AI loop metrics._
  Detection (any-of): `web/public/analytics.js` · `web/src/components/analytics/`
- **✗ `acmm:ci-matrix`** `acmm` `feedback-loop` — CI matrix
  _Matrix CI testing multiple platforms/versions._
  Detection (any-of): `.github/workflows/build.yml` · `.github/workflows/build-deploy.yml` · `.github/workflows/ci.yml` · `.github/workflows/test.yml`
- **✗ `acmm:layered-safety`** `acmm` `governance` — Layered safety model
  _Multiple independent enforcement layers — each catches what the others miss._
  Detection (any-of): `.claude/settings.json` · `.claude/settings.local.json`
- **✗ `acmm:mechanical-enforcement`** `acmm` `governance` — Mechanical enforcement
  _Rules enforced by settings.json permissions and Claude Code hooks, not just markdown instructions._
  Detection (any-of): `.claude/settings.json`
- **✗ `acmm:context-budget`** `acmm` `readiness` — Context budget management
  _Controlling how much of the AI's context window is consumed by command output, reference material, and verbose logs._
  Detection (path): `CLAUDE.md`
- **✗ `acmm:model-tiering`** `acmm` `readiness` — Model tiering for subagents
  _Using cheaper models for mechanical tasks and reserving the session model for reasoning tasks._
  Detection (path): `CLAUDE.md`
- **✗ `acmm:verify-before-reporting`** `acmm` `readiness` — Verify-before-reporting practices
  _Workflows require the AI to show evidence before accepting completion claims._
  Detection (path): `CLAUDE.md`
- **✗ `acmm:evidence-antipatterns`** `acmm` `governance` — Evidence-based antipattern rules
  _Numbered coding rules where every rule traces to a real bug with a PR or issue number._
  Detection (path): `CLAUDE.md`
- **✗ `acmm:session-summary`** `acmm` `learning` — Session summary artifact
  _An end-of-session artifact that records what changed, what was tried, and what was learned._
  Detection (any-of): `.claude/session-summary.md` · `.claude/checkpoint.md`
- **✗ `acmm:structural-gates`** `acmm` `traceability` — Structural gates
  _Config-enforced gates that block agents from touching protected areas without review._
  Detection (any-of): `.claude/settings.json`
- **✗ `fullsend:auto-merge-policy`** `fullsend` `autonomy` — Auto-merge policy
  _Explicit policy for when PRs auto-merge vs. escalate to humans._
  Detection (any-of): `.github/auto-merge.yml` · `.prow.yaml` · `tide.yaml` · `.github/workflows/auto-merge.yml`
- **✗ `fullsend:branch-protection-doc`** `fullsend` `governance` — Branch protection documentation
  _Documented branch protection rules (required reviews, status checks)._
  Detection (any-of): `docs/branch-protection.md` · `docs/governance.md` · `.github/branch-protection.yml`
- **✗ `fullsend:rollback-drill`** `fullsend` `readiness` — Rollback drill
  _A documented or automated rollback procedure._
  Detection (any-of): `docs/rollback.md` · `.github/workflows/rollback.yml` · `scripts/rollback.sh`
- **✗ `aef:task-traceability`** `agentic-engineering-framework` `governance` — Task traceability ledger
  _Every agent task is logged with intent, inputs, and outputs._
  Detection (any-of): `.agent/tasks/` · `docs/agent-tasks/` · `.github/agent-log/` · `agent-tasks.md`
- **✗ `aef:change-classification`** `agentic-engineering-framework` `governance` — Change classification policy
  _A documented policy that classifies changes by risk tier and routes them to appropriate review._
  Detection (any-of): `docs/change-classification.md` · `.github/change-tiers.yml` · `docs/risk-tiers.md`
- **✗ `claude-reflect:correction-capture`** `claude-reflect` `self-tuning` — Correction capture
  _A mechanism that captures user corrections during agent sessions and persists them._
  Detection (any-of): `.claude/reflections/` · `memory/feedback_` · `.github/ai-corrections.yml` · `scripts/capture-corrections.mjs`
- **✗ `claude-reflect:positive-reinforcement`** `claude-reflect` `self-tuning` — Positive reinforcement capture
  _A mechanism that captures confirmations of non-obvious correct behavior, not just corrections._
  Detection (any-of): `.claude/reflections/` · `memory/feedback_` · `docs/ai-reinforcement.md`
- **✗ `claude-reflect:preference-index`** `claude-reflect` `self-tuning` — Preference index
  _A structured index of captured preferences keyed by topic or file area._
  Detection (any-of): `.claude/preferences.json` · `memory/MEMORY.md` · `.github/agent-preferences.yml`
- **✗ `claude-reflect:session-summary`** `claude-reflect` `self-tuning` — Session summary artifact
  _An end-of-session artifact that records what changed, what was tried, and what was learned._
  Detection (any-of): `.claude/sessions/` · `docs/session-summaries/` · `memory/session_`

## Level 4 ✗ gaps (0/28)

- **✗ `acmm:auto-qa-tuning`** `acmm` `self-tuning` — Auto-QA self-tuning config
  _A config file that tunes review prompts based on the L3 metrics._
  Detection (any-of): `.github/auto-qa-tuning.json` · `.github/qa-tuning.yml`
- **✗ `acmm:nightly-compliance`** `acmm` `feedback-loop` — Nightly compliance scan
  _Scheduled workflow that re-validates the codebase against its rules every night._
  Detection (any-of): `.github/workflows/nightly-compliance.yml` · `.github/workflows/nightly.yml` · `.github/workflows/nightly-test.yml` · `.github/workflows/nightly-test-suite.yml`
- **✗ `acmm:copilot-review-apply`** `acmm` `feedback-loop` — Automated review application
  _Workflow that applies AI-review suggestions automatically to PRs._
  Detection (any-of): `.github/workflows/copilot-review-apply.yml` · `.github/workflows/ai-fix.yml` · `.github/workflows/auto-review.yml`
- **✗ `acmm:auto-label`** `acmm` `feedback-loop` — Automated issue labeling
  _Workflow or bot config that triages new issues with AI._
  Detection (any-of): `.github/workflows/auto-label.yml` · `.github/labeler.yml` · `.github/workflows/triage.yml`
- **✗ `acmm:ai-fix-workflow`** `acmm` `feedback-loop` — AI-fix-requested workflow
  _A workflow or label that dispatches AI agents on issues marked for fix._
  Detection (any-of): `.github/workflows/ai-fix.yml` · `.github/workflows/fix-requested.yml` · `.github/workflows/claude.yml`
- **✗ `acmm:tier-classifier`** `acmm` `governance` — Change classification policy
  _Workflow or policy that classifies changes by risk tier and routes review accordingly._
  Detection (any-of): `.github/workflows/tier-classifier.yml` · `.github/workflows/pr-size.yml`
- **✗ `acmm:security-ai-md`** `acmm` `governance` — AI security policy
  _A SECURITY-AI.md or equivalent defining what the AI is and is not allowed to do._
  Detection (any-of): `SECURITY-AI.md` · `docs/security/SECURITY-AI.md` · `docs/SECURITY-AI.md`
- **✗ `acmm:structured-workflows`** `acmm` `feedback-loop` — Structured workflow skills
  _Skills that encode complex decision logic as repeatable workflows with phases, branching, and sub-skill delegation._
  Detection (any-of): `.claude/skills/` · `.claude/commands/`
- **✗ `acmm:router-skills`** `acmm` `feedback-loop` — Router skills with decision trees
  _Parent skills contain mermaid flowcharts as executable workflow logic._
  Detection (any-of): `.claude/skills/` · `.claude/commands/`
- **✗ `acmm:tdd-workflows`** `acmm` `feedback-loop` — TDD workflows with environment routing
  _Structured test-first cycle that dispatches to the correct test environment and loops until tests pass._
  Detection (any-of): `.claude/skills/` · `.claude/commands/`
- **✗ `acmm:structured-rca`** `acmm` `feedback-loop` — Structured RCA workflows
  _Phased investigation that gathers evidence before diagnosing._
  Detection (any-of): `.claude/skills/` · `.claude/commands/`
- **✗ `acmm:multi-perspective-review`** `acmm` `feedback-loop` — Multi-perspective review
  _Multiple independent review perspectives dispatched in parallel with a convergence loop._
  Detection (any-of): `.claude/skills/` · `.claude/commands/`
- **✗ `acmm:idempotent-workflows`** `acmm` `readiness` — Idempotent and resumable workflows
  _Workflows derive state from durable infrastructure rather than session memory._
  Detection (path): `CLAUDE.md`
- **✗ `acmm:session-continuity`** `acmm` `learning` — Session continuity
  _A persistent record the agent reads at session start to recover prior context._
  Detection (any-of): `.claude/checkpoint.md` · `.claude/session-summary.md`
- **✗ `acmm:cross-session-knowledge`** `acmm` `learning` — Cross-session knowledge sharing
  _A git-committed knowledge store that shares learnings across sessions, users, and crashes._
  Detection (any-of): `knowledge.jsonl` · `.knowledge/` · `docs/reflections/`
- **✗ `acmm:cross-repo-skills`** `acmm` `readiness` — Cross-repository skill sharing
  _A mechanism for distributing skills, safety configuration, and conventions across multiple repos._
  Detection (path): `.claude/settings.json`
- **✗ `acmm:github-coordination`** `acmm` `readiness` — GitHub as coordination layer
  _Using GitHub issues, PRs, and @mentions as the sole coordination system._
  Detection (path): `.github/workflows/`
- **✗ `acmm:feedback-loops`** `acmm` `learning` — Self-improving feedback loops
  _Systems that encode learnings from AI sessions back into the tooling._
  Detection (path): `CLAUDE.md`
- **✗ `acmm:claude-md-auto-sync`** `acmm` `learning` — CLAUDE.md auto-sync
  _A workflow that syncs captured corrections and preferences into CLAUDE.md automatically._
  Detection (any-of): `.github/workflows/claude-md-sync.yml`
- **✗ `acmm:preference-index`** `acmm` `learning` — Preference index
  _A structured index of captured preferences keyed by topic or file area._
  Detection (any-of): `preferences.json` · `.claude/preferences.json`
- **✗ `acmm:task-ledger`** `acmm` `traceability` — Task traceability ledger
  _Every agent task is logged with intent, inputs, and outputs._
  Detection (any-of): `task-log.jsonl` · `.claude/task-log.jsonl`
- **✗ `fullsend:production-feedback`** `fullsend` `observability` — Production feedback signal
  _A mechanism that feeds production observations back into the development loop._
  Detection (any-of): `monitoring/` · `grafana/` · `.github/workflows/post-deploy-check.yml` · `scripts/production-feedback.mjs`
- **✗ `fullsend:observability-runbook`** `fullsend` `observability` — Observability runbook
  _A runbook or guide describing how humans debug autonomous behavior._
  Detection (any-of): `docs/runbook.md` · `docs/runbooks/` · `RUNBOOK.md` · `docs/operations/`
- **✗ `fullsend:risk-assessment`** `fullsend` `autonomy` — Risk assessment config
  _A config that lets the agent assess blast radius before acting._
  Detection (any-of): `.github/risk-assessment.yml` · `docs/risk-tiers.md` · `.github/workflows/tier-classifier.yml`
- **✗ `aef:audit-trail`** `agentic-engineering-framework` `governance` — Audit trail workflow
  _A workflow that records agent-generated PRs and attributes them for later review._
  Detection (any-of): `.github/workflows/ai-audit.yml` · `.github/workflows/agent-audit.yml` · `scripts/ai-audit-report.mjs`
- **✗ `aef:cross-tool-config`** `agentic-engineering-framework` `governance` — Cross-tool agent config
  _Agent instructions that apply across Claude, Copilot, Cursor, and other tools rather than being tool-specific._
  Detection (any-of): `AGENTS.md` · `docs/ai-contributors.md` · `.github/ai-config.yml`
- **✗ `claude-reflect:claude-md-sync`** `claude-reflect` `self-tuning` — CLAUDE.md auto-sync
  _A workflow that syncs captured corrections/preferences into CLAUDE.md or AGENTS.md._
  Detection (any-of): `.github/workflows/claude-md-sync.yml` · `scripts/sync-claude-md.mjs` · `scripts/update-claude-md.mjs`
- **✗ `claude-reflect:reflection-review`** `claude-reflect` `self-tuning` — Periodic reflection review
  _A scheduled job that surfaces captured reflections for human review and pruning._
  Detection (any-of): `.github/workflows/reflection-review.yml` · `scripts/review-reflections.mjs` · `docs/reflection-review.md`

## Level 5 ✗ gaps (0/7)

- **✗ `acmm:github-actions-ai`** `acmm` `feedback-loop` — GitHub Actions AI integration
  _GitHub Actions trigger AI-assisted workflows automatically on CI failures, PR events, or @claude mentions._
  Detection (any-of): `.github/workflows/claude.yml` · `.github/workflows/claude-code-review.yml`
- **✗ `acmm:auto-qa-self-tuning`** `acmm` `self-tuning` — Auto-QA with self-tuning
  _An automated quality system that tracks suggestion acceptance rates and adjusts its own sensitivity thresholds._
  Detection (any-of): `.github/workflows/auto-qa.yml` · `.github/auto-qa-tuning.json`
- **✗ `acmm:public-metrics`** `acmm` `observability` — Public metrics endpoint
  _A published metrics endpoint or analytics page that external reviewers can audit._
  Detection (any-of): `web/netlify/functions/analytics-accm.mts` · `web/public/analytics.js`
- **✗ `acmm:policy-as-code`** `acmm` `governance` — Policy as code
  _Policies expressed as machine-enforceable code (OPA, ConfTest, etc.)._
  Detection (any-of): `.github/policies/` · `policy/` · `conftest.yaml` · `opa/`
- **✗ `acmm:reflection-log`** `acmm` `feedback-loop` — Reflection log
  _A committed log where the AI records lessons learned that feed back into instruction files._
  Detection (any-of): `docs/reflections/` · `memory/` · `.memory/` · `REFLECTIONS.md`
- **✗ `acmm:periodic-reflection`** `acmm` `learning` — Periodic reflection review
  _A scheduled job that surfaces captured reflections for human review and pruning._
  Detection (any-of): `.github/workflows/reflection-review.yml`
- **✗ `acmm:audit-trail`** `acmm` `traceability` — Audit trail workflow
  _A workflow that records agent-generated PRs and attributes them for later review._
  Detection (any-of): `.github/workflows/audit-trail.yml` · `.github/workflows/ai-attribution.yml`

## Level 6 ✗ gaps (0/8)

- **✗ `acmm:auto-issue-gen`** `acmm` `autonomy` — Automated issue generation
  _Workflow or cron that generates work items for the AI to pick up — the system identifies its own problems and creates tasks._
  Detection (any-of): `.github/workflows/auto-issue.yml` · `.github/workflows/issue-gen.yml` · `.github/workflows/auto-generate-issues.yml`
- **✗ `acmm:multi-agent-orchestration`** `acmm` `autonomy` — Multi-agent orchestration
  _A workflow or script that coordinates multiple AI agents on one task, decomposing work and managing parallel execution._
  Detection (any-of): `scripts/orchestrate.mjs` · `.github/workflows/orchestrate.yml` · `orchestrator/`
- **✗ `acmm:merge-queue`** `acmm` `autonomy` — Merge queue / auto-merge
  _Branch protection with automated merge queue, allowing verified AI-generated PRs to merge without manual intervention._
  Detection (any-of): `.github/workflows/merge-queue.yml` · `.prow.yaml` · `tide.yaml`
- **✗ `acmm:strategic-dashboard`** `acmm` `observability` — Strategic dashboard
  _A human-facing dashboard that shows what the codebase is doing on its own — active AI sessions, pending fixes, merge pipeline, trend data._
  Detection (any-of): `web/src/components/acmm/` · `web/public/analytics.js` · `docs/autonomous-work-log.md`
- **✗ `acmm:risk-assessment-config`** `acmm` `governance` — Risk assessment config
  _A config that lets the agent assess blast radius before acting — preventing autonomous changes to high-risk areas._
  Detection (any-of): `risk-config.json` · `.claude/risk-config.json` · `.github/risk-assessment.yml`
- **✗ `acmm:production-feedback`** `acmm` `feedback-loop` — Production feedback signal
  _A mechanism that feeds production observations back into the development loop._
  Detection (any-of): `.github/workflows/production-feedback.yml`
- **✗ `acmm:observability-runbook`** `acmm` `governance` — Observability runbook
  _A runbook describing how humans debug autonomous behavior — what to check when the AI does something unexpected._
  Detection (any-of): `docs/ai-ops-runbook.md` · `docs/runbook/` · `RUNBOOK.md`
- **✗ `acmm:rollback-drill`** `acmm` `governance` — Rollback drill
  _A documented or automated rollback procedure for when autonomous changes cause problems._
  Detection (any-of): `docs/rollback-drill.md` · `docs/ai-ops-runbook.md`

## Next-level gaps (3)

To advance from L1 → L2, close ≥70% of the criteria below.

- **`acmm:agent-instructions`** — Agent instructions (any)
  Any one of CLAUDE.md, AGENTS.md, .github/copilot-instructions.md, or .cursorrules.
  _Detection:_ `CLAUDE.md` · `AGENTS.md` · `.github/copilot-instructions.md` · `.cursorrules`
- **`acmm:prompts-catalog`** — Prompt catalog
  Committed prompt templates for recurring tasks.
  _Detection:_ `prompts/` · `.prompts/` · `docs/prompts/` · `.github/prompts/` · `.github/agents/`
- **`acmm:editor-config`** — EditorConfig
  .editorconfig for cross-editor consistency.
  _Detection:_ `.editorconfig`

## Trend

| Date | Level | Detected |
|---|---|---|
| 2026-04-26 | L1 | 1/85 |
