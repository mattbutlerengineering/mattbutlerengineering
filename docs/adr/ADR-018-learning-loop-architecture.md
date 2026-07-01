---
id: ADR-018
title: Continuous-Improvement / Learning-Loop Architecture
status: active
date: 2026-06-30
---

# ADR-018: Continuous-Improvement / Learning-Loop Architecture

## Context

The project maintains and extends itself with autonomous agents — auditing the live site, fixing CI, implementing backlog issues, and triaging production errors. For that autonomy to compound rather than drift, it needs a closed feedback loop: measure the system, detect regressions, turn them into actionable work, verify that past fixes held, and adjust the thresholds that decide what counts as a regression. Without a recorded architecture, this behavior is spread across skills and scheduled triggers and reads as tribal knowledge.

## Decision

The platform runs a **sensor-driven learning loop** coordinated through a **label-based state machine**, operable in **two modes**.

### The sensor cycle

1. **Collect** — sensors emit metrics (CI health, cost/token spend, deploy health, coverage, antipattern counts, production errors).
2. **Detect** — metrics are compared against thresholds to find regressions.
3. **File** — regressions become GitHub issues labeled for agent pickup.
4. **Verify** — past fixes are re-checked against current metrics before their issues are considered resolved (source-of-truth checks are re-run live rather than trusting earlier summaries).
5. **Self-tune** — thresholds adjust based on observed variance to reduce false positives, with a circuit breaker that halts the loop after repeated failures.

### Two operating modes

- **Scheduled (conservative)** — RemoteTriggers on the hosted scheduler run maintenance agents on a cadence; they push **PRs for review** rather than auto-merging. Best for unattended background maintenance.
- **Implement Queue (aggressive)** — a local `/loop <interval> /implement-queue` drains the `ready` backlog with parallel worktree agents and **auto-merges green PRs** through a serial merge train. Best for active development sprints.

Both modes feed and drain the same issue tracker; discovery skills (site-audit, sentry-triage, ci-monitor, learning-loop) _feed_ the queue, and implement-queue _drains_ it.

### Coordination state machine (labels)

Work moves through GitHub labels as a state machine: `ready` → `in-progress` → `has-pr`, with `agent-failed` / `stealable` for exhausted retries, and category labels (`ci-fix`, `audit`, `feature`, `sensor`, `acmm`) recording provenance. The label set is the single coordination surface shared by humans and every agent.

## Consequences

**Benefits:**

- Improvement compounds: regressions are caught, filed, fixed, and _verified_, closing the loop instead of just raising alerts.
- The two modes let the same machinery run safely unattended (PRs for review) or aggressively during sprints (auto-merge), without a separate codebase.
- A label state machine gives humans and agents one shared, inspectable coordination surface.

**Trade-offs:**

- Self-tuning thresholds can mask a slow real regression if variance widens; the circuit breaker and human-reviewed scheduled PRs are the backstops.
- Autonomy is bounded by a run/cost ceiling; the schedule is weighted to peak availability rather than run continuously.
- Sensors detect only what they measure — a blind spot (e.g. no per-test history) yields no signal, so sensor coverage itself must be audited (an ACMM concern).

## Alternatives Considered

### Human-only maintenance (no autonomous loop)

Rejected because the maintenance surface (site audits, CI fixes, error triage, backlog) exceeds a single maintainer's throughput; the loop exists to absorb the routine, reviewable work.

### Alerting without closing the loop

Rejected because raising issues without a verify step lets "fixed" regressions silently recur; verification against live metrics is what makes the loop trustworthy.

### A single always-on aggressive mode

Rejected because unattended auto-merge is unsafe for background maintenance; the conservative scheduled mode (PRs for review) is the correct default when no human is actively steering.

### A bespoke coordination store (database/queue) instead of labels

Rejected because GitHub labels are already visible to humans and every agent, require no extra infrastructure, and make the coordination state auditable in the same place the work lives.
