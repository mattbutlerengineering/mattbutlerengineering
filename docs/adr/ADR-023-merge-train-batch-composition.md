---
id: ADR-023
title: Zone-Spread Merge-Train Batch Composition
status: active
date: 2026-07-11
---

# ADR-023: Zone-Spread Merge-Train Batch Composition

## Context

The implement-queue drains the `ready` backlog by claiming a small batch (≤3) of independent issues, implementing each in a parallel worker, then merging the resulting PRs through a serial merge train (see [ADR-017: Agent Execution Architecture](ADR-017-agent-execution-architecture.md)).

Two prior decisions interact badly with a naive batch:

- **[ADR-016: Green-Main Merge-Gating Policy](ADR-016-green-main-merge-gating.md)** makes `main` `strict` — a branch must be up-to-date with `main` before it can merge.
- The merge train holds a **per-zone** lock (`scripts/merge-train-lock.mjs`), where a "zone" is a workspace area (`apps/<name>`, `packages/<name>`, `services/<name>`, or the global/`null` zone for cross-cutting changes).

The `ready` backlog clusters by workspace area — at the time of writing, ~5 issues in rialto/rialto-catalog, 3 in api-client/types, 2 in reservations. If a batch stacks multiple **same-zone** PRs, `strict` main turns each merge into a poison pill for its siblings: merging the first makes the others out-of-date, forcing `gh pr update-branch` and a **full CI re-run per sibling**. For _k_ same-zone PRs this is an O(k²) branch-update/revalidation tax, and it is the dominant reason serial draining feels glacial.

Neither existing ADR owns this: ADR-016 owns the _gate_, ADR-017 owns the _execution unit_. Neither owns _batch selection_.

## Decision

**Batch composition maximizes distinct merge-train zones — breadth over depth.**

- A pure function `issueZone(issue)` (`scripts/issue-zone.mjs`) estimates the zone an issue's PR will most likely occupy, derived from the issue title's Conventional-Commit scope (e.g. `refactor(rialto): …` → `packages/rialto`). It **reuses the merge-train-lock zone vocabulary** — it imports `WORKSPACE_ROOTS` and `zoneForPath` from `scripts/merge-train-lock.mjs` and builds the scope→zone map by scanning the real workspace directories. There is deliberately **no second, divergent zone list**.
- Scope resolution mirrors `zoneForPaths`: a scope (or set of scopes) that maps to exactly one workspace zone yields that zone; a scope spanning multiple zones, an unknown/non-workspace scope (e.g. `cli`, which lives under `tools/`, or `skills`), or a scopeless title all resolve to `null` — the **global** zone.
- A pure function `selectZoneSpreadBatch(candidates, { maxWorkers = 3 })` composes the batch. Preserving the caller's **priority order** (security > ci-fix > feature > audit, per the implement-queue skill), it takes **at most one issue per distinct zone** (up to `maxWorkers`) and **defers same-zone surplus** to a later batch.
- `null`-zone (global/cross-cutting) issues each occupy the **single global slot**: at most one global issue is scheduled per batch. A global PR takes the global lock and serializes against every other train, so co-scheduling two globals would reintroduce the very serialization this policy avoids.

The implement-queue "Phase 1: Claim Batch" step is wired to run `selectZoneSpreadBatch` over the priority-sorted, independence-filtered `ready` candidates so orchestration actually applies the spread.

## Consequences

**Benefits:**

- Batched PRs land in distinct zones, so they merge through the per-zone train without invalidating one another — eliminating the O(k²) same-zone `update-branch`/CI re-run tax under `strict` main (ADR-016).
- Zone estimation and the lock never disagree: both derive `<root>/<name>` from the same `WORKSPACE_ROOTS` + `zoneForPath` source of truth.
- Selection is a pure, deterministic function — unit-testable in isolation and independent of live GitHub state.

**Trade-offs:**

- Zone is _estimated_ from the commit scope, not the realized changeset. A mis-scoped title can under- or over-estimate the zone; the cost is a missed spread opportunity (a same-zone stack, i.e. today's status quo) or an over-conservative deferral — never a correctness failure, since the real per-zone lock still gates the merge.
- Throughput is intentionally traded for merge efficiency: a zone-heavy backlog drains one issue per zone per batch instead of saturating workers on the hottest zone. Over successive batches the backlog still clears, with far less CI churn.
- The single-global-slot rule can leave a worker idle when the top candidates are all global; this is accepted because two concurrent global PRs cannot both merge cleanly anyway.

## Alternatives Considered

### Keep claiming purely by priority/age (status quo)

Rejected: it stacks same-zone PRs and pays the O(k²) `update-branch`/CI tax that motivated this ADR.

### Second, purpose-built zone list for issue estimation

Rejected: a divergent list would drift from the merge-train lock's actual zones, producing estimates that disagree with the gate. Reusing `WORKSPACE_ROOTS` + `zoneForPath` keeps a single source of truth.

### Make `main` non-strict instead

Rejected: relaxing `strict` (ADR-016) trades the O(k²) tax for the risk of merging against a stale base (lockfile/generated-artifact desync breaking `main`). Fixing batch selection is cheaper and preserves the green-main invariant.

### Infer zone from a dry-run diff / touched files

Rejected as premature: computing a real changeset per candidate requires implementing the issue first (or a speculative checkout), which is exactly the expensive work the batch step precedes. The commit-scope heuristic is O(1), pure, and good enough to spread the batch; the authoritative per-zone lock remains the safety net.
