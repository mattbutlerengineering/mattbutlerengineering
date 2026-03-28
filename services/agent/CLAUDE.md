# Agent Service

Fastify + Prisma service for AI agent session management. Port **3003**.

## Domain Model

- `Session` — agent task execution (status lifecycle: PENDING → RUNNING → SUCCEEDED/FAILED/CANCELLED)
- `Event` — structured log entries per session (tool calls, completions, errors)
- Sessions track: task description, branch name, model, max turns, budget, PR creation flag
- Results: `prUrl`, `prNumber`, `worktreePath`, `totalCostUsd`, `totalTurns`, error info

## Structure

```
src/
├── app.ts          # Fastify app builder
├── index.ts        # Entry point
├── routes/         # Session CRUD + event streaming (SSE)
├── schemas/        # JSON Schema definitions
├── services/       # Session lifecycle, agent orchestration
└── generated/      # Prisma client
```

## Environment Variables

- `PORT` (default: 3003)
- `LOG_LEVEL` (default: "info")
- `DATABASE_URL` — Postgres connection (separate DB from users)
- `ANTHROPIC_API_KEY` — Claude API key (required)
- `DEFAULT_MODEL` (default: "claude-sonnet-4-6")
- `MAX_CONCURRENT_SESSIONS` (default: 5)
- `GITHUB_WEBHOOK_SECRET` — HMAC secret for webhook verification
- `AGENT_API_URL` (default: "http://localhost:3003")

## Key Patterns

- SSE streaming for real-time session logs (`mbe agent logs <id>`)
- GitHub webhook integration for PR events
- Agent core logic lives in `packages/agent-core/` (worktree mgmt, tool permissions)
- Session orchestration decomposes large tasks into parallel sub-sessions

## Commands

```bash
pnpm dev              # Hot-reload dev server
pnpm build            # Compile TypeScript
pnpm test             # Run all tests
pnpm test:watch       # Watch mode
pnpm test:coverage    # Coverage report
pnpm db:generate      # Generate Prisma client
pnpm db:push          # Push schema (dev only)
pnpm db:migrate       # Create + apply migrations
```
