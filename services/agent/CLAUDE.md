# Agent Service

Fastify + Prisma service for AI agent session management. Port **3003**.

## Reference

Domain model (session, event and stored-spec entities), source layout, API routes, session lifecycle examples, `@mbe/agent-core` usage and error codes: [docs/reference.md](./docs/reference.md). Read it before changing routes, entities or error codes.

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

### Standard Error Response

```typescript
// RFC 7807 Problem Details (ADR-008) — the single error shape on the wire.
interface ProblemDetails {
  type: string; // URI identifying the error type (default: "about:blank")
  title: string; // Short human-readable summary (e.g. "Payment Required")
  status: number; // HTTP status code
  detail: string; // Human-readable explanation for this occurrence
  instance?: string; // URI identifying this specific occurrence
}
```

Domain-specific context (e.g. the budget figures that triggered the error) is
carried as RFC 7807 extension members (Section 3.2) alongside the standard
fields, not nested in a `details` bag — see ADR-008's "Extension Members"
example:

```json
{
  "type": "/errors/budget-exceeded",
  "title": "Budget Exceeded",
  "status": 402,
  "detail": "Session cost ($1.05) exceeded budget ($1.00)",
  "totalCostUsd": 1.05,
  "maxBudgetUsd": 1.0
}
```

## Testing Patterns

### Session Creation Testing

```typescript
vi.mock("@mbe/agent-core", () => ({
  runSession: vi.fn().mockResolvedValue({ status: "SUCCEEDED" }),
  createWorktree: vi.fn().mockResolvedValue({ path: "/tmp/test", branch: "test" }),
  removeWorktree: vi.fn(),
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
pnpm start            # Run compiled server (node dist/index.js)
pnpm build            # Compile TypeScript
pnpm build:openapi    # Generate openapi.json from route schemas
pnpm test             # Run all tests
pnpm test:watch       # Watch mode
pnpm test:coverage    # Coverage report
pnpm test:contract    # Run contract tests only
pnpm lint             # ESLint
pnpm typecheck        # TypeScript type check
pnpm db:generate      # Generate Prisma client
pnpm db:push          # Push schema (dev only)
pnpm db:migrate       # Create + apply migrations
pnpm db:migrate:deploy # Apply migrations (production)
pnpm db:migrate:status # Show migration status
```

## Environment Variables

| Variable                     | Required   | Description                                                     |
| ---------------------------- | ---------- | --------------------------------------------------------------- |
| `PORT`                       | No         | Service port (default: 3003)                                    |
| `LOG_LEVEL`                  | No         | Logging level (default: info)                                   |
| `CORS_ORIGINS`               | No         | Comma-separated allowed origins                                 |
| `DATABASE_URL`               | Yes        | Postgres connection                                             |
| `ANTHROPIC_API_KEY`          | Yes        | Claude API key                                                  |
| `MAX_CONCURRENT_SESSIONS`    | No         | Max parallel sessions (default: 5)                              |
| `GEN_DAILY_CEILING_USD`      | No         | Aggregate `/api/gen/*` spend ceiling per UTC day (default: 0.5) |
| `GITHUB_TOKEN`               | Yes        | GitHub PAT for PR creation                                      |
| `GITHUB_WEBHOOK_SECRET`      | No         | HMAC secret for GitHub webhooks                                 |
| `REMEDIATION_WEBHOOK_SECRET` | No         | HMAC secret for remediation webhooks                            |
| `REPO_PATH`                  | No         | Repo URL for agent context                                      |
| `AGENT_API_URL`              | No         | Public API URL (default: http://localhost:3003)                 |
| `API_BASE_URL`               | No         | Base URL for the platform (default: localhost)                  |
| `SENTRY_DSN`                 | No         | Sentry DSN for error tracking                                   |
| `AUTH_AUTHORITY`             | Yes (prod) | Auth0 domain URL                                                |
| `AUTH_AUDIENCE`              | Yes (prod) | Auth0 API identifier                                            |

## Dockerfile gotchas

- `pnpm --filter <pkg> build` does NOT cascade to workspace deps. When adding a new workspace dep that needs compiling, add its build step to the RUN chain in dep order, and COPY lines for its `src/`, `tsconfig*.json`, plus any build config (for rialto: `vite.config.lib.ts` + `scripts/`).
- `packages/api-client` uses conditional exports — `production` resolves to `dist/`, `default` to `src/`. Runner stage copies `dist/`.

## Related Documentation

- [Agent Core Package](../../packages/agent-core/README.md)
- [CLI Usage](../../tools/cli/README.md)
- [Cross-Service Flows](../../docs/CROSS-SERVICE-FLOWS.md)
