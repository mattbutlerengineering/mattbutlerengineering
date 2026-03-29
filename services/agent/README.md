# Agent Service

REST API for managing AI agent sessions. Supports creating, monitoring, and orchestrating Claude-powered coding agents.

## Tech Stack

- Fastify 5 + TypeScript (port 3003)
- Prisma ORM + PostgreSQL
- Claude API (`@anthropic-ai/claude-agent-sdk`)
- SSE streaming for real-time session logs
- Vitest for testing

## Key Features

- Session lifecycle management (PENDING, RUNNING, SUCCEEDED, FAILED, CANCELLED)
- Real-time event streaming via SSE
- Task decomposition and parallel orchestration
- GitHub webhook integration for PR events

## Commands

```bash
pnpm dev              # Dev server with hot reload
pnpm build            # Compile TypeScript
pnpm test             # Run tests
pnpm test:coverage    # Coverage report
pnpm db:migrate       # Create and apply migrations
pnpm db:push          # Quick schema sync (dev only)
pnpm db:studio        # Open Prisma Studio
```

See [CLAUDE.md](CLAUDE.md) for domain model, environment variables, and architecture details.
