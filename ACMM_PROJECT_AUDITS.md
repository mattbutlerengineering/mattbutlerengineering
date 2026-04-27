# ACMM Project Audits

This document outlines how each ACMM requirement is satisfied (or not) for each project in the repository.

## apps/gen

**Current ACMM Level:** 1 (Assisted / Ad Hoc)

| ID | Level | Name | Status | Evidence |
|---|---|---|---|---|
| `acmm:prereq-cicd` | L0 | CI/CD pipeline | ❌ Fail | none of: .github/workflows/, .gitlab-ci.yml, Jenkinsfile, .circleci/ |
| `acmm:prereq-code-style` | L0 | Code style config | ✅ Pass | detected at one of: .eslintrc, .eslintrc.json, .eslintrc.js, eslint.config.js, .prettierrc, ruff.toml, .golangci.yml |
| `acmm:prereq-contrib-guide` | L0 | Contributing guide | ❌ Fail | none of: CONTRIBUTING.md, .github/CONTRIBUTING.md |
| `acmm:prereq-coverage-gate` | L0 | Coverage gate workflow | ❌ Fail | none of: .github/workflows/coverage-gate.yml, .github/workflows/coverage.yml, .coverage-thresholds.json |
| `acmm:prereq-e2e` | L0 | End-to-end tests | ✅ Pass | detected at one of: playwright.config.ts, playwright.config.js, cypress.config.ts, cypress.config.js, e2e/, tests/e2e/ |
| `acmm:prereq-issue-template` | L0 | Issue template | ❌ Fail | none of: .github/ISSUE_TEMPLATE/, .github/issue_template.md |
| `acmm:prereq-pr-template` | L0 | Pull request template | ❌ Fail | none of: .github/pull_request_template.md, .github/PULL_REQUEST_TEMPLATE.md |
| `acmm:prereq-test-suite` | L0 | Automated test suite | ✅ Pass | detected at one of: vitest.config.ts, vitest.config.js, jest.config.js, jest.config.ts, go.mod, pytest.ini, pyproject.toml |
| `acmm:agents-md` | L2 | AGENTS.md shared directives | ❌ Fail | none of: AGENTS.md |
| `acmm:claude-md` | L2 | CLAUDE.md instructions | ❌ Fail | none of: CLAUDE.md |
| `acmm:copilot-instructions` | L2 | Copilot instructions | ❌ Fail | none of: .github/copilot-instructions.md |
| `acmm:correction-capture` | L2 | Correction capture | ❌ Fail | none of: .claude/memory/, .memory/, corrections.jsonl |
| `acmm:cursor-rules` | L2 | Cursor rules | ❌ Fail | none of: .cursor/rules, .cursorrules |
| `acmm:editor-config` | L2 | EditorConfig | ❌ Fail | none of: .editorconfig |
| `acmm:positive-reinforcement` | L2 | Positive reinforcement capture | ❌ Fail | none of: .claude/memory/ |
| `acmm:prompts-catalog` | L2 | Prompt catalog | ❌ Fail | none of: prompts/, .prompts/, docs/prompts/, .github/prompts/, .github/agents/ |
| `acmm:simple-skills` | L2 | Simple skills | ❌ Fail | none of: .claude/skills/, .claude/commands/, skills/ |
| `aef:session-continuity` | L2 | Session continuity doc | ❌ Fail | none of: CLAUDE.md, AGENTS.md, .cursorrules, .github/copilot-instructions.md, docs/agent-context.md |
| `aef:structural-gates` | L2 | Structural gates | ❌ Fail | none of: CODEOWNERS, .github/CODEOWNERS, .agent/boundaries.yml, docs/agent-boundaries.md |
| `fullsend:ci-cd-maturity` | L2 | CI/CD pipeline | ❌ Fail | none of: .github/workflows/ |
| `fullsend:test-coverage` | L2 | Test coverage threshold | ❌ Fail | none of: codecov.yml, .codecov.yml, coverage.yml, .github/workflows/coverage-gate.yml |
| `acmm:ci-matrix` | L3 | CI matrix | ❌ Fail | none of: .github/workflows/build.yml, .github/workflows/build-deploy.yml, .github/workflows/ci.yml, .github/workflows/test.yml |
| `acmm:context-budget` | L3 | Context budget management | ❌ Fail | none of: CLAUDE.md |
| `acmm:evidence-antipatterns` | L3 | Evidence-based antipattern rules | ❌ Fail | none of: CLAUDE.md |
| `acmm:layered-safety` | L3 | Layered safety model | ❌ Fail | none of: .claude/settings.json, .claude/settings.local.json |
| `acmm:mechanical-enforcement` | L3 | Mechanical enforcement | ❌ Fail | none of: .claude/settings.json |
| `acmm:model-tiering` | L3 | Model tiering for subagents | ❌ Fail | none of: CLAUDE.md |
| `acmm:pr-acceptance-metric` | L3 | PR acceptance tracking | ❌ Fail | none of: scripts/build-accm-history.mjs, .github/workflows/accm-history-update.yml, scripts/pr-metrics.mjs |
| `acmm:pr-review-rubric` | L3 | PR review rubric | ❌ Fail | none of: .github/review-rubric.md, docs/review-criteria.md, .github/prompts/review.md, docs/qa/ |
| `acmm:quality-dashboard` | L3 | Quality dashboard | ❌ Fail | none of: web/public/analytics.js, web/src/components/analytics/ |
| `acmm:session-summary` | L3 | Session summary artifact | ❌ Fail | none of: .claude/session-summary.md, .claude/checkpoint.md |
| `acmm:structural-gates` | L3 | Structural gates | ❌ Fail | none of: .claude/settings.json |
| `acmm:verify-before-reporting` | L3 | Verify-before-reporting practices | ❌ Fail | none of: CLAUDE.md |
| `aef:change-classification` | L3 | Change classification policy | ❌ Fail | none of: docs/change-classification.md, .github/change-tiers.yml, docs/risk-tiers.md |
| `aef:task-traceability` | L3 | Task traceability ledger | ❌ Fail | none of: .agent/tasks/, docs/agent-tasks/, .github/agent-log/, agent-tasks.md |
| `claude-reflect:correction-capture` | L3 | Correction capture | ❌ Fail | none of: .claude/reflections/, memory/feedback_, .github/ai-corrections.yml, scripts/capture-corrections.mjs |
| `claude-reflect:positive-reinforcement` | L3 | Positive reinforcement capture | ❌ Fail | none of: .claude/reflections/, memory/feedback_, docs/ai-reinforcement.md |
| `claude-reflect:preference-index` | L3 | Preference index | ❌ Fail | none of: .claude/preferences.json, memory/MEMORY.md, .github/agent-preferences.yml |
| `claude-reflect:session-summary` | L3 | Session summary artifact | ❌ Fail | none of: .claude/sessions/, docs/session-summaries/, memory/session_ |
| `fullsend:auto-merge-policy` | L3 | Auto-merge policy | ❌ Fail | none of: .github/auto-merge.yml, .prow.yaml, tide.yaml, .github/workflows/auto-merge.yml |
| `fullsend:branch-protection-doc` | L3 | Branch protection documentation | ❌ Fail | none of: docs/branch-protection.md, docs/governance.md, .github/branch-protection.yml |
| `fullsend:rollback-drill` | L3 | Rollback drill | ❌ Fail | none of: docs/rollback.md, .github/workflows/rollback.yml, scripts/rollback.sh |
| `acmm:ai-fix-workflow` | L4 | AI-fix-requested workflow | ❌ Fail | none of: .github/workflows/ai-fix.yml, .github/workflows/fix-requested.yml, .github/workflows/claude.yml |
| `acmm:auto-label` | L4 | Automated issue labeling | ❌ Fail | none of: .github/workflows/auto-label.yml, .github/labeler.yml, .github/workflows/triage.yml |
| `acmm:auto-qa-tuning` | L4 | Auto-QA self-tuning config | ❌ Fail | none of: .github/auto-qa-tuning.json, .github/qa-tuning.yml |
| `acmm:claude-md-auto-sync` | L4 | CLAUDE.md auto-sync | ❌ Fail | none of: .github/workflows/claude-md-sync.yml |
| `acmm:copilot-review-apply` | L4 | Automated review application | ❌ Fail | none of: .github/workflows/copilot-review-apply.yml, .github/workflows/ai-fix.yml, .github/workflows/auto-review.yml |
| `acmm:cross-repo-skills` | L4 | Cross-repository skill sharing | ❌ Fail | none of: .claude/settings.json |
| `acmm:cross-session-knowledge` | L4 | Cross-session knowledge sharing | ❌ Fail | none of: knowledge.jsonl, .knowledge/, docs/reflections/ |
| `acmm:feedback-loops` | L4 | Self-improving feedback loops | ❌ Fail | none of: CLAUDE.md |
| `acmm:github-coordination` | L4 | GitHub as coordination layer | ❌ Fail | none of: .github/workflows/ |
| `acmm:idempotent-workflows` | L4 | Idempotent and resumable workflows | ❌ Fail | none of: CLAUDE.md |
| `acmm:multi-perspective-review` | L4 | Multi-perspective review | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:nightly-compliance` | L4 | Nightly compliance scan | ❌ Fail | none of: .github/workflows/nightly-compliance.yml, .github/workflows/nightly.yml, .github/workflows/nightly-test.yml, .github/workflows/nightly-test-suite.yml |
| `acmm:preference-index` | L4 | Preference index | ❌ Fail | none of: preferences.json, .claude/preferences.json |
| `acmm:router-skills` | L4 | Router skills with decision trees | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:security-ai-md` | L4 | AI security policy | ❌ Fail | none of: SECURITY-AI.md, docs/security/SECURITY-AI.md, docs/SECURITY-AI.md |
| `acmm:session-continuity` | L4 | Session continuity | ❌ Fail | none of: .claude/checkpoint.md, .claude/session-summary.md |
| `acmm:structured-rca` | L4 | Structured RCA workflows | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:structured-workflows` | L4 | Structured workflow skills | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:task-ledger` | L4 | Task traceability ledger | ❌ Fail | none of: task-log.jsonl, .claude/task-log.jsonl |
| `acmm:tdd-workflows` | L4 | TDD workflows with environment routing | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:tier-classifier` | L4 | Change classification policy | ❌ Fail | none of: .github/workflows/tier-classifier.yml, .github/workflows/pr-size.yml |
| `aef:audit-trail` | L4 | Audit trail workflow | ❌ Fail | none of: .github/workflows/ai-audit.yml, .github/workflows/agent-audit.yml, scripts/ai-audit-report.mjs |
| `aef:cross-tool-config` | L4 | Cross-tool agent config | ❌ Fail | none of: AGENTS.md, docs/ai-contributors.md, .github/ai-config.yml |
| `claude-reflect:claude-md-sync` | L4 | CLAUDE.md auto-sync | ❌ Fail | none of: .github/workflows/claude-md-sync.yml, scripts/sync-claude-md.mjs, scripts/update-claude-md.mjs |
| `claude-reflect:reflection-review` | L4 | Periodic reflection review | ❌ Fail | none of: .github/workflows/reflection-review.yml, scripts/review-reflections.mjs, docs/reflection-review.md |
| `fullsend:observability-runbook` | L4 | Observability runbook | ❌ Fail | none of: docs/runbook.md, docs/runbooks/, RUNBOOK.md, docs/operations/ |
| `fullsend:production-feedback` | L4 | Production feedback signal | ❌ Fail | none of: monitoring/, grafana/, .github/workflows/post-deploy-check.yml, scripts/production-feedback.mjs |
| `fullsend:risk-assessment` | L4 | Risk assessment config | ❌ Fail | none of: .github/risk-assessment.yml, docs/risk-tiers.md, .github/workflows/tier-classifier.yml |
| `acmm:audit-trail` | L5 | Audit trail workflow | ❌ Fail | none of: .github/workflows/audit-trail.yml, .github/workflows/ai-attribution.yml |
| `acmm:auto-qa-self-tuning` | L5 | Auto-QA with self-tuning | ❌ Fail | none of: .github/workflows/auto-qa.yml, .github/auto-qa-tuning.json |
| `acmm:github-actions-ai` | L5 | GitHub Actions AI integration | ❌ Fail | none of: .github/workflows/claude.yml, .github/workflows/claude-code-review.yml |
| `acmm:periodic-reflection` | L5 | Periodic reflection review | ❌ Fail | none of: .github/workflows/reflection-review.yml |
| `acmm:policy-as-code` | L5 | Policy as code | ❌ Fail | none of: .github/policies/, policy/, conftest.yaml, opa/ |
| `acmm:public-metrics` | L5 | Public metrics endpoint | ❌ Fail | none of: web/netlify/functions/analytics-accm.mts, web/public/analytics.js |
| `acmm:reflection-log` | L5 | Reflection log | ❌ Fail | none of: docs/reflections/, memory/, .memory/, REFLECTIONS.md |
| `acmm:auto-issue-gen` | L6 | Automated issue generation | ❌ Fail | none of: .github/workflows/auto-issue.yml, .github/workflows/issue-gen.yml, .github/workflows/auto-generate-issues.yml |
| `acmm:merge-queue` | L6 | Merge queue / auto-merge | ❌ Fail | none of: .github/workflows/merge-queue.yml, .prow.yaml, tide.yaml |
| `acmm:multi-agent-orchestration` | L6 | Multi-agent orchestration | ❌ Fail | none of: scripts/orchestrate.mjs, .github/workflows/orchestrate.yml, orchestrator/ |
| `acmm:observability-runbook` | L6 | Observability runbook | ❌ Fail | none of: docs/ai-ops-runbook.md, docs/runbook/, RUNBOOK.md |
| `acmm:production-feedback` | L6 | Production feedback signal | ❌ Fail | none of: .github/workflows/production-feedback.yml |
| `acmm:risk-assessment-config` | L6 | Risk assessment config | ❌ Fail | none of: risk-config.json, .claude/risk-config.json, .github/risk-assessment.yml |
| `acmm:rollback-drill` | L6 | Rollback drill | ❌ Fail | none of: docs/rollback-drill.md, docs/ai-ops-runbook.md |
| `acmm:strategic-dashboard` | L6 | Strategic dashboard | ❌ Fail | none of: web/src/components/acmm/, web/public/analytics.js, docs/autonomous-work-log.md |

## apps/hospitality

**Current ACMM Level:** 2 (Instructed)

| ID | Level | Name | Status | Evidence |
|---|---|---|---|---|
| `acmm:prereq-cicd` | L0 | CI/CD pipeline | ❌ Fail | none of: .github/workflows/, .gitlab-ci.yml, Jenkinsfile, .circleci/ |
| `acmm:prereq-code-style` | L0 | Code style config | ✅ Pass | detected at one of: .eslintrc, .eslintrc.json, .eslintrc.js, eslint.config.js, .prettierrc, ruff.toml, .golangci.yml |
| `acmm:prereq-contrib-guide` | L0 | Contributing guide | ❌ Fail | none of: CONTRIBUTING.md, .github/CONTRIBUTING.md |
| `acmm:prereq-coverage-gate` | L0 | Coverage gate workflow | ❌ Fail | none of: .github/workflows/coverage-gate.yml, .github/workflows/coverage.yml, .coverage-thresholds.json |
| `acmm:prereq-e2e` | L0 | End-to-end tests | ✅ Pass | detected at one of: playwright.config.ts, playwright.config.js, cypress.config.ts, cypress.config.js, e2e/, tests/e2e/ |
| `acmm:prereq-issue-template` | L0 | Issue template | ❌ Fail | none of: .github/ISSUE_TEMPLATE/, .github/issue_template.md |
| `acmm:prereq-pr-template` | L0 | Pull request template | ❌ Fail | none of: .github/pull_request_template.md, .github/PULL_REQUEST_TEMPLATE.md |
| `acmm:prereq-test-suite` | L0 | Automated test suite | ✅ Pass | detected at one of: vitest.config.ts, vitest.config.js, jest.config.js, jest.config.ts, go.mod, pytest.ini, pyproject.toml |
| `acmm:agents-md` | L2 | AGENTS.md shared directives | ❌ Fail | none of: AGENTS.md |
| `acmm:claude-md` | L2 | CLAUDE.md instructions | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:copilot-instructions` | L2 | Copilot instructions | ❌ Fail | none of: .github/copilot-instructions.md |
| `acmm:correction-capture` | L2 | Correction capture | ❌ Fail | none of: .claude/memory/, .memory/, corrections.jsonl |
| `acmm:cursor-rules` | L2 | Cursor rules | ❌ Fail | none of: .cursor/rules, .cursorrules |
| `acmm:editor-config` | L2 | EditorConfig | ❌ Fail | none of: .editorconfig |
| `acmm:positive-reinforcement` | L2 | Positive reinforcement capture | ❌ Fail | none of: .claude/memory/ |
| `acmm:prompts-catalog` | L2 | Prompt catalog | ❌ Fail | none of: prompts/, .prompts/, docs/prompts/, .github/prompts/, .github/agents/ |
| `acmm:simple-skills` | L2 | Simple skills | ❌ Fail | none of: .claude/skills/, .claude/commands/, skills/ |
| `aef:session-continuity` | L2 | Session continuity doc | ✅ Pass | detected at one of: CLAUDE.md, AGENTS.md, .cursorrules, .github/copilot-instructions.md, docs/agent-context.md |
| `aef:structural-gates` | L2 | Structural gates | ❌ Fail | none of: CODEOWNERS, .github/CODEOWNERS, .agent/boundaries.yml, docs/agent-boundaries.md |
| `fullsend:ci-cd-maturity` | L2 | CI/CD pipeline | ❌ Fail | none of: .github/workflows/ |
| `fullsend:test-coverage` | L2 | Test coverage threshold | ❌ Fail | none of: codecov.yml, .codecov.yml, coverage.yml, .github/workflows/coverage-gate.yml |
| `acmm:ci-matrix` | L3 | CI matrix | ❌ Fail | none of: .github/workflows/build.yml, .github/workflows/build-deploy.yml, .github/workflows/ci.yml, .github/workflows/test.yml |
| `acmm:context-budget` | L3 | Context budget management | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:evidence-antipatterns` | L3 | Evidence-based antipattern rules | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:layered-safety` | L3 | Layered safety model | ❌ Fail | none of: .claude/settings.json, .claude/settings.local.json |
| `acmm:mechanical-enforcement` | L3 | Mechanical enforcement | ❌ Fail | none of: .claude/settings.json |
| `acmm:model-tiering` | L3 | Model tiering for subagents | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:pr-acceptance-metric` | L3 | PR acceptance tracking | ❌ Fail | none of: scripts/build-accm-history.mjs, .github/workflows/accm-history-update.yml, scripts/pr-metrics.mjs |
| `acmm:pr-review-rubric` | L3 | PR review rubric | ❌ Fail | none of: .github/review-rubric.md, docs/review-criteria.md, .github/prompts/review.md, docs/qa/ |
| `acmm:quality-dashboard` | L3 | Quality dashboard | ❌ Fail | none of: web/public/analytics.js, web/src/components/analytics/ |
| `acmm:session-summary` | L3 | Session summary artifact | ❌ Fail | none of: .claude/session-summary.md, .claude/checkpoint.md |
| `acmm:structural-gates` | L3 | Structural gates | ❌ Fail | none of: .claude/settings.json |
| `acmm:verify-before-reporting` | L3 | Verify-before-reporting practices | ✅ Pass | detected at one of: CLAUDE.md |
| `aef:change-classification` | L3 | Change classification policy | ❌ Fail | none of: docs/change-classification.md, .github/change-tiers.yml, docs/risk-tiers.md |
| `aef:task-traceability` | L3 | Task traceability ledger | ❌ Fail | none of: .agent/tasks/, docs/agent-tasks/, .github/agent-log/, agent-tasks.md |
| `claude-reflect:correction-capture` | L3 | Correction capture | ❌ Fail | none of: .claude/reflections/, memory/feedback_, .github/ai-corrections.yml, scripts/capture-corrections.mjs |
| `claude-reflect:positive-reinforcement` | L3 | Positive reinforcement capture | ❌ Fail | none of: .claude/reflections/, memory/feedback_, docs/ai-reinforcement.md |
| `claude-reflect:preference-index` | L3 | Preference index | ❌ Fail | none of: .claude/preferences.json, memory/MEMORY.md, .github/agent-preferences.yml |
| `claude-reflect:session-summary` | L3 | Session summary artifact | ❌ Fail | none of: .claude/sessions/, docs/session-summaries/, memory/session_ |
| `fullsend:auto-merge-policy` | L3 | Auto-merge policy | ❌ Fail | none of: .github/auto-merge.yml, .prow.yaml, tide.yaml, .github/workflows/auto-merge.yml |
| `fullsend:branch-protection-doc` | L3 | Branch protection documentation | ❌ Fail | none of: docs/branch-protection.md, docs/governance.md, .github/branch-protection.yml |
| `fullsend:rollback-drill` | L3 | Rollback drill | ❌ Fail | none of: docs/rollback.md, .github/workflows/rollback.yml, scripts/rollback.sh |
| `acmm:ai-fix-workflow` | L4 | AI-fix-requested workflow | ❌ Fail | none of: .github/workflows/ai-fix.yml, .github/workflows/fix-requested.yml, .github/workflows/claude.yml |
| `acmm:auto-label` | L4 | Automated issue labeling | ❌ Fail | none of: .github/workflows/auto-label.yml, .github/labeler.yml, .github/workflows/triage.yml |
| `acmm:auto-qa-tuning` | L4 | Auto-QA self-tuning config | ❌ Fail | none of: .github/auto-qa-tuning.json, .github/qa-tuning.yml |
| `acmm:claude-md-auto-sync` | L4 | CLAUDE.md auto-sync | ❌ Fail | none of: .github/workflows/claude-md-sync.yml |
| `acmm:copilot-review-apply` | L4 | Automated review application | ❌ Fail | none of: .github/workflows/copilot-review-apply.yml, .github/workflows/ai-fix.yml, .github/workflows/auto-review.yml |
| `acmm:cross-repo-skills` | L4 | Cross-repository skill sharing | ❌ Fail | none of: .claude/settings.json |
| `acmm:cross-session-knowledge` | L4 | Cross-session knowledge sharing | ❌ Fail | none of: knowledge.jsonl, .knowledge/, docs/reflections/ |
| `acmm:feedback-loops` | L4 | Self-improving feedback loops | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:github-coordination` | L4 | GitHub as coordination layer | ❌ Fail | none of: .github/workflows/ |
| `acmm:idempotent-workflows` | L4 | Idempotent and resumable workflows | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:multi-perspective-review` | L4 | Multi-perspective review | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:nightly-compliance` | L4 | Nightly compliance scan | ❌ Fail | none of: .github/workflows/nightly-compliance.yml, .github/workflows/nightly.yml, .github/workflows/nightly-test.yml, .github/workflows/nightly-test-suite.yml |
| `acmm:preference-index` | L4 | Preference index | ❌ Fail | none of: preferences.json, .claude/preferences.json |
| `acmm:router-skills` | L4 | Router skills with decision trees | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:security-ai-md` | L4 | AI security policy | ❌ Fail | none of: SECURITY-AI.md, docs/security/SECURITY-AI.md, docs/SECURITY-AI.md |
| `acmm:session-continuity` | L4 | Session continuity | ❌ Fail | none of: .claude/checkpoint.md, .claude/session-summary.md |
| `acmm:structured-rca` | L4 | Structured RCA workflows | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:structured-workflows` | L4 | Structured workflow skills | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:task-ledger` | L4 | Task traceability ledger | ❌ Fail | none of: task-log.jsonl, .claude/task-log.jsonl |
| `acmm:tdd-workflows` | L4 | TDD workflows with environment routing | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:tier-classifier` | L4 | Change classification policy | ❌ Fail | none of: .github/workflows/tier-classifier.yml, .github/workflows/pr-size.yml |
| `aef:audit-trail` | L4 | Audit trail workflow | ❌ Fail | none of: .github/workflows/ai-audit.yml, .github/workflows/agent-audit.yml, scripts/ai-audit-report.mjs |
| `aef:cross-tool-config` | L4 | Cross-tool agent config | ❌ Fail | none of: AGENTS.md, docs/ai-contributors.md, .github/ai-config.yml |
| `claude-reflect:claude-md-sync` | L4 | CLAUDE.md auto-sync | ❌ Fail | none of: .github/workflows/claude-md-sync.yml, scripts/sync-claude-md.mjs, scripts/update-claude-md.mjs |
| `claude-reflect:reflection-review` | L4 | Periodic reflection review | ❌ Fail | none of: .github/workflows/reflection-review.yml, scripts/review-reflections.mjs, docs/reflection-review.md |
| `fullsend:observability-runbook` | L4 | Observability runbook | ❌ Fail | none of: docs/runbook.md, docs/runbooks/, RUNBOOK.md, docs/operations/ |
| `fullsend:production-feedback` | L4 | Production feedback signal | ❌ Fail | none of: monitoring/, grafana/, .github/workflows/post-deploy-check.yml, scripts/production-feedback.mjs |
| `fullsend:risk-assessment` | L4 | Risk assessment config | ❌ Fail | none of: .github/risk-assessment.yml, docs/risk-tiers.md, .github/workflows/tier-classifier.yml |
| `acmm:audit-trail` | L5 | Audit trail workflow | ❌ Fail | none of: .github/workflows/audit-trail.yml, .github/workflows/ai-attribution.yml |
| `acmm:auto-qa-self-tuning` | L5 | Auto-QA with self-tuning | ❌ Fail | none of: .github/workflows/auto-qa.yml, .github/auto-qa-tuning.json |
| `acmm:github-actions-ai` | L5 | GitHub Actions AI integration | ❌ Fail | none of: .github/workflows/claude.yml, .github/workflows/claude-code-review.yml |
| `acmm:periodic-reflection` | L5 | Periodic reflection review | ❌ Fail | none of: .github/workflows/reflection-review.yml |
| `acmm:policy-as-code` | L5 | Policy as code | ❌ Fail | none of: .github/policies/, policy/, conftest.yaml, opa/ |
| `acmm:public-metrics` | L5 | Public metrics endpoint | ❌ Fail | none of: web/netlify/functions/analytics-accm.mts, web/public/analytics.js |
| `acmm:reflection-log` | L5 | Reflection log | ❌ Fail | none of: docs/reflections/, memory/, .memory/, REFLECTIONS.md |
| `acmm:auto-issue-gen` | L6 | Automated issue generation | ❌ Fail | none of: .github/workflows/auto-issue.yml, .github/workflows/issue-gen.yml, .github/workflows/auto-generate-issues.yml |
| `acmm:merge-queue` | L6 | Merge queue / auto-merge | ❌ Fail | none of: .github/workflows/merge-queue.yml, .prow.yaml, tide.yaml |
| `acmm:multi-agent-orchestration` | L6 | Multi-agent orchestration | ❌ Fail | none of: scripts/orchestrate.mjs, .github/workflows/orchestrate.yml, orchestrator/ |
| `acmm:observability-runbook` | L6 | Observability runbook | ❌ Fail | none of: docs/ai-ops-runbook.md, docs/runbook/, RUNBOOK.md |
| `acmm:production-feedback` | L6 | Production feedback signal | ❌ Fail | none of: .github/workflows/production-feedback.yml |
| `acmm:risk-assessment-config` | L6 | Risk assessment config | ❌ Fail | none of: risk-config.json, .claude/risk-config.json, .github/risk-assessment.yml |
| `acmm:rollback-drill` | L6 | Rollback drill | ❌ Fail | none of: docs/rollback-drill.md, docs/ai-ops-runbook.md |
| `acmm:strategic-dashboard` | L6 | Strategic dashboard | ❌ Fail | none of: web/src/components/acmm/, web/public/analytics.js, docs/autonomous-work-log.md |

