---
id: ADR-017
title: Agent Execution Architecture
status: active
date: 2026-06-30
---

# ADR-017: Agent Execution Architecture

## Context

The platform runs autonomous coding agents to implement issues, fix CI, and audit the codebase. Those agents must be able to (a) run against different LLM back-ends without rewriting the runner, and (b) be driven both from a developer's terminal (fire-and-forget) and from a long-lived API service (observable, cancellable sessions). Without a shared execution seam, each entry point would grow its own copy of the run loop, event mapping, and PR creation — the exact smearing that motivated the session-lifecycle work.

This ADR records the execution/adapter layer. It **composes with, and does not restate,** [ADR-005](ADR-005-agent-worktree-isolation.md) (agent worktree isolation), which owns the filesystem-isolation decision.

## Decision

Agent execution is built around a **shared execution unit** (`runSession`, in `@mbe/agent-core`) that both entry points drive, with a **pluggable adapter** for the underlying model provider.

### Multi-adapter abstraction

`mbe agent run --adapter <auto|claude|gemini|opencode>` selects the provider behind a common interface:

- `claude` — the default and the pinned adapter for deep/architecture work.
- `gemini`, `opencode` — alternative back-ends.
- `auto` — enables a rate-limit failover cascade (`claude → gemini → opencode` on 429), preventing stalls on busy days for routine tiers.

Adapter selection is orthogonal to the task logic: the same `runSession` pipeline runs regardless of which adapter is bound.

### Two execution modes, one pipeline

- **Local (worktree) mode** — `mbe agent run "<task>"` executes `runSession` directly via `@mbe/agent-core`, in an isolated git worktree (see ADR-005), and produces a PR. Stateless and terminal.
- **API-backed mode** — the agent service (`:3003`) exposes sessions (`mbe agent start/list/status/logs/cancel/delete`) that wrap the _same_ `runSession` execution unit with persistent state, SSE event streaming, and cancellation.

Both modes share the run loop, SDK-event mapping, evaluation, and PR creation. The API layer adds persistence and observability around the shared unit rather than reimplementing it.

### Model tier, not model ID, at the dispatch seam

Subagent/model routing selects a **tier** (`opus`/`sonnet`/`haiku`/`fable`), resolved by the model router from labels + title + body, never a hardcoded full model ID at the dispatch seam.

### Adapter ports vs. internal phase collaborators

_Amended 2026-07-05 (#3120)._ This ADR fixes the `runSession` **adapter port** at the process boundary: the external CLI / model back-end (`claude`/`gemini`/`opencode`) is a genuine seam because production-vs-test — and one provider vs. another — bind different implementations behind it. That is distinct from an **internal phase-collaborator injection**: an in-process helper a single phase calls (failure-memory lookup, `git diff`, the post-commit quality gateway). Such collaborators have exactly one production implementation and vary only under test, so they are imported directly inside their owning phase and substituted with `vi.mock`, not threaded through an injected `PhaseDeps` port. Only the cross-process / spawn-session collaborators (worktree manager, query runner, PR creator, feedback loop) remain injected ports.

## Consequences

**Benefits:**

- Adding or swapping a model back-end is an adapter change, not a runner rewrite.
- CLI and API sessions cannot diverge in execution semantics because they run the same `runSession` code path.
- The `auto` failover cascade keeps routine work moving through provider rate limits without human intervention.

**Trade-offs:**

- The adapter interface must stay narrow enough that every provider can satisfy it; provider-specific features are surfaced cautiously to avoid leaking into the shared contract.
- Failover (`auto`) is inappropriate for deep architecture tasks, where provider consistency matters — those pin `--adapter claude`.
- The shared execution unit is load-bearing for both entry points, so changes to it are high-blast-radius and reviewed accordingly (see the session-lifecycle orchestrator work).

## Alternatives Considered

### One runner per entry point (CLI and API each own their loop)

Rejected because it duplicates the run loop, event mapping, and PR logic, and lets CLI and API drift apart in behavior — the smearing this architecture exists to remove.

### Single hardcoded provider (Claude only)

Rejected because it removes the rate-limit failover path and couples the platform to one vendor's availability and pricing.

### Full model IDs at the dispatch seam

Rejected because dispatch APIs accept a tier enum, not a full ID; emitting a full ID (`claude-opus-4-8`) at the seam breaks model resolution. The router emits the tier and the adapter resolves the concrete model.
