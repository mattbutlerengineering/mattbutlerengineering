# ACMM Requirements

| ID | Level | Name | Description |
|---|---|---|---|
| `acmm:prereq-cicd` | L0 | CI/CD pipeline | A working CI/CD pipeline that runs on every PR. |
| `acmm:prereq-code-style` | L0 | Code style config | Committed formatter and linter configuration that enforces style mechanically rather than through instructions. |
| `acmm:prereq-contrib-guide` | L0 | Contributing guide | CONTRIBUTING.md used both by humans and AI to understand contribution rules, development setup, and workflow expectations. |
| `acmm:prereq-coverage-gate` | L0 | Coverage gate workflow | CI workflow that fails PRs below a coverage threshold. |
| `acmm:prereq-e2e` | L0 | End-to-end tests | Playwright, Cypress, or equivalent E2E test suite that verifies the system works as a whole. |
| `acmm:prereq-issue-template` | L0 | Issue template | Structured issue form that ensures every report is triageable by humans and AI. |
| `acmm:prereq-pr-template` | L0 | Pull request template | Structured PR description template that guides both humans and AI when creating or reviewing PRs. |
| `acmm:prereq-test-suite` | L0 | Automated test suite | A test runner config and at least one test directory. |
| `acmm:agents-md` | L2 | AGENTS.md shared directives | Cross-tool agent instructions readable by any AI coding tool. |
| `acmm:claude-md` | L2 | CLAUDE.md instructions | Project-level instructions loaded by Claude Code at every session start. |
| `acmm:copilot-instructions` | L2 | Copilot instructions | GitHub Copilot repository instructions loaded on every Copilot interaction. |
| `acmm:correction-capture` | L2 | Correction capture | A mechanism that captures user corrections during agent sessions and persists them so the same mistake isn't repeated. |
| `acmm:cursor-rules` | L2 | Cursor rules | Cursor IDE project rules that guide its agent. |
| `acmm:editor-config` | L2 | EditorConfig | .editorconfig for cross-editor consistency. |
| `acmm:positive-reinforcement` | L2 | Positive reinforcement capture | A mechanism that captures confirmations of non-obvious correct behavior, not just corrections. |
| `acmm:prompts-catalog` | L2 | Prompt catalog | Committed prompt templates for recurring tasks. |
| `acmm:simple-skills` | L2 | Simple skills | Skills that capture common patterns as checklists, reference lookups, or common task sequences. |
| `aef:session-continuity` | L2 | Session continuity doc | A persistent record the agent reads at session start to recover prior context. |
| `aef:structural-gates` | L2 | Structural gates | Config-enforced gates that block agents from touching protected areas without review. |
| `fullsend:ci-cd-maturity` | L2 | CI/CD pipeline | A working CI/CD pipeline that runs on every PR. |
| `fullsend:test-coverage` | L2 | Test coverage threshold | Documented or enforced test coverage floor. |
| `acmm:ci-matrix` | L3 | CI matrix | Matrix CI testing multiple platforms/versions. |
| `acmm:context-budget` | L3 | Context budget management | Controlling how much of the AI's context window is consumed by command output, reference material, and verbose logs. |
| `acmm:evidence-antipatterns` | L3 | Evidence-based antipattern rules | Numbered coding rules where every rule traces to a real bug with a PR or issue number. |
| `acmm:layered-safety` | L3 | Layered safety model | Multiple independent enforcement layers — each catches what the others miss. |
| `acmm:mechanical-enforcement` | L3 | Mechanical enforcement | Rules enforced by settings.json permissions and Claude Code hooks, not just markdown instructions. |
| `acmm:model-tiering` | L3 | Model tiering for subagents | Using cheaper models for mechanical tasks and reserving the session model for reasoning tasks. |
| `acmm:pr-acceptance-metric` | L3 | PR acceptance tracking | Scheduled job that tracks AI PR acceptance rate over time. |
| `acmm:pr-review-rubric` | L3 | PR review rubric | Committed rubric the AI follows when reviewing PRs. |
| `acmm:quality-dashboard` | L3 | Quality dashboard | A dashboard or page that renders the AI loop metrics. |
| `acmm:session-summary` | L3 | Session summary artifact | An end-of-session artifact that records what changed, what was tried, and what was learned. |
| `acmm:structural-gates` | L3 | Structural gates | Config-enforced gates that block agents from touching protected areas without review. |
| `acmm:verify-before-reporting` | L3 | Verify-before-reporting practices | Workflows require the AI to show evidence before accepting completion claims. |
| `aef:change-classification` | L3 | Change classification policy | A documented policy that classifies changes by risk tier and routes them to appropriate review. |
| `aef:task-traceability` | L3 | Task traceability ledger | Every agent task is logged with intent, inputs, and outputs. |
| `claude-reflect:correction-capture` | L3 | Correction capture | A mechanism that captures user corrections during agent sessions and persists them. |
| `claude-reflect:positive-reinforcement` | L3 | Positive reinforcement capture | A mechanism that captures confirmations of non-obvious correct behavior, not just corrections. |
| `claude-reflect:preference-index` | L3 | Preference index | A structured index of captured preferences keyed by topic or file area. |
| `claude-reflect:session-summary` | L3 | Session summary artifact | An end-of-session artifact that records what changed, what was tried, and what was learned. |
| `fullsend:auto-merge-policy` | L3 | Auto-merge policy | Explicit policy for when PRs auto-merge vs. escalate to humans. |
| `fullsend:branch-protection-doc` | L3 | Branch protection documentation | Documented branch protection rules (required reviews, status checks). |
| `fullsend:rollback-drill` | L3 | Rollback drill | A documented or automated rollback procedure. |
| `acmm:ai-fix-workflow` | L4 | AI-fix-requested workflow | A workflow or label that dispatches AI agents on issues marked for fix. |
| `acmm:auto-label` | L4 | Automated issue labeling | Workflow or bot config that triages new issues with AI. |
| `acmm:auto-qa-tuning` | L4 | Auto-QA self-tuning config | A config file that tunes review prompts based on the L3 metrics. |
| `acmm:claude-md-auto-sync` | L4 | CLAUDE.md auto-sync | A workflow that syncs captured corrections and preferences into CLAUDE.md automatically. |
| `acmm:copilot-review-apply` | L4 | Automated review application | Workflow that applies AI-review suggestions automatically to PRs. |
| `acmm:cross-repo-skills` | L4 | Cross-repository skill sharing | A mechanism for distributing skills, safety configuration, and conventions across multiple repos. |
| `acmm:cross-session-knowledge` | L4 | Cross-session knowledge sharing | A git-committed knowledge store that shares learnings across sessions, users, and crashes. |
| `acmm:feedback-loops` | L4 | Self-improving feedback loops | Systems that encode learnings from AI sessions back into the tooling. |
| `acmm:github-coordination` | L4 | GitHub as coordination layer | Using GitHub issues, PRs, and @mentions as the sole coordination system. |
| `acmm:idempotent-workflows` | L4 | Idempotent and resumable workflows | Workflows derive state from durable infrastructure rather than session memory. |
| `acmm:multi-perspective-review` | L4 | Multi-perspective review | Multiple independent review perspectives dispatched in parallel with a convergence loop. |
| `acmm:nightly-compliance` | L4 | Nightly compliance scan | Scheduled workflow that re-validates the codebase against its rules every night. |
| `acmm:preference-index` | L4 | Preference index | A structured index of captured preferences keyed by topic or file area. |
| `acmm:router-skills` | L4 | Router skills with decision trees | Parent skills contain mermaid flowcharts as executable workflow logic. |
| `acmm:security-ai-md` | L4 | AI security policy | A SECURITY-AI.md or equivalent defining what the AI is and is not allowed to do. |
| `acmm:session-continuity` | L4 | Session continuity | A persistent record the agent reads at session start to recover prior context. |
| `acmm:structured-rca` | L4 | Structured RCA workflows | Phased investigation that gathers evidence before diagnosing. |
| `acmm:structured-workflows` | L4 | Structured workflow skills | Skills that encode complex decision logic as repeatable workflows with phases, branching, and sub-skill delegation. |
| `acmm:task-ledger` | L4 | Task traceability ledger | Every agent task is logged with intent, inputs, and outputs. |
| `acmm:tdd-workflows` | L4 | TDD workflows with environment routing | Structured test-first cycle that dispatches to the correct test environment and loops until tests pass. |
| `acmm:tier-classifier` | L4 | Change classification policy | Workflow or policy that classifies changes by risk tier and routes review accordingly. |
| `aef:audit-trail` | L4 | Audit trail workflow | A workflow that records agent-generated PRs and attributes them for later review. |
| `aef:cross-tool-config` | L4 | Cross-tool agent config | Agent instructions that apply across Claude, Copilot, Cursor, and other tools rather than being tool-specific. |
| `claude-reflect:claude-md-sync` | L4 | CLAUDE.md auto-sync | A workflow that syncs captured corrections/preferences into CLAUDE.md or AGENTS.md. |
| `claude-reflect:reflection-review` | L4 | Periodic reflection review | A scheduled job that surfaces captured reflections for human review and pruning. |
| `fullsend:observability-runbook` | L4 | Observability runbook | A runbook or guide describing how humans debug autonomous behavior. |
| `fullsend:production-feedback` | L4 | Production feedback signal | A mechanism that feeds production observations back into the development loop. |
| `fullsend:risk-assessment` | L4 | Risk assessment config | A config that lets the agent assess blast radius before acting. |
| `acmm:audit-trail` | L5 | Audit trail workflow | A workflow that records agent-generated PRs and attributes them for later review. |
| `acmm:auto-qa-self-tuning` | L5 | Auto-QA with self-tuning | An automated quality system that tracks suggestion acceptance rates and adjusts its own sensitivity thresholds. |
| `acmm:github-actions-ai` | L5 | GitHub Actions AI integration | GitHub Actions trigger AI-assisted workflows automatically on CI failures, PR events, or @claude mentions. |
| `acmm:periodic-reflection` | L5 | Periodic reflection review | A scheduled job that surfaces captured reflections for human review and pruning. |
| `acmm:policy-as-code` | L5 | Policy as code | Policies expressed as machine-enforceable code (OPA, ConfTest, etc.). |
| `acmm:public-metrics` | L5 | Public metrics endpoint | A published metrics endpoint or analytics page that external reviewers can audit. |
| `acmm:reflection-log` | L5 | Reflection log | A committed log where the AI records lessons learned that feed back into instruction files. |
| `acmm:auto-issue-gen` | L6 | Automated issue generation | Workflow or cron that generates work items for the AI to pick up — the system identifies its own problems and creates tasks. |
| `acmm:merge-queue` | L6 | Merge queue / auto-merge | Branch protection with automated merge queue, allowing verified AI-generated PRs to merge without manual intervention. |
| `acmm:multi-agent-orchestration` | L6 | Multi-agent orchestration | A workflow or script that coordinates multiple AI agents on one task, decomposing work and managing parallel execution. |
| `acmm:observability-runbook` | L6 | Observability runbook | A runbook describing how humans debug autonomous behavior — what to check when the AI does something unexpected. |
| `acmm:production-feedback` | L6 | Production feedback signal | A mechanism that feeds production observations back into the development loop. |
| `acmm:risk-assessment-config` | L6 | Risk assessment config | A config that lets the agent assess blast radius before acting — preventing autonomous changes to high-risk areas. |
| `acmm:rollback-drill` | L6 | Rollback drill | A documented or automated rollback procedure for when autonomous changes cause problems. |
| `acmm:strategic-dashboard` | L6 | Strategic dashboard | A human-facing dashboard that shows what the codebase is doing on its own — active AI sessions, pending fixes, merge pipeline, trend data. |
