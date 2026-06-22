---
id: ADR-012
title: Single Primary Memory System
status: active
date: 2026-06-21
---

# ADR-012: Single Primary Memory System

## Context

Three overlapping memory mechanisms were active across every Claude Code session in this repo:

1. **OMEGA** (`mcp__omega-memory__*`) — an MCP memory server wired in via **global hooks** and a session-start preamble (`omega_welcome` / `omega_protocol`). It injected `[MEMORY]`/`[HANDOFF]`/`[COORD]` blocks and required a per-session `omega_store`.
2. **claude-mem** (`@thedotmack` plugin) — cross-session semantic memory. Auto-records observations during sessions and surfaces them at session start; searchable via `/mem-search`, `/smart-explore`.
3. **File `MEMORY.md`** — a hand-curated, checked-in index of project memories under `~/.claude/projects/.../memory/`, loaded into context each session.

The overlap is costly and risky:

- **Session-start token weight** — each system injects its own context block, and OMEGA additionally requires protocol/welcome round-trips before any work begins.
- **Conflicting context** — three systems can surface stale or contradictory facts about the same topic, with no single source of truth.
- **Operational drift** — OMEGA was already disconnected in recent sessions, yet its hooks/preamble still ran, spending tokens for no payoff.

The external `ai-tooling` Memory Systems evaluation ranks **claude-mem > OMEGA**, and the canonical `STACK.md` omits OMEGA entirely.

## Decision

Adopt **claude-mem as the single primary memory system**, with the other mechanisms demoted to non-overlapping lanes. Each tool owns one lane and only one:

| Lane                        | System                   | Role                                                                                                                                                                                  |
| --------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Primary semantic memory** | **claude-mem**           | Cross-session recall of observations, decisions, and domain context. Auto-recorded during sessions; queried via `/mem-search` & co. The default answer to "have we seen this before?" |
| **Durable curated index**   | **file `MEMORY.md`**     | Hand-maintained, version-controlled facts that must survive tooling churn (active-work resume points, deployment notes, recurring gotchas). Human-curated, not auto-generated.        |
| **Code map**                | **graphify / codegraph** | Concept/symbol-level navigation of the codebase. **Not memory** — it is regenerated from source, never a store of session history.                                                    |
| **Retired**                 | **OMEGA**                | Removed. Global hooks + session-start preamble deleted; existing memories exported first. Execution tracked in #2542.                                                                 |

### Why two memory lanes (claude-mem + file index) instead of one

They serve different durability guarantees. claude-mem is the _automatic, semantic, high-recall_ layer — broad but tool-dependent and not in version control. The file `MEMORY.md` index is the _deliberate, durable, reviewable_ layer — narrow but checked into git and immune to memory-tool migration. Curated resume points and deployment-critical facts belong in git; everything else is claude-mem's job.

## Alternatives Considered

- **Keep OMEGA primary** — rejected. The eval ranks it below claude-mem, it was already disconnected in practice, and its hook/preamble tax is paid every session regardless of use.
- **Keep both OMEGA and claude-mem, no designated winner** — rejected. This preserves the exact overlap (token cost + conflicting context) the issue exists to eliminate.
- **Single system, drop the file index too** — rejected. The file index gives a version-controlled, tool-independent durability guarantee that a plugin-backed store cannot.

## Consequences

**Positive**

- One source of truth for semantic recall; no contradictory memory blocks.
- Lower session-start token weight (no OMEGA welcome/protocol/inject cycle).
- Clear mental model: "semantic recall → claude-mem; durable curated fact → `MEMORY.md`; how does the code connect → graphify."

**Negative / trade-offs**

- claude-mem becomes a single point of dependence for semantic recall; if the plugin breaks, that lane is unavailable until restored (the file index still covers the durability-critical subset).
- Historical OMEGA memories must be exported before its hooks are removed, or they are lost.

## What Gets Retired

Execution is **out of scope for this ADR** and tracked in **#2542**:

- Export existing OMEGA memories to a durable artifact.
- Remove OMEGA global hooks and the session-start `omega_welcome`/`omega_protocol` preamble.
- Remove the `omega-memory` MCP server registration.

No hooks or config are changed by this ADR.
