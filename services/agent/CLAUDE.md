# Agent Service

Fastify + Prisma service for AI agent session management. Port **3003**.

## Domain Model

### Session Entity

Represents an agent task execution.

```typescript
interface AgentSession {
  id: string;
  task: string; // Task description
  branchName: string | null; // Git branch for changes
  model: string; // e.g., "claude-sonnet-4-6"
  status: SessionStatus;
  maxTurns: number; // Conversation turn limit
  maxBudgetUsd: number; // Budget cap
  totalCostUsd: number; // Actual cost incurred
  totalTurns: number; // Turns used
  prUrl: string | null; // Created PR URL
  prNumber: number | null; // Created PR number
  worktreePath: string | null; // Local worktree location
  errorMessage: string | null; // Error if failed
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

type SessionStatus =
  | "PENDING" // Queued, not started
  | "RUNNING" // Currently executing
  | "SUCCEEDED" // Completed successfully
  | "FAILED" // Completed with error
  | "CANCELLED"; // Manually cancelled
```

### Event Entity

Structured log entries per session.

```typescript
interface AgentSessionEvent {
  id: string;
  sessionId: string;
  type: EventType;
  data: Record<string, unknown>;
  timestamp: Date;
}

type EventType =
  | "turn:start"
  | "turn:end"
  | "tool:start"
  | "tool:end"
  | "tool:error"
  | "file:created"
  | "file:modified"
  | "file:deleted"
  | "git:commit"
  | "pr:created"
  | "error"
  | "warning";
```

## Structure

```
src/
├── app.ts              # Fastify app builder
├── index.ts            # Entry point
├── routes/
│   ├── health.ts       # Health check endpoints
│   ├── sessions.ts     # Session CRUD
│   ├── session-events.ts # SSE event streaming
│   ├── orchestrate.ts  # Multi-session orchestration
│   ├── webhooks.ts    # GitHub webhook handlers
│   ├── remediation.ts # Auto-remediation endpoints
│   ├── gen-ui.ts      # Gen UI streaming endpoint
│   ├── gen-chat.ts    # Gen chat streaming endpoint
│   └── gen-specs.ts   # Gen specs streaming endpoint
├── schemas/            # JSON Schema definitions
├── services/
│   ├── database.ts    # Prisma client
│   └── ...
└── generated/          # Prisma client
```

## API Routes

### Sessions

| Method | Path                      | Description                 |
| ------ | ------------------------- | --------------------------- |
| POST   | `/v1/sessions`            | Create new agent session    |
| GET    | `/v1/sessions`            | List sessions               |
| GET    | `/v1/sessions/:id`        | Get session details         |
| DELETE | `/v1/sessions/:id`        | Cancel session              |
| GET    | `/v1/sessions/:id/events` | Stream session events (SSE) |

### Orchestration

| Method | Path                  | Description                  |
| ------ | --------------------- | ---------------------------- |
| POST   | `/v1/orchestrate`     | Create orchestration session |
| GET    | `/v1/orchestrate/:id` | Get orchestration status     |

### Gen AI (Streaming)

| Method | Path             | Description                  |
| ------ | ---------------- | ---------------------------- |
| POST   | `/api/gen/ui`    | Stream UI generation (JSONL) |
| POST   | `/api/gen/chat`  | Stream chat responses (SSE)  |
| POST   | `/api/gen/specs` | Stream spec generation (SSE) |

### Webhooks

| Method | Path                  | Description             |
| ------ | --------------------- | ----------------------- |
| POST   | `/v1/webhooks/github` | GitHub webhook receiver |

## Session Lifecycle

### Create Session

```bash
POST /v1/sessions
Content-Type: application/json

{
  "task": "Fix the login bug on the hospitality app",
  "model": "claude-sonnet-4-6",
  "maxBudgetUsd": 1.00,
  "maxTurns": 50,
  "createPR": true
}
```

**Response:**

```json
{
  "data": {
    "id": "session-abc123",
    "status": "PENDING",
    "task": "Fix the login bug...",
    "createdAt": "2026-04-04T00:00:00Z"
  }
}
```

### Stream Events

```bash
GET /v1/sessions/session-abc123/events
Accept: text/event-stream

event: turn:start
data: {"turn": 1, "timestamp": "2026-04-04T00:00:01Z"}

event: turn:end
data: {"turn": 1, "costUsd": 0.05, "tokensIn": 500, "tokensOut": 1200}

event: file:modified
data: {"path": "src/auth.ts", "action": "modified"}

event: session:completed
data: {"status": "SUCCEEDED", "prUrl": "https://github.com/..."}
```

## Agent Core

The actual agent execution happens in `@mbe/agent-core` package.

### Key Components

```typescript
// From @mbe/agent-core
import {
  createSessionRunner,
  createWorktreeManager,
  createPromptBuilder,
  createSuccessEvaluator,
} from "@mbe/agent-core";
```

### Session Runner

Manages the conversation loop with Claude API.

```typescript
const runner = createSessionRunner({
  model: session.model,
  maxTurns: session.maxTurns,
  maxBudget: session.maxBudgetUsd,
  onEvent: (event) => {
    // Emit SSE event to client
    emitter.emit(event.type, event);
  },
});

await runner.run({
  task: session.task,
  worktree: session.worktreePath,
  context: {
    repoUrl: "https://github.com/mattbutlerengineering/mattbutlerengineering",
    baseBranch: "main",
  },
});
```

