# AGENTS.md — services/agent

Fastify + Prisma service for AI agent session management. Port **3003**.

## Service Purpose

Agent orchestration API with session lifecycle management and model routing. Handles agent task execution, worktree isolation, SSE event streaming, and Langfuse tracing. Deployed on DigitalOcean App Platform.

## Session Lifecycle

```
PENDING → RUNNING → SUCCEEDED
                  → FAILED
                  → CANCELLED

Cleanup: remove worktree on terminal state (SUCCEEDED/FAILED/CANCELLED)
Max-turn enforcement: session stops after maxTurns reached
Budget enforcement: session stops when totalCostUsd >= maxBudgetUsd
```

## Model Routing Rules

| Tier | Model | Use Case | Budget |
|------|-------|----------|--------|
| Tier 1 | Haiku | Lint, typos, dependency bumps | < $0.05 |
| Tier 2 | Sonnet | Standard features, refactors, unit tests | $0.05 - $0.50 |
| Tier 3 | Opus | Architecture, migrations, cross-cutting | > $0.50 |

Escalation: on failure, attempt one model tier upgrade before giving up.

## Worktree Isolation

- Each session runs in its own git worktree (`/tmp/agent-worktrees/<sessionId>/`)
- Cleanup on terminal state (SUCCEEDED/FAILED/CANCELLED)
- Disk-space monitoring: alert if worktree dir > 1GB
- Never persist arbitrary code execution outside worktree

## Langfuse Tracing

- Session traces linked by `sessionId`
- Generation spans include token usage, tool calls, cost
- `evaluation_confidence` metric tracked for self-tuning

## Critical Rules

- Never run agents without budget cap
- Never persist arbitrary code execution outside worktree
- Model fallback escalation on failure (Haiku → Sonnet → Opus)
- Max-turn MUST be enforced — sessions exceeding limit are terminated
- No destructive migrations without `-- DESTRUCTIVE: <reason>` marker

## Build / Test Commands

```bash
pnpm --dir services/agent dev              # Hot-reload dev server (port 3003)
pnpm --dir services/agent build           # Compile TypeScript
pnpm --dir services/agent test            # Run all tests
pnpm --dir services/agent test:watch     # Watch mode
pnpm --dir services/agent test:coverage  # Coverage report
pnpm --dir services/agent lint           # ESLint
pnpm --dir services/agent typecheck      # TypeScript type check
pnpm --dir services/agent db:generate   # Generate Prisma client
pnpm --dir services/agent db:push       # Push schema (dev only)
pnpm --dir services/agent db:migrate    # Create + apply migrations
```

## Deployment Target

DigitalOcean App Platform — component name: `agent-service`

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/sessions` | Create new agent session |
| GET | `/v1/sessions` | List sessions |
| GET | `/v1/sessions/:id` | Get session details |
| DELETE | `/v1/sessions/:id` | Cancel session |
| GET | `/v1/sessions/:id/events` | Stream session events (SSE) |
| POST | `/v1/orchestrate` | Create orchestration session |
| POST | `/api/gen/ui` | Stream UI generation (JSONL) |
| POST | `/api/gen/chat` | Stream chat responses (SSE) |
