# ACMM Improvement Tasks

These tasks are derived from the ACMM audit performed on 2026-05-05. The codebase is currently Level 6 (Fully Autonomous) by detection markers, but "soft" behavioral metrics and evaluation scores indicate areas for improvement.

## 🔴 High Priority: Agent Evaluation & Pipeline Fixes
Goal: Achieve >80% pass rate on frozen task fixtures and ensure infrastructure is robust.

- [x] **Audit existing issues**: Created #1067, #1068, #1069, #1070, #1071, #1072.
- [ ] **Adjust Task Parameters**: Update `plugins/acmm/scripts/evals/tasks/*.json` to increase `maxBudgetUsd` and `maxTurns`.
  - Current failures are mostly due to hitting $0.10-$0.15 budgets or 8-12 turn limits.
- [ ] **Fix Evaluation Infrastructure**: Ensure `plugins/acmm/scripts/evals/run.js` can correctly invoke the agent and parse results.
- [ ] **Address Rate Limiting**: Implement retries or pacing in the eval runner to handle "You've hit your limit" errors from Claude.
- [ ] **Expand Eval Tasks**: Add 3-5 more complex tasks to the eval suite that involve multi-file changes or architectural adherence.

## 🟡 Medium Priority: Behavioral & Implementation Gaps
Goal: Reduce human intervention and bridge the gap between "Skeleton" and "Functional" systems.

- [x] **Analyze Human-Touch Ratio**: Investigate why 100% of agent-authored PRs have non-author (human) commits (#1068).
  - **Findings**: Human interventions were primarily for: 1) Residual conflict markers, 2) Missing imports, 3) Stale generated files (schemas/dep-graph), 4) Dockerfile dependency omissions.
  - **Action**: Updated `AGENTS.md` and `CLAUDE.md` with a mandatory "Zero-Touch Audit" checklist.
- [ ] **Implement AI Service Fallback**: Build the circuit breaker and notification system (#1071).
- [ ] **Accessibility Gating**: Implement Phase 2-4 of the a11y regression check for agent branches (#1070).
- [ ] **Automate Auto-QA Tuning**: Schedule or trigger `node plugins/acmm/scripts/auto-qa-tune.js` periodically (#1069).

## 🟢 Low Priority: Documentation & Traceability
Goal: Improve the quality of "detected" markers and audit skeletons.

- [ ] **Verify "Detected" Items**: Perform a manual check of items marked "Detected" in the ACMM report to ensure they aren't just empty files or placeholders (#1072).
- [ ] **Public Metrics Dashboard**: Ensure the strategic dashboard (`web/src/components/acmm/`) is up-to-date and reflects the latest evaluation scores.
- [ ] **Update AGENTS.md**: Synchronize findings from these tasks back into the global agent instructions.