## apps/marketing

**Current ACMM Level:** 6 (Fully Autonomous)

| ID | Level | Name | Status | Evidence |
|---|---|---|---|---|
| `acmm:prereq-cicd` | L0 | CI/CD pipeline | ✅ Pass | detected at one of: .github/workflows/, .gitlab-ci.yml, Jenkinsfile, .circleci/ |
| `acmm:prereq-code-style` | L0 | Code style config | ✅ Pass | detected at one of: .eslintrc, .eslintrc.json, .eslintrc.js, eslint.config.js, .prettierrc, ruff.toml, .golangci.yml |
| `acmm:prereq-contrib-guide` | L0 | Contributing guide | ✅ Pass | detected at one of: CONTRIBUTING.md, .github/CONTRIBUTING.md |
| `acmm:prereq-coverage-gate` | L0 | Coverage gate workflow | ❌ Fail | none of: .github/workflows/coverage-gate.yml, .github/workflows/coverage.yml, .coverage-thresholds.json |
| `acmm:prereq-e2e` | L0 | End-to-end tests | ✅ Pass | detected at one of: playwright.config.ts, playwright.config.js, cypress.config.ts, cypress.config.js, e2e/, tests/e2e/ |
| `acmm:prereq-issue-template` | L0 | Issue template | ✅ Pass | detected at one of: .github/ISSUE_TEMPLATE/, .github/issue_template.md |
| `acmm:prereq-pr-template` | L0 | Pull request template | ✅ Pass | detected at one of: .github/pull_request_template.md, .github/PULL_REQUEST_TEMPLATE.md |
| `acmm:prereq-test-suite` | L0 | Automated test suite | ❌ Fail | none of: vitest.config.ts, vitest.config.js, jest.config.js, jest.config.ts, go.mod, pytest.ini, pyproject.toml |
| `acmm:agents-md` | L2 | AGENTS.md shared directives | ❌ Fail | none of: AGENTS.md |
| `acmm:claude-md` | L2 | CLAUDE.md instructions | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:copilot-instructions` | L2 | Copilot instructions | ❌ Fail | none of: .github/copilot-instructions.md |
| `acmm:correction-capture` | L2 | Correction capture | ❌ Fail | none of: .claude/memory/, .memory/, corrections.jsonl |
| `acmm:cursor-rules` | L2 | Cursor rules | ❌ Fail | none of: .cursor/rules, .cursorrules |
| `acmm:editor-config` | L2 | EditorConfig | ❌ Fail | none of: .editorconfig |
| `acmm:positive-reinforcement` | L2 | Positive reinforcement capture | ❌ Fail | none of: .claude/memory/ |
| `acmm:prompts-catalog` | L2 | Prompt catalog | ❌ Fail | none of: prompts/, .prompts/, docs/prompts/, .github/prompts/, .github/agents/ |
| `acmm:simple-skills` | L2 | Simple skills | ❌ Fail | none of: .claude/skills/, .claude/commands/, skills/ |
| `aef:session-continuity` | L2 | Session continuity doc | ✅ Pass | detected at one of: CLAUDE.md, AGENTS.md, .cursorrules, .github/copilot-instructions.md, docs/agent-context.md |
| `aef:structural-gates` | L2 | Structural gates | ✅ Pass | detected at one of: CODEOWNERS, .github/CODEOWNERS, .agent/boundaries.yml, docs/agent-boundaries.md |
| `fullsend:ci-cd-maturity` | L2 | CI/CD pipeline | ✅ Pass | detected at one of: .github/workflows/ |
| `fullsend:test-coverage` | L2 | Test coverage threshold | ❌ Fail | none of: codecov.yml, .codecov.yml, coverage.yml, .github/workflows/coverage-gate.yml |
| `acmm:ci-matrix` | L3 | CI matrix | ✅ Pass | detected at one of: .github/workflows/build.yml, .github/workflows/build-deploy.yml, .github/workflows/ci.yml, .github/workflows/test.yml |
| `acmm:context-budget` | L3 | Context budget management | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:evidence-antipatterns` | L3 | Evidence-based antipattern rules | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:layered-safety` | L3 | Layered safety model | ✅ Pass | detected at one of: .claude/settings.json, .claude/settings.local.json |
| `acmm:mechanical-enforcement` | L3 | Mechanical enforcement | ✅ Pass | detected at one of: .claude/settings.json |
| `acmm:model-tiering` | L3 | Model tiering for subagents | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:pr-acceptance-metric` | L3 | PR acceptance tracking | ✅ Pass | detected at one of: scripts/build-accm-history.mjs, .github/workflows/accm-history-update.yml, scripts/pr-metrics.mjs |
| `acmm:pr-review-rubric` | L3 | PR review rubric | ✅ Pass | detected at one of: .github/review-rubric.md, docs/review-criteria.md, .github/prompts/review.md, docs/qa/ |
| `acmm:quality-dashboard` | L3 | Quality dashboard | ❌ Fail | none of: web/public/analytics.js, web/src/components/analytics/ |
| `acmm:session-summary` | L3 | Session summary artifact | ❌ Fail | none of: .claude/session-summary.md, .claude/checkpoint.md |
| `acmm:structural-gates` | L3 | Structural gates | ✅ Pass | detected at one of: .claude/settings.json |
| `acmm:verify-before-reporting` | L3 | Verify-before-reporting practices | ✅ Pass | detected at one of: CLAUDE.md |
| `aef:change-classification` | L3 | Change classification policy | ❌ Fail | none of: docs/change-classification.md, .github/change-tiers.yml, docs/risk-tiers.md |
| `aef:task-traceability` | L3 | Task traceability ledger | ❌ Fail | none of: .agent/tasks/, docs/agent-tasks/, .github/agent-log/, agent-tasks.md |
| `claude-reflect:correction-capture` | L3 | Correction capture | ❌ Fail | none of: .claude/reflections/, memory/feedback_, .github/ai-corrections.yml, scripts/capture-corrections.mjs |
| `claude-reflect:positive-reinforcement` | L3 | Positive reinforcement capture | ❌ Fail | none of: .claude/reflections/, memory/feedback_, docs/ai-reinforcement.md |
| `claude-reflect:preference-index` | L3 | Preference index | ❌ Fail | none of: .claude/preferences.json, memory/MEMORY.md, .github/agent-preferences.yml |
| `claude-reflect:session-summary` | L3 | Session summary artifact | ❌ Fail | none of: .claude/sessions/, docs/session-summaries/, memory/session_ |
| `fullsend:auto-merge-policy` | L3 | Auto-merge policy | ❌ Fail | none of: .github/auto-merge.yml, .prow.yaml, tide.yaml, .github/workflows/auto-merge.yml |
| `fullsend:branch-protection-doc` | L3 | Branch protection documentation | ❌ Fail | none of: docs/branch-protection.md, docs/governance.md, .github/branch-protection.yml |
| `fullsend:rollback-drill` | L3 | Rollback drill | ❌ Fail | none of: docs/rollback.md, .github/workflows/rollback.yml, scripts/rollback.sh |
| `acmm:ai-fix-workflow` | L4 | AI-fix-requested workflow | ✅ Pass | detected at one of: .github/workflows/ai-fix.yml, .github/workflows/fix-requested.yml, .github/workflows/claude.yml |
| `acmm:auto-label` | L4 | Automated issue labeling | ✅ Pass | detected at one of: .github/workflows/auto-label.yml, .github/labeler.yml, .github/workflows/triage.yml |
| `acmm:auto-qa-tuning` | L4 | Auto-QA self-tuning config | ✅ Pass | detected at one of: .github/auto-qa-tuning.json, .github/qa-tuning.yml |
| `acmm:claude-md-auto-sync` | L4 | CLAUDE.md auto-sync | ❌ Fail | none of: .github/workflows/claude-md-sync.yml |
| `acmm:copilot-review-apply` | L4 | Automated review application | ❌ Fail | none of: .github/workflows/copilot-review-apply.yml, .github/workflows/ai-fix.yml, .github/workflows/auto-review.yml |
| `acmm:cross-repo-skills` | L4 | Cross-repository skill sharing | ✅ Pass | detected at one of: .claude/settings.json |
| `acmm:cross-session-knowledge` | L4 | Cross-session knowledge sharing | ✅ Pass | detected at one of: knowledge.jsonl, .knowledge/, docs/reflections/ |
| `acmm:feedback-loops` | L4 | Self-improving feedback loops | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:github-coordination` | L4 | GitHub as coordination layer | ✅ Pass | detected at one of: .github/workflows/ |
| `acmm:idempotent-workflows` | L4 | Idempotent and resumable workflows | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:multi-perspective-review` | L4 | Multi-perspective review | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:nightly-compliance` | L4 | Nightly compliance scan | ✅ Pass | detected at one of: .github/workflows/nightly-compliance.yml, .github/workflows/nightly.yml, .github/workflows/nightly-test.yml, .github/workflows/nightly-test-suite.yml |
| `acmm:preference-index` | L4 | Preference index | ❌ Fail | none of: preferences.json, .claude/preferences.json |
| `acmm:router-skills` | L4 | Router skills with decision trees | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:security-ai-md` | L4 | AI security policy | ✅ Pass | detected at one of: SECURITY-AI.md, docs/security/SECURITY-AI.md, docs/SECURITY-AI.md |
| `acmm:session-continuity` | L4 | Session continuity | ❌ Fail | none of: .claude/checkpoint.md, .claude/session-summary.md |
| `acmm:structured-rca` | L4 | Structured RCA workflows | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:structured-workflows` | L4 | Structured workflow skills | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:task-ledger` | L4 | Task traceability ledger | ❌ Fail | none of: task-log.jsonl, .claude/task-log.jsonl |
| `acmm:tdd-workflows` | L4 | TDD workflows with environment routing | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:tier-classifier` | L4 | Change classification policy | ✅ Pass | detected at one of: .github/workflows/tier-classifier.yml, .github/workflows/pr-size.yml |
| `aef:audit-trail` | L4 | Audit trail workflow | ❌ Fail | none of: .github/workflows/ai-audit.yml, .github/workflows/agent-audit.yml, scripts/ai-audit-report.mjs |
| `aef:cross-tool-config` | L4 | Cross-tool agent config | ❌ Fail | none of: AGENTS.md, docs/ai-contributors.md, .github/ai-config.yml |
| `claude-reflect:claude-md-sync` | L4 | CLAUDE.md auto-sync | ❌ Fail | none of: .github/workflows/claude-md-sync.yml, scripts/sync-claude-md.mjs, scripts/update-claude-md.mjs |
| `claude-reflect:reflection-review` | L4 | Periodic reflection review | ❌ Fail | none of: .github/workflows/reflection-review.yml, scripts/review-reflections.mjs, docs/reflection-review.md |
| `fullsend:observability-runbook` | L4 | Observability runbook | ✅ Pass | detected at one of: docs/runbook.md, docs/runbooks/, RUNBOOK.md, docs/operations/ |
| `fullsend:production-feedback` | L4 | Production feedback signal | ❌ Fail | none of: monitoring/, grafana/, .github/workflows/post-deploy-check.yml, scripts/production-feedback.mjs |
| `fullsend:risk-assessment` | L4 | Risk assessment config | ✅ Pass | detected at one of: .github/risk-assessment.yml, docs/risk-tiers.md, .github/workflows/tier-classifier.yml |
| `acmm:audit-trail` | L5 | Audit trail workflow | ✅ Pass | detected at one of: .github/workflows/audit-trail.yml, .github/workflows/ai-attribution.yml |
| `acmm:auto-qa-self-tuning` | L5 | Auto-QA with self-tuning | ✅ Pass | detected at one of: .github/workflows/auto-qa.yml, .github/auto-qa-tuning.json |
| `acmm:github-actions-ai` | L5 | GitHub Actions AI integration | ✅ Pass | detected at one of: .github/workflows/claude.yml, .github/workflows/claude-code-review.yml |
| `acmm:periodic-reflection` | L5 | Periodic reflection review | ❌ Fail | none of: .github/workflows/reflection-review.yml |
| `acmm:policy-as-code` | L5 | Policy as code | ✅ Pass | detected at one of: .github/policies/, policy/, conftest.yaml, opa/ |
| `acmm:public-metrics` | L5 | Public metrics endpoint | ❌ Fail | none of: web/netlify/functions/analytics-accm.mts, web/public/analytics.js |
| `acmm:reflection-log` | L5 | Reflection log | ✅ Pass | detected at one of: docs/reflections/, memory/, .memory/, REFLECTIONS.md |
| `acmm:auto-issue-gen` | L6 | Automated issue generation | ✅ Pass | detected at one of: .github/workflows/auto-issue.yml, .github/workflows/issue-gen.yml, .github/workflows/auto-generate-issues.yml |
| `acmm:merge-queue` | L6 | Merge queue / auto-merge | ✅ Pass | detected at one of: .github/workflows/merge-queue.yml, .prow.yaml, tide.yaml |
| `acmm:multi-agent-orchestration` | L6 | Multi-agent orchestration | ✅ Pass | detected at one of: scripts/orchestrate.mjs, .github/workflows/orchestrate.yml, orchestrator/ |
| `acmm:observability-runbook` | L6 | Observability runbook | ✅ Pass | detected at one of: docs/ai-ops-runbook.md, docs/runbook/, RUNBOOK.md |
| `acmm:production-feedback` | L6 | Production feedback signal | ❌ Fail | none of: .github/workflows/production-feedback.yml |
| `acmm:risk-assessment-config` | L6 | Risk assessment config | ✅ Pass | detected at one of: risk-config.json, .claude/risk-config.json, .github/risk-assessment.yml |
| `acmm:rollback-drill` | L6 | Rollback drill | ✅ Pass | detected at one of: docs/rollback-drill.md, docs/ai-ops-runbook.md |
| `acmm:strategic-dashboard` | L6 | Strategic dashboard | ✅ Pass | detected at one of: web/src/components/acmm/, web/public/analytics.js, docs/autonomous-work-log.md |

## apps/rialto-web

**Current ACMM Level:** 1 (Assisted / Ad Hoc)

| ID | Level | Name | Status | Evidence |
|---|---|---|---|---|
| `acmm:prereq-cicd` | L0 | CI/CD pipeline | ❌ Fail | none of: .github/workflows/, .gitlab-ci.yml, Jenkinsfile, .circleci/ |
| `acmm:prereq-code-style` | L0 | Code style config | ✅ Pass | detected at one of: .eslintrc, .eslintrc.json, .eslintrc.js, eslint.config.js, .prettierrc, ruff.toml, .golangci.yml |
| `acmm:prereq-contrib-guide` | L0 | Contributing guide | ❌ Fail | none of: CONTRIBUTING.md, .github/CONTRIBUTING.md |
| `acmm:prereq-coverage-gate` | L0 | Coverage gate workflow | ❌ Fail | none of: .github/workflows/coverage-gate.yml, .github/workflows/coverage.yml, .coverage-thresholds.json |
| `acmm:prereq-e2e` | L0 | End-to-end tests | ✅ Pass | detected at one of: playwright.config.ts, playwright.config.js, cypress.config.ts, cypress.config.js, e2e/, tests/e2e/ |
| `acmm:prereq-issue-template` | L0 | Issue template | ❌ Fail | none of: .github/ISSUE_TEMPLATE/, .github/issue_template.md |
| `acmm:prereq-pr-template` | L0 | Pull request template | ❌ Fail | none of: .github/pull_request_template.md, .github/PULL_REQUEST_TEMPLATE.md |
| `acmm:prereq-test-suite` | L0 | Automated test suite | ❌ Fail | none of: vitest.config.ts, vitest.config.js, jest.config.js, jest.config.ts, go.mod, pytest.ini, pyproject.toml |
| `acmm:agents-md` | L2 | AGENTS.md shared directives | ❌ Fail | none of: AGENTS.md |
| `acmm:claude-md` | L2 | CLAUDE.md instructions | ❌ Fail | none of: CLAUDE.md |
| `acmm:copilot-instructions` | L2 | Copilot instructions | ❌ Fail | none of: .github/copilot-instructions.md |
| `acmm:correction-capture` | L2 | Correction capture | ❌ Fail | none of: .claude/memory/, .memory/, corrections.jsonl |
| `acmm:cursor-rules` | L2 | Cursor rules | ❌ Fail | none of: .cursor/rules, .cursorrules |
| `acmm:editor-config` | L2 | EditorConfig | ❌ Fail | none of: .editorconfig |
| `acmm:positive-reinforcement` | L2 | Positive reinforcement capture | ❌ Fail | none of: .claude/memory/ |
| `acmm:prompts-catalog` | L2 | Prompt catalog | ❌ Fail | none of: prompts/, .prompts/, docs/prompts/, .github/prompts/, .github/agents/ |
| `acmm:simple-skills` | L2 | Simple skills | ❌ Fail | none of: .claude/skills/, .claude/commands/, skills/ |
| `aef:session-continuity` | L2 | Session continuity doc | ❌ Fail | none of: CLAUDE.md, AGENTS.md, .cursorrules, .github/copilot-instructions.md, docs/agent-context.md |
| `aef:structural-gates` | L2 | Structural gates | ❌ Fail | none of: CODEOWNERS, .github/CODEOWNERS, .agent/boundaries.yml, docs/agent-boundaries.md |
| `fullsend:ci-cd-maturity` | L2 | CI/CD pipeline | ❌ Fail | none of: .github/workflows/ |
| `fullsend:test-coverage` | L2 | Test coverage threshold | ❌ Fail | none of: codecov.yml, .codecov.yml, coverage.yml, .github/workflows/coverage-gate.yml |
| `acmm:ci-matrix` | L3 | CI matrix | ❌ Fail | none of: .github/workflows/build.yml, .github/workflows/build-deploy.yml, .github/workflows/ci.yml, .github/workflows/test.yml |
| `acmm:context-budget` | L3 | Context budget management | ❌ Fail | none of: CLAUDE.md |
| `acmm:evidence-antipatterns` | L3 | Evidence-based antipattern rules | ❌ Fail | none of: CLAUDE.md |
| `acmm:layered-safety` | L3 | Layered safety model | ❌ Fail | none of: .claude/settings.json, .claude/settings.local.json |
| `acmm:mechanical-enforcement` | L3 | Mechanical enforcement | ❌ Fail | none of: .claude/settings.json |
| `acmm:model-tiering` | L3 | Model tiering for subagents | ❌ Fail | none of: CLAUDE.md |
| `acmm:pr-acceptance-metric` | L3 | PR acceptance tracking | ❌ Fail | none of: scripts/build-accm-history.mjs, .github/workflows/accm-history-update.yml, scripts/pr-metrics.mjs |
| `acmm:pr-review-rubric` | L3 | PR review rubric | ❌ Fail | none of: .github/review-rubric.md, docs/review-criteria.md, .github/prompts/review.md, docs/qa/ |
| `acmm:quality-dashboard` | L3 | Quality dashboard | ❌ Fail | none of: web/public/analytics.js, web/src/components/analytics/ |
| `acmm:session-summary` | L3 | Session summary artifact | ❌ Fail | none of: .claude/session-summary.md, .claude/checkpoint.md |
| `acmm:structural-gates` | L3 | Structural gates | ❌ Fail | none of: .claude/settings.json |
| `acmm:verify-before-reporting` | L3 | Verify-before-reporting practices | ❌ Fail | none of: CLAUDE.md |
| `aef:change-classification` | L3 | Change classification policy | ❌ Fail | none of: docs/change-classification.md, .github/change-tiers.yml, docs/risk-tiers.md |
| `aef:task-traceability` | L3 | Task traceability ledger | ❌ Fail | none of: .agent/tasks/, docs/agent-tasks/, .github/agent-log/, agent-tasks.md |
| `claude-reflect:correction-capture` | L3 | Correction capture | ❌ Fail | none of: .claude/reflections/, memory/feedback_, .github/ai-corrections.yml, scripts/capture-corrections.mjs |
| `claude-reflect:positive-reinforcement` | L3 | Positive reinforcement capture | ❌ Fail | none of: .claude/reflections/, memory/feedback_, docs/ai-reinforcement.md |
| `claude-reflect:preference-index` | L3 | Preference index | ❌ Fail | none of: .claude/preferences.json, memory/MEMORY.md, .github/agent-preferences.yml |
| `claude-reflect:session-summary` | L3 | Session summary artifact | ❌ Fail | none of: .claude/sessions/, docs/session-summaries/, memory/session_ |
| `fullsend:auto-merge-policy` | L3 | Auto-merge policy | ❌ Fail | none of: .github/auto-merge.yml, .prow.yaml, tide.yaml, .github/workflows/auto-merge.yml |
| `fullsend:branch-protection-doc` | L3 | Branch protection documentation | ❌ Fail | none of: docs/branch-protection.md, docs/governance.md, .github/branch-protection.yml |
| `fullsend:rollback-drill` | L3 | Rollback drill | ❌ Fail | none of: docs/rollback.md, .github/workflows/rollback.yml, scripts/rollback.sh |
| `acmm:ai-fix-workflow` | L4 | AI-fix-requested workflow | ❌ Fail | none of: .github/workflows/ai-fix.yml, .github/workflows/fix-requested.yml, .github/workflows/claude.yml |
| `acmm:auto-label` | L4 | Automated issue labeling | ❌ Fail | none of: .github/workflows/auto-label.yml, .github/labeler.yml, .github/workflows/triage.yml |
| `acmm:auto-qa-tuning` | L4 | Auto-QA self-tuning config | ❌ Fail | none of: .github/auto-qa-tuning.json, .github/qa-tuning.yml |
| `acmm:claude-md-auto-sync` | L4 | CLAUDE.md auto-sync | ❌ Fail | none of: .github/workflows/claude-md-sync.yml |
| `acmm:copilot-review-apply` | L4 | Automated review application | ❌ Fail | none of: .github/workflows/copilot-review-apply.yml, .github/workflows/ai-fix.yml, .github/workflows/auto-review.yml |
| `acmm:cross-repo-skills` | L4 | Cross-repository skill sharing | ❌ Fail | none of: .claude/settings.json |
| `acmm:cross-session-knowledge` | L4 | Cross-session knowledge sharing | ❌ Fail | none of: knowledge.jsonl, .knowledge/, docs/reflections/ |
| `acmm:feedback-loops` | L4 | Self-improving feedback loops | ❌ Fail | none of: CLAUDE.md |
| `acmm:github-coordination` | L4 | GitHub as coordination layer | ❌ Fail | none of: .github/workflows/ |
| `acmm:idempotent-workflows` | L4 | Idempotent and resumable workflows | ❌ Fail | none of: CLAUDE.md |
| `acmm:multi-perspective-review` | L4 | Multi-perspective review | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:nightly-compliance` | L4 | Nightly compliance scan | ❌ Fail | none of: .github/workflows/nightly-compliance.yml, .github/workflows/nightly.yml, .github/workflows/nightly-test.yml, .github/workflows/nightly-test-suite.yml |
| `acmm:preference-index` | L4 | Preference index | ❌ Fail | none of: preferences.json, .claude/preferences.json |
| `acmm:router-skills` | L4 | Router skills with decision trees | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:security-ai-md` | L4 | AI security policy | ❌ Fail | none of: SECURITY-AI.md, docs/security/SECURITY-AI.md, docs/SECURITY-AI.md |
| `acmm:session-continuity` | L4 | Session continuity | ❌ Fail | none of: .claude/checkpoint.md, .claude/session-summary.md |
| `acmm:structured-rca` | L4 | Structured RCA workflows | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:structured-workflows` | L4 | Structured workflow skills | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:task-ledger` | L4 | Task traceability ledger | ❌ Fail | none of: task-log.jsonl, .claude/task-log.jsonl |
| `acmm:tdd-workflows` | L4 | TDD workflows with environment routing | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:tier-classifier` | L4 | Change classification policy | ❌ Fail | none of: .github/workflows/tier-classifier.yml, .github/workflows/pr-size.yml |
| `aef:audit-trail` | L4 | Audit trail workflow | ❌ Fail | none of: .github/workflows/ai-audit.yml, .github/workflows/agent-audit.yml, scripts/ai-audit-report.mjs |
| `aef:cross-tool-config` | L4 | Cross-tool agent config | ❌ Fail | none of: AGENTS.md, docs/ai-contributors.md, .github/ai-config.yml |
| `claude-reflect:claude-md-sync` | L4 | CLAUDE.md auto-sync | ❌ Fail | none of: .github/workflows/claude-md-sync.yml, scripts/sync-claude-md.mjs, scripts/update-claude-md.mjs |
| `claude-reflect:reflection-review` | L4 | Periodic reflection review | ❌ Fail | none of: .github/workflows/reflection-review.yml, scripts/review-reflections.mjs, docs/reflection-review.md |
| `fullsend:observability-runbook` | L4 | Observability runbook | ❌ Fail | none of: docs/runbook.md, docs/runbooks/, RUNBOOK.md, docs/operations/ |
| `fullsend:production-feedback` | L4 | Production feedback signal | ❌ Fail | none of: monitoring/, grafana/, .github/workflows/post-deploy-check.yml, scripts/production-feedback.mjs |
| `fullsend:risk-assessment` | L4 | Risk assessment config | ❌ Fail | none of: .github/risk-assessment.yml, docs/risk-tiers.md, .github/workflows/tier-classifier.yml |
| `acmm:audit-trail` | L5 | Audit trail workflow | ❌ Fail | none of: .github/workflows/audit-trail.yml, .github/workflows/ai-attribution.yml |
| `acmm:auto-qa-self-tuning` | L5 | Auto-QA with self-tuning | ❌ Fail | none of: .github/workflows/auto-qa.yml, .github/auto-qa-tuning.json |
| `acmm:github-actions-ai` | L5 | GitHub Actions AI integration | ❌ Fail | none of: .github/workflows/claude.yml, .github/workflows/claude-code-review.yml |
| `acmm:periodic-reflection` | L5 | Periodic reflection review | ❌ Fail | none of: .github/workflows/reflection-review.yml |
| `acmm:policy-as-code` | L5 | Policy as code | ❌ Fail | none of: .github/policies/, policy/, conftest.yaml, opa/ |
| `acmm:public-metrics` | L5 | Public metrics endpoint | ❌ Fail | none of: web/netlify/functions/analytics-accm.mts, web/public/analytics.js |
| `acmm:reflection-log` | L5 | Reflection log | ❌ Fail | none of: docs/reflections/, memory/, .memory/, REFLECTIONS.md |
| `acmm:auto-issue-gen` | L6 | Automated issue generation | ❌ Fail | none of: .github/workflows/auto-issue.yml, .github/workflows/issue-gen.yml, .github/workflows/auto-generate-issues.yml |
| `acmm:merge-queue` | L6 | Merge queue / auto-merge | ❌ Fail | none of: .github/workflows/merge-queue.yml, .prow.yaml, tide.yaml |
| `acmm:multi-agent-orchestration` | L6 | Multi-agent orchestration | ❌ Fail | none of: scripts/orchestrate.mjs, .github/workflows/orchestrate.yml, orchestrator/ |
| `acmm:observability-runbook` | L6 | Observability runbook | ❌ Fail | none of: docs/ai-ops-runbook.md, docs/runbook/, RUNBOOK.md |
| `acmm:production-feedback` | L6 | Production feedback signal | ❌ Fail | none of: .github/workflows/production-feedback.yml |
| `acmm:risk-assessment-config` | L6 | Risk assessment config | ❌ Fail | none of: risk-config.json, .claude/risk-config.json, .github/risk-assessment.yml |
| `acmm:rollback-drill` | L6 | Rollback drill | ❌ Fail | none of: docs/rollback-drill.md, docs/ai-ops-runbook.md |
| `acmm:strategic-dashboard` | L6 | Strategic dashboard | ❌ Fail | none of: web/src/components/acmm/, web/public/analytics.js, docs/autonomous-work-log.md |

