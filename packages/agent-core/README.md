# Agent Core

Core library for running AI agent sessions. Manages git worktrees, tool permissions, and session execution using the Claude Agent SDK.

## Usage

```typescript
import { createSession, runSession } from "@mbe/agent-core";
```

Used by the [Agent Service](../../services/agent/) and the [`mbe` CLI](../../tools/cli/).

## Key Responsibilities

- Git worktree creation and cleanup
- Tool permission configuration for Claude agents
- Session execution with budget and turn limits
- Cost tracking and event emission

## Commands

```bash
pnpm test             # Run tests
pnpm test:coverage    # Coverage report
pnpm lint             # ESLint
pnpm typecheck        # TypeScript check
```
