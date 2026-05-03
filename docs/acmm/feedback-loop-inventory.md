# Feedback Loop Inventory

Catalog of all feedback loops in this repository, following the ACMM (AI Codebase Maturity Model) framework.

> **Why this document exists:** The ACMM paper (arXiv:2604.09388v2, Table 2) defines maturity as feedback loop topology -- what loops exist, at what frequency, and whether they actually run. This inventory makes that topology explicit and auditable.

## Active Loops

| Loop | ACMM Level | Frequency | Trigger | Status | Last Verified |
|------|-----------|-----------|---------|--------|---------------|
| CLAUDE.md / AGENTS.md instructions | L2 | Every session | Session start | Active | 2026-05-02 |
| Pre-commit hooks (lint-staged, ADR check, gitleaks, semgrep) | L3 | Every commit | `git commit` | Active | 2026-05-02 |
| CI pipeline (lint, typecheck, test, architecture audit) | L3 | Every push | GitHub Actions `ci.yml` on push/PR | Active | 2026-05-02 |
| Coverage gate | L3 | Every PR | GitHub Actions `coverage-gate.yml` | Active | 2026-05-02 |
| CodeQL / secret scan | L3 | Every push | GitHub Actions `secret-scan.yml` | Active | 2026-05-02 |
| Site audit (deep) | L3 | Weekly Mon 8:23am PT | RemoteTrigger `mbe-deep-audit` | Active | 2026-05-02 |
| Site audit (light) | L3 | Daily Tue-Sun 9:41am PT | RemoteTrigger `mbe-light-audit` | Active | 2026-05-02 |
| Lighthouse performance audit | L3 | Every PR / scheduled | GitHub Actions `lighthouse.yml` | Active | 2026-05-02 |
| Nightly compliance scan | L4 | Nightly | GitHub Actions `nightly-compliance.yml` | Active | 2026-05-02 |
| Issue worker | L4 | Every 2h | RemoteTrigger `mbe-issue-worker` | Active | 2026-05-02 |
| ACMM audit | L4 | Daily 10:00am PT | RemoteTrigger `mbe-acmm-audit` | Active | 2026-05-02 |
| Progress tracker | L4 | Daily 5:11pm PT | RemoteTrigger `mbe-progress-tracker` | Active | 2026-05-02 |
| Auto-label (issue triage) | L4 | On issue creation | GitHub Actions `auto-label.yml` | Active | 2026-05-02 |
| Tier classifier (PR risk routing) | L4 | On PR | GitHub Actions `tier-classifier.yml` | Active | 2026-05-02 |
| Dependabot auto-merge (dev deps) | L4 | On PR | GitHub Actions `dependabot-auto-merge.yml` | Active | 2026-05-02 |
| CLAUDE.md auto-sync | L4 | Scheduled | GitHub Actions `claude-md-sync.yml` | Active | 2026-05-02 |
| Circuit breaker (self-tuning) | L4 | On failure | GitHub Actions `circuit-breaker.yml` | Active | 2026-05-02 |
| Auto-QA tuning | L4 | Weekly (planned) | Planned workflow | Planned | 2026-05-02 |
| Learning loop (sensor -> triage -> verify) | L5 | Daily 11:00am PT | RemoteTrigger `mbe-learning-loop` | Active | 2026-05-02 |
| AI attribution (audit trail) | L5 | On PR | GitHub Actions `ai-attribution.yml` | Active | 2026-05-02 |
| Reflection review | L5 | Scheduled | GitHub Actions `reflection-review.yml` | Active | 2026-05-02 |
| Production feedback signal | L6 | On failure | GitHub Actions `production-feedback.yml` | Active | 2026-05-02 |
| Auto-rollback on deploy failure | L6 | On failure | GitHub Actions `auto-rollback.yml` | Active | 2026-05-02 |
| Auto-issue generation | L6 | Scheduled | GitHub Actions `auto-issue.yml` | Active | 2026-05-02 |
| Merge queue | L6 | On PR approval | GitHub Actions `merge-queue.yml` | Active | 2026-05-02 |

## Loop Topology by ACMM Level

### L2 -- Instructed
Agent reads instructions at session start and follows conventions.
- `CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`
- Prompt catalog in `.github/prompts/`
- Skills in `.claude/skills/`

### L3 -- Measured / Enforced
Commits and pushes trigger automated quality checks that block bad code.
- Pre-commit: lint-staged, ADR check, gitleaks, semgrep
- CI: lint, typecheck, test, architecture audit, coverage gate
- Site audits: Playwright crawl + Lighthouse scoring

### L4 -- Adaptive / Structured
Scheduled agents find issues, implement fixes, create PRs, and self-tune thresholds.
- Issue worker picks up `ready`-labeled issues every 2h
- ACMM audit scores the repo daily and files gap issues
- Progress tracker logs metrics and adjusts circuit breaker
- Nightly compliance catches drift between PRs

### L5 -- Semi-Automated
Sensor data drives regression detection, automatic issue creation, and verification.
- Learning loop collects metrics from all sensors, detects regressions, creates issues, verifies past fixes
- AI attribution labels agent-authored PRs for audit
- Reflection review surfaces learnings for human pruning

### L6 -- Autonomous
Failed deploys auto-rollback, production regressions trigger fix loops, system generates its own work.
- Production feedback creates issues from error spikes
- Auto-rollback reverts regressions without human initiation
- Auto-issue generation scans for TODOs, stale deps, failing tests
- Merge queue batches and merges verified PRs

## How to Update This Inventory

1. When adding a new feedback loop (workflow, RemoteTrigger, hook, or skill), add a row to the table above.
2. Set the ACMM level based on the loop's autonomy (L3 = blocks bad code, L4 = takes action, L5 = proposes fixes, L6 = acts autonomously).
3. Update the "Last Verified" date when you confirm the loop is still operational.
4. The ACMM audit criterion `acmm:feedback-loop-inventory` checks for this file's existence.