## packages/agent-core

**Current ACMM Level:** 2 (Instructed)

| ID | Level | Name | Status | Evidence |
|---|---|---|---|---|
| `acmm:prereq-cicd` | L0 | CI/CD pipeline | ❌ Fail | none of: .github/workflows/, .gitlab-ci.yml, Jenkinsfile, .circleci/ |
| `acmm:prereq-code-style` | L0 | Code style config | ✅ Pass | detected at one of: .eslintrc, .eslintrc.json, .eslintrc.js, eslint.config.js, .prettierrc, ruff.toml, .golangci.yml |
| `acmm:prereq-contrib-guide` | L0 | Contributing guide | ❌ Fail | none of: CONTRIBUTING.md, .github/CONTRIBUTING.md |
| `acmm:prereq-coverage-gate` | L0 | Coverage gate workflow | ❌ Fail | none of: .github/workflows/coverage-gate.yml, .github/workflows/coverage.yml, .coverage-thresholds.json |
| `acmm:prereq-e2e` | L0 | End-to-end tests | ❌ Fail | none of: playwright.config.ts, playwright.config.js, cypress.config.ts, cypress.config.js, e2e/, tests/e2e/ |
| `acmm:prereq-issue-template` | L0 | Issue template | ❌ Fail | none of: .github/ISSUE_TEMPLATE/, .github/issue_template.md |
| `acmm:prereq-pr-template` | L0 | Pull request template | ❌ Fail | none of: .github/pull_request_template.md, .github/PULL_REQUEST_TEMPLATE.md |
| `acmm:prereq-test-suite` | L0 | Automated test suite | ✅ Pass | detected at one of: vitest.config.ts, vitest.config.js, jest.config.js, jest.config.ts, go.mod, pytest.ini, pyproject.toml |
| `acmm:agents-md` | L2 | AGENTS.md shared directives | ❌ Fail | none of: AGENTS.md |
| `acmm:claude-md` | L2 | CLAUDE.md instructions | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:copilot-instructions` | L2 | Copilot instructions | ❌ Fail | none of: .github/copilot-instructions.md |
| `acmm:correction-capture` | L2 | Correction capture | ❌ Fail | none of: .claude/memory/, .memory/, corrections.jsonl |
| `acmm:cursor-rules` | L2 | Cursor rules | ❌ Fail | none of: .cursor/rules, .cursorrules |
| `acmm:editor-config` | L2 | EditorConfig | ❌ Fail | none of: .editorconfig |
| `acmm:positive-reinforcement` | L2 | Positive reinforcement capture | ❌ Fail | none of: .claude/memory/ |
| `acmm:prompts-catalog` | L2 | Prompt catalog | ❌ Fail | none of: prompts/, .prompts/, docs/prompts/, .github/prompts/, .github/agents/ |
| `acmm:simple-skills` | L2 | Simple skills | ❌ Fail | none of: .claude/skills/, .claude/commands/, skills/ |
| `aef:session-continuity` | L2 | Session continuity doc | ✅ Pass | detected at one of: CLAUDE.md, AGENTS.md, .cursorrules, .github/copilot-instructions.md, docs/agent-context.md |
| `aef:structural-gates` | L2 | Structural gates | ❌ Fail | none of: CODEOWNERS, .github/CODEOWNERS, .agent/boundaries.yml, docs/agent-boundaries.md |
| `fullsend:ci-cd-maturity` | L2 | CI/CD pipeline | ❌ Fail | none of: .github/workflows/ |
| `fullsend:test-coverage` | L2 | Test coverage threshold | ❌ Fail | none of: codecov.yml, .codecov.yml, coverage.yml, .github/workflows/coverage-gate.yml |
| `acmm:ci-matrix` | L3 | CI matrix | ❌ Fail | none of: .github/workflows/build.yml, .github/workflows/build-deploy.yml, .github/workflows/ci.yml, .github/workflows/test.yml |
| `acmm:context-budget` | L3 | Context budget management | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:evidence-antipatterns` | L3 | Evidence-based antipattern rules | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:layered-safety` | L3 | Layered safety model | ❌ Fail | none of: .claude/settings.json, .claude/settings.local.json |
| `acmm:mechanical-enforcement` | L3 | Mechanical enforcement | ❌ Fail | none of: .claude/settings.json |
| `acmm:model-tiering` | L3 | Model tiering for subagents | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:pr-acceptance-metric` | L3 | PR acceptance tracking | ❌ Fail | none of: scripts/build-accm-history.mjs, .github/workflows/accm-history-update.yml, scripts/pr-metrics.mjs |
| `acmm:pr-review-rubric` | L3 | PR review rubric | ❌ Fail | none of: .github/review-rubric.md, docs/review-criteria.md, .github/prompts/review.md, docs/qa/ |
| `acmm:quality-dashboard` | L3 | Quality dashboard | ❌ Fail | none of: web/public/analytics.js, web/src/components/analytics/ |
| `acmm:session-summary` | L3 | Session summary artifact | ❌ Fail | none of: .claude/session-summary.md, .claude/checkpoint.md |
| `acmm:structural-gates` | L3 | Structural gates | ❌ Fail | none of: .claude/settings.json |
| `acmm:verify-before-reporting` | L3 | Verify-before-reporting practices | ✅ Pass | detected at one of: CLAUDE.md |
| `aef:change-classification` | L3 | Change classification policy | ❌ Fail | none of: docs/change-classification.md, .github/change-tiers.yml, docs/risk-tiers.md |
| `aef:task-traceability` | L3 | Task traceability ledger | ❌ Fail | none of: .agent/tasks/, docs/agent-tasks/, .github/agent-log/, agent-tasks.md |
| `claude-reflect:correction-capture` | L3 | Correction capture | ❌ Fail | none of: .claude/reflections/, memory/feedback_, .github/ai-corrections.yml, scripts/capture-corrections.mjs |
| `claude-reflect:positive-reinforcement` | L3 | Positive reinforcement capture | ❌ Fail | none of: .claude/reflections/, memory/feedback_, docs/ai-reinforcement.md |
| `claude-reflect:preference-index` | L3 | Preference index | ❌ Fail | none of: .claude/preferences.json, memory/MEMORY.md, .github/agent-preferences.yml |
| `claude-reflect:session-summary` | L3 | Session summary artifact | ❌ Fail | none of: .claude/sessions/, docs/session-summaries/, memory/session_ |
| `fullsend:auto-merge-policy` | L3 | Auto-merge policy | ❌ Fail | none of: .github/auto-merge.yml, .prow.yaml, tide.yaml, .github/workflows/auto-merge.yml |
| `fullsend:branch-protection-doc` | L3 | Branch protection documentation | ❌ Fail | none of: docs/branch-protection.md, docs/governance.md, .github/branch-protection.yml |
| `fullsend:rollback-drill` | L3 | Rollback drill | ❌ Fail | none of: docs/rollback.md, .github/workflows/rollback.yml, scripts/rollback.sh |
| `acmm:ai-fix-workflow` | L4 | AI-fix-requested workflow | ❌ Fail | none of: .github/workflows/ai-fix.yml, .github/workflows/fix-requested.yml, .github/workflows/claude.yml |
| `acmm:auto-label` | L4 | Automated issue labeling | ❌ Fail | none of: .github/workflows/auto-label.yml, .github/labeler.yml, .github/workflows/triage.yml |
| `acmm:auto-qa-tuning` | L4 | Auto-QA self-tuning config | ❌ Fail | none of: .github/auto-qa-tuning.json, .github/qa-tuning.yml |
| `acmm:claude-md-auto-sync` | L4 | CLAUDE.md auto-sync | ❌ Fail | none of: .github/workflows/claude-md-sync.yml |
| `acmm:copilot-review-apply` | L4 | Automated review application | ❌ Fail | none of: .github/workflows/copilot-review-apply.yml, .github/workflows/ai-fix.yml, .github/workflows/auto-review.yml |
| `acmm:cross-repo-skills` | L4 | Cross-repository skill sharing | ❌ Fail | none of: .claude/settings.json |
| `acmm:cross-session-knowledge` | L4 | Cross-session knowledge sharing | ❌ Fail | none of: knowledge.jsonl, .knowledge/, docs/reflections/ |
| `acmm:feedback-loops` | L4 | Self-improving feedback loops | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:github-coordination` | L4 | GitHub as coordination layer | ❌ Fail | none of: .github/workflows/ |
| `acmm:idempotent-workflows` | L4 | Idempotent and resumable workflows | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:multi-perspective-review` | L4 | Multi-perspective review | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:nightly-compliance` | L4 | Nightly compliance scan | ❌ Fail | none of: .github/workflows/nightly-compliance.yml, .github/workflows/nightly.yml, .github/workflows/nightly-test.yml, .github/workflows/nightly-test-suite.yml |
| `acmm:preference-index` | L4 | Preference index | ❌ Fail | none of: preferences.json, .claude/preferences.json |
| `acmm:router-skills` | L4 | Router skills with decision trees | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:security-ai-md` | L4 | AI security policy | ❌ Fail | none of: SECURITY-AI.md, docs/security/SECURITY-AI.md, docs/SECURITY-AI.md |
| `acmm:session-continuity` | L4 | Session continuity | ❌ Fail | none of: .claude/checkpoint.md, .claude/session-summary.md |
| `acmm:structured-rca` | L4 | Structured RCA workflows | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:structured-workflows` | L4 | Structured workflow skills | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:task-ledger` | L4 | Task traceability ledger | ❌ Fail | none of: task-log.jsonl, .claude/task-log.jsonl |
| `acmm:tdd-workflows` | L4 | TDD workflows with environment routing | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:tier-classifier` | L4 | Change classification policy | ❌ Fail | none of: .github/workflows/tier-classifier.yml, .github/workflows/pr-size.yml |
| `aef:audit-trail` | L4 | Audit trail workflow | ❌ Fail | none of: .github/workflows/ai-audit.yml, .github/workflows/agent-audit.yml, scripts/ai-audit-report.mjs |
| `aef:cross-tool-config` | L4 | Cross-tool agent config | ❌ Fail | none of: AGENTS.md, docs/ai-contributors.md, .github/ai-config.yml |
| `claude-reflect:claude-md-sync` | L4 | CLAUDE.md auto-sync | ❌ Fail | none of: .github/workflows/claude-md-sync.yml, scripts/sync-claude-md.mjs, scripts/update-claude-md.mjs |
| `claude-reflect:reflection-review` | L4 | Periodic reflection review | ❌ Fail | none of: .github/workflows/reflection-review.yml, scripts/review-reflections.mjs, docs/reflection-review.md |
| `fullsend:observability-runbook` | L4 | Observability runbook | ❌ Fail | none of: docs/runbook.md, docs/runbooks/, RUNBOOK.md, docs/operations/ |
| `fullsend:production-feedback` | L4 | Production feedback signal | ❌ Fail | none of: monitoring/, grafana/, .github/workflows/post-deploy-check.yml, scripts/production-feedback.mjs |
| `fullsend:risk-assessment` | L4 | Risk assessment config | ❌ Fail | none of: .github/risk-assessment.yml, docs/risk-tiers.md, .github/workflows/tier-classifier.yml |
| `acmm:audit-trail` | L5 | Audit trail workflow | ❌ Fail | none of: .github/workflows/audit-trail.yml, .github/workflows/ai-attribution.yml |
| `acmm:auto-qa-self-tuning` | L5 | Auto-QA with self-tuning | ❌ Fail | none of: .github/workflows/auto-qa.yml, .github/auto-qa-tuning.json |
| `acmm:github-actions-ai` | L5 | GitHub Actions AI integration | ❌ Fail | none of: .github/workflows/claude.yml, .github/workflows/claude-code-review.yml |
| `acmm:periodic-reflection` | L5 | Periodic reflection review | ❌ Fail | none of: .github/workflows/reflection-review.yml |
| `acmm:policy-as-code` | L5 | Policy as code | ❌ Fail | none of: .github/policies/, policy/, conftest.yaml, opa/ |
| `acmm:public-metrics` | L5 | Public metrics endpoint | ❌ Fail | none of: web/netlify/functions/analytics-accm.mts, web/public/analytics.js |
| `acmm:reflection-log` | L5 | Reflection log | ❌ Fail | none of: docs/reflections/, memory/, .memory/, REFLECTIONS.md |
| `acmm:auto-issue-gen` | L6 | Automated issue generation | ❌ Fail | none of: .github/workflows/auto-issue.yml, .github/workflows/issue-gen.yml, .github/workflows/auto-generate-issues.yml |
| `acmm:merge-queue` | L6 | Merge queue / auto-merge | ❌ Fail | none of: .github/workflows/merge-queue.yml, .prow.yaml, tide.yaml |
| `acmm:multi-agent-orchestration` | L6 | Multi-agent orchestration | ❌ Fail | none of: scripts/orchestrate.mjs, .github/workflows/orchestrate.yml, orchestrator/ |
| `acmm:observability-runbook` | L6 | Observability runbook | ❌ Fail | none of: docs/ai-ops-runbook.md, docs/runbook/, RUNBOOK.md |
| `acmm:production-feedback` | L6 | Production feedback signal | ❌ Fail | none of: .github/workflows/production-feedback.yml |
| `acmm:risk-assessment-config` | L6 | Risk assessment config | ❌ Fail | none of: risk-config.json, .claude/risk-config.json, .github/risk-assessment.yml |
| `acmm:rollback-drill` | L6 | Rollback drill | ❌ Fail | none of: docs/rollback-drill.md, docs/ai-ops-runbook.md |
| `acmm:strategic-dashboard` | L6 | Strategic dashboard | ❌ Fail | none of: web/src/components/acmm/, web/public/analytics.js, docs/autonomous-work-log.md |

## packages/api-client

**Current ACMM Level:** 2 (Instructed)

| ID | Level | Name | Status | Evidence |
|---|---|---|---|---|
| `acmm:prereq-cicd` | L0 | CI/CD pipeline | ❌ Fail | none of: .github/workflows/, .gitlab-ci.yml, Jenkinsfile, .circleci/ |
| `acmm:prereq-code-style` | L0 | Code style config | ✅ Pass | detected at one of: .eslintrc, .eslintrc.json, .eslintrc.js, eslint.config.js, .prettierrc, ruff.toml, .golangci.yml |
| `acmm:prereq-contrib-guide` | L0 | Contributing guide | ❌ Fail | none of: CONTRIBUTING.md, .github/CONTRIBUTING.md |
| `acmm:prereq-coverage-gate` | L0 | Coverage gate workflow | ❌ Fail | none of: .github/workflows/coverage-gate.yml, .github/workflows/coverage.yml, .coverage-thresholds.json |
| `acmm:prereq-e2e` | L0 | End-to-end tests | ❌ Fail | none of: playwright.config.ts, playwright.config.js, cypress.config.ts, cypress.config.js, e2e/, tests/e2e/ |
| `acmm:prereq-issue-template` | L0 | Issue template | ❌ Fail | none of: .github/ISSUE_TEMPLATE/, .github/issue_template.md |
| `acmm:prereq-pr-template` | L0 | Pull request template | ❌ Fail | none of: .github/pull_request_template.md, .github/PULL_REQUEST_TEMPLATE.md |
| `acmm:prereq-test-suite` | L0 | Automated test suite | ❌ Fail | none of: vitest.config.ts, vitest.config.js, jest.config.js, jest.config.ts, go.mod, pytest.ini, pyproject.toml |
| `acmm:agents-md` | L2 | AGENTS.md shared directives | ❌ Fail | none of: AGENTS.md |
| `acmm:claude-md` | L2 | CLAUDE.md instructions | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:copilot-instructions` | L2 | Copilot instructions | ❌ Fail | none of: .github/copilot-instructions.md |
| `acmm:correction-capture` | L2 | Correction capture | ❌ Fail | none of: .claude/memory/, .memory/, corrections.jsonl |
| `acmm:cursor-rules` | L2 | Cursor rules | ❌ Fail | none of: .cursor/rules, .cursorrules |
| `acmm:editor-config` | L2 | EditorConfig | ❌ Fail | none of: .editorconfig |
| `acmm:positive-reinforcement` | L2 | Positive reinforcement capture | ❌ Fail | none of: .claude/memory/ |
| `acmm:prompts-catalog` | L2 | Prompt catalog | ❌ Fail | none of: prompts/, .prompts/, docs/prompts/, .github/prompts/, .github/agents/ |
| `acmm:simple-skills` | L2 | Simple skills | ❌ Fail | none of: .claude/skills/, .claude/commands/, skills/ |
| `aef:session-continuity` | L2 | Session continuity doc | ✅ Pass | detected at one of: CLAUDE.md, AGENTS.md, .cursorrules, .github/copilot-instructions.md, docs/agent-context.md |
| `aef:structural-gates` | L2 | Structural gates | ❌ Fail | none of: CODEOWNERS, .github/CODEOWNERS, .agent/boundaries.yml, docs/agent-boundaries.md |
| `fullsend:ci-cd-maturity` | L2 | CI/CD pipeline | ❌ Fail | none of: .github/workflows/ |
| `fullsend:test-coverage` | L2 | Test coverage threshold | ❌ Fail | none of: codecov.yml, .codecov.yml, coverage.yml, .github/workflows/coverage-gate.yml |
| `acmm:ci-matrix` | L3 | CI matrix | ❌ Fail | none of: .github/workflows/build.yml, .github/workflows/build-deploy.yml, .github/workflows/ci.yml, .github/workflows/test.yml |
| `acmm:context-budget` | L3 | Context budget management | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:evidence-antipatterns` | L3 | Evidence-based antipattern rules | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:layered-safety` | L3 | Layered safety model | ❌ Fail | none of: .claude/settings.json, .claude/settings.local.json |
| `acmm:mechanical-enforcement` | L3 | Mechanical enforcement | ❌ Fail | none of: .claude/settings.json |
| `acmm:model-tiering` | L3 | Model tiering for subagents | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:pr-acceptance-metric` | L3 | PR acceptance tracking | ❌ Fail | none of: scripts/build-accm-history.mjs, .github/workflows/accm-history-update.yml, scripts/pr-metrics.mjs |
| `acmm:pr-review-rubric` | L3 | PR review rubric | ❌ Fail | none of: .github/review-rubric.md, docs/review-criteria.md, .github/prompts/review.md, docs/qa/ |
| `acmm:quality-dashboard` | L3 | Quality dashboard | ❌ Fail | none of: web/public/analytics.js, web/src/components/analytics/ |
| `acmm:session-summary` | L3 | Session summary artifact | ❌ Fail | none of: .claude/session-summary.md, .claude/checkpoint.md |
| `acmm:structural-gates` | L3 | Structural gates | ❌ Fail | none of: .claude/settings.json |
| `acmm:verify-before-reporting` | L3 | Verify-before-reporting practices | ✅ Pass | detected at one of: CLAUDE.md |
| `aef:change-classification` | L3 | Change classification policy | ❌ Fail | none of: docs/change-classification.md, .github/change-tiers.yml, docs/risk-tiers.md |
| `aef:task-traceability` | L3 | Task traceability ledger | ❌ Fail | none of: .agent/tasks/, docs/agent-tasks/, .github/agent-log/, agent-tasks.md |
| `claude-reflect:correction-capture` | L3 | Correction capture | ❌ Fail | none of: .claude/reflections/, memory/feedback_, .github/ai-corrections.yml, scripts/capture-corrections.mjs |
| `claude-reflect:positive-reinforcement` | L3 | Positive reinforcement capture | ❌ Fail | none of: .claude/reflections/, memory/feedback_, docs/ai-reinforcement.md |
| `claude-reflect:preference-index` | L3 | Preference index | ❌ Fail | none of: .claude/preferences.json, memory/MEMORY.md, .github/agent-preferences.yml |
| `claude-reflect:session-summary` | L3 | Session summary artifact | ❌ Fail | none of: .claude/sessions/, docs/session-summaries/, memory/session_ |
| `fullsend:auto-merge-policy` | L3 | Auto-merge policy | ❌ Fail | none of: .github/auto-merge.yml, .prow.yaml, tide.yaml, .github/workflows/auto-merge.yml |
| `fullsend:branch-protection-doc` | L3 | Branch protection documentation | ❌ Fail | none of: docs/branch-protection.md, docs/governance.md, .github/branch-protection.yml |
| `fullsend:rollback-drill` | L3 | Rollback drill | ❌ Fail | none of: docs/rollback.md, .github/workflows/rollback.yml, scripts/rollback.sh |
| `acmm:ai-fix-workflow` | L4 | AI-fix-requested workflow | ❌ Fail | none of: .github/workflows/ai-fix.yml, .github/workflows/fix-requested.yml, .github/workflows/claude.yml |
| `acmm:auto-label` | L4 | Automated issue labeling | ❌ Fail | none of: .github/workflows/auto-label.yml, .github/labeler.yml, .github/workflows/triage.yml |
| `acmm:auto-qa-tuning` | L4 | Auto-QA self-tuning config | ❌ Fail | none of: .github/auto-qa-tuning.json, .github/qa-tuning.yml |
| `acmm:claude-md-auto-sync` | L4 | CLAUDE.md auto-sync | ❌ Fail | none of: .github/workflows/claude-md-sync.yml |
| `acmm:copilot-review-apply` | L4 | Automated review application | ❌ Fail | none of: .github/workflows/copilot-review-apply.yml, .github/workflows/ai-fix.yml, .github/workflows/auto-review.yml |
| `acmm:cross-repo-skills` | L4 | Cross-repository skill sharing | ❌ Fail | none of: .claude/settings.json |
| `acmm:cross-session-knowledge` | L4 | Cross-session knowledge sharing | ❌ Fail | none of: knowledge.jsonl, .knowledge/, docs/reflections/ |
| `acmm:feedback-loops` | L4 | Self-improving feedback loops | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:github-coordination` | L4 | GitHub as coordination layer | ❌ Fail | none of: .github/workflows/ |
| `acmm:idempotent-workflows` | L4 | Idempotent and resumable workflows | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:multi-perspective-review` | L4 | Multi-perspective review | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:nightly-compliance` | L4 | Nightly compliance scan | ❌ Fail | none of: .github/workflows/nightly-compliance.yml, .github/workflows/nightly.yml, .github/workflows/nightly-test.yml, .github/workflows/nightly-test-suite.yml |
| `acmm:preference-index` | L4 | Preference index | ❌ Fail | none of: preferences.json, .claude/preferences.json |
| `acmm:router-skills` | L4 | Router skills with decision trees | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:security-ai-md` | L4 | AI security policy | ❌ Fail | none of: SECURITY-AI.md, docs/security/SECURITY-AI.md, docs/SECURITY-AI.md |
| `acmm:session-continuity` | L4 | Session continuity | ❌ Fail | none of: .claude/checkpoint.md, .claude/session-summary.md |
| `acmm:structured-rca` | L4 | Structured RCA workflows | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:structured-workflows` | L4 | Structured workflow skills | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:task-ledger` | L4 | Task traceability ledger | ❌ Fail | none of: task-log.jsonl, .claude/task-log.jsonl |
| `acmm:tdd-workflows` | L4 | TDD workflows with environment routing | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:tier-classifier` | L4 | Change classification policy | ❌ Fail | none of: .github/workflows/tier-classifier.yml, .github/workflows/pr-size.yml |
| `aef:audit-trail` | L4 | Audit trail workflow | ❌ Fail | none of: .github/workflows/ai-audit.yml, .github/workflows/agent-audit.yml, scripts/ai-audit-report.mjs |
| `aef:cross-tool-config` | L4 | Cross-tool agent config | ❌ Fail | none of: AGENTS.md, docs/ai-contributors.md, .github/ai-config.yml |
| `claude-reflect:claude-md-sync` | L4 | CLAUDE.md auto-sync | ❌ Fail | none of: .github/workflows/claude-md-sync.yml, scripts/sync-claude-md.mjs, scripts/update-claude-md.mjs |
| `claude-reflect:reflection-review` | L4 | Periodic reflection review | ❌ Fail | none of: .github/workflows/reflection-review.yml, scripts/review-reflections.mjs, docs/reflection-review.md |
| `fullsend:observability-runbook` | L4 | Observability runbook | ❌ Fail | none of: docs/runbook.md, docs/runbooks/, RUNBOOK.md, docs/operations/ |
| `fullsend:production-feedback` | L4 | Production feedback signal | ❌ Fail | none of: monitoring/, grafana/, .github/workflows/post-deploy-check.yml, scripts/production-feedback.mjs |
| `fullsend:risk-assessment` | L4 | Risk assessment config | ❌ Fail | none of: .github/risk-assessment.yml, docs/risk-tiers.md, .github/workflows/tier-classifier.yml |
| `acmm:audit-trail` | L5 | Audit trail workflow | ❌ Fail | none of: .github/workflows/audit-trail.yml, .github/workflows/ai-attribution.yml |
| `acmm:auto-qa-self-tuning` | L5 | Auto-QA with self-tuning | ❌ Fail | none of: .github/workflows/auto-qa.yml, .github/auto-qa-tuning.json |
| `acmm:github-actions-ai` | L5 | GitHub Actions AI integration | ❌ Fail | none of: .github/workflows/claude.yml, .github/workflows/claude-code-review.yml |
| `acmm:periodic-reflection` | L5 | Periodic reflection review | ❌ Fail | none of: .github/workflows/reflection-review.yml |
| `acmm:policy-as-code` | L5 | Policy as code | ❌ Fail | none of: .github/policies/, policy/, conftest.yaml, opa/ |
| `acmm:public-metrics` | L5 | Public metrics endpoint | ❌ Fail | none of: web/netlify/functions/analytics-accm.mts, web/public/analytics.js |
| `acmm:reflection-log` | L5 | Reflection log | ❌ Fail | none of: docs/reflections/, memory/, .memory/, REFLECTIONS.md |
| `acmm:auto-issue-gen` | L6 | Automated issue generation | ❌ Fail | none of: .github/workflows/auto-issue.yml, .github/workflows/issue-gen.yml, .github/workflows/auto-generate-issues.yml |
| `acmm:merge-queue` | L6 | Merge queue / auto-merge | ❌ Fail | none of: .github/workflows/merge-queue.yml, .prow.yaml, tide.yaml |
| `acmm:multi-agent-orchestration` | L6 | Multi-agent orchestration | ❌ Fail | none of: scripts/orchestrate.mjs, .github/workflows/orchestrate.yml, orchestrator/ |
| `acmm:observability-runbook` | L6 | Observability runbook | ❌ Fail | none of: docs/ai-ops-runbook.md, docs/runbook/, RUNBOOK.md |
| `acmm:production-feedback` | L6 | Production feedback signal | ❌ Fail | none of: .github/workflows/production-feedback.yml |
| `acmm:risk-assessment-config` | L6 | Risk assessment config | ❌ Fail | none of: risk-config.json, .claude/risk-config.json, .github/risk-assessment.yml |
| `acmm:rollback-drill` | L6 | Rollback drill | ❌ Fail | none of: docs/rollback-drill.md, docs/ai-ops-runbook.md |
| `acmm:strategic-dashboard` | L6 | Strategic dashboard | ❌ Fail | none of: web/src/components/acmm/, web/public/analytics.js, docs/autonomous-work-log.md |

