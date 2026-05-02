# Accessibility Regression Checks for AI-Generated UI Code

## Problem

AI-generated UI components can inadvertently introduce accessibility regressions: missing ARIA attributes, insufficient color contrast, broken keyboard navigation, or incorrect semantic structure. These issues are subtle enough to pass visual review but create real barriers for users relying on assistive technology.

Agent-authored PRs are particularly susceptible because the model optimizes for functional correctness and may deprioritize a11y patterns it was not explicitly instructed to follow.

## Existing Safeguards

Rialto already has strong per-component a11y coverage:

| Layer | What it checks | Location |
|-------|---------------|----------|
| axe-core per-component tests | ARIA violations, role misuse, keyboard traps, heading order | `packages/rialto/src/test/accessibility/*.accessibility.test.tsx` (7 test files) |
| Token contrast tests | WCAG AA contrast ratios for text-on-surface and UI-on-surface token pairs | `packages/rialto/src/test/token-contrast.test.ts` |
| Component authoring rules | Focus management, semantic headings, reduced motion | `packages/rialto/CLAUDE.md` |

These tests run on every PR and catch most regressions regardless of author.

## Gap

While axe-core tests catch violations, there is no mechanism to:

1. **Track a11y violations by author type** (agent vs. human) to identify whether AI-generated code introduces regressions at a higher rate.
2. **Gate agent-specific branches** with targeted a11y test runs, ensuring the accessibility suite is always included when an agent modifies UI code.
3. **Trend a11y health over time** correlated with the ratio of agent-authored changes.

Without this tracking dimension, recurring agent-introduced a11y patterns go unnoticed because they are corrected ad hoc rather than addressed systemically.

## Proposed Enhancement

### CI check for agent branches

Add a CI step that detects agent-authored branches (prefix `agent-*` or `worktree-agent-*`) and ensures the Rialto accessibility test suite runs as a required check:

```yaml
# In .github/workflows/build-deploy.yml or a dedicated a11y workflow
- name: Run a11y checks on agent branches
  if: startsWith(github.head_ref, 'agent-') || startsWith(github.head_ref, 'worktree-agent-') || startsWith(github.head_ref, 'acmm/')
  run: pnpm --dir packages/rialto vitest run --reporter=json --outputFile=a11y-results.json src/test/accessibility src/test/token-contrast.test.ts
```

### Violation attribution

When a11y tests fail on an agent branch, the CI output should include:
- Which component(s) failed
- The specific axe rule ID violated
- The branch name and PR author for attribution tracking

### Trending dashboard integration

Feed a11y test results into the existing quality dashboard (`web/public/analytics.js`) with a new dimension:
- Total a11y violations per PR, segmented by author type
- Week-over-week trend of agent-introduced violations
- Most common violation categories from agent PRs

## Implementation Approach

1. **Phase 1 (current):** Document the gap and establish the criterion. Existing axe-core tests already provide coverage; this phase adds awareness.
2. **Phase 2:** Add a CI step that runs `pnpm --dir packages/rialto test` focusing on accessibility test files when the PR branch matches agent naming patterns.
3. **Phase 3:** Add JSON reporter output to persist test results as artifacts, enabling downstream aggregation.
4. **Phase 4:** Integrate violation counts into the progress tracker and quality dashboard for trend analysis.

## Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| Agent a11y violation rate | % of agent PRs with a11y test failures | < 5% |
| Human a11y violation rate | % of human PRs with a11y test failures (baseline) | Measured |
| Agent vs. human ratio | Relative violation rate | < 1.5x |
| Top violation categories | Most common axe rule IDs from agent PRs | Tracked |
| Trend slope | Week-over-week change in agent violation count | Decreasing |

## Current Status

Existing axe-core tests across 7 accessibility test files and the token contrast test provide comprehensive per-component coverage. All components must pass `toHaveNoViolations()` before merge. This document adds the agent-specific tracking dimension as an ACMM Level 5 governance criterion, recognizing that the next step is attribution-aware CI gating rather than additional test coverage.
