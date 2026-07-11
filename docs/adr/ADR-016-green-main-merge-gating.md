---
id: ADR-016
title: Green-Main Merge-Gating Policy
status: active
date: 2026-06-30
---

# ADR-016: Green-Main Merge-Gating Policy

## Context

`main` is the deploy branch and the base every agent and contributor branches from. If `main` breaks, every open PR inherits the failure, autonomous agents waste cycles diagnosing unrelated red CI, and deploys are blocked. The project runs a large volume of agent-authored PRs through an autonomous merge train, so the merge gate must be unambiguous: a machine (and a human) must be able to decide "is this mergeable?" from a single authoritative signal, not a subjective read of a mixed check rollup.

We also run advisory checks (patch-coverage delta, an environment-sensitive E2E suite) that are valuable as signal but too flaky or too partial to block every merge.

## Decision

**`main` must always be green, and `CI Gate` is the single required status check.**

### Required vs advisory checks

- **`CI Gate`** is the only _required_ status check on `main`. It aggregates the authoritative jobs (build, test, lint, typecheck, Integrity, Architecture-Audit).
- **`codecov/patch`** (patch-coverage delta) and **`Hospitality E2E`** (auth/booking-widget specs) are **advisory** — they surface signal but do not block merge. E2E is frequently red for environmental/auth-bypass reasons unrelated to the change under review.
- Merge decisions gate on `CI Gate` + the underlying build/test/lint/typecheck/Integrity/Architecture-Audit jobs, **not** on an all-green rollup. Required contexts are verified via `gh api repos/.../branches/main/protection/required_status_checks`.

### CI critical-path composition

The per-PR critical path (create → merge) is kept lean so the merge-blocking jobs win Actions runner concurrency:

- **One coverage-producing test pass.** The `test` job (in `ci.yml`) runs the suite **at most once per required Node version**. The repo-wide statement-coverage floor is enforced inside that job's Node-22 leg; the former standalone `coverage-gate.yml` — which re-ran the entire suite a third time per PR — is **removed**.
- **One coverage threshold, one source.** The repo-wide floor is a single number (**60%**) defined once as the `test` job's `COVERAGE_THRESHOLD` env and enforced there — a failing threshold fails the job (and therefore `CI Gate`), exactly as before. `packages/agent-core` keeps a deliberately **stricter, package-specific 80% gate**; it is a separate rule, not a competing repo-wide number.
- **PR Node matrix.** Pull requests run tests on **Node 22 only**; `push` to `main`, `merge_group`, and any scheduled/nightly run exercise **Node 20 and 22**. Node 20 compatibility signal is retained but moved off the PR critical path (the matrix resolves via `fromJSON(github.event_name == 'pull_request' && '[22]' || '[20,22]')`).
- **Advisory workflows are off the required path.** Heavy or environment-sensitive workflows — Hospitality E2E, Rialto and rialto-web visual regression, Storybook deploy, Lighthouse, and load-test — are **path-gated** (they run only when their relevant paths change) or **schedule-only** (Lighthouse, load-test). None are aggregated into `CI Gate`, so they never queue the merge-blocking jobs behind them.

### Branch protection

- `main` is **`strict`**: a branch must be up-to-date with `main` before it can merge (forces rebase/update-branch when `main` advances).
- **No admin-merge through red checks.** A failing required check blocks merge for everyone, including maintainers.

### Recovery

- If `main` breaks, fixing it is the **top priority** and preempts feature work.
- **Emergency revert is the only exception** to the no-red-merge rule — reverting a bad commit to restore green may bypass the normal queue.

## Consequences

**Benefits:**

- A single required signal (`CI Gate`) makes mergeability decidable by the autonomous merge train without heuristics over a noisy rollup.
- Keeping `main` green protects every open branch from inheriting unrelated failures.
- Advisory checks retain their diagnostic value without holding the queue hostage to flaky environments.
- Deduping the triple test run and dropping Node 20 from PRs shortens the per-PR critical path and frees runner concurrency for the merge-blocking jobs, so `CI Gate` resolves sooner.
- A single coverage threshold from one source removes the risk of two competing repo-wide numbers drifting apart.

**Trade-offs:**

- `strict` mode means a busy `main` forces frequent update-branch/rebase cycles on open PRs; this is accepted as the cost of never merging against a stale base.
- Advisory-but-visible checks can be misread as "blocking"; the policy must be documented so agents do not wait on `Hospitality E2E` or `codecov/patch`.
- Concentrating the gate in one aggregate job means a misconfiguration of `CI Gate` itself is high-impact — its composition is version-controlled and reviewed.
- Node 20 regressions now surface on `main`/nightly rather than per-PR; accepted because full Node 20 coverage is retained off the critical path and the incremental risk of a change passing on Node 22 but failing only on Node 20 is low.
- Folding coverage enforcement into the required `test` job means a coverage-tooling failure fails `CI Gate` directly (the retired standalone gate was advisory-by-omission). This is intended — coverage is meant to block — and the enforcement step is kept minimal and self-contained to limit its blast radius.

## Alternatives Considered

### Require every check (all-green rollup)

Rejected because environment-sensitive suites (E2E) and delta metrics (patch coverage) would block unrelated merges on flaky or partial signals, stalling the autonomous queue.

### No required checks (trust review)

Rejected because the volume of agent-authored PRs makes human review-per-merge infeasible, and it provides no machine-decidable gate for the merge train.

### Allow admin override through red

Rejected because it erodes the green-main invariant — once red merges are normalized, `main` breakage becomes routine and every downstream branch pays for it.

### Non-strict branch protection (merge against stale base)

Rejected because merging a branch that passed CI against an old `main` can still break `main` post-merge (e.g. a lockfile or generated-artifact desync); `strict` forces revalidation against current `main`.