## packages/api-versioning

**Current ACMM Level:** 1 (Assisted / Ad Hoc)

| ID | Level | Name | Status | Evidence |
|---|---|---|---|---|
| `acmm:prereq-cicd` | L0 | CI/CD pipeline | ❌ Fail | none of: .github/workflows/, .gitlab-ci.yml, Jenkinsfile, .circleci/ |
| `acmm:prereq-code-style` | L0 | Code style config | ❌ Fail | none of: .eslintrc, .eslintrc.json, .eslintrc.js, eslint.config.js, .prettierrc, ruff.toml, .golangci.yml |
| `acmm:prereq-contrib-guide` | L0 | Contributing guide | ❌ Fail | none of: CONTRIBUTING.md, .github/CONTRIBUTING.md |
| `acmm:prereq-coverage-gate` | L0 | Coverage gate workflow | ❌ Fail | none of: .github/workflows/coverage-gate.yml, .github/workflows/coverage.yml, .coverage-thresholds.json |
| `acmm:prereq-e2e` | L0 | End-to-end tests | ❌ Fail | none of: playwright.config.ts, playwright.config.js, cypress.config.ts, cypress.config.js, e2e/, tests/e2e/ |
| `acmm:prereq-issue-template` | L0 | Issue template | ❌ Fail | none of: .github/ISSUE_TEMPLATE/, .github/issue_template.md |
| `acmm:prereq-pr-template` | L0 | Pull request template | ❌ Fail | none of: .github/pull_request_template.md, .github/PULL_REQUEST_TEMPLATE.md |
| `acmm:prereq-test-suite` | L0 | Automated test suite | ❌ Fail | none of: vitest.config.ts, vitest.config.js, jest.config.js, jest.config.ts, go.mod, pytest.ini, pyproject.toml |
| `acmm:agents-md` | L2 | AGENTS.md shared directives | ❌ Fail | none of: AGENTS.md |
| `acmm:claude-md` | L2 | CLAUDE.md instructions | ❌ Fail | none of: CLAUDE.md |
| `acmm:copilot-instructions` | L2 | Copilot instructions | ❌ Fail | none of: .github/copilot-instructions.md |
| `acmm:correction-capture` | L2 | Correction capture | ❌ Fail | none of: .claude/memory/, .memory/, corrections.jsonl |
| `acmm:cursor-rules` | L2 | Cursor rules | ❌ Fail | none of: .cursor/rules, .cursorrules |
| `acmm:editor-config` | L2 | EditorConfig | ❌ Fail | none of: .editorconfig |
| `acmm:positive-reinforcement` | L2 | Positive reinforcement capture | ❌ Fail | none of: .claude/memory/ |
| `acmm:prompts-catalog` | L2 | Prompt catalog | ❌ Fail | none of: prompts/, .prompts/, docs/prompts/, .github/prompts/, .github/agents/ |
| `acmm:simple-skills` | L2 | Simple skills | ❌ Fail | none of: .claude/skills/, .claude/commands/, skills/ |
| `aef:session-continuity` | L2 | Session continuity doc | ❌ Fail | none of: CLAUDE.md, AGENTS.md, .cursorrules, .github/copilot-instructions.md, docs/agent-context.md |
| `aef:structural-gates` | L2 | Structural gates | ❌ Fail | none of: CODEOWNERS, .github/CODEOWNERS, .agent/boundaries.yml, docs/agent-boundaries.md |
| `fullsend:ci-cd-maturity` | L2 | CI/CD pipeline | ❌ Fail | none of: .github/workflows/ |
| `fullsend:test-coverage` | L2 | Test coverage threshold | ❌ Fail | none of: codecov.yml, .codecov.yml, coverage.yml, .github/workflows/coverage-gate.yml |
| `acmm:ci-matrix` | L3 | CI matrix | ❌ Fail | none of: .github/workflows/build.yml, .github/workflows/build-deploy.yml, .github/workflows/ci.yml, .github/workflows/test.yml |
| `acmm:context-budget` | L3 | Context budget management | ❌ Fail | none of: CLAUDE.md |
| `acmm:evidence-antipatterns` | L3 | Evidence-based antipattern rules | ❌ Fail | none of: CLAUDE.md |
| `acmm:layered-safety` | L3 | Layered safety model | ❌ Fail | none of: .claude/settings.json, .claude/settings.local.json |
| `acmm:mechanical-enforcement` | L3 | Mechanical enforcement | ❌ Fail | none of: .claude/settings.json |
| `acmm:model-tiering` | L3 | Model tiering for subagents | ❌ Fail | none of: CLAUDE.md |
| `acmm:pr-acceptance-metric` | L3 | PR acceptance tracking | ❌ Fail | none of: scripts/build-accm-history.mjs, .github/workflows/accm-history-update.yml, scripts/pr-metrics.mjs |
| `acmm:pr-review-rubric` | L3 | PR review rubric | ❌ Fail | none of: .github/review-rubric.md, docs/review-criteria.md, .github/prompts/review.md, docs/qa/ |
| `acmm:quality-dashboard` | L3 | Quality dashboard | ❌ Fail | none of: web/public/analytics.js, web/src/components/analytics/ |
| `acmm:session-summary` | L3 | Session summary artifact | ❌ Fail | none of: .claude/session-summary.md, .claude/checkpoint.md |
| `acmm:structural-gates` | L3 | Structural gates | ❌ Fail | none of: .claude/settings.json |
| `acmm:verify-before-reporting` | L3 | Verify-before-reporting practices | ❌ Fail | none of: CLAUDE.md |
| `aef:change-classification` | L3 | Change classification policy | ❌ Fail | none of: docs/change-classification.md, .github/change-tiers.yml, docs/risk-tiers.md |
| `aef:task-traceability` | L3 | Task traceability ledger | ❌ Fail | none of: .agent/tasks/, docs/agent-tasks/, .github/agent-log/, agent-tasks.md |
| `claude-reflect:correction-capture` | L3 | Correction capture | ❌ Fail | none of: .claude/reflections/, memory/feedback_, .github/ai-corrections.yml, scripts/capture-corrections.mjs |
| `claude-reflect:positive-reinforcement` | L3 | Positive reinforcement capture | ❌ Fail | none of: .claude/reflections/, memory/feedback_, docs/ai-reinforcement.md |
| `claude-reflect:preference-index` | L3 | Preference index | ❌ Fail | none of: .claude/preferences.json, memory/MEMORY.md, .github/agent-preferences.yml |
| `claude-reflect:session-summary` | L3 | Session summary artifact | ❌ Fail | none of: .claude/sessions/, docs/session-summaries/, memory/session_ |
| `fullsend:auto-merge-policy` | L3 | Auto-merge policy | ❌ Fail | none of: .github/auto-merge.yml, .prow.yaml, tide.yaml, .github/workflows/auto-merge.yml |
| `fullsend:branch-protection-doc` | L3 | Branch protection documentation | ❌ Fail | none of: docs/branch-protection.md, docs/governance.md, .github/branch-protection.yml |
| `fullsend:rollback-drill` | L3 | Rollback drill | ❌ Fail | none of: docs/rollback.md, .github/workflows/rollback.yml, scripts/rollback.sh |
| `acmm:ai-fix-workflow` | L4 | AI-fix-requested workflow | ❌ Fail | none of: .github/workflows/ai-fix.yml, .github/workflows/fix-requested.yml, .github/workflows/claude.yml |
| `acmm:auto-label` | L4 | Automated issue labeling | ❌ Fail | none of: .github/workflows/auto-label.yml, .github/labeler.yml, .github/workflows/triage.yml |
| `acmm:auto-qa-tuning` | L4 | Auto-QA self-tuning config | ❌ Fail | none of: .github/auto-qa-tuning.json, .github/qa-tuning.yml |
| `acmm:claude-md-auto-sync` | L4 | CLAUDE.md auto-sync | ❌ Fail | none of: .github/workflows/claude-md-sync.yml |
| `acmm:copilot-review-apply` | L4 | Automated review application | ❌ Fail | none of: .github/workflows/copilot-review-apply.yml, .github/workflows/ai-fix.yml, .github/workflows/auto-review.yml |
| `acmm:cross-repo-skills` | L4 | Cross-repository skill sharing | ❌ Fail | none of: .claude/settings.json |
| `acmm:cross-session-knowledge` | L4 | Cross-session knowledge sharing | ❌ Fail | none of: knowledge.jsonl, .knowledge/, docs/reflections/ |
| `acmm:feedback-loops` | L4 | Self-improving feedback loops | ❌ Fail | none of: CLAUDE.md |
| `acmm:github-coordination` | L4 | GitHub as coordination layer | ❌ Fail | none of: .github/workflows/ |
| `acmm:idempotent-workflows` | L4 | Idempotent and resumable workflows | ❌ Fail | none of: CLAUDE.md |
| `acmm:multi-perspective-review` | L4 | Multi-perspective review | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:nightly-compliance` | L4 | Nightly compliance scan | ❌ Fail | none of: .github/workflows/nightly-compliance.yml, .github/workflows/nightly.yml, .github/workflows/nightly-test.yml, .github/workflows/nightly-test-suite.yml |
| `acmm:preference-index` | L4 | Preference index | ❌ Fail | none of: preferences.json, .claude/preferences.json |
| `acmm:router-skills` | L4 | Router skills with decision trees | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:security-ai-md` | L4 | AI security policy | ❌ Fail | none of: SECURITY-AI.md, docs/security/SECURITY-AI.md, docs/SECURITY-AI.md |
| `acmm:session-continuity` | L4 | Session continuity | ❌ Fail | none of: .claude/checkpoint.md, .claude/session-summary.md |
| `acmm:structured-rca` | L4 | Structured RCA workflows | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:structured-workflows` | L4 | Structured workflow skills | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:task-ledger` | L4 | Task traceability ledger | ❌ Fail | none of: task-log.jsonl, .claude/task-log.jsonl |
| `acmm:tdd-workflows` | L4 | TDD workflows with environment routing | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:tier-classifier` | L4 | Change classification policy | ❌ Fail | none of: .github/workflows/tier-classifier.yml, .github/workflows/pr-size.yml |
| `aef:audit-trail` | L4 | Audit trail workflow | ❌ Fail | none of: .github/workflows/ai-audit.yml, .github/workflows/agent-audit.yml, scripts/ai-audit-report.mjs |
| `aef:cross-tool-config` | L4 | Cross-tool agent config | ❌ Fail | none of: AGENTS.md, docs/ai-contributors.md, .github/ai-config.yml |
| `claude-reflect:claude-md-sync` | L4 | CLAUDE.md auto-sync | ❌ Fail | none of: .github/workflows/claude-md-sync.yml, scripts/sync-claude-md.mjs, scripts/update-claude-md.mjs |
| `claude-reflect:reflection-review` | L4 | Periodic reflection review | ❌ Fail | none of: .github/workflows/reflection-review.yml, scripts/review-reflections.mjs, docs/reflection-review.md |
| `fullsend:observability-runbook` | L4 | Observability runbook | ❌ Fail | none of: docs/runbook.md, docs/runbooks/, RUNBOOK.md, docs/operations/ |
| `fullsend:production-feedback` | L4 | Production feedback signal | ❌ Fail | none of: monitoring/, grafana/, .github/workflows/post-deploy-check.yml, scripts/production-feedback.mjs |
| `fullsend:risk-assessment` | L4 | Risk assessment config | ❌ Fail | none of: .github/risk-assessment.yml, docs/risk-tiers.md, .github/workflows/tier-classifier.yml |
| `acmm:audit-trail` | L5 | Audit trail workflow | ❌ Fail | none of: .github/workflows/audit-trail.yml, .github/workflows/ai-attribution.yml |
| `acmm:auto-qa-self-tuning` | L5 | Auto-QA with self-tuning | ❌ Fail | none of: .github/workflows/auto-qa.yml, .github/auto-qa-tuning.json |
| `acmm:github-actions-ai` | L5 | GitHub Actions AI integration | ❌ Fail | none of: .github/workflows/claude.yml, .github/workflows/claude-code-review.yml |
| `acmm:periodic-reflection` | L5 | Periodic reflection review | ❌ Fail | none of: .github/workflows/reflection-review.yml |
| `acmm:policy-as-code` | L5 | Policy as code | ❌ Fail | none of: .github/policies/, policy/, conftest.yaml, opa/ |
| `acmm:public-metrics` | L5 | Public metrics endpoint | ❌ Fail | none of: web/netlify/functions/analytics-accm.mts, web/public/analytics.js |
| `acmm:reflection-log` | L5 | Reflection log | ❌ Fail | none of: docs/reflections/, memory/, .memory/, REFLECTIONS.md |
| `acmm:auto-issue-gen` | L6 | Automated issue generation | ❌ Fail | none of: .github/workflows/auto-issue.yml, .github/workflows/issue-gen.yml, .github/workflows/auto-generate-issues.yml |
| `acmm:merge-queue` | L6 | Merge queue / auto-merge | ❌ Fail | none of: .github/workflows/merge-queue.yml, .prow.yaml, tide.yaml |
| `acmm:multi-agent-orchestration` | L6 | Multi-agent orchestration | ❌ Fail | none of: scripts/orchestrate.mjs, .github/workflows/orchestrate.yml, orchestrator/ |
| `acmm:observability-runbook` | L6 | Observability runbook | ❌ Fail | none of: docs/ai-ops-runbook.md, docs/runbook/, RUNBOOK.md |
| `acmm:production-feedback` | L6 | Production feedback signal | ❌ Fail | none of: .github/workflows/production-feedback.yml |
| `acmm:risk-assessment-config` | L6 | Risk assessment config | ❌ Fail | none of: risk-config.json, .claude/risk-config.json, .github/risk-assessment.yml |
| `acmm:rollback-drill` | L6 | Rollback drill | ❌ Fail | none of: docs/rollback-drill.md, docs/ai-ops-runbook.md |
| `acmm:strategic-dashboard` | L6 | Strategic dashboard | ❌ Fail | none of: web/src/components/acmm/, web/public/analytics.js, docs/autonomous-work-log.md |

## packages/auth

**Current ACMM Level:** 2 (Instructed)

| ID | Level | Name | Status | Evidence |
|---|---|---|---|---|
| `acmm:prereq-cicd` | L0 | CI/CD pipeline | ❌ Fail | none of: .github/workflows/, .gitlab-ci.yml, Jenkinsfile, .circleci/ |
| `acmm:prereq-code-style` | L0 | Code style config | ✅ Pass | detected at one of: .eslintrc, .eslintrc.json, .eslintrc.js, eslint.config.js, .prettierrc, ruff.toml, .golangci.yml |
| `acmm:prereq-contrib-guide` | L0 | Contributing guide | ❌ Fail | none of: CONTRIBUTING.md, .github/CONTRIBUTING.md |
| `acmm:prereq-coverage-gate` | L0 | Coverage gate workflow | ❌ Fail | none of: .github/workflows/coverage-gate.yml, .github/workflows/coverage.yml, .coverage-thresholds.json |
| `acmm:prereq-e2e` | L0 | End-to-end tests | ❌ Fail | none of: playwright.config.ts, playwright.config.js, cypress.config.ts, cypress.config.js, e2e/, tests/e2e/ |
| `acmm:prereq-issue-template` | L0 | Issue template | ❌ Fail | none of: .github/ISSUE_TEMPLATE/, .github/issue_template.md |
| `acmm:prereq-pr-template` | L0 | Pull request template | ❌ Fail | none of: .github/pull_request_template.md, .github/PULL_REQUEST_TEMPLATE.md |
| `acmm:prereq-test-suite` | L0 | Automated test suite | ✅ Pass | detected at one of: vitest.config.ts, vitest.config.js, jest.config.js, jest.config.ts, go.mod, pytest.ini, pyproject.toml |
| `acmm:agents-md` | L2 | AGENTS.md shared directives | ❌ Fail | none of: AGENTS.md |
| `acmm:claude-md` | L2 | CLAUDE.md instructions | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:copilot-instructions` | L2 | Copilot instructions | ❌ Fail | none of: .github/copilot-instructions.md |
| `acmm:correction-capture` | L2 | Correction capture | ❌ Fail | none of: .claude/memory/, .memory/, corrections.jsonl |
| `acmm:cursor-rules` | L2 | Cursor rules | ❌ Fail | none of: .cursor/rules, .cursorrules |
| `acmm:editor-config` | L2 | EditorConfig | ❌ Fail | none of: .editorconfig |
| `acmm:positive-reinforcement` | L2 | Positive reinforcement capture | ❌ Fail | none of: .claude/memory/ |
| `acmm:prompts-catalog` | L2 | Prompt catalog | ❌ Fail | none of: prompts/, .prompts/, docs/prompts/, .github/prompts/, .github/agents/ |
| `acmm:simple-skills` | L2 | Simple skills | ❌ Fail | none of: .claude/skills/, .claude/commands/, skills/ |
| `aef:session-continuity` | L2 | Session continuity doc | ✅ Pass | detected at one of: CLAUDE.md, AGENTS.md, .cursorrules, .github/copilot-instructions.md, docs/agent-context.md |
| `aef:structural-gates` | L2 | Structural gates | ❌ Fail | none of: CODEOWNERS, .github/CODEOWNERS, .agent/boundaries.yml, docs/agent-boundaries.md |
| `fullsend:ci-cd-maturity` | L2 | CI/CD pipeline | ❌ Fail | none of: .github/workflows/ |
| `fullsend:test-coverage` | L2 | Test coverage threshold | ❌ Fail | none of: codecov.yml, .codecov.yml, coverage.yml, .github/workflows/coverage-gate.yml |
| `acmm:ci-matrix` | L3 | CI matrix | ❌ Fail | none of: .github/workflows/build.yml, .github/workflows/build-deploy.yml, .github/workflows/ci.yml, .github/workflows/test.yml |
| `acmm:context-budget` | L3 | Context budget management | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:evidence-antipatterns` | L3 | Evidence-based antipattern rules | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:layered-safety` | L3 | Layered safety model | ❌ Fail | none of: .claude/settings.json, .claude/settings.local.json |
| `acmm:mechanical-enforcement` | L3 | Mechanical enforcement | ❌ Fail | none of: .claude/settings.json |
| `acmm:model-tiering` | L3 | Model tiering for subagents | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:pr-acceptance-metric` | L3 | PR acceptance tracking | ❌ Fail | none of: scripts/build-accm-history.mjs, .github/workflows/accm-history-update.yml, scripts/pr-metrics.mjs |
| `acmm:pr-review-rubric` | L3 | PR review rubric | ❌ Fail | none of: .github/review-rubric.md, docs/review-criteria.md, .github/prompts/review.md, docs/qa/ |
| `acmm:quality-dashboard` | L3 | Quality dashboard | ❌ Fail | none of: web/public/analytics.js, web/src/components/analytics/ |
| `acmm:session-summary` | L3 | Session summary artifact | ❌ Fail | none of: .claude/session-summary.md, .claude/checkpoint.md |
| `acmm:structural-gates` | L3 | Structural gates | ❌ Fail | none of: .claude/settings.json |
| `acmm:verify-before-reporting` | L3 | Verify-before-reporting practices | ✅ Pass | detected at one of: CLAUDE.md |
| `aef:change-classification` | L3 | Change classification policy | ❌ Fail | none of: docs/change-classification.md, .github/change-tiers.yml, docs/risk-tiers.md |
| `aef:task-traceability` | L3 | Task traceability ledger | ❌ Fail | none of: .agent/tasks/, docs/agent-tasks/, .github/agent-log/, agent-tasks.md |
| `claude-reflect:correction-capture` | L3 | Correction capture | ❌ Fail | none of: .claude/reflections/, memory/feedback_, .github/ai-corrections.yml, scripts/capture-corrections.mjs |
| `claude-reflect:positive-reinforcement` | L3 | Positive reinforcement capture | ❌ Fail | none of: .claude/reflections/, memory/feedback_, docs/ai-reinforcement.md |
| `claude-reflect:preference-index` | L3 | Preference index | ❌ Fail | none of: .claude/preferences.json, memory/MEMORY.md, .github/agent-preferences.yml |
| `claude-reflect:session-summary` | L3 | Session summary artifact | ❌ Fail | none of: .claude/sessions/, docs/session-summaries/, memory/session_ |
| `fullsend:auto-merge-policy` | L3 | Auto-merge policy | ❌ Fail | none of: .github/auto-merge.yml, .prow.yaml, tide.yaml, .github/workflows/auto-merge.yml |
| `fullsend:branch-protection-doc` | L3 | Branch protection documentation | ❌ Fail | none of: docs/branch-protection.md, docs/governance.md, .github/branch-protection.yml |
| `fullsend:rollback-drill` | L3 | Rollback drill | ❌ Fail | none of: docs/rollback.md, .github/workflows/rollback.yml, scripts/rollback.sh |
| `acmm:ai-fix-workflow` | L4 | AI-fix-requested workflow | ❌ Fail | none of: .github/workflows/ai-fix.yml, .github/workflows/fix-requested.yml, .github/workflows/claude.yml |
| `acmm:auto-label` | L4 | Automated issue labeling | ❌ Fail | none of: .github/workflows/auto-label.yml, .github/labeler.yml, .github/workflows/triage.yml |
| `acmm:auto-qa-tuning` | L4 | Auto-QA self-tuning config | ❌ Fail | none of: .github/auto-qa-tuning.json, .github/qa-tuning.yml |
| `acmm:claude-md-auto-sync` | L4 | CLAUDE.md auto-sync | ❌ Fail | none of: .github/workflows/claude-md-sync.yml |
| `acmm:copilot-review-apply` | L4 | Automated review application | ❌ Fail | none of: .github/workflows/copilot-review-apply.yml, .github/workflows/ai-fix.yml, .github/workflows/auto-review.yml |
| `acmm:cross-repo-skills` | L4 | Cross-repository skill sharing | ❌ Fail | none of: .claude/settings.json |
| `acmm:cross-session-knowledge` | L4 | Cross-session knowledge sharing | ❌ Fail | none of: knowledge.jsonl, .knowledge/, docs/reflections/ |
| `acmm:feedback-loops` | L4 | Self-improving feedback loops | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:github-coordination` | L4 | GitHub as coordination layer | ❌ Fail | none of: .github/workflows/ |
| `acmm:idempotent-workflows` | L4 | Idempotent and resumable workflows | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:multi-perspective-review` | L4 | Multi-perspective review | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:nightly-compliance` | L4 | Nightly compliance scan | ❌ Fail | none of: .github/workflows/nightly-compliance.yml, .github/workflows/nightly.yml, .github/workflows/nightly-test.yml, .github/workflows/nightly-test-suite.yml |
| `acmm:preference-index` | L4 | Preference index | ❌ Fail | none of: preferences.json, .claude/preferences.json |
| `acmm:router-skills` | L4 | Router skills with decision trees | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:security-ai-md` | L4 | AI security policy | ❌ Fail | none of: SECURITY-AI.md, docs/security/SECURITY-AI.md, docs/SECURITY-AI.md |
| `acmm:session-continuity` | L4 | Session continuity | ❌ Fail | none of: .claude/checkpoint.md, .claude/session-summary.md |
| `acmm:structured-rca` | L4 | Structured RCA workflows | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:structured-workflows` | L4 | Structured workflow skills | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:task-ledger` | L4 | Task traceability ledger | ❌ Fail | none of: task-log.jsonl, .claude/task-log.jsonl |
| `acmm:tdd-workflows` | L4 | TDD workflows with environment routing | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:tier-classifier` | L4 | Change classification policy | ❌ Fail | none of: .github/workflows/tier-classifier.yml, .github/workflows/pr-size.yml |
| `aef:audit-trail` | L4 | Audit trail workflow | ❌ Fail | none of: .github/workflows/ai-audit.yml, .github/workflows/agent-audit.yml, scripts/ai-audit-report.mjs |
| `aef:cross-tool-config` | L4 | Cross-tool agent config | ❌ Fail | none of: AGENTS.md, docs/ai-contributors.md, .github/ai-config.yml |
| `claude-reflect:claude-md-sync` | L4 | CLAUDE.md auto-sync | ❌ Fail | none of: .github/workflows/claude-md-sync.yml, scripts/sync-claude-md.mjs, scripts/update-claude-md.mjs |
| `claude-reflect:reflection-review` | L4 | Periodic reflection review | ❌ Fail | none of: .github/workflows/reflection-review.yml, scripts/review-reflections.mjs, docs/reflection-review.md |
| `fullsend:observability-runbook` | L4 | Observability runbook | ❌ Fail | none of: docs/runbook.md, docs/runbooks/, RUNBOOK.md, docs/operations/ |
| `fullsend:production-feedback` | L4 | Production feedback signal | ❌ Fail | none of: monitoring/, grafana/, .github/workflows/post-deploy-check.yml, scripts/production-feedback.mjs |
| `fullsend:risk-assessment` | L4 | Risk assessment config | ❌ Fail | none of: .github/risk-assessment.yml, docs/risk-tiers.md, .github/workflows/tier-classifier.yml |
| `acmm:audit-trail` | L5 | Audit trail workflow | ❌ Fail | none of: .github/workflows/audit-trail.yml, .github/workflows/ai-attribution.yml |
| `acmm:auto-qa-self-tuning` | L5 | Auto-QA with self-tuning | ❌ Fail | none of: .github/workflows/auto-qa.yml, .github/auto-qa-tuning.json |
| `acmm:github-actions-ai` | L5 | GitHub Actions AI integration | ❌ Fail | none of: .github/workflows/claude.yml, .github/workflows/claude-code-review.yml |
| `acmm:periodic-reflection` | L5 | Periodic reflection review | ❌ Fail | none of: .github/workflows/reflection-review.yml |
| `acmm:policy-as-code` | L5 | Policy as code | ❌ Fail | none of: .github/policies/, policy/, conftest.yaml, opa/ |
| `acmm:public-metrics` | L5 | Public metrics endpoint | ❌ Fail | none of: web/netlify/functions/analytics-accm.mts, web/public/analytics.js |
| `acmm:reflection-log` | L5 | Reflection log | ❌ Fail | none of: docs/reflections/, memory/, .memory/, REFLECTIONS.md |
| `acmm:auto-issue-gen` | L6 | Automated issue generation | ❌ Fail | none of: .github/workflows/auto-issue.yml, .github/workflows/issue-gen.yml, .github/workflows/auto-generate-issues.yml |
| `acmm:merge-queue` | L6 | Merge queue / auto-merge | ❌ Fail | none of: .github/workflows/merge-queue.yml, .prow.yaml, tide.yaml |
| `acmm:multi-agent-orchestration` | L6 | Multi-agent orchestration | ❌ Fail | none of: scripts/orchestrate.mjs, .github/workflows/orchestrate.yml, orchestrator/ |
| `acmm:observability-runbook` | L6 | Observability runbook | ❌ Fail | none of: docs/ai-ops-runbook.md, docs/runbook/, RUNBOOK.md |
| `acmm:production-feedback` | L6 | Production feedback signal | ❌ Fail | none of: .github/workflows/production-feedback.yml |
| `acmm:risk-assessment-config` | L6 | Risk assessment config | ❌ Fail | none of: risk-config.json, .claude/risk-config.json, .github/risk-assessment.yml |
| `acmm:rollback-drill` | L6 | Rollback drill | ❌ Fail | none of: docs/rollback-drill.md, docs/ai-ops-runbook.md |
| `acmm:strategic-dashboard` | L6 | Strategic dashboard | ❌ Fail | none of: web/src/components/acmm/, web/public/analytics.js, docs/autonomous-work-log.md |

