# ADR-005: Agent Worktree Isolation

**Status:** active
**Date:** 2026-04-06

## Context

AI agents (via `mbe agent run`) modify source code to implement features and fix bugs. Running agents in the main working directory risks conflicts with in-progress human work, corrupted state from partial agent failures, and inability to run multiple agents in parallel on different tasks.

## Decision

Each agent session creates a Git worktree under `.claude/worktrees/<session-id>`, branching from `main`. The agent operates entirely within this worktree. On success, the agent creates a PR from the worktree branch. On failure or cancellation, the worktree is cleaned up. Multiple agents can run concurrently on separate worktrees without interference.

## Consequences

- **Enables:** Parallel agent execution, safe failure recovery, and zero disruption to the developer's working directory. Agents can be aggressive with code changes knowing the blast radius is contained.
- **Constrains:** Worktrees share the same Git object store, so very large parallel operations can contend on Git locks. Disk usage grows linearly with concurrent agents.
- **Trade-off:** Worktrees are lighter than full clones (shared `.git`) but heavier than in-process sandboxing. The isolation-to-overhead ratio is the best fit for the current agent workload.

## Alternatives Considered

- **Docker containers**: Stronger isolation but significantly higher startup time and resource usage per agent session.
- **Separate full clones**: Maximum isolation but wasteful disk and network usage; slow to set up.
- **In-process sandboxing**: Lowest overhead but no filesystem isolation; one agent's changes would affect another's.
