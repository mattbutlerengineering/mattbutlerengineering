# Reviewer Contract — multi-agent quality gate

## Rationale

Each `/implement-queue` worker runs TDD, gates, and verification inside its
own worktree before opening a PR. However, these guards are self-contained —
the worker checks its own output against the same bias that produced it. A
**Reviewer sub-agent** provides an independent second opinion, catching:

- **Hallucinations** — code that works in isolation but doesn't match the task
- **Regressions** — tests removed or behaviour changed without justification
- **Gate bypass** — lint/typecheck/test results that were misinterpreted
- **Criteria gaps** — acceptance criteria the worker addressed poorly or skipped

## Input schema (`ReviewInput`)

Defined in `packages/agent-core/src/reviewer-contract.ts` — type `ReviewInput`.

| Field                | Type       | Description                                  |
| -------------------- | ---------- | -------------------------------------------- |
| `diff`               | `string`   | Full git diff from the worker's commit(s)    |
| `verificationOutput` | `string`   | Trimmed stdout+stderr of lint/typecheck/test |
| `taskDescription`    | `string`   | The original task driving the worker session |
| `acceptanceCriteria` | `string[]` | Structured AC extracted from the issue body  |
| `changedFiles`       | `string[]` | Files touched by the diff                    |
| `commitMessage`      | `string`   | The worker's commit message                  |

## Output schema (`ReviewVerdict`)

Defined in `packages/agent-core/src/reviewer-contract.ts` — type `ReviewVerdict`.

| Field        | Type            | Description                                          |
| ------------ | --------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| `verdict`    | `"pass"         | "flag"`                                              | Pass = proceed to PR; flag = block and handle per policy |
| `score`      | `number` (0–10) | Numeric quality score (see rubric below)             |
| `issues`     | `ReviewIssue[]` | Specific issues found (empty on pass)                |
| `strengths`  | `string?`       | Optional positive feedback for reward-model training |
| `assessment` | `string`        | Free-text qualitative assessment                     |
| `reviewedAt` | `string`        | ISO-8601 timestamp                                   |

Each `ReviewIssue` has:

| Field         | Type                  | Description                            |
| ------------- | --------------------- | -------------------------------------- | ---------- | ------------ | -------------- | ---------- | -------- | ---------- | -------- |
| `category`    | `ReviewIssueCategory` | `hallucination                         | regression | test_failure | lint_violation | type_error | security | incomplete | quality` |
| `description` | `string`              | Concise problem description            |
| `filePath`    | `string?`             | File path where the issue manifests    |
| `lineNumber`  | `number?`             | Line number of the issue               |
| `suggestion`  | `string?`             | Optional fix suggestion (code or text) |

## Scoring rubric (0–10)

Scores ≥ **7** constitute a passing grade. Scores ≤ **6** produce a `"flag"` verdict.

| Score | Label      | Criteria                                                              |
| ----- | ---------- | --------------------------------------------------------------------- |
| 9–10  | Excellent  | All AC met, no defects, clean code, tests pass, no regressions        |
| 7–8   | Good       | All AC met, minor nits (style, naming), no blocking issues            |
| 5–6   | Acceptable | All AC met but has non-trivial issues (messy code, missing edge case) |
| 3–4   | Poor       | Some AC missed or broken; requires rework before merging              |
| 0–2   | Failing    | Major problems: hallucinations, regressions, security, or no tests    |

### Scoring guidelines for the Reviewer

- **Start at 10 and deduct** rather than building up from zero.
- **One major defect** (hallucination, regression, security) → max 4.
- **One minor defect** (lint violation, missing edge case) → max 8.
- **Missing AC** → score based on proportion met (e.g. 3 of 5 AC → max 6).
- **All tests passing + no lint/type errors** → floor of 5 even with quality nits.

## Dispatch model