## packages/config

**Current ACMM Level:** 1 (Assisted / Ad Hoc)

| ID | Level | Name | Status | Evidence |
|---|---|---|---|---|
| `acmm:prereq-cicd` | L0 | CI/CD pipeline | ❌ Fail | none of: .github/workflows/, .gitlab-ci.yml, Jenkinsfile, .circleci/ |
| `acmm:prereq-code-style` | L0 | Code style config | ❌ Fail | none of: .eslintrc, .eslintrc.json, .eslintrc.js, eslint.config.js, .prettierrc, ruff.toml, .golangci.yml |
| `acmm:prereq-contrib-guide` | L0 | Contributing guide | ❌ Fail | none of: CONTRIBUTING.md, .github/CONTRIBUTING.md |
| `acmm:prereq-coverage-gate` | L0 | Coverage gate workflow | ❌ Fail | none of: .github/workflows/coverage-gate.yml, .github/workflows/coverage.yml, .coverage-thresholds.json |
| `acmm:prereq-e2e` | L0 | End-to-end tests | ❌ Fail | none of: playwright.config.ts, playwright.config.js, cypress.config.ts, cypress.config.js, e2e/, tests/e2e/ |
| `acmm:prereq-issue-template` | L0 | Issue template | ❌ Fail | none of: .github/ISSUE_TEMPLATE/, .github/issue_template.md |
| `acmm:prereq-pr-template` | L0 | Pull request template | ❌ Fail | none of: .github/pull_request_template.md, .github/PULL_REQUEST_TEMPLATE.md |
| `acmm:prereq-test-suite` | L0 | Automated test suite | ❌ Fail | none of: vitest.config.ts, vitest.config.js, jest.config.js, jest.config.ts, go.mod, pytest.ini, pyproject.toml |
| `acmm:agents-md` | L2 | AGENTS.md shared directives | ❌ Fail | none of: AGENTS.md |
| `acmm:claude-md` | L2 | CLAUDE.md instructions | ❌ Fail | none of: CLAUDE.md |
| `acmm:copilot-instructions` | L2 | Copilot instructions | ❌ Fail | none of: .github/copilot-instructions.md |
| `acmm:correction-capture` | L2 | Correction capture | ❌ Fail | none of: .claude/memory/, .memory/, corrections.jsonl |
| `acmm:cursor-rules` | L2 | Cursor rules | ❌ Fail | none of: .cursor/rules, .cursorrules |
| `acmm:editor-config` | L2 | EditorConfig | ❌ Fail | none of: .editorconfig |
| `acmm:positive-reinforcement` | L2 | Positive reinforcement capture | ❌ Fail | none of: .claude/memory/ |
| `acmm:prompts-catalog` | L2 | Prompt catalog | ❌ Fail | none of: prompts/, .prompts/, docs/prompts/, .github/prompts/, .github/agents/ |
| `acmm:simple-skills` | L2 | Simple skills | ❌ Fail | none of: .claude/skills/, .claude/commands/, skills/ |
| `aef:session-continuity` | L2 | Session continuity doc | ❌ Fail | none of: CLAUDE.md, AGENTS.md, .cursorrules, .github/copilot-instructions.md, docs/agent-context.md |
| `aef:structural-gates` | L2 | Structural gates | ❌ Fail | none of: CODEOWNERS, .github/CODEOWNERS, .agent/boundaries.yml, docs/agent-boundaries.md |
| `fullsend:ci-cd-maturity` | L2 | CI/CD pipeline | ❌ Fail | none of: .github/workflows/ |
| `fullsend:test-coverage` | L2 | Test coverage threshold | ❌ Fail | none of: codecov.yml, .codecov.yml, coverage.yml, .github/workflows/coverage-gate.yml |
| `acmm:ci-matrix` | L3 | CI matrix | ❌ Fail | none of: .github/workflows/build.yml, .github/workflows/build-deploy.yml, .github/workflows/ci.yml, .github/workflows/test.yml |
| `acmm:context-budget` | L3 | Context budget management | ❌ Fail | none of: CLAUDE.md |
| `acmm:evidence-antipatterns` | L3 | Evidence-based antipattern rules | ❌ Fail | none of: CLAUDE.md |
| `acmm:layered-safety` | L3 | Layered safety model | ❌ Fail | none of: .claude/settings.json, .claude/settings.local.json |
| `acmm:mechanical-enforcement` | L3 | Mechanical enforcement | ❌ Fail | none of: .claude/settings.json |
| `acmm:model-tiering` | L3 | Model tiering for subagents | ❌ Fail | none of: CLAUDE.md |
| `acmm:pr-acceptance-metric` | L3 | PR acceptance tracking | ❌ Fail | none of: scripts/build-accm-history.mjs, .github/workflows/accm-history-update.yml, scripts/pr-metrics.mjs |
| `acmm:pr-review-rubric` | L3 | PR review rubric | ❌ Fail | none of: .github/review-rubric.md, docs/review-criteria.md, .github/prompts/review.md, docs/qa/ |
| `acmm:quality-dashboard` | L3 | Quality dashboard | ❌ Fail | none of: web/public/analytics.js, web/src/components/analytics/ |
| `acmm:session-summary` | L3 | Session summary artifact | ❌ Fail | none of: .claude/session-summary.md, .claude/checkpoint.md |
| `acmm:structural-gates` | L3 | Structural gates | ❌ Fail | none of: .claude/settings.json |
| `acmm:verify-before-reporting` | L3 | Verify-before-reporting practices | ❌ Fail | none of: CLAUDE.md |
| `aef:change-classification` | L3 | Change classification policy | ❌ Fail | none of: docs/change-classification.md, .github/change-tiers.yml, docs/risk-tiers.md |
| `aef:task-traceability` | L3 | Task traceability ledger | ❌ Fail | none of: .agent/tasks/, docs/agent-tasks/, .github/agent-log/, agent-tasks.md |
| `claude-reflect:correction-capture` | L3 | Correction capture | ❌ Fail | none of: .claude/reflections/, memory/feedback_, .github/ai-corrections.yml, scripts/capture-corrections.mjs |
| `claude-reflect:positive-reinforcement` | L3 | Positive reinforcement capture | ❌ Fail | none of: .claude/reflections/, memory/feedback_, docs/ai-reinforcement.md |
| `claude-reflect:preference-index` | L3 | Preference index | ❌ Fail | none of: .claude/preferences.json, memory/MEMORY.md, .github/agent-preferences.yml |
| `claude-reflect:session-summary` | L3 | Session summary artifact | ❌ Fail | none of: .claude/sessions/, docs/session-summaries/, memory/session_ |
| `fullsend:auto-merge-policy` | L3 | Auto-merge policy | ❌ Fail | none of: .github/auto-merge.yml, .prow.yaml, tide.yaml, .github/workflows/auto-merge.yml |
| `fullsend:branch-protection-doc` | L3 | Branch protection documentation | ❌ Fail | none of: docs/branch-protection.md, docs/governance.md, .github/branch-protection.yml |
| `fullsend:rollback-drill` | L3 | Rollback drill | ❌ Fail | none of: docs/rollback.md, .github/workflows/rollback.yml, scripts/rollback.sh |
| `acmm:ai-fix-workflow` | L4 | AI-fix-requested workflow | ❌ Fail | none of: .github/workflows/ai-fix.yml, .github/workflows/fix-requested.yml, .github/workflows/claude.yml |
| `acmm:auto-label` | L4 | Automated issue labeling | ❌ Fail | none of: .github/workflows/auto-label.yml, .github/labeler.yml, .github/workflows/triage.yml |
| `acmm:auto-qa-tuning` | L4 | Auto-QA self-tuning config | ❌ Fail | none of: .github/auto-qa-tuning.json, .github/qa-tuning.yml |
| `acmm:claude-md-auto-sync` | L4 | CLAUDE.md auto-sync | ❌ Fail | none of: .github/workflows/claude-md-sync.yml |
| `acmm:copilot-review-apply` | L4 | Automated review application | ❌ Fail | none of: .github/workflows/copilot-review-apply.yml, .github/workflows/ai-fix.yml, .github/workflows/auto-review.yml |
| `acmm:cross-repo-skills` | L4 | Cross-repository skill sharing | ❌ Fail | none of: .claude/settings.json |
| `acmm:cross-session-knowledge` | L4 | Cross-session knowledge sharing | ❌ Fail | none of: knowledge.jsonl, .knowledge/, docs/reflections/ |
| `acmm:feedback-loops` | L4 | Self-improving feedback loops | ❌ Fail | none of: CLAUDE.md |
| `acmm:github-coordination` | L4 | GitHub as coordination layer | ❌ Fail | none of: .github/workflows/ |
| `acmm:idempotent-workflows` | L4 | Idempotent and resumable workflows | ❌ Fail | none of: CLAUDE.md |
| `acmm:multi-perspective-review` | L4 | Multi-perspective review | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:nightly-compliance` | L4 | Nightly compliance scan | ❌ Fail | none of: .github/workflows/nightly-compliance.yml, .github/workflows/nightly.yml, .github/workflows/nightly-test.yml, .github/workflows/nightly-test-suite.yml |
| `acmm:preference-index` | L4 | Preference index | ❌ Fail | none of: preferences.json, .claude/preferences.json |
| `acmm:router-skills` | L4 | Router skills with decision trees | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:security-ai-md` | L4 | AI security policy | ❌ Fail | none of: SECURITY-AI.md, docs/security/SECURITY-AI.md, docs/SECURITY-AI.md |
| `acmm:session-continuity` | L4 | Session continuity | ❌ Fail | none of: .claude/checkpoint.md, .claude/session-summary.md |
| `acmm:structured-rca` | L4 | Structured RCA workflows | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:structured-workflows` | L4 | Structured workflow skills | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:task-ledger` | L4 | Task traceability ledger | ❌ Fail | none of: task-log.jsonl, .claude/task-log.jsonl |
| `acmm:tdd-workflows` | L4 | TDD workflows with environment routing | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:tier-classifier` | L4 | Change classification policy | ❌ Fail | none of: .github/workflows/tier-classifier.yml, .github/workflows/pr-size.yml |
| `aef:audit-trail` | L4 | Audit trail workflow | ❌ Fail | none of: .github/workflows/ai-audit.yml, .github/workflows/agent-audit.yml, scripts/ai-audit-report.mjs |
| `aef:cross-tool-config` | L4 | Cross-tool agent config | ❌ Fail | none of: AGENTS.md, docs/ai-contributors.md, .github/ai-config.yml |
| `claude-reflect:claude-md-sync` | L4 | CLAUDE.md auto-sync | ❌ Fail | none of: .github/workflows/claude-md-sync.yml, scripts/sync-claude-md.mjs, scripts/update-claude-md.mjs |
| `claude-reflect:reflection-review` | L4 | Periodic reflection review | ❌ Fail | none of: .github/workflows/reflection-review.yml, scripts/review-reflections.mjs, docs/reflection-review.md |
| `fullsend:observability-runbook` | L4 | Observability runbook | ❌ Fail | none of: docs/runbook.md, docs/runbooks/, RUNBOOK.md, docs/operations/ |
| `fullsend:production-feedback` | L4 | Production feedback signal | ❌ Fail | none of: monitoring/, grafana/, .github/workflows/post-deploy-check.yml, scripts/production-feedback.mjs |
| `fullsend:risk-assessment` | L4 | Risk assessment config | ❌ Fail | none of: .github/risk-assessment.yml, docs/risk-tiers.md, .github/workflows/tier-classifier.yml |
| `acmm:audit-trail` | L5 | Audit trail workflow | ❌ Fail | none of: .github/workflows/audit-trail.yml, .github/workflows/ai-attribution.yml |
| `acmm:auto-qa-self-tuning` | L5 | Auto-QA with self-tuning | ❌ Fail | none of: .github/workflows/auto-qa.yml, .github/auto-qa-tuning.json |
| `acmm:github-actions-ai` | L5 | GitHub Actions AI integration | ❌ Fail | none of: .github/workflows/claude.yml, .github/workflows/claude-code-review.yml |
| `acmm:periodic-reflection` | L5 | Periodic reflection review | ❌ Fail | none of: .github/workflows/reflection-review.yml |
| `acmm:policy-as-code` | L5 | Policy as code | ❌ Fail | none of: .github/policies/, policy/, conftest.yaml, opa/ |
| `acmm:public-metrics` | L5 | Public metrics endpoint | ❌ Fail | none of: web/netlify/functions/analytics-accm.mts, web/public/analytics.js |
| `acmm:reflection-log` | L5 | Reflection log | ❌ Fail | none of: docs/reflections/, memory/, .memory/, REFLECTIONS.md |
| `acmm:auto-issue-gen` | L6 | Automated issue generation | ❌ Fail | none of: .github/workflows/auto-issue.yml, .github/workflows/issue-gen.yml, .github/workflows/auto-generate-issues.yml |
| `acmm:merge-queue` | L6 | Merge queue / auto-merge | ❌ Fail | none of: .github/workflows/merge-queue.yml, .prow.yaml, tide.yaml |
| `acmm:multi-agent-orchestration` | L6 | Multi-agent orchestration | ❌ Fail | none of: scripts/orchestrate.mjs, .github/workflows/orchestrate.yml, orchestrator/ |
| `acmm:observability-runbook` | L6 | Observability runbook | ❌ Fail | none of: docs/ai-ops-runbook.md, docs/runbook/, RUNBOOK.md |
| `acmm:production-feedback` | L6 | Production feedback signal | ❌ Fail | none of: .github/workflows/production-feedback.yml |
| `acmm:risk-assessment-config` | L6 | Risk assessment config | ❌ Fail | none of: risk-config.json, .claude/risk-config.json, .github/risk-assessment.yml |
| `acmm:rollback-drill` | L6 | Rollback drill | ❌ Fail | none of: docs/rollback-drill.md, docs/ai-ops-runbook.md |
| `acmm:strategic-dashboard` | L6 | Strategic dashboard | ❌ Fail | none of: web/src/components/acmm/, web/public/analytics.js, docs/autonomous-work-log.md |

## packages/observability

**Current ACMM Level:** 2 (Instructed)

| ID | Level | Name | Status | Evidence |
|---|---|---|---|---|
| `acmm:prereq-cicd` | L0 | CI/CD pipeline | ❌ Fail | none of: .github/workflows/, .gitlab-ci.yml, Jenkinsfile, .circleci/ |
| `acmm:prereq-code-style` | L0 | Code style config | ❌ Fail | none of: .eslintrc, .eslintrc.json, .eslintrc.js, eslint.config.js, .prettierrc, ruff.toml, .golangci.yml |
| `acmm:prereq-contrib-guide` | L0 | Contributing guide | ❌ Fail | none of: CONTRIBUTING.md, .github/CONTRIBUTING.md |
| `acmm:prereq-coverage-gate` | L0 | Coverage gate workflow | ❌ Fail | none of: .github/workflows/coverage-gate.yml, .github/workflows/coverage.yml, .coverage-thresholds.json |
| `acmm:prereq-e2e` | L0 | End-to-end tests | ❌ Fail | none of: playwright.config.ts, playwright.config.js, cypress.config.ts, cypress.config.js, e2e/, tests/e2e/ |
| `acmm:prereq-issue-template` | L0 | Issue template | ❌ Fail | none of: .github/ISSUE_TEMPLATE/, .github/issue_template.md |
| `acmm:prereq-pr-template` | L0 | Pull request template | ❌ Fail | none of: .github/pull_request_template.md, .github/PULL_REQUEST_TEMPLATE.md |
| `acmm:prereq-test-suite` | L0 | Automated test suite | ✅ Pass | detected at one of: vitest.config.ts, vitest.config.js, jest.config.js, jest.config.ts, go.mod, pytest.ini, pyproject.toml |
| `acmm:agents-md` | L2 | AGENTS.md shared directives | ❌ Fail | none of: AGENTS.md |
| `acmm:claude-md` | L2 | CLAUDE.md instructions | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:copilot-instructions` | L2 | Copilot instructions | ❌ Fail | none of: .github/copilot-instructions.md |
| `acmm:correction-capture` | L2 | Correction capture | ❌ Fail | none of: .claude/memory/, .memory/, corrections.jsonl |
| `acmm:cursor-rules` | L2 | Cursor rules | ❌ Fail | none of: .cursor/rules, .cursorrules |
| `acmm:editor-config` | L2 | EditorConfig | ❌ Fail | none of: .editorconfig |
| `acmm:positive-reinforcement` | L2 | Positive reinforcement capture | ❌ Fail | none of: .claude/memory/ |
| `acmm:prompts-catalog` | L2 | Prompt catalog | ❌ Fail | none of: prompts/, .prompts/, docs/prompts/, .github/prompts/, .github/agents/ |
| `acmm:simple-skills` | L2 | Simple skills | ❌ Fail | none of: .claude/skills/, .claude/commands/, skills/ |
| `aef:session-continuity` | L2 | Session continuity doc | ✅ Pass | detected at one of: CLAUDE.md, AGENTS.md, .cursorrules, .github/copilot-instructions.md, docs/agent-context.md |
| `aef:structural-gates` | L2 | Structural gates | ❌ Fail | none of: CODEOWNERS, .github/CODEOWNERS, .agent/boundaries.yml, docs/agent-boundaries.md |
| `fullsend:ci-cd-maturity` | L2 | CI/CD pipeline | ❌ Fail | none of: .github/workflows/ |
| `fullsend:test-coverage` | L2 | Test coverage threshold | ❌ Fail | none of: codecov.yml, .codecov.yml, coverage.yml, .github/workflows/coverage-gate.yml |
| `acmm:ci-matrix` | L3 | CI matrix | ❌ Fail | none of: .github/workflows/build.yml, .github/workflows/build-deploy.yml, .github/workflows/ci.yml, .github/workflows/test.yml |
| `acmm:context-budget` | L3 | Context budget management | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:evidence-antipatterns` | L3 | Evidence-based antipattern rules | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:layered-safety` | L3 | Layered safety model | ❌ Fail | none of: .claude/settings.json, .claude/settings.local.json |
| `acmm:mechanical-enforcement` | L3 | Mechanical enforcement | ❌ Fail | none of: .claude/settings.json |
| `acmm:model-tiering` | L3 | Model tiering for subagents | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:pr-acceptance-metric` | L3 | PR acceptance tracking | ❌ Fail | none of: scripts/build-accm-history.mjs, .github/workflows/accm-history-update.yml, scripts/pr-metrics.mjs |
| `acmm:pr-review-rubric` | L3 | PR review rubric | ❌ Fail | none of: .github/review-rubric.md, docs/review-criteria.md, .github/prompts/review.md, docs/qa/ |
| `acmm:quality-dashboard` | L3 | Quality dashboard | ❌ Fail | none of: web/public/analytics.js, web/src/components/analytics/ |
| `acmm:session-summary` | L3 | Session summary artifact | ❌ Fail | none of: .claude/session-summary.md, .claude/checkpoint.md |
| `acmm:structural-gates` | L3 | Structural gates | ❌ Fail | none of: .claude/settings.json |
| `acmm:verify-before-reporting` | L3 | Verify-before-reporting practices | ✅ Pass | detected at one of: CLAUDE.md |
| `aef:change-classification` | L3 | Change classification policy | ❌ Fail | none of: docs/change-classification.md, .github/change-tiers.yml, docs/risk-tiers.md |
| `aef:task-traceability` | L3 | Task traceability ledger | ❌ Fail | none of: .agent/tasks/, docs/agent-tasks/, .github/agent-log/, agent-tasks.md |
| `claude-reflect:correction-capture` | L3 | Correction capture | ❌ Fail | none of: .claude/reflections/, memory/feedback_, .github/ai-corrections.yml, scripts/capture-corrections.mjs |
| `claude-reflect:positive-reinforcement` | L3 | Positive reinforcement capture | ❌ Fail | none of: .claude/reflections/, memory/feedback_, docs/ai-reinforcement.md |
| `claude-reflect:preference-index` | L3 | Preference index | ❌ Fail | none of: .claude/preferences.json, memory/MEMORY.md, .github/agent-preferences.yml |
| `claude-reflect:session-summary` | L3 | Session summary artifact | ❌ Fail | none of: .claude/sessions/, docs/session-summaries/, memory/session_ |
| `fullsend:auto-merge-policy` | L3 | Auto-merge policy | ❌ Fail | none of: .github/auto-merge.yml, .prow.yaml, tide.yaml, .github/workflows/auto-merge.yml |
| `fullsend:branch-protection-doc` | L3 | Branch protection documentation | ❌ Fail | none of: docs/branch-protection.md, docs/governance.md, .github/branch-protection.yml |
| `fullsend:rollback-drill` | L3 | Rollback drill | ❌ Fail | none of: docs/rollback.md, .github/workflows/rollback.yml, scripts/rollback.sh |
| `acmm:ai-fix-workflow` | L4 | AI-fix-requested workflow | ❌ Fail | none of: .github/workflows/ai-fix.yml, .github/workflows/fix-requested.yml, .github/workflows/claude.yml |
| `acmm:auto-label` | L4 | Automated issue labeling | ❌ Fail | none of: .github/workflows/auto-label.yml, .github/labeler.yml, .github/workflows/triage.yml |
| `acmm:auto-qa-tuning` | L4 | Auto-QA self-tuning config | ❌ Fail | none of: .github/auto-qa-tuning.json, .github/qa-tuning.yml |
| `acmm:claude-md-auto-sync` | L4 | CLAUDE.md auto-sync | ❌ Fail | none of: .github/workflows/claude-md-sync.yml |
| `acmm:copilot-review-apply` | L4 | Automated review application | ❌ Fail | none of: .github/workflows/copilot-review-apply.yml, .github/workflows/ai-fix.yml, .github/workflows/auto-review.yml |
| `acmm:cross-repo-skills` | L4 | Cross-repository skill sharing | ❌ Fail | none of: .claude/settings.json |
| `acmm:cross-session-knowledge` | L4 | Cross-session knowledge sharing | ❌ Fail | none of: knowledge.jsonl, .knowledge/, docs/reflections/ |
| `acmm:feedback-loops` | L4 | Self-improving feedback loops | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:github-coordination` | L4 | GitHub as coordination layer | ❌ Fail | none of: .github/workflows/ |
| `acmm:idempotent-workflows` | L4 | Idempotent and resumable workflows | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:multi-perspective-review` | L4 | Multi-perspective review | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:nightly-compliance` | L4 | Nightly compliance scan | ❌ Fail | none of: .github/workflows/nightly-compliance.yml, .github/workflows/nightly.yml, .github/workflows/nightly-test.yml, .github/workflows/nightly-test-suite.yml |
| `acmm:preference-index` | L4 | Preference index | ❌ Fail | none of: preferences.json, .claude/preferences.json |
| `acmm:router-skills` | L4 | Router skills with decision trees | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:security-ai-md` | L4 | AI security policy | ❌ Fail | none of: SECURITY-AI.md, docs/security/SECURITY-AI.md, docs/SECURITY-AI.md |
| `acmm:session-continuity` | L4 | Session continuity | ❌ Fail | none of: .claude/checkpoint.md, .claude/session-summary.md |
| `acmm:structured-rca` | L4 | Structured RCA workflows | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:structured-workflows` | L4 | Structured workflow skills | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:task-ledger` | L4 | Task traceability ledger | ❌ Fail | none of: task-log.jsonl, .claude/task-log.jsonl |
| `acmm:tdd-workflows` | L4 | TDD workflows with environment routing | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:tier-classifier` | L4 | Change classification policy | ❌ Fail | none of: .github/workflows/tier-classifier.yml, .github/workflows/pr-size.yml |
| `aef:audit-trail` | L4 | Audit trail workflow | ❌ Fail | none of: .github/workflows/ai-audit.yml, .github/workflows/agent-audit.yml, scripts/ai-audit-report.mjs |
| `aef:cross-tool-config` | L4 | Cross-tool agent config | ❌ Fail | none of: AGENTS.md, docs/ai-contributors.md, .github/ai-config.yml |
| `claude-reflect:claude-md-sync` | L4 | CLAUDE.md auto-sync | ❌ Fail | none of: .github/workflows/claude-md-sync.yml, scripts/sync-claude-md.mjs, scripts/update-claude-md.mjs |
| `claude-reflect:reflection-review` | L4 | Periodic reflection review | ❌ Fail | none of: .github/workflows/reflection-review.yml, scripts/review-reflections.mjs, docs/reflection-review.md |
| `fullsend:observability-runbook` | L4 | Observability runbook | ❌ Fail | none of: docs/runbook.md, docs/runbooks/, RUNBOOK.md, docs/operations/ |
| `fullsend:production-feedback` | L4 | Production feedback signal | ❌ Fail | none of: monitoring/, grafana/, .github/workflows/post-deploy-check.yml, scripts/production-feedback.mjs |
| `fullsend:risk-assessment` | L4 | Risk assessment config | ❌ Fail | none of: .github/risk-assessment.yml, docs/risk-tiers.md, .github/workflows/tier-classifier.yml |
| `acmm:audit-trail` | L5 | Audit trail workflow | ❌ Fail | none of: .github/workflows/audit-trail.yml, .github/workflows/ai-attribution.yml |
| `acmm:auto-qa-self-tuning` | L5 | Auto-QA with self-tuning | ❌ Fail | none of: .github/workflows/auto-qa.yml, .github/auto-qa-tuning.json |
| `acmm:github-actions-ai` | L5 | GitHub Actions AI integration | ❌ Fail | none of: .github/workflows/claude.yml, .github/workflows/claude-code-review.yml |
| `acmm:periodic-reflection` | L5 | Periodic reflection review | ❌ Fail | none of: .github/workflows/reflection-review.yml |
| `acmm:policy-as-code` | L5 | Policy as code | ❌ Fail | none of: .github/policies/, policy/, conftest.yaml, opa/ |
| `acmm:public-metrics` | L5 | Public metrics endpoint | ❌ Fail | none of: web/netlify/functions/analytics-accm.mts, web/public/analytics.js |
| `acmm:reflection-log` | L5 | Reflection log | ❌ Fail | none of: docs/reflections/, memory/, .memory/, REFLECTIONS.md |
| `acmm:auto-issue-gen` | L6 | Automated issue generation | ❌ Fail | none of: .github/workflows/auto-issue.yml, .github/workflows/issue-gen.yml, .github/workflows/auto-generate-issues.yml |
| `acmm:merge-queue` | L6 | Merge queue / auto-merge | ❌ Fail | none of: .github/workflows/merge-queue.yml, .prow.yaml, tide.yaml |
| `acmm:multi-agent-orchestration` | L6 | Multi-agent orchestration | ❌ Fail | none of: scripts/orchestrate.mjs, .github/workflows/orchestrate.yml, orchestrator/ |
| `acmm:observability-runbook` | L6 | Observability runbook | ❌ Fail | none of: docs/ai-ops-runbook.md, docs/runbook/, RUNBOOK.md |
| `acmm:production-feedback` | L6 | Production feedback signal | ❌ Fail | none of: .github/workflows/production-feedback.yml |
| `acmm:risk-assessment-config` | L6 | Risk assessment config | ❌ Fail | none of: risk-config.json, .claude/risk-config.json, .github/risk-assessment.yml |
| `acmm:rollback-drill` | L6 | Rollback drill | ❌ Fail | none of: docs/rollback-drill.md, docs/ai-ops-runbook.md |
| `acmm:strategic-dashboard` | L6 | Strategic dashboard | ❌ Fail | none of: web/src/components/acmm/, web/public/analytics.js, docs/autonomous-work-log.md |