### Worktree Manager

Creates isolated Git worktrees for each session.

```typescript
const worktreeManager = createWorktreeManager({
  basePath: "/tmp/agent-worktrees",
});

const worktree = await worktreeManager.create({
  sessionId: session.id,
  baseBranch: "main",
});

// Returns: { path: "/tmp/agent-worktrees/session-abc123", branch: "agent/session-abc123" }
```

## Integration Points

### GitHub Integration

```
Agent Service ──> GitHub API ──> Create branch, commit, PR
                  │
                  └────< GitHub Webhooks ──> Agent Service (PR feedback)
```

### Streaming to Clients

```
CLI (mbe agent run) ──> POST /sessions ──> Agent Core
                        │
                        └────< SSE /sessions/:id/events ──> CLI
```

## Error Handling

### Error Codes

| Code                 | HTTP | Description                     |
| -------------------- | ---- | ------------------------------- |
| `SESSION_NOT_FOUND`  | 404  | Session doesn't exist           |
| `SESSION_RUNNING`    | 409  | Cannot modify running session   |
| `BUDGET_EXCEEDED`    | 402  | Cost exceeded maxBudgetUsd      |
| `MAX_TURNS_EXCEEDED` | 400  | Conversation turn limit reached |
| `WORKTREE_CONFLICT`  | 409  | Worktree creation failed        |
| `GITHUB_AUTH_FAILED` | 401  | GitHub token invalid            |

### Error Response

```json
{
  "error": "BUDGET_EXCEEDED",
  "message": "Session cost ($1.05) exceeded budget ($1.00)",
  "statusCode": 402,
  "details": {
    "totalCostUsd": 1.05,
    "maxBudgetUsd": 1.0
  }
}
```

## Testing Patterns

### Session Creation Testing

```typescript
vi.mock("@mbe/agent-core", () => ({
  createSessionRunner: vi.fn().mockReturnValue({
    run: vi.fn().mockResolvedValue({ status: "SUCCEEDED" }),
  }),
  createWorktreeManager: vi.fn().mockReturnValue({
    create: vi.fn().mockResolvedValue({ path: "/tmp/test", branch: "test" }),
    cleanup: vi.fn(),
  }),
}));

it("creates session and returns id", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/v1/sessions",
    payload: {
      task: "Test task",
      maxBudgetUsd: 0.5,
    },
  });

  expect(response.statusCode).toBe(201);
  expect(JSON.parse(response.body)).toMatchObject({
    data: expect.objectContaining({
      id: expect.any(String),
      status: "PENDING",
    }),
  });
});
```

### SSE Event Streaming

```typescript
it("streams events as they occur", async () => {
  const events: string[] = [];

  const response = await app.inject({
    method: "GET",
    url: "/v1/sessions/test-id/events",
  });

  response.on("data", (chunk: Buffer) => {
    events.push(chunk.toString());
  });

  // Wait for events
  await delay(100);

  expect(events.some((e) => e.includes("turn:start"))).toBe(true);
});
```

## Commands

```bash
pnpm dev              # Hot-reload dev server (port 3003)
pnpm build            # Compile TypeScript
pnpm test             # Run all tests
pnpm test:watch       # Watch mode
pnpm test:coverage    # Coverage report
pnpm lint             # ESLint
pnpm typecheck        # TypeScript type check
pnpm db:generate      # Generate Prisma client
pnpm db:push          # Push schema (dev only)
pnpm db:migrate       # Create + apply migrations
pnpm db:migrate:deploy # Apply migrations (production)
```

## Environment Variables

| Variable                  | Required | Description                                     |
| ------------------------- | -------- | ----------------------------------------------- |
| `PORT`                    | No       | Service port (default: 3003)                    |
| `LOG_LEVEL`               | No       | Logging level (default: info)                   |
| `DATABASE_URL`            | Yes      | Postgres connection                             |
| `ANTHROPIC_API_KEY`       | Yes      | Claude API key                                  |
| `DEFAULT_MODEL`           | No       | Default model (default: claude-sonnet-4-6)      |
| `MAX_CONCURRENT_SESSIONS` | No       | Max parallel sessions (default: 5)              |
| `GITHUB_WEBHOOK_SECRET`   | No       | HMAC secret for webhooks                        |
| `AGENT_API_URL`           | No       | Public API URL (default: http://localhost:3003) |

## Dockerfile gotchas

- `pnpm --filter <pkg> build` does NOT cascade to workspace deps. When adding a new workspace dep that needs compiling, add its build step to the RUN chain in dep order, and COPY lines for its `src/`, `tsconfig*.json`, plus any build config (for rialto: `vite.config.lib.ts` + `scripts/`).
- `packages/api-client` has no build script — exports `./src/index.ts` directly. Runner stage must copy `src/` not `dist/`.

## Related Documentation

- [Agent Core Package](../packages/agent-core/README.md)
- [CLI Usage](../tools/cli/README.md)
- [Cross-Service Flows](../docs/CROSS-SERVICE-FLOWS.md)
