# Smarter Flywheel — Implementation Status

Tracking implementation of [PRD #1629](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/1629): Continuous Product Improvement Engine (7 modules).

## Module Status

| Module | Name                           | Status                                 | Implementing PR/Commit                                                                                                                                                                     |
| ------ | ------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1     | Sensor Correlator              | ✅ Merged                              | [#1640](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/1640) — `663ff43`                                                                                              |
| M2     | Threshold Auto-Tuner           | ✅ Merged (base) + 🔄 Open (extension) | [#1650](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/1650) — `1a58908`; extension [#1657](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/1657) |
| M3     | ACMM Substance Checkers        | ✅ Merged                              | [#1639](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/1639) — `d102f89`                                                                                              |
| M4     | Product Improvement Discoverer | ✅ Merged                              | [#1652](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/1652) — `aae6c4a`                                                                                              |
| M5     | Process Metrics Collector      | ✅ Merged                              | [#1638](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/1638) — `ca6f413`                                                                                              |
| M6     | Instruction Evolver            | 🔄 Open PR                             | [#1651](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/1651)                                                                                                          |
| M7     | ACMM Meta-Criteria             | 🔄 Open PR                             | [#1655](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/1655)                                                                                                          |

## What Was Built

### M1: Sensor Correlator

Groups signals from all 7 sensors by likely root cause (same timeframe + related metrics) before issue creation. Deduplicates against open issues across sensor boundaries. Output: `{ rootCause, signals[], severity, suggestedLabel }`.

### M2: Threshold Auto-Tuner

Base: `scripts/threshold-tuner.mjs` — pure-function module with 3 decision rules (FP >30% → loosen 5%, effectiveness <50% → tighten 5%, FP <10% + effectiveness >80% → tighten 3%). Guard rails: max 10%/week change, hard floor 0.1, ceiling 2.0. Logs to `metrics/threshold-changes.jsonl`.

Extension PR #1657: Wires tuner into `scripts/verify-fixes.mjs` so verification results directly feed back into `.github/auto-qa-tuning.json` (closes the advisory-only gap).

### M3: ACMM Substance Checkers

Extends `plugins/acmm/scripts/audit.js` with two-tier validation: Tier 1 (file presence) must pass before Tier 2 (substance) runs. Checks reflections for `feeds_back_into:` frontmatter + >50 char body, feedback loops for log entries within 30 days, skills for non-stub content. Reports "present" vs "present and substantive". Expected to lower current score temporarily — correct behavior.

### M4: Product Improvement Discoverer

New learning-loop phase, runs only when regression queue empty. 4-strategy weekly rotation (perf → a11y → design consistency → test gap analysis). Every-run checks: Sentry warnings trending up, outdated deps. Max 2 improvement issues per run, labeled `improvement,ready`. Priority waterfall enforced.

### M5: Process Metrics Collector

Writes `metrics/process-metrics.jsonl` with: `time_to_fix_hours`, `cost_per_fix_usd`, `agent_success_rate`, `fp_rate`, `improvements_shipped`. Weekly aggregation into `metrics/process-metrics-weekly.json`.

### M6: Instruction Evolver (PR #1651)

Friday-only learning step in `scripts/instruction-evolver.mjs`. Pattern detection at 3+ occurrences. Risk classification: low-risk (gotchas, threshold notes) → auto-commit; high-risk (skill/policy changes) → review-gated issue. Logs to `metrics/instruction-changes.jsonl`.

### M7: ACMM Meta-Criteria (PR #1655)

`plugins/acmm/scripts/meta-criteria.js` — 5 L6 criteria: `meta-threshold-tuning`, `meta-instruction-evolution`, `meta-process-metrics`, `meta-fp-rate`, `meta-product-improvements`. Integrated as new `meta` source in ACMM scanner.

## Rollout Order

Followed PRD guidance: M5 (read-only data) → M3 (detection-only) → M1 (detection-only) → M4 (state-creating) → M2 (state-modifying) → M6/M7 (meta-learning, depends on M2/M5 data).

## Key Files

| File                                    | Module | Purpose                          |
| --------------------------------------- | ------ | -------------------------------- |
| `scripts/threshold-tuner.mjs`           | M2     | Threshold adjustment logic       |
| `scripts/verify-fixes.mjs`              | M2 ext | Wires tuner into verification    |
| `metrics/threshold-changes.jsonl`       | M2     | Audit log of threshold changes   |
| `metrics/process-metrics.jsonl`         | M5     | Per-run process metrics          |
| `metrics/process-metrics-weekly.json`   | M5     | Weekly trend aggregation         |
| `metrics/instruction-changes.jsonl`     | M6     | Auto-commit audit trail          |
| `plugins/acmm/scripts/audit.js`         | M3     | Extended with substance checkers |
| `plugins/acmm/scripts/meta-criteria.js` | M7     | 5 self-improvement L6 criteria   |
| `scripts/instruction-evolver.mjs`       | M6     | Friday pattern extraction        |

## Guard Rails (Load-Bearing)

- Threshold changes capped 10%/week per sensor
- Threshold hard floor: 0.1 (sensor never disabled)
- Max 2 improvement issues per learning-loop run
- Priority waterfall: security > regressions > ACMM gaps > improvements > process improvements
- High-risk instruction updates require human review (filed as issues, not auto-committed)