## packages/rialto

**Current ACMM Level:** 6 (Fully Autonomous)

| ID | Level | Name | Status | Evidence |
|---|---|---|---|---|
| `acmm:prereq-cicd` | L0 | CI/CD pipeline | ✅ Pass | detected at one of: .github/workflows/, .gitlab-ci.yml, Jenkinsfile, .circleci/ |
| `acmm:prereq-code-style` | L0 | Code style config | ✅ Pass | detected at one of: .eslintrc, .eslintrc.json, .eslintrc.js, eslint.config.js, .prettierrc, ruff.toml, .golangci.yml |
| `acmm:prereq-contrib-guide` | L0 | Contributing guide | ✅ Pass | detected at one of: CONTRIBUTING.md, .github/CONTRIBUTING.md |
| `acmm:prereq-coverage-gate` | L0 | Coverage gate workflow | ❌ Fail | none of: .github/workflows/coverage-gate.yml, .github/workflows/coverage.yml, .coverage-thresholds.json |
| `acmm:prereq-e2e` | L0 | End-to-end tests | ❌ Fail | none of: playwright.config.ts, playwright.config.js, cypress.config.ts, cypress.config.js, e2e/, tests/e2e/ |
| `acmm:prereq-issue-template` | L0 | Issue template | ✅ Pass | detected at one of: .github/ISSUE_TEMPLATE/, .github/issue_template.md |
| `acmm:prereq-pr-template` | L0 | Pull request template | ✅ Pass | detected at one of: .github/pull_request_template.md, .github/PULL_REQUEST_TEMPLATE.md |
| `acmm:prereq-test-suite` | L0 | Automated test suite | ✅ Pass | detected at one of: vitest.config.ts, vitest.config.js, jest.config.js, jest.config.ts, go.mod, pytest.ini, pyproject.toml |
| `acmm:agents-md` | L2 | AGENTS.md shared directives | ❌ Fail | none of: AGENTS.md |
| `acmm:claude-md` | L2 | CLAUDE.md instructions | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:copilot-instructions` | L2 | Copilot instructions | ❌ Fail | none of: .github/copilot-instructions.md |
| `acmm:correction-capture` | L2 | Correction capture | ❌ Fail | none of: .claude/memory/, .memory/, corrections.jsonl |
| `acmm:cursor-rules` | L2 | Cursor rules | ❌ Fail | none of: .cursor/rules, .cursorrules |
| `acmm:editor-config` | L2 | EditorConfig | ❌ Fail | none of: .editorconfig |
| `acmm:positive-reinforcement` | L2 | Positive reinforcement capture | ❌ Fail | none of: .claude/memory/ |
| `acmm:prompts-catalog` | L2 | Prompt catalog | ❌ Fail | none of: prompts/, .prompts/, docs/prompts/, .github/prompts/, .github/agents/ |
| `acmm:simple-skills` | L2 | Simple skills | ❌ Fail | none of: .claude/skills/, .claude/commands/, skills/ |
| `aef:session-continuity` | L2 | Session continuity doc | ✅ Pass | detected at one of: CLAUDE.md, AGENTS.md, .cursorrules, .github/copilot-instructions.md, docs/agent-context.md |
| `aef:structural-gates` | L2 | Structural gates | ✅ Pass | detected at one of: CODEOWNERS, .github/CODEOWNERS, .agent/boundaries.yml, docs/agent-boundaries.md |
| `fullsend:ci-cd-maturity` | L2 | CI/CD pipeline | ✅ Pass | detected at one of: .github/workflows/ |
| `fullsend:test-coverage` | L2 | Test coverage threshold | ❌ Fail | none of: codecov.yml, .codecov.yml, coverage.yml, .github/workflows/coverage-gate.yml |
| `acmm:ci-matrix` | L3 | CI matrix | ✅ Pass | detected at one of: .github/workflows/build.yml, .github/workflows/build-deploy.yml, .github/workflows/ci.yml, .github/workflows/test.yml |
| `acmm:context-budget` | L3 | Context budget management | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:evidence-antipatterns` | L3 | Evidence-based antipattern rules | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:layered-safety` | L3 | Layered safety model | ✅ Pass | detected at one of: .claude/settings.json, .claude/settings.local.json |
| `acmm:mechanical-enforcement` | L3 | Mechanical enforcement | ✅ Pass | detected at one of: .claude/settings.json |
| `acmm:model-tiering` | L3 | Model tiering for subagents | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:pr-acceptance-metric` | L3 | PR acceptance tracking | ✅ Pass | detected at one of: scripts/build-accm-history.mjs, .github/workflows/accm-history-update.yml, scripts/pr-metrics.mjs |
| `acmm:pr-review-rubric` | L3 | PR review rubric | ✅ Pass | detected at one of: .github/review-rubric.md, docs/review-criteria.md, .github/prompts/review.md, docs/qa/ |
| `acmm:quality-dashboard` | L3 | Quality dashboard | ❌ Fail | none of: web/public/analytics.js, web/src/components/analytics/ |
| `acmm:session-summary` | L3 | Session summary artifact | ❌ Fail | none of: .claude/session-summary.md, .claude/checkpoint.md |
| `acmm:structural-gates` | L3 | Structural gates | ✅ Pass | detected at one of: .claude/settings.json |
| `acmm:verify-before-reporting` | L3 | Verify-before-reporting practices | ✅ Pass | detected at one of: CLAUDE.md |
| `aef:change-classification` | L3 | Change classification policy | ❌ Fail | none of: docs/change-classification.md, .github/change-tiers.yml, docs/risk-tiers.md |
| `aef:task-traceability` | L3 | Task traceability ledger | ❌ Fail | none of: .agent/tasks/, docs/agent-tasks/, .github/agent-log/, agent-tasks.md |
| `claude-reflect:correction-capture` | L3 | Correction capture | ❌ Fail | none of: .claude/reflections/, memory/feedback_, .github/ai-corrections.yml, scripts/capture-corrections.mjs |
| `claude-reflect:positive-reinforcement` | L3 | Positive reinforcement capture | ❌ Fail | none of: .claude/reflections/, memory/feedback_, docs/ai-reinforcement.md |
| `claude-reflect:preference-index` | L3 | Preference index | ❌ Fail | none of: .claude/preferences.json, memory/MEMORY.md, .github/agent-preferences.yml |
| `claude-reflect:session-summary` | L3 | Session summary artifact | ❌ Fail | none of: .claude/sessions/, docs/session-summaries/, memory/session_ |
| `fullsend:auto-merge-policy` | L3 | Auto-merge policy | ❌ Fail | none of: .github/auto-merge.yml, .prow.yaml, tide.yaml, .github/workflows/auto-merge.yml |
| `fullsend:branch-protection-doc` | L3 | Branch protection documentation | ❌ Fail | none of: docs/branch-protection.md, docs/governance.md, .github/branch-protection.yml |
| `fullsend:rollback-drill` | L3 | Rollback drill | ❌ Fail | none of: docs/rollback.md, .github/workflows/rollback.yml, scripts/rollback.sh |
| `acmm:ai-fix-workflow` | L4 | AI-fix-requested workflow | ✅ Pass | detected at one of: .github/workflows/ai-fix.yml, .github/workflows/fix-requested.yml, .github/workflows/claude.yml |
| `acmm:auto-label` | L4 | Automated issue labeling | ✅ Pass | detected at one of: .github/workflows/auto-label.yml, .github/labeler.yml, .github/workflows/triage.yml |
| `acmm:auto-qa-tuning` | L4 | Auto-QA self-tuning config | ✅ Pass | detected at one of: .github/auto-qa-tuning.json, .github/qa-tuning.yml |
| `acmm:claude-md-auto-sync` | L4 | CLAUDE.md auto-sync | ❌ Fail | none of: .github/workflows/claude-md-sync.yml |
| `acmm:copilot-review-apply` | L4 | Automated review application | ❌ Fail | none of: .github/workflows/copilot-review-apply.yml, .github/workflows/ai-fix.yml, .github/workflows/auto-review.yml |
| `acmm:cross-repo-skills` | L4 | Cross-repository skill sharing | ✅ Pass | detected at one of: .claude/settings.json |
| `acmm:cross-session-knowledge` | L4 | Cross-session knowledge sharing | ✅ Pass | detected at one of: knowledge.jsonl, .knowledge/, docs/reflections/ |
| `acmm:feedback-loops` | L4 | Self-improving feedback loops | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:github-coordination` | L4 | GitHub as coordination layer | ✅ Pass | detected at one of: .github/workflows/ |
| `acmm:idempotent-workflows` | L4 | Idempotent and resumable workflows | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:multi-perspective-review` | L4 | Multi-perspective review | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:nightly-compliance` | L4 | Nightly compliance scan | ✅ Pass | detected at one of: .github/workflows/nightly-compliance.yml, .github/workflows/nightly.yml, .github/workflows/nightly-test.yml, .github/workflows/nightly-test-suite.yml |
| `acmm:preference-index` | L4 | Preference index | ❌ Fail | none of: preferences.json, .claude/preferences.json |
| `acmm:router-skills` | L4 | Router skills with decision trees | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:security-ai-md` | L4 | AI security policy | ✅ Pass | detected at one of: SECURITY-AI.md, docs/security/SECURITY-AI.md, docs/SECURITY-AI.md |
| `acmm:session-continuity` | L4 | Session continuity | ❌ Fail | none of: .claude/checkpoint.md, .claude/session-summary.md |
| `acmm:structured-rca` | L4 | Structured RCA workflows | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:structured-workflows` | L4 | Structured workflow skills | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:task-ledger` | L4 | Task traceability ledger | ❌ Fail | none of: task-log.jsonl, .claude/task-log.jsonl |
| `acmm:tdd-workflows` | L4 | TDD workflows with environment routing | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:tier-classifier` | L4 | Change classification policy | ✅ Pass | detected at one of: .github/workflows/tier-classifier.yml, .github/workflows/pr-size.yml |
| `aef:audit-trail` | L4 | Audit trail workflow | ❌ Fail | none of: .github/workflows/ai-audit.yml, .github/workflows/agent-audit.yml, scripts/ai-audit-report.mjs |
| `aef:cross-tool-config` | L4 | Cross-tool agent config | ❌ Fail | none of: AGENTS.md, docs/ai-contributors.md, .github/ai-config.yml |
| `claude-reflect:claude-md-sync` | L4 | CLAUDE.md auto-sync | ❌ Fail | none of: .github/workflows/claude-md-sync.yml, scripts/sync-claude-md.mjs, scripts/update-claude-md.mjs |
| `claude-reflect:reflection-review` | L4 | Periodic reflection review | ❌ Fail | none of: .github/workflows/reflection-review.yml, scripts/review-reflections.mjs, docs/reflection-review.md |
| `fullsend:observability-runbook` | L4 | Observability runbook | ✅ Pass | detected at one of: docs/runbook.md, docs/runbooks/, RUNBOOK.md, docs/operations/ |
| `fullsend:production-feedback` | L4 | Production feedback signal | ❌ Fail | none of: monitoring/, grafana/, .github/workflows/post-deploy-check.yml, scripts/production-feedback.mjs |
| `fullsend:risk-assessment` | L4 | Risk assessment config | ✅ Pass | detected at one of: .github/risk-assessment.yml, docs/risk-tiers.md, .github/workflows/tier-classifier.yml |
| `acmm:audit-trail` | L5 | Audit trail workflow | ✅ Pass | detected at one of: .github/workflows/audit-trail.yml, .github/workflows/ai-attribution.yml |
| `acmm:auto-qa-self-tuning` | L5 | Auto-QA with self-tuning | ✅ Pass | detected at one of: .github/workflows/auto-qa.yml, .github/auto-qa-tuning.json |
| `acmm:github-actions-ai` | L5 | GitHub Actions AI integration | ✅ Pass | detected at one of: .github/workflows/claude.yml, .github/workflows/claude-code-review.yml |
| `acmm:periodic-reflection` | L5 | Periodic reflection review | ❌ Fail | none of: .github/workflows/reflection-review.yml |
| `acmm:policy-as-code` | L5 | Policy as code | ✅ Pass | detected at one of: .github/policies/, policy/, conftest.yaml, opa/ |
| `acmm:public-metrics` | L5 | Public metrics endpoint | ❌ Fail | none of: web/netlify/functions/analytics-accm.mts, web/public/analytics.js |
| `acmm:reflection-log` | L5 | Reflection log | ✅ Pass | detected at one of: docs/reflections/, memory/, .memory/, REFLECTIONS.md |
| `acmm:auto-issue-gen` | L6 | Automated issue generation | ✅ Pass | detected at one of: .github/workflows/auto-issue.yml, .github/workflows/issue-gen.yml, .github/workflows/auto-generate-issues.yml |
| `acmm:merge-queue` | L6 | Merge queue / auto-merge | ✅ Pass | detected at one of: .github/workflows/merge-queue.yml, .prow.yaml, tide.yaml |
| `acmm:multi-agent-orchestration` | L6 | Multi-agent orchestration | ✅ Pass | detected at one of: scripts/orchestrate.mjs, .github/workflows/orchestrate.yml, orchestrator/ |
| `acmm:observability-runbook` | L6 | Observability runbook | ✅ Pass | detected at one of: docs/ai-ops-runbook.md, docs/runbook/, RUNBOOK.md |
| `acmm:production-feedback` | L6 | Production feedback signal | ❌ Fail | none of: .github/workflows/production-feedback.yml |
| `acmm:risk-assessment-config` | L6 | Risk assessment config | ✅ Pass | detected at one of: risk-config.json, .claude/risk-config.json, .github/risk-assessment.yml |
| `acmm:rollback-drill` | L6 | Rollback drill | ✅ Pass | detected at one of: docs/rollback-drill.md, docs/ai-ops-runbook.md |
| `acmm:strategic-dashboard` | L6 | Strategic dashboard | ✅ Pass | detected at one of: web/src/components/acmm/, web/public/analytics.js, docs/autonomous-work-log.md |

## packages/rialto-catalog

**Current ACMM Level:** 1 (Assisted / Ad Hoc)

| ID | Level | Name | Status | Evidence |
|---|---|---|---|---|
| `acmm:prereq-cicd` | L0 | CI/CD pipeline | ❌ Fail | none of: .github/workflows/, .gitlab-ci.yml, Jenkinsfile, .circleci/ |
| `acmm:prereq-code-style` | L0 | Code style config | ❌ Fail | none of: .eslintrc, .eslintrc.json, .eslintrc.js, eslint.config.js, .prettierrc, ruff.toml, .golangci.yml |
| `acmm:prereq-contrib-guide` | L0 | Contributing guide | ❌ Fail | none of: CONTRIBUTING.md, .github/CONTRIBUTING.md |
| `acmm:prereq-coverage-gate` | L0 | Coverage gate workflow | ❌ Fail | none of: .github/workflows/coverage-gate.yml, .github/workflows/coverage.yml, .coverage-thresholds.json |
| `acmm:prereq-e2e` | L0 | End-to-end tests | ❌ Fail | none of: playwright.config.ts, playwright.config.js, cypress.config.ts, cypress.config.js, e2e/, tests/e2e/ |
| `acmm:prereq-issue-template` | L0 | Issue template | ❌ Fail | none of: .github/ISSUE_TEMPLATE/, .github/issue_template.md |
| `acmm:prereq-pr-template` | L0 | Pull request template | ❌ Fail | none of: .github/pull_request_template.md, .github/PULL_REQUEST_TEMPLATE.md |
| `acmm:prereq-test-suite` | L0 | Automated test suite | ✅ Pass | detected at one of: vitest.config.ts, vitest.config.js, jest.config.js, jest.config.ts, go.mod, pytest.ini, pyproject.toml |
| `acmm:agents-md` | L2 | AGENTS.md shared directives | ❌ Fail | none of: AGENTS.md |
| `acmm:claude-md` | L2 | CLAUDE.md instructions | ❌ Fail | none of: CLAUDE.md |
| `acmm:copilot-instructions` | L2 | Copilot instructions | ❌ Fail | none of: .github/copilot-instructions.md |
| `acmm:correction-capture` | L2 | Correction capture | ❌ Fail | none of: .claude/memory/, .memory/, corrections.jsonl |
| `acmm:cursor-rules` | L2 | Cursor rules | ❌ Fail | none of: .cursor/rules, .cursorrules |
| `acmm:editor-config` | L2 | EditorConfig | ❌ Fail | none of: .editorconfig |
| `acmm:positive-reinforcement` | L2 | Positive reinforcement capture | ❌ Fail | none of: .claude/memory/ |
| `acmm:prompts-catalog` | L2 | Prompt catalog | ❌ Fail | none of: prompts/, .prompts/, docs/prompts/, .github/prompts/, .github/agents/ |
| `acmm:simple-skills` | L2 | Simple skills | ❌ Fail | none of: .claude/skills/, .claude/commands/, skills/ |
| `aef:session-continuity` | L2 | Session continuity doc | ❌ Fail | none of: CLAUDE.md, AGENTS.md, .cursorrules, .github/copilot-instructions.md, docs/agent-context.md |
| `aef:structural-gates` | L2 | Structural gates | ❌ Fail | none of: CODEOWNERS, .github/CODEOWNERS, .agent/boundaries.yml, docs/agent-boundaries.md |
| `fullsend:ci-cd-maturity` | L2 | CI/CD pipeline | ❌ Fail | none of: .github/workflows/ |
| `fullsend:test-coverage` | L2 | Test coverage threshold | ❌ Fail | none of: codecov.yml, .codecov.yml, coverage.yml, .github/workflows/coverage-gate.yml |
| `acmm:ci-matrix` | L3 | CI matrix | ❌ Fail | none of: .github/workflows/build.yml, .github/workflows/build-deploy.yml, .github/workflows/ci.yml, .github/workflows/test.yml |
| `acmm:context-budget` | L3 | Context budget management | ❌ Fail | none of: CLAUDE.md |
| `acmm:evidence-antipatterns` | L3 | Evidence-based antipattern rules | ❌ Fail | none of: CLAUDE.md |
| `acmm:layered-safety` | L3 | Layered safety model | ❌ Fail | none of: .claude/settings.json, .claude/settings.local.json |
| `acmm:mechanical-enforcement` | L3 | Mechanical enforcement | ❌ Fail | none of: .claude/settings.json |
| `acmm:model-tiering` | L3 | Model tiering for subagents | ❌ Fail | none of: CLAUDE.md |
| `acmm:pr-acceptance-metric` | L3 | PR acceptance tracking | ❌ Fail | none of: scripts/build-accm-history.mjs, .github/workflows/accm-history-update.yml, scripts/pr-metrics.mjs |
| `acmm:pr-review-rubric` | L3 | PR review rubric | ❌ Fail | none of: .github/review-rubric.md, docs/review-criteria.md, .github/prompts/review.md, docs/qa/ |
| `acmm:quality-dashboard` | L3 | Quality dashboard | ❌ Fail | none of: web/public/analytics.js, web/src/components/analytics/ |
| `acmm:session-summary` | L3 | Session summary artifact | ❌ Fail | none of: .claude/session-summary.md, .claude/checkpoint.md |
| `acmm:structural-gates` | L3 | Structural gates | ❌ Fail | none of: .claude/settings.json |
| `acmm:verify-before-reporting` | L3 | Verify-before-reporting practices | ❌ Fail | none of: CLAUDE.md |
| `aef:change-classification` | L3 | Change classification policy | ❌ Fail | none of: docs/change-classification.md, .github/change-tiers.yml, docs/risk-tiers.md |
| `aef:task-traceability` | L3 | Task traceability ledger | ❌ Fail | none of: .agent/tasks/, docs/agent-tasks/, .github/agent-log/, agent-tasks.md |
| `claude-reflect:correction-capture` | L3 | Correction capture | ❌ Fail | none of: .claude/reflections/, memory/feedback_, .github/ai-corrections.yml, scripts/capture-corrections.mjs |
| `claude-reflect:positive-reinforcement` | L3 | Positive reinforcement capture | ❌ Fail | none of: .claude/reflections/, memory/feedback_, docs/ai-reinforcement.md |
| `claude-reflect:preference-index` | L3 | Preference index | ❌ Fail | none of: .claude/preferences.json, memory/MEMORY.md, .github/agent-preferences.yml |
| `claude-reflect:session-summary` | L3 | Session summary artifact | ❌ Fail | none of: .claude/sessions/, docs/session-summaries/, memory/session_ |
| `fullsend:auto-merge-policy` | L3 | Auto-merge policy | ❌ Fail | none of: .github/auto-merge.yml, .prow.yaml, tide.yaml, .github/workflows/auto-merge.yml |
| `fullsend:branch-protection-doc` | L3 | Branch protection documentation | ❌ Fail | none of: docs/branch-protection.md, docs/governance.md, .github/branch-protection.yml |
| `fullsend:rollback-drill` | L3 | Rollback drill | ❌ Fail | none of: docs/rollback.md, .github/workflows/rollback.yml, scripts/rollback.sh |
| `acmm:ai-fix-workflow` | L4 | AI-fix-requested workflow | ❌ Fail | none of: .github/workflows/ai-fix.yml, .github/workflows/fix-requested.yml, .github/workflows/claude.yml |
| `acmm:auto-label` | L4 | Automated issue labeling | ❌ Fail | none of: .github/workflows/auto-label.yml, .github/labeler.yml, .github/workflows/triage.yml |
| `acmm:auto-qa-tuning` | L4 | Auto-QA self-tuning config | ❌ Fail | none of: .github/auto-qa-tuning.json, .github/qa-tuning.yml |
| `acmm:claude-md-auto-sync` | L4 | CLAUDE.md auto-sync | ❌ Fail | none of: .github/workflows/claude-md-sync.yml |
| `acmm:copilot-review-apply` | L4 | Automated review application | ❌ Fail | none of: .github/workflows/copilot-review-apply.yml, .github/workflows/ai-fix.yml, .github/workflows/auto-review.yml |
| `acmm:cross-repo-skills` | L4 | Cross-repository skill sharing | ❌ Fail | none of: .claude/settings.json |
| `acmm:cross-session-knowledge` | L4 | Cross-session knowledge sharing | ❌ Fail | none of: knowledge.jsonl, .knowledge/, docs/reflections/ |
| `acmm:feedback-loops` | L4 | Self-improving feedback loops | ❌ Fail | none of: CLAUDE.md |
| `acmm:github-coordination` | L4 | GitHub as coordination layer | ❌ Fail | none of: .github/workflows/ |
| `acmm:idempotent-workflows` | L4 | Idempotent and resumable workflows | ❌ Fail | none of: CLAUDE.md |
| `acmm:multi-perspective-review` | L4 | Multi-perspective review | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:nightly-compliance` | L4 | Nightly compliance scan | ❌ Fail | none of: .github/workflows/nightly-compliance.yml, .github/workflows/nightly.yml, .github/workflows/nightly-test.yml, .github/workflows/nightly-test-suite.yml |
| `acmm:preference-index` | L4 | Preference index | ❌ Fail | none of: preferences.json, .claude/preferences.json |
| `acmm:router-skills` | L4 | Router skills with decision trees | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:security-ai-md` | L4 | AI security policy | ❌ Fail | none of: SECURITY-AI.md, docs/security/SECURITY-AI.md, docs/SECURITY-AI.md |
| `acmm:session-continuity` | L4 | Session continuity | ❌ Fail | none of: .claude/checkpoint.md, .claude/session-summary.md |
| `acmm:structured-rca` | L4 | Structured RCA workflows | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:structured-workflows` | L4 | Structured workflow skills | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:task-ledger` | L4 | Task traceability ledger | ❌ Fail | none of: task-log.jsonl, .claude/task-log.jsonl |
| `acmm:tdd-workflows` | L4 | TDD workflows with environment routing | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:tier-classifier` | L4 | Change classification policy | ❌ Fail | none of: .github/workflows/tier-classifier.yml, .github/workflows/pr-size.yml |
| `aef:audit-trail` | L4 | Audit trail workflow | ❌ Fail | none of: .github/workflows/ai-audit.yml, .github/workflows/agent-audit.yml, scripts/ai-audit-report.mjs |
| `aef:cross-tool-config` | L4 | Cross-tool agent config | ❌ Fail | none of: AGENTS.md, docs/ai-contributors.md, .github/ai-config.yml |
| `claude-reflect:claude-md-sync` | L4 | CLAUDE.md auto-sync | ❌ Fail | none of: .github/workflows/claude-md-sync.yml, scripts/sync-claude-md.mjs, scripts/update-claude-md.mjs |
| `claude-reflect:reflection-review` | L4 | Periodic reflection review | ❌ Fail | none of: .github/workflows/reflection-review.yml, scripts/review-reflections.mjs, docs/reflection-review.md |
| `fullsend:observability-runbook` | L4 | Observability runbook | ❌ Fail | none of: docs/runbook.md, docs/runbooks/, RUNBOOK.md, docs/operations/ |
| `fullsend:production-feedback` | L4 | Production feedback signal | ❌ Fail | none of: monitoring/, grafana/, .github/workflows/post-deploy-check.yml, scripts/production-feedback.mjs |
| `fullsend:risk-assessment` | L4 | Risk assessment config | ❌ Fail | none of: .github/risk-assessment.yml, docs/risk-tiers.md, .github/workflows/tier-classifier.yml |
| `acmm:audit-trail` | L5 | Audit trail workflow | ❌ Fail | none of: .github/workflows/audit-trail.yml, .github/workflows/ai-attribution.yml |
| `acmm:auto-qa-self-tuning` | L5 | Auto-QA with self-tuning | ❌ Fail | none of: .github/workflows/auto-qa.yml, .github/auto-qa-tuning.json |
| `acmm:github-actions-ai` | L5 | GitHub Actions AI integration | ❌ Fail | none of: .github/workflows/claude.yml, .github/workflows/claude-code-review.yml |
| `acmm:periodic-reflection` | L5 | Periodic reflection review | ❌ Fail | none of: .github/workflows/reflection-review.yml |
| `acmm:policy-as-code` | L5 | Policy as code | ❌ Fail | none of: .github/policies/, policy/, conftest.yaml, opa/ |
| `acmm:public-metrics` | L5 | Public metrics endpoint | ❌ Fail | none of: web/netlify/functions/analytics-accm.mts, web/public/analytics.js |
| `acmm:reflection-log` | L5 | Reflection log | ❌ Fail | none of: docs/reflections/, memory/, .memory/, REFLECTIONS.md |
| `acmm:auto-issue-gen` | L6 | Automated issue generation | ❌ Fail | none of: .github/workflows/auto-issue.yml, .github/workflows/issue-gen.yml, .github/workflows/auto-generate-issues.yml |
| `acmm:merge-queue` | L6 | Merge queue / auto-merge | ❌ Fail | none of: .github/workflows/merge-queue.yml, .prow.yaml, tide.yaml |
| `acmm:multi-agent-orchestration` | L6 | Multi-agent orchestration | ❌ Fail | none of: scripts/orchestrate.mjs, .github/workflows/orchestrate.yml, orchestrator/ |
| `acmm:observability-runbook` | L6 | Observability runbook | ❌ Fail | none of: docs/ai-ops-runbook.md, docs/runbook/, RUNBOOK.md |
| `acmm:production-feedback` | L6 | Production feedback signal | ❌ Fail | none of: .github/workflows/production-feedback.yml |
| `acmm:risk-assessment-config` | L6 | Risk assessment config | ❌ Fail | none of: risk-config.json, .claude/risk-config.json, .github/risk-assessment.yml |
| `acmm:rollback-drill` | L6 | Rollback drill | ❌ Fail | none of: docs/rollback-drill.md, docs/ai-ops-runbook.md |
| `acmm:strategic-dashboard` | L6 | Strategic dashboard | ❌ Fail | none of: web/src/components/acmm/, web/public/analytics.js, docs/autonomous-work-log.md |

