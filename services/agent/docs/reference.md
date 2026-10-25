# Agent service reference

Domain model, source layout, API routes, session lifecycle examples, `@mbe/agent-core` usage and error codes for `services/agent`, moved out of [CLAUDE.md](../CLAUDE.md) so they don't load into context every time an agent-service file is read. The source of truth is the code: `prisma/schema.prisma` for the model and `src/routes/` for the API.

## Domain Model

### Session Entity

Represents an agent task execution.

```typescript
interface AgentSession {
  id: string;
  task: string; // Task description
  branchName: string | null; // Git branch for changes
  model: string; // e.g., "claude-sonnet-5"
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

### StoredSpec Entity

Persisted gen-specs from the `stored_specs` table.

```typescript
interface StoredSpec {
  id: string;
  userId: string;
  prompt: string; // The user's original prompt
  spec: unknown; // Parsed spec JSON
  rawLines: string[]; // Raw lines from the AI response
  isFavorite: boolean;
  refinement: { parentId: string | null; path: string; before: unknown; after: unknown } | null; // only on kind "refine"
  createdAt: Date;
  updatedAt: Date;
}
```

## Structure

```
src/
├── app.ts              # Fastify app builder
├── index.ts            # Entry point
├── routes/
│   ├── sessions.ts     # Session CRUD                → /v1/sessions
│   ├── session-events.ts # SSE event streaming       → /v1/sessions
│   ├── orchestrate.ts  # Multi-session orchestration  → /v1/orchestrate
│   ├── webhooks.ts     # GitHub webhook handlers      → /v1/webhooks/github
│   ├── remediation.ts  # Alert-based auto-remediation → /v1/webhooks/remediation
│   ├── gen-ui.ts       # Gen playground UI streaming  → /api/gen/ui
│   ├── gen-specs.ts    # Gen specs CRUD + streaming   → /api/gen/specs
│   ├── gen-agent.ts    # Gen agent streaming (tools)  → /api/gen/agent
│   ├── gen-stream.ts   # Shared gen streaming infra (not a route)
│   └── gen-agent-tools.ts # Agent-tool definitions    → used by gen-agent
├── schemas/            # JSON Schema definitions
├── services/
│   ├── database.ts    # Prisma client
│   └── ...
└── generated/          # Prisma client
```

## API Routes

### Readiness

| Method | Path     | Description                       |
| ------ | -------- | --------------------------------- |
| GET    | `/ready` | Readiness probe (DB + Auth0 JWKS) |

### Sessions

| Method | Path                      | Description                 |
| ------ | ------------------------- | --------------------------- |
| POST   | `/v1/sessions`            | Create new agent session    |
| GET    | `/v1/sessions`            | List sessions               |
| GET    | `/v1/sessions/:id`        | Get session details         |
| POST   | `/v1/sessions/:id/cancel` | Cancel a running session    |
| DELETE | `/v1/sessions/:id`        | Delete a session            |
| GET    | `/v1/sessions/:id/events` | Stream session events (SSE) |

### Orchestration

| Method | Path              | Description                |
| ------ | ----------------- | -------------------------- |
| POST   | `/v1/orchestrate` | Orchestrate a complex task |

### Gen AI (Streaming)

| Method | Path                          | Description                                                                                                              |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| POST   | `/api/gen/ui`                 | Stream UI generation (JSONL); optional `target: {key, type}` regenerates one subtree (root keeps `target.key`, else 502) |
| POST   | `/api/gen/agent`              | Stream agent responses (SSE)                                                                                             |
| POST   | `/api/gen/specs`              | Create and persist a spec                                                                                                |
| GET    | `/api/gen/specs`              | List user's specs                                                                                                        |
| GET    | `/api/gen/specs/:id`          | Get spec by id (public)                                                                                                  |
| PATCH  | `/api/gen/specs/:id/favorite` | Toggle spec favorite                                                                                                     |
| DELETE | `/api/gen/specs/:id`          | Delete a spec                                                                                                            |

### Webhooks

| Method | Path                       | Description                       |
| ------ | -------------------------- | --------------------------------- |
| POST   | `/v1/webhooks/github`      | GitHub webhook receiver           |
| POST   | `/v1/webhooks/remediation` | Alert-based auto-remediation hook |

## Session Lifecycle

### Create Session

```bash
POST /v1/sessions
Content-Type: application/json

{
  "task": "Fix the login bug on the hospitality app",
  "model": "claude-sonnet-5",
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
import { runSession } from "@mbe/agent-core";
import { createWorktree, removeWorktree } from "@mbe/agent-core";
import { buildSystemPrompt } from "@mbe/agent-core";
import { evaluateSuccess } from "@mbe/agent-core";
```

### Session Runner

Manages the conversation loop with Claude API.

```typescript
const result = await runSession(
  {
    taskDescription: session.task,
    repoPath: session.worktreePath,
    model: session.model,
    maxTurns: session.maxTurns,
    maxBudgetUsd: session.maxBudgetUsd,
  },
  (event) => {
    // Emit SSE event to client
    emitter.emit(event.type, event);
  }
);
```

### Worktree Manager

Creates isolated Git worktrees for each session.

```typescript
const worktree = await createWorktree({
  repoPath: "/path/to/repo",
  sessionId: session.id,
  baseBranch: "main",
});

// Returns: { path: "/path/to/repo/.worktrees/session-abc123", branch: "agent/session-abc123" }

await removeWorktree(worktree.path);
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
