---
stage: verify
run: feature:ci-test-matrix-split
date: 2026-10-14
---

# Verification: Test matrix legs + `test-coverage-gate`

## SC-3 forced full run

Cache bust: a temporary one-line comment appended to `eslint.config.js` (a
turbo `globalDependencies` entry), reverted in the same PR. Run
[38688786065](https://github.com/mattbutlerengineering/mattbutlerengineering/actions/runs/38688786065)
on head `d0f7fdda4`, `pull_request` event, conclusion `success`. Typecheck
reported `0 cached, 52 total`; each leg's `test:coverage` tasks were cache
misses (hits in the leg logs are `^build`/`db:generate` dependencies only).

Baseline: run
[38650413196](https://github.com/mattbutlerengineering/mattbutlerengineering/actions/runs/38650413196)
on main (the cold run cited in #6664), single `Test (Node 22)` job.

| Job                            | Wall-clock (job start to end) |
| ------------------------------ | ----------------------------- |
| main baseline `Test (Node 22)` | 14m49s                        |
| `Test (Node 22, reservations)` | 5m16s                         |
| `Test (Node 22, rest)`         | 4m50s                         |
| `Test (Node 22, hospitality)`  | 2m54s                         |
| `Test (Node 22, rialto)`       | 2m14s                         |
| `Test Coverage Gate`           | 15s                           |

Longest leg 5m16s, within the ~7m bound. Legs start 1-2 minutes apart because
of runner queueing, not work; the gate ended 8m33s after the first leg began.

| Metric                | main baseline       | split run           |
| --------------------- | ------------------- | ------------------- |
| repo-wide statements  | 86% (31817 / 36725) | 86% (31936 / 36914) |
| agent-core statements | 95% (2693 / 2826)   | 95% (2693 / 2826)   |

Equal after integer rounding. The statement totals differ by 119 / 189
because the baseline commit and this branch's base differ (other merged work
between them); agent-core, which neither touches, is identical.

## Other gates

- `ci-test-shards.test.mjs`: RED against single-job `ci.yml` (10 of 12
  failing), GREEN after the split.
- `ci-lint-critical-path`, `ci-test-results-glob`, `ci-coverage-upload-paths`
  (now reads the gate job), `ci-node-matrix`, `nightly-compliance-workflow`,
  `check-ci-gate-coverage`: green.
- `CI Gate` succeeded on the measured run with `test-coverage-gate` in its
  `needs`.