## packages/rialto-plugin

**Current ACMM Level:** 1 (Assisted / Ad Hoc)

| ID | Level | Name | Status | Evidence |
|---|---|---|---|---|
| `acmm:prereq-cicd` | L0 | CI/CD pipeline | ❌ Fail | none of: .github/workflows/, .gitlab-ci.yml, Jenkinsfile, .circleci/ |
| `acmm:prereq-code-style` | L0 | Code style config | ❌ Fail | none of: .eslintrc, .eslintrc.json, .eslintrc.js, eslint.config.js, .prettierrc, ruff.toml, .golangci.yml |
| `acmm:prereq-contrib-guide` | L0 | Contributing guide | ❌ Fail | none of: CONTRIBUTING.md, .github/CONTRIBUTING.md |
| `acmm:prereq-coverage-gate` | L0 | Coverage gate workflow | ❌ Fail | none of: .github/workflows/coverage-gate.yml, .github/workflows/coverage.yml, .coverage-thresholds.json |
| `acmm:prereq-e2e` | L0 | End-to-end tests | ❌ Fail | none of: playwright.config.ts, playwright.config.js, cypress.config.ts, cypress.config.js, e2e/, tests/e2e/ |
| `acmm:prereq-issue-template` | L0 | Issue template | ❌ Fail | none of: .github/ISSUE_TEMPLATE/, .github/issue_template.md |
| `acmm:prereq-pr-template` | L0 | Pull request template | ❌ Fail | none of: .github/pull_request_template.md, .github/PULL_REQUEST_TEMPLATE.md |
| `acmm:prereq-test-suite` | L0 | Automated test suite | ❌ Fail | none of: vitest.config.ts, vitest.config.js, jest.config.js, jest.config.ts, go.mod, pytest.ini, pyproject.toml |
| `acmm:agents-md` | L2 | AGENTS.md shared directives | ❌ Fail | none of: AGENTS.md |
| `acmm:claude-md` | L2 | CLAUDE.md instructions | ❌ Fail | none of: CLAUDE.md |
| `acmm:copilot-instructions` | L2 | Copilot instructions | ❌ Fail | none of: .github/copilot-instructions.md |
| `acmm:correction-capture` | L2 | Correction capture | ❌ Fail | none of: .claude/memory/, .memory/, corrections.jsonl |
| `acmm:cursor-rules` | L2 | Cursor rules | ❌ Fail | none of: .cursor/rules, .cursorrules |
| `acmm:editor-config` | L2 | EditorConfig | ❌ Fail | none of: .editorconfig |
| `acmm:positive-reinforcement` | L2 | Positive reinforcement capture | ❌ Fail | none of: .claude/memory/ |
| `acmm:prompts-catalog` | L2 | Prompt catalog | ❌ Fail | none of: prompts/, .prompts/, docs/prompts/, .github/prompts/, .github/agents/ |
| `acmm:simple-skills` | L2 | Simple skills | ✅ Pass | detected at one of: .claude/skills/, .claude/commands/, skills/ |
| `aef:session-continuity` | L2 | Session continuity doc | ❌ Fail | none of: CLAUDE.md, AGENTS.md, .cursorrules, .github/copilot-instructions.md, docs/agent-context.md |
| `aef:structural-gates` | L2 | Structural gates | ❌ Fail | none of: CODEOWNERS, .github/CODEOWNERS, .agent/boundaries.yml, docs/agent-boundaries.md |
| `fullsend:ci-cd-maturity` | L2 | CI/CD pipeline | ❌ Fail | none of: .github/workflows/ |
| `fullsend:test-coverage` | L2 | Test coverage threshold | ❌ Fail | none of: codecov.yml, .codecov.yml, coverage.yml, .github/workflows/coverage-gate.yml |
| `acmm:ci-matrix` | L3 | CI matrix | ❌ Fail | none of: .github/workflows/build.yml, .github/workflows/build-deploy.yml, .github/workflows/ci.yml, .github/workflows/test.yml |
| `acmm:context-budget` | L3 | Context budget management | ❌ Fail | none of: CLAUDE.md |
| `acmm:evidence-antipatterns` | L3 | Evidence-based antipattern rules | ❌ Fail | none of: CLAUDE.md |
| `acmm:layered-safety` | L3 | Layered safety model | ❌ Fail | none of: .claude/settings.json, .claude/settings.local.json |
| `acmm:mechanical-enforcement` | L3 | Mechanical enforcement | ❌ Fail | none of: .claude/settings.json |
| `acmm:model-tiering` | L3 | Model tiering for subagents | ❌ Fail | none of: CLAUDE.md |
| `acmm:pr-acceptance-metric` | L3 | PR acceptance tracking | ❌ Fail | none of: scripts/build-accm-history.mjs, .github/workflows/accm-history-update.yml, scripts/pr-metrics.mjs |
| `acmm:pr-review-rubric` | L3 | PR review rubric | ❌ Fail | none of: .github/review-rubric.md, docs/review-criteria.md, .github/prompts/review.md, docs/qa/ |
| `acmm:quality-dashboard` | L3 | Quality dashboard | ❌ Fail | none of: web/public/analytics.js, web/src/components/analytics/ |
| `acmm:session-summary` | L3 | Session summary artifact | ❌ Fail | none of: .claude/session-summary.md, .claude/checkpoint.md |
| `acmm:structural-gates` | L3 | Structural gates | ❌ Fail | none of: .claude/settings.json |
| `acmm:verify-before-reporting` | L3 | Verify-before-reporting practices | ❌ Fail | none of: CLAUDE.md |
| `aef:change-classification` | L3 | Change classification policy | ❌ Fail | none of: docs/change-classification.md, .github/change-tiers.yml, docs/risk-tiers.md |
| `aef:task-traceability` | L3 | Task traceability ledger | ❌ Fail | none of: .agent/tasks/, docs/agent-tasks/, .github/agent-log/, agent-tasks.md |
| `claude-reflect:correction-capture` | L3 | Correction capture | ❌ Fail | none of: .claude/reflections/, memory/feedback_, .github/ai-corrections.yml, scripts/capture-corrections.mjs |
| `claude-reflect:positive-reinforcement` | L3 | Positive reinforcement capture | ❌ Fail | none of: .claude/reflections/, memory/feedback_, docs/ai-reinforcement.md |
| `claude-reflect:preference-index` | L3 | Preference index | ❌ Fail | none of: .claude/preferences.json, memory/MEMORY.md, .github/agent-preferences.yml |
| `claude-reflect:session-summary` | L3 | Session summary artifact | ❌ Fail | none of: .claude/sessions/, docs/session-summaries/, memory/session_ |
| `fullsend:auto-merge-policy` | L3 | Auto-merge policy | ❌ Fail | none of: .github/auto-merge.yml, .prow.yaml, tide.yaml, .github/workflows/auto-merge.yml |
| `fullsend:branch-protection-doc` | L3 | Branch protection documentation | ❌ Fail | none of: docs/branch-protection.md, docs/governance.md, .github/branch-protection.yml |
| `fullsend:rollback-drill` | L3 | Rollback drill | ❌ Fail | none of: docs/rollback.md, .github/workflows/rollback.yml, scripts/rollback.sh |
| `acmm:ai-fix-workflow` | L4 | AI-fix-requested workflow | ❌ Fail | none of: .github/workflows/ai-fix.yml, .github/workflows/fix-requested.yml, .github/workflows/claude.yml |
| `acmm:auto-label` | L4 | Automated issue labeling | ❌ Fail | none of: .github/workflows/auto-label.yml, .github/labeler.yml, .github/workflows/triage.yml |
| `acmm:auto-qa-tuning` | L4 | Auto-QA self-tuning config | ❌ Fail | none of: .github/auto-qa-tuning.json, .github/qa-tuning.yml |
| `acmm:claude-md-auto-sync` | L4 | CLAUDE.md auto-sync | ❌ Fail | none of: .github/workflows/claude-md-sync.yml |
| `acmm:copilot-review-apply` | L4 | Automated review application | ❌ Fail | none of: .github/workflows/copilot-review-apply.yml, .github/workflows/ai-fix.yml, .github/workflows/auto-review.yml |
| `acmm:cross-repo-skills` | L4 | Cross-repository skill sharing | ❌ Fail | none of: .claude/settings.json |
| `acmm:cross-session-knowledge` | L4 | Cross-session knowledge sharing | ❌ Fail | none of: knowledge.jsonl, .knowledge/, docs/reflections/ |
| `acmm:feedback-loops` | L4 | Self-improving feedback loops | ❌ Fail | none of: CLAUDE.md |
| `acmm:github-coordination` | L4 | GitHub as coordination layer | ❌ Fail | none of: .github/workflows/ |
| `acmm:idempotent-workflows` | L4 | Idempotent and resumable workflows | ❌ Fail | none of: CLAUDE.md |
| `acmm:multi-perspective-review` | L4 | Multi-perspective review | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:nightly-compliance` | L4 | Nightly compliance scan | ❌ Fail | none of: .github/workflows/nightly-compliance.yml, .github/workflows/nightly.yml, .github/workflows/nightly-test.yml, .github/workflows/nightly-test-suite.yml |
| `acmm:preference-index` | L4 | Preference index | ❌ Fail | none of: preferences.json, .claude/preferences.json |
| `acmm:router-skills` | L4 | Router skills with decision trees | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:security-ai-md` | L4 | AI security policy | ❌ Fail | none of: SECURITY-AI.md, docs/security/SECURITY-AI.md, docs/SECURITY-AI.md |
| `acmm:session-continuity` | L4 | Session continuity | ❌ Fail | none of: .claude/checkpoint.md, .claude/session-summary.md |
| `acmm:structured-rca` | L4 | Structured RCA workflows | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:structured-workflows` | L4 | Structured workflow skills | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:task-ledger` | L4 | Task traceability ledger | ❌ Fail | none of: task-log.jsonl, .claude/task-log.jsonl |
| `acmm:tdd-workflows` | L4 | TDD workflows with environment routing | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:tier-classifier` | L4 | Change classification policy | ❌ Fail | none of: .github/workflows/tier-classifier.yml, .github/workflows/pr-size.yml |
| `aef:audit-trail` | L4 | Audit trail workflow | ❌ Fail | none of: .github/workflows/ai-audit.yml, .github/workflows/agent-audit.yml, scripts/ai-audit-report.mjs |
| `aef:cross-tool-config` | L4 | Cross-tool agent config | ❌ Fail | none of: AGENTS.md, docs/ai-contributors.md, .github/ai-config.yml |
| `claude-reflect:claude-md-sync` | L4 | CLAUDE.md auto-sync | ❌ Fail | none of: .github/workflows/claude-md-sync.yml, scripts/sync-claude-md.mjs, scripts/update-claude-md.mjs |
| `claude-reflect:reflection-review` | L4 | Periodic reflection review | ❌ Fail | none of: .github/workflows/reflection-review.yml, scripts/review-reflections.mjs, docs/reflection-review.md |
| `fullsend:observability-runbook` | L4 | Observability runbook | ❌ Fail | none of: docs/runbook.md, docs/runbooks/, RUNBOOK.md, docs/operations/ |
| `fullsend:production-feedback` | L4 | Production feedback signal | ❌ Fail | none of: monitoring/, grafana/, .github/workflows/post-deploy-check.yml, scripts/production-feedback.mjs |
| `fullsend:risk-assessment` | L4 | Risk assessment config | ❌ Fail | none of: .github/risk-assessment.yml, docs/risk-tiers.md, .github/workflows/tier-classifier.yml |
| `acmm:audit-trail` | L5 | Audit trail workflow | ❌ Fail | none of: .github/workflows/audit-trail.yml, .github/workflows/ai-attribution.yml |
| `acmm:auto-qa-self-tuning` | L5 | Auto-QA with self-tuning | ❌ Fail | none of: .github/workflows/auto-qa.yml, .github/auto-qa-tuning.json |
| `acmm:github-actions-ai` | L5 | GitHub Actions AI integration | ❌ Fail | none of: .github/workflows/claude.yml, .github/workflows/claude-code-review.yml |
| `acmm:periodic-reflection` | L5 | Periodic reflection review | ❌ Fail | none of: .github/workflows/reflection-review.yml |
| `acmm:policy-as-code` | L5 | Policy as code | ❌ Fail | none of: .github/policies/, policy/, conftest.yaml, opa/ |
| `acmm:public-metrics` | L5 | Public metrics endpoint | ❌ Fail | none of: web/netlify/functions/analytics-accm.mts, web/public/analytics.js |
| `acmm:reflection-log` | L5 | Reflection log | ❌ Fail | none of: docs/reflections/, memory/, .memory/, REFLECTIONS.md |
| `acmm:auto-issue-gen` | L6 | Automated issue generation | ❌ Fail | none of: .github/workflows/auto-issue.yml, .github/workflows/issue-gen.yml, .github/workflows/auto-generate-issues.yml |
| `acmm:merge-queue` | L6 | Merge queue / auto-merge | ❌ Fail | none of: .github/workflows/merge-queue.yml, .prow.yaml, tide.yaml |
| `acmm:multi-agent-orchestration` | L6 | Multi-agent orchestration | ❌ Fail | none of: scripts/orchestrate.mjs, .github/workflows/orchestrate.yml, orchestrator/ |
| `acmm:observability-runbook` | L6 | Observability runbook | ❌ Fail | none of: docs/ai-ops-runbook.md, docs/runbook/, RUNBOOK.md |
| `acmm:production-feedback` | L6 | Production feedback signal | ❌ Fail | none of: .github/workflows/production-feedback.yml |
| `acmm:risk-assessment-config` | L6 | Risk assessment config | ❌ Fail | none of: risk-config.json, .claude/risk-config.json, .github/risk-assessment.yml |
| `acmm:rollback-drill` | L6 | Rollback drill | ❌ Fail | none of: docs/rollback-drill.md, docs/ai-ops-runbook.md |
| `acmm:strategic-dashboard` | L6 | Strategic dashboard | ❌ Fail | none of: web/src/components/acmm/, web/public/analytics.js, docs/autonomous-work-log.md |

## packages/sentry

**Current ACMM Level:** 2 (Instructed)

| ID | Level | Name | Status | Evidence |
|---|---|---|---|---|
| `acmm:prereq-cicd` | L0 | CI/CD pipeline | ❌ Fail | none of: .github/workflows/, .gitlab-ci.yml, Jenkinsfile, .circleci/ |
| `acmm:prereq-code-style` | L0 | Code style config | ❌ Fail | none of: .eslintrc, .eslintrc.json, .eslintrc.js, eslint.config.js, .prettierrc, ruff.toml, .golangci.yml |
| `acmm:prereq-contrib-guide` | L0 | Contributing guide | ❌ Fail | none of: CONTRIBUTING.md, .github/CONTRIBUTING.md |
| `acmm:prereq-coverage-gate` | L0 | Coverage gate workflow | ❌ Fail | none of: .github/workflows/coverage-gate.yml, .github/workflows/coverage.yml, .coverage-thresholds.json |
| `acmm:prereq-e2e` | L0 | End-to-end tests | ❌ Fail | none of: playwright.config.ts, playwright.config.js, cypress.config.ts, cypress.config.js, e2e/, tests/e2e/ |
| `acmm:prereq-issue-template` | L0 | Issue template | ❌ Fail | none of: .github/ISSUE_TEMPLATE/, .github/issue_template.md |
| `acmm:prereq-pr-template` | L0 | Pull request template | ❌ Fail | none of: .github/pull_request_template.md, .github/PULL_REQUEST_TEMPLATE.md |
| `acmm:prereq-test-suite` | L0 | Automated test suite | ❌ Fail | none of: vitest.config.ts, vitest.config.js, jest.config.js, jest.config.ts, go.mod, pytest.ini, pyproject.toml |
| `acmm:agents-md` | L2 | AGENTS.md shared directives | ❌ Fail | none of: AGENTS.md |
| `acmm:claude-md` | L2 | CLAUDE.md instructions | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:copilot-instructions` | L2 | Copilot instructions | ❌ Fail | none of: .github/copilot-instructions.md |
| `acmm:correction-capture` | L2 | Correction capture | ❌ Fail | none of: .claude/memory/, .memory/, corrections.jsonl |
| `acmm:cursor-rules` | L2 | Cursor rules | ❌ Fail | none of: .cursor/rules, .cursorrules |
| `acmm:editor-config` | L2 | EditorConfig | ❌ Fail | none of: .editorconfig |
| `acmm:positive-reinforcement` | L2 | Positive reinforcement capture | ❌ Fail | none of: .claude/memory/ |
| `acmm:prompts-catalog` | L2 | Prompt catalog | ❌ Fail | none of: prompts/, .prompts/, docs/prompts/, .github/prompts/, .github/agents/ |
| `acmm:simple-skills` | L2 | Simple skills | ❌ Fail | none of: .claude/skills/, .claude/commands/, skills/ |
| `aef:session-continuity` | L2 | Session continuity doc | ✅ Pass | detected at one of: CLAUDE.md, AGENTS.md, .cursorrules, .github/copilot-instructions.md, docs/agent-context.md |
| `aef:structural-gates` | L2 | Structural gates | ❌ Fail | none of: CODEOWNERS, .github/CODEOWNERS, .agent/boundaries.yml, docs/agent-boundaries.md |
| `fullsend:ci-cd-maturity` | L2 | CI/CD pipeline | ❌ Fail | none of: .github/workflows/ |
| `fullsend:test-coverage` | L2 | Test coverage threshold | ❌ Fail | none of: codecov.yml, .codecov.yml, coverage.yml, .github/workflows/coverage-gate.yml |
| `acmm:ci-matrix` | L3 | CI matrix | ❌ Fail | none of: .github/workflows/build.yml, .github/workflows/build-deploy.yml, .github/workflows/ci.yml, .github/workflows/test.yml |
| `acmm:context-budget` | L3 | Context budget management | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:evidence-antipatterns` | L3 | Evidence-based antipattern rules | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:layered-safety` | L3 | Layered safety model | ❌ Fail | none of: .claude/settings.json, .claude/settings.local.json |
| `acmm:mechanical-enforcement` | L3 | Mechanical enforcement | ❌ Fail | none of: .claude/settings.json |
| `acmm:model-tiering` | L3 | Model tiering for subagents | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:pr-acceptance-metric` | L3 | PR acceptance tracking | ❌ Fail | none of: scripts/build-accm-history.mjs, .github/workflows/accm-history-update.yml, scripts/pr-metrics.mjs |
| `acmm:pr-review-rubric` | L3 | PR review rubric | ❌ Fail | none of: .github/review-rubric.md, docs/review-criteria.md, .github/prompts/review.md, docs/qa/ |
| `acmm:quality-dashboard` | L3 | Quality dashboard | ❌ Fail | none of: web/public/analytics.js, web/src/components/analytics/ |
| `acmm:session-summary` | L3 | Session summary artifact | ❌ Fail | none of: .claude/session-summary.md, .claude/checkpoint.md |
| `acmm:structural-gates` | L3 | Structural gates | ❌ Fail | none of: .claude/settings.json |
| `acmm:verify-before-reporting` | L3 | Verify-before-reporting practices | ✅ Pass | detected at one of: CLAUDE.md |
| `aef:change-classification` | L3 | Change classification policy | ❌ Fail | none of: docs/change-classification.md, .github/change-tiers.yml, docs/risk-tiers.md |
| `aef:task-traceability` | L3 | Task traceability ledger | ❌ Fail | none of: .agent/tasks/, docs/agent-tasks/, .github/agent-log/, agent-tasks.md |
| `claude-reflect:correction-capture` | L3 | Correction capture | ❌ Fail | none of: .claude/reflections/, memory/feedback_, .github/ai-corrections.yml, scripts/capture-corrections.mjs |
| `claude-reflect:positive-reinforcement` | L3 | Positive reinforcement capture | ❌ Fail | none of: .claude/reflections/, memory/feedback_, docs/ai-reinforcement.md |
| `claude-reflect:preference-index` | L3 | Preference index | ❌ Fail | none of: .claude/preferences.json, memory/MEMORY.md, .github/agent-preferences.yml |
| `claude-reflect:session-summary` | L3 | Session summary artifact | ❌ Fail | none of: .claude/sessions/, docs/session-summaries/, memory/session_ |
| `fullsend:auto-merge-policy` | L3 | Auto-merge policy | ❌ Fail | none of: .github/auto-merge.yml, .prow.yaml, tide.yaml, .github/workflows/auto-merge.yml |
| `fullsend:branch-protection-doc` | L3 | Branch protection documentation | ❌ Fail | none of: docs/branch-protection.md, docs/governance.md, .github/branch-protection.yml |
| `fullsend:rollback-drill` | L3 | Rollback drill | ❌ Fail | none of: docs/rollback.md, .github/workflows/rollback.yml, scripts/rollback.sh |
| `acmm:ai-fix-workflow` | L4 | AI-fix-requested workflow | ❌ Fail | none of: .github/workflows/ai-fix.yml, .github/workflows/fix-requested.yml, .github/workflows/claude.yml |
| `acmm:auto-label` | L4 | Automated issue labeling | ❌ Fail | none of: .github/workflows/auto-label.yml, .github/labeler.yml, .github/workflows/triage.yml |
| `acmm:auto-qa-tuning` | L4 | Auto-QA self-tuning config | ❌ Fail | none of: .github/auto-qa-tuning.json, .github/qa-tuning.yml |
| `acmm:claude-md-auto-sync` | L4 | CLAUDE.md auto-sync | ❌ Fail | none of: .github/workflows/claude-md-sync.yml |
| `acmm:copilot-review-apply` | L4 | Automated review application | ❌ Fail | none of: .github/workflows/copilot-review-apply.yml, .github/workflows/ai-fix.yml, .github/workflows/auto-review.yml |
| `acmm:cross-repo-skills` | L4 | Cross-repository skill sharing | ❌ Fail | none of: .claude/settings.json |
| `acmm:cross-session-knowledge` | L4 | Cross-session knowledge sharing | ❌ Fail | none of: knowledge.jsonl, .knowledge/, docs/reflections/ |
| `acmm:feedback-loops` | L4 | Self-improving feedback loops | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:github-coordination` | L4 | GitHub as coordination layer | ❌ Fail | none of: .github/workflows/ |
| `acmm:idempotent-workflows` | L4 | Idempotent and resumable workflows | ✅ Pass | detected at one of: CLAUDE.md |
| `acmm:multi-perspective-review` | L4 | Multi-perspective review | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:nightly-compliance` | L4 | Nightly compliance scan | ❌ Fail | none of: .github/workflows/nightly-compliance.yml, .github/workflows/nightly.yml, .github/workflows/nightly-test.yml, .github/workflows/nightly-test-suite.yml |
| `acmm:preference-index` | L4 | Preference index | ❌ Fail | none of: preferences.json, .claude/preferences.json |
| `acmm:router-skills` | L4 | Router skills with decision trees | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:security-ai-md` | L4 | AI security policy | ❌ Fail | none of: SECURITY-AI.md, docs/security/SECURITY-AI.md, docs/SECURITY-AI.md |
| `acmm:session-continuity` | L4 | Session continuity | ❌ Fail | none of: .claude/checkpoint.md, .claude/session-summary.md |
| `acmm:structured-rca` | L4 | Structured RCA workflows | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:structured-workflows` | L4 | Structured workflow skills | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:task-ledger` | L4 | Task traceability ledger | ❌ Fail | none of: task-log.jsonl, .claude/task-log.jsonl |
| `acmm:tdd-workflows` | L4 | TDD workflows with environment routing | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:tier-classifier` | L4 | Change classification policy | ❌ Fail | none of: .github/workflows/tier-classifier.yml, .github/workflows/pr-size.yml |
| `aef:audit-trail` | L4 | Audit trail workflow | ❌ Fail | none of: .github/workflows/ai-audit.yml, .github/workflows/agent-audit.yml, scripts/ai-audit-report.mjs |
| `aef:cross-tool-config` | L4 | Cross-tool agent config | ❌ Fail | none of: AGENTS.md, docs/ai-contributors.md, .github/ai-config.yml |
| `claude-reflect:claude-md-sync` | L4 | CLAUDE.md auto-sync | ❌ Fail | none of: .github/workflows/claude-md-sync.yml, scripts/sync-claude-md.mjs, scripts/update-claude-md.mjs |
| `claude-reflect:reflection-review` | L4 | Periodic reflection review | ❌ Fail | none of: .github/workflows/reflection-review.yml, scripts/review-reflections.mjs, docs/reflection-review.md |
| `fullsend:observability-runbook` | L4 | Observability runbook | ❌ Fail | none of: docs/runbook.md, docs/runbooks/, RUNBOOK.md, docs/operations/ |
| `fullsend:production-feedback` | L4 | Production feedback signal | ❌ Fail | none of: monitoring/, grafana/, .github/workflows/post-deploy-check.yml, scripts/production-feedback.mjs |
| `fullsend:risk-assessment` | L4 | Risk assessment config | ❌ Fail | none of: .github/risk-assessment.yml, docs/risk-tiers.md, .github/workflows/tier-classifier.yml |
| `acmm:audit-trail` | L5 | Audit trail workflow | ❌ Fail | none of: .github/workflows/audit-trail.yml, .github/workflows/ai-attribution.yml |
| `acmm:auto-qa-self-tuning` | L5 | Auto-QA with self-tuning | ❌ Fail | none of: .github/workflows/auto-qa.yml, .github/auto-qa-tuning.json |
| `acmm:github-actions-ai` | L5 | GitHub Actions AI integration | ❌ Fail | none of: .github/workflows/claude.yml, .github/workflows/claude-code-review.yml |
| `acmm:periodic-reflection` | L5 | Periodic reflection review | ❌ Fail | none of: .github/workflows/reflection-review.yml |
| `acmm:policy-as-code` | L5 | Policy as code | ❌ Fail | none of: .github/policies/, policy/, conftest.yaml, opa/ |
| `acmm:public-metrics` | L5 | Public metrics endpoint | ❌ Fail | none of: web/netlify/functions/analytics-accm.mts, web/public/analytics.js |
| `acmm:reflection-log` | L5 | Reflection log | ❌ Fail | none of: docs/reflections/, memory/, .memory/, REFLECTIONS.md |
| `acmm:auto-issue-gen` | L6 | Automated issue generation | ❌ Fail | none of: .github/workflows/auto-issue.yml, .github/workflows/issue-gen.yml, .github/workflows/auto-generate-issues.yml |
| `acmm:merge-queue` | L6 | Merge queue / auto-merge | ❌ Fail | none of: .github/workflows/merge-queue.yml, .prow.yaml, tide.yaml |
| `acmm:multi-agent-orchestration` | L6 | Multi-agent orchestration | ❌ Fail | none of: scripts/orchestrate.mjs, .github/workflows/orchestrate.yml, orchestrator/ |
| `acmm:observability-runbook` | L6 | Observability runbook | ❌ Fail | none of: docs/ai-ops-runbook.md, docs/runbook/, RUNBOOK.md |
| `acmm:production-feedback` | L6 | Production feedback signal | ❌ Fail | none of: .github/workflows/production-feedback.yml |
| `acmm:risk-assessment-config` | L6 | Risk assessment config | ❌ Fail | none of: risk-config.json, .claude/risk-config.json, .github/risk-assessment.yml |
| `acmm:rollback-drill` | L6 | Rollback drill | ❌ Fail | none of: docs/rollback-drill.md, docs/ai-ops-runbook.md |
| `acmm:strategic-dashboard` | L6 | Strategic dashboard | ❌ Fail | none of: web/src/components/acmm/, web/public/analytics.js, docs/autonomous-work-log.md |

## packages/types

**Current ACMM Level:** 1 (Assisted / Ad Hoc)

| ID | Level | Name | Status | Evidence |
|---|---|---|---|---|
| `acmm:prereq-cicd` | L0 | CI/CD pipeline | ❌ Fail | none of: .github/workflows/, .gitlab-ci.yml, Jenkinsfile, .circleci/ |
| `acmm:prereq-code-style` | L0 | Code style config | ✅ Pass | detected at one of: .eslintrc, .eslintrc.json, .eslintrc.js, eslint.config.js, .prettierrc, ruff.toml, .golangci.yml |
| `acmm:prereq-contrib-guide` | L0 | Contributing guide | ❌ Fail | none of: CONTRIBUTING.md, .github/CONTRIBUTING.md |
| `acmm:prereq-coverage-gate` | L0 | Coverage gate workflow | ❌ Fail | none of: .github/workflows/coverage-gate.yml, .github/workflows/coverage.yml, .coverage-thresholds.json |
| `acmm:prereq-e2e` | L0 | End-to-end tests | ❌ Fail | none of: playwright.config.ts, playwright.config.js, cypress.config.ts, cypress.config.js, e2e/, tests/e2e/ |
| `acmm:prereq-issue-template` | L0 | Issue template | ❌ Fail | none of: .github/ISSUE_TEMPLATE/, .github/issue_template.md |
| `acmm:prereq-pr-template` | L0 | Pull request template | ❌ Fail | none of: .github/pull_request_template.md, .github/PULL_REQUEST_TEMPLATE.md |
| `acmm:prereq-test-suite` | L0 | Automated test suite | ❌ Fail | none of: vitest.config.ts, vitest.config.js, jest.config.js, jest.config.ts, go.mod, pytest.ini, pyproject.toml |
| `acmm:agents-md` | L2 | AGENTS.md shared directives | ❌ Fail | none of: AGENTS.md |
| `acmm:claude-md` | L2 | CLAUDE.md instructions | ❌ Fail | none of: CLAUDE.md |
| `acmm:copilot-instructions` | L2 | Copilot instructions | ❌ Fail | none of: .github/copilot-instructions.md |
| `acmm:correction-capture` | L2 | Correction capture | ❌ Fail | none of: .claude/memory/, .memory/, corrections.jsonl |
| `acmm:cursor-rules` | L2 | Cursor rules | ❌ Fail | none of: .cursor/rules, .cursorrules |
| `acmm:editor-config` | L2 | EditorConfig | ❌ Fail | none of: .editorconfig |
| `acmm:positive-reinforcement` | L2 | Positive reinforcement capture | ❌ Fail | none of: .claude/memory/ |
| `acmm:prompts-catalog` | L2 | Prompt catalog | ❌ Fail | none of: prompts/, .prompts/, docs/prompts/, .github/prompts/, .github/agents/ |
| `acmm:simple-skills` | L2 | Simple skills | ❌ Fail | none of: .claude/skills/, .claude/commands/, skills/ |
| `aef:session-continuity` | L2 | Session continuity doc | ❌ Fail | none of: CLAUDE.md, AGENTS.md, .cursorrules, .github/copilot-instructions.md, docs/agent-context.md |
| `aef:structural-gates` | L2 | Structural gates | ❌ Fail | none of: CODEOWNERS, .github/CODEOWNERS, .agent/boundaries.yml, docs/agent-boundaries.md |
| `fullsend:ci-cd-maturity` | L2 | CI/CD pipeline | ❌ Fail | none of: .github/workflows/ |
| `fullsend:test-coverage` | L2 | Test coverage threshold | ❌ Fail | none of: codecov.yml, .codecov.yml, coverage.yml, .github/workflows/coverage-gate.yml |
| `acmm:ci-matrix` | L3 | CI matrix | ❌ Fail | none of: .github/workflows/build.yml, .github/workflows/build-deploy.yml, .github/workflows/ci.yml, .github/workflows/test.yml |
| `acmm:context-budget` | L3 | Context budget management | ❌ Fail | none of: CLAUDE.md |
| `acmm:evidence-antipatterns` | L3 | Evidence-based antipattern rules | ❌ Fail | none of: CLAUDE.md |
| `acmm:layered-safety` | L3 | Layered safety model | ❌ Fail | none of: .claude/settings.json, .claude/settings.local.json |
| `acmm:mechanical-enforcement` | L3 | Mechanical enforcement | ❌ Fail | none of: .claude/settings.json |
| `acmm:model-tiering` | L3 | Model tiering for subagents | ❌ Fail | none of: CLAUDE.md |
| `acmm:pr-acceptance-metric` | L3 | PR acceptance tracking | ❌ Fail | none of: scripts/build-accm-history.mjs, .github/workflows/accm-history-update.yml, scripts/pr-metrics.mjs |
| `acmm:pr-review-rubric` | L3 | PR review rubric | ❌ Fail | none of: .github/review-rubric.md, docs/review-criteria.md, .github/prompts/review.md, docs/qa/ |
| `acmm:quality-dashboard` | L3 | Quality dashboard | ❌ Fail | none of: web/public/analytics.js, web/src/components/analytics/ |
| `acmm:session-summary` | L3 | Session summary artifact | ❌ Fail | none of: .claude/session-summary.md, .claude/checkpoint.md |
| `acmm:structural-gates` | L3 | Structural gates | ❌ Fail | none of: .claude/settings.json |
| `acmm:verify-before-reporting` | L3 | Verify-before-reporting practices | ❌ Fail | none of: CLAUDE.md |
| `aef:change-classification` | L3 | Change classification policy | ❌ Fail | none of: docs/change-classification.md, .github/change-tiers.yml, docs/risk-tiers.md |
| `aef:task-traceability` | L3 | Task traceability ledger | ❌ Fail | none of: .agent/tasks/, docs/agent-tasks/, .github/agent-log/, agent-tasks.md |
| `claude-reflect:correction-capture` | L3 | Correction capture | ❌ Fail | none of: .claude/reflections/, memory/feedback_, .github/ai-corrections.yml, scripts/capture-corrections.mjs |
| `claude-reflect:positive-reinforcement` | L3 | Positive reinforcement capture | ❌ Fail | none of: .claude/reflections/, memory/feedback_, docs/ai-reinforcement.md |
| `claude-reflect:preference-index` | L3 | Preference index | ❌ Fail | none of: .claude/preferences.json, memory/MEMORY.md, .github/agent-preferences.yml |
| `claude-reflect:session-summary` | L3 | Session summary artifact | ❌ Fail | none of: .claude/sessions/, docs/session-summaries/, memory/session_ |
| `fullsend:auto-merge-policy` | L3 | Auto-merge policy | ❌ Fail | none of: .github/auto-merge.yml, .prow.yaml, tide.yaml, .github/workflows/auto-merge.yml |
| `fullsend:branch-protection-doc` | L3 | Branch protection documentation | ❌ Fail | none of: docs/branch-protection.md, docs/governance.md, .github/branch-protection.yml |
| `fullsend:rollback-drill` | L3 | Rollback drill | ❌ Fail | none of: docs/rollback.md, .github/workflows/rollback.yml, scripts/rollback.sh |
| `acmm:ai-fix-workflow` | L4 | AI-fix-requested workflow | ❌ Fail | none of: .github/workflows/ai-fix.yml, .github/workflows/fix-requested.yml, .github/workflows/claude.yml |
| `acmm:auto-label` | L4 | Automated issue labeling | ❌ Fail | none of: .github/workflows/auto-label.yml, .github/labeler.yml, .github/workflows/triage.yml |
| `acmm:auto-qa-tuning` | L4 | Auto-QA self-tuning config | ❌ Fail | none of: .github/auto-qa-tuning.json, .github/qa-tuning.yml |
| `acmm:claude-md-auto-sync` | L4 | CLAUDE.md auto-sync | ❌ Fail | none of: .github/workflows/claude-md-sync.yml |
| `acmm:copilot-review-apply` | L4 | Automated review application | ❌ Fail | none of: .github/workflows/copilot-review-apply.yml, .github/workflows/ai-fix.yml, .github/workflows/auto-review.yml |
| `acmm:cross-repo-skills` | L4 | Cross-repository skill sharing | ❌ Fail | none of: .claude/settings.json |
| `acmm:cross-session-knowledge` | L4 | Cross-session knowledge sharing | ❌ Fail | none of: knowledge.jsonl, .knowledge/, docs/reflections/ |
| `acmm:feedback-loops` | L4 | Self-improving feedback loops | ❌ Fail | none of: CLAUDE.md |
| `acmm:github-coordination` | L4 | GitHub as coordination layer | ❌ Fail | none of: .github/workflows/ |
| `acmm:idempotent-workflows` | L4 | Idempotent and resumable workflows | ❌ Fail | none of: CLAUDE.md |
| `acmm:multi-perspective-review` | L4 | Multi-perspective review | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:nightly-compliance` | L4 | Nightly compliance scan | ❌ Fail | none of: .github/workflows/nightly-compliance.yml, .github/workflows/nightly.yml, .github/workflows/nightly-test.yml, .github/workflows/nightly-test-suite.yml |
| `acmm:preference-index` | L4 | Preference index | ❌ Fail | none of: preferences.json, .claude/preferences.json |
| `acmm:router-skills` | L4 | Router skills with decision trees | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:security-ai-md` | L4 | AI security policy | ❌ Fail | none of: SECURITY-AI.md, docs/security/SECURITY-AI.md, docs/SECURITY-AI.md |
| `acmm:session-continuity` | L4 | Session continuity | ❌ Fail | none of: .claude/checkpoint.md, .claude/session-summary.md |
| `acmm:structured-rca` | L4 | Structured RCA workflows | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:structured-workflows` | L4 | Structured workflow skills | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:task-ledger` | L4 | Task traceability ledger | ❌ Fail | none of: task-log.jsonl, .claude/task-log.jsonl |
| `acmm:tdd-workflows` | L4 | TDD workflows with environment routing | ❌ Fail | none of: .claude/skills/, .claude/commands/ |
| `acmm:tier-classifier` | L4 | Change classification policy | ❌ Fail | none of: .github/workflows/tier-classifier.yml, .github/workflows/pr-size.yml |
| `aef:audit-trail` | L4 | Audit trail workflow | ❌ Fail | none of: .github/workflows/ai-audit.yml, .github/workflows/agent-audit.yml, scripts/ai-audit-report.mjs |
| `aef:cross-tool-config` | L4 | Cross-tool agent config | ❌ Fail | none of: AGENTS.md, docs/ai-contributors.md, .github/ai-config.yml |
| `claude-reflect:claude-md-sync` | L4 | CLAUDE.md auto-sync | ❌ Fail | none of: .github/workflows/claude-md-sync.yml, scripts/sync-claude-md.mjs, scripts/update-claude-md.mjs |
| `claude-reflect:reflection-review` | L4 | Periodic reflection review | ❌ Fail | none of: .github/workflows/reflection-review.yml, scripts/review-reflections.mjs, docs/reflection-review.md |
| `fullsend:observability-runbook` | L4 | Observability runbook | ❌ Fail | none of: docs/runbook.md, docs/runbooks/, RUNBOOK.md, docs/operations/ |
| `fullsend:production-feedback` | L4 | Production feedback signal | ❌ Fail | none of: monitoring/, grafana/, .github/workflows/post-deploy-check.yml, scripts/production-feedback.mjs |
| `fullsend:risk-assessment` | L4 | Risk assessment config | ❌ Fail | none of: .github/risk-assessment.yml, docs/risk-tiers.md, .github/workflows/tier-classifier.yml |
| `acmm:audit-trail` | L5 | Audit trail workflow | ❌ Fail | none of: .github/workflows/audit-trail.yml, .github/workflows/ai-attribution.yml |
| `acmm:auto-qa-self-tuning` | L5 | Auto-QA with self-tuning | ❌ Fail | none of: .github/workflows/auto-qa.yml, .github/auto-qa-tuning.json |
| `acmm:github-actions-ai` | L5 | GitHub Actions AI integration | ❌ Fail | none of: .github/workflows/claude.yml, .github/workflows/claude-code-review.yml |
| `acmm:periodic-reflection` | L5 | Periodic reflection review | ❌ Fail | none of: .github/workflows/reflection-review.yml |
| `acmm:policy-as-code` | L5 | Policy as code | ❌ Fail | none of: .github/policies/, policy/, conftest.yaml, opa/ |
| `acmm:public-metrics` | L5 | Public metrics endpoint | ❌ Fail | none of: web/netlify/functions/analytics-accm.mts, web/public/analytics.js |
| `acmm:reflection-log` | L5 | Reflection log | ❌ Fail | none of: docs/reflections/, memory/, .memory/, REFLECTIONS.md |
| `acmm:auto-issue-gen` | L6 | Automated issue generation | ❌ Fail | none of: .github/workflows/auto-issue.yml, .github/workflows/issue-gen.yml, .github/workflows/auto-generate-issues.yml |
| `acmm:merge-queue` | L6 | Merge queue / auto-merge | ❌ Fail | none of: .github/workflows/merge-queue.yml, .prow.yaml, tide.yaml |
| `acmm:multi-agent-orchestration` | L6 | Multi-agent orchestration | ❌ Fail | none of: scripts/orchestrate.mjs, .github/workflows/orchestrate.yml, orchestrator/ |
| `acmm:observability-runbook` | L6 | Observability runbook | ❌ Fail | none of: docs/ai-ops-runbook.md, docs/runbook/, RUNBOOK.md |
| `acmm:production-feedback` | L6 | Production feedback signal | ❌ Fail | none of: .github/workflows/production-feedback.yml |
| `acmm:risk-assessment-config` | L6 | Risk assessment config | ❌ Fail | none of: risk-config.json, .claude/risk-config.json, .github/risk-assessment.yml |
| `acmm:rollback-drill` | L6 | Rollback drill | ❌ Fail | none of: docs/rollback-drill.md, docs/ai-ops-runbook.md |
| `acmm:strategic-dashboard` | L6 | Strategic dashboard | ❌ Fail | none of: web/src/components/acmm/, web/public/analytics.js, docs/autonomous-work-log.md |