```
implement-queue (phase 3: merge train)
  │
  ├─ 1. For each green PR (skipped for low-risk PRs per isLowRiskPR)
  │
  ├─ 2. Build ReviewInput from worker output
  │
  ├─ 3. Dispatch Reviewer sub-agent (subagent_type: "reviewer", isolation: "none")
  │     with content: the contract doc + the ReviewInput
  │     Model tier: haiku (fast, cheap) — sonnet for security-critical changes
  │     Budget: $0.05 per review
  │
  ├─ 4. Await verdict (≤30s timeout, fail-open on timeout → pass)
  │
  ├─ 5. Decision:
  │   ├─ pass  → proceed to gh pr merge
  │   ├─ flag  → apply Retry Policy (below)
  │   └─ timeout/error → log warning, proceed (fail-open)
```

### When the Reviewer runs

The Reviewer runs in **Phase 3 (merge train)** of the implement-queue,
**after** CI is green and **before** `gh pr merge`. This catches issues
that CI cannot (semantic regressions, hallucinated behaviour, skipped
acceptance criteria).

Review is **skipped** for low-risk PRs (tests-only, docs, config, deps)
as defined by `isLowRiskPR()` in `pr-risk-classifier.ts`.

### Reviewer agent constraints

- **Read-only:** the Reviewer never edits files, branches, or issues.
- **Isolation:** `isolation: "none"` — no worktree needed, it only reads text.
- **Timeout:** 30 seconds. A slow Reviewer does not block the merge train.
- **Fail-open:** timeout or LLM error → log warning, proceed to merge.
  False negatives (missed issues) are better than false positives (stuck train).

## Retry policy

When verdict is `"flag"`:

| Retry count | Action                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------- |
| 0           | **Retry** — send work back to a new worker session with the Reviewer's issues as additional context. Re-run TDD.    |
| 1           | **File issue** — label the linked issue `needs-review`, add a comment with the Reviewer output, and skip the merge. |
| ≥2          | **Skip** — label `stealable` and move on. Three flags on one issue suggest a fundamental problem.                   |

### Configuration (`ReviewRetryPolicy`)

```typescript
interface ReviewRetryPolicy {
  maxRetries: number; // Default: 1
  actions: ReviewRetryAction[]; // Default: ["retry", "file_issue"]
}
```

The `actions` array is indexed by retry count. Beyond the array length,
the last action repeats. Overridable per-issue by setting `review-policy:`
in the issue's YAML frontmatter.

### Retry flow detail

1. implement-queue receives `"flag"` verdict.
2. If `retryCount < maxRetries`:
   - Label issue `review-retry-<N>`.
   - Create a new feedback prompt: "Reviewer flagged your previous output:
     <issues>. Please fix and re-run TDD."
   - Dispatch a new worker session in the same branch with `--no-pr` (to
     avoid duplicate PRs).
   - Worker fixes → verification → re-review → loop.
3. If `retryCount >= maxRetries`:
   - Apply the last action in the policy (default: file issue).
   - Remove `in-progress`, add `needs-review`/`stealable`.
   - Continue to the next PR in the merge train.

## Integration points

### implement-queue SKILL.md

The relevant section is **Phase 3: Serial Merge Train** (lines 94–116).
The existing "Diff-matched review gate" step already dispatches
specialized reviewers (`migration-reviewer`, `adr-compliance-reviewer`,
etc.). The general-purpose Reviewer sub-agent described in this contract
runs **before** those specialized reviewers, as a universal gate.

### Future: `@mbe/agent-core` runtime

Once runtime wiring is built, the `GateRunner` in `gate-runner.ts` should
grow a `ReviewerGate` implementation that wraps the Reviewer sub-agent
dispatch, producing a `GateResult` compatible with the existing gate
pipeline (like `LlmEvaluationGate`).

## Testing the contract

- Unit tests for `ReviewInput` and `ReviewVerdict` type construction
  (compile-time checks).
- Integration tests that simulate a Reviewer sub-agent call with mock
  worker output and verify the verdict/score/issue mapping.
- Tests for retry policy logic (action selection by retry count, boundary
  conditions at `maxRetries`).
- Test files: `packages/agent-core/src/__tests__/reviewer-contract.test.ts`
