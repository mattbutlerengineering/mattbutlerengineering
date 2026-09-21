---
date: 2026-08-29
session: learning-loop-sensor-triage
trigger: The ciHealth sensor filed three false-positive ci-fix regressions in 13 days, including a 40-point "pass-rate regression" whose own payload reported `failed: 0`
correction: Compute the rate as passed / (passed + failed), excluding skipped and cancelled from the denominator entirely, and scope the workflow-run query to the branch the metric claims to describe
root_cause: "Two independent defects in the same sensor. (a) The run query was repo-wide instead of `--branch main`, so every failure on an open Dependabot PR branch counted against main's pass rate while main was green the whole time. (b) pass_rate_pct was passed / completed, and `completed` folded in skipped (Auto-Rollback and Revert Watchdog both skip by design when their trigger condition is not met) and cancelled (concurrency-superseded reruns) alongside genuine failures, so a batch of steady-state no-ops could swing a 30-run window hard."
prevention: "Fast triage check that short-circuits this whole class: a large negative rate delta alongside `failed: 0` in the same payload is definitionally not a rate regression — a real one needs failed > 0 for the metric it claims dropped on. Check that field before opening or triaging a ci-fix issue off a rate sensor. Skipped and cancelled runs are common in this repo's steady state, never rare edge cases the denominator can safely ignore."
feeds_back_into: .claude/rules/gotchas.md#ci
---

## Summary

This is not a ciHealth-specific bug. Any sensor built the same way — an unscoped branch query, raw run and conclusion counts used directly as a denominator — will rediscover both traps independently. Check for the pattern before trusting any new rate-based sensor.

The three false positives were #4333 (2026-08-17, 86% to 67%), #4538 (2026-08-24, 86% to 71%, root cause (a)), and #4685 (2026-08-29, 75% to 35%, root cause (b)). The fix landed in #4687.

What makes this class expensive is that the output is plausible. A sensor reporting a pass-rate drop looks exactly like a sensor doing its job, so the failure mode is not a crash or an obviously wrong number — it is a confident, well-formatted, actionable-looking issue that sends someone to investigate a regression that never happened. Three times. The `failed: 0` cross-check is cheap and should be reflexive.
