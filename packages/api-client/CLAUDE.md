# @mbe/api-client

Typed HTTP client for the MBE platform API. Wraps `fetch` with auth token injection, retry logic, timeout handling, and optional Zod validation.

## Structure

```
src/
├── agent-sessions.ts  # AgentSessionsClient
├── availability.ts    # AvailabilityClient, HoldsClient
├── client.ts          # ApiClient base class, retry, timeout, errors
├── client.test.ts     # Core client tests
├── floor-plans.ts     # FloorPlansClient
├── guests.ts          # GuestsClient
├── health.ts          # HealthClient
├── index.ts           # createApiClient factory + re-exports
├── reservations.ts    # ReservationsClient
├── streaming.ts       # StreamingClient (SSE event streams)
├── tables.ts          # TablesClient
├── users.ts           # UsersClient
└── venues.ts          # VenuesClient, VenueGroupsClient
```

## Quick Start

```typescript
import { createApiClient } from "@mbe/api-client";

const api = createApiClient({
  baseUrl: "https://api.example.com",
  getAccessToken: () => authToken, // sync or async
  timeout: 30_000, // default: 30s
  maxRetries: 3, // default: 3
});

const user = await api.users.me();
const reservations = await api.reservations.list({ venueId, date: "2026-04-04" });
const slots = await api.availability.getTimeSlots({ venueId, date, partySize: 4 });
```

## Service Clients

| Client         | Key Methods                                                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`        | `me()`, `list()`, `get(id)`, `create()`, `update()`, `delete()`, `updatePreferences()`                                                                   |
| `reservations` | `list(params)`, `me()`, `get(id)`, `create()`, `update()`, `cancel()`, `cancelWithReason()`, `walkIn()`                                                  |
| `venues`       | `list()`, `get(id)`, `getBySlug()`, `create()`, `update()`, `delete()`                                                                                   |
| `venueGroups`  | `list()`, `get(id)`, `getBySlug()`, `create()`, `update()`, `delete()`                                                                                   |
| `tables`       | `list(params)`, `get(id)`, `create()`, `update()`, `delete()`, `updateStatus()`                                                                          |
| `guests`       | `list(params)`, `search(params)`, `getSegments(venueId)`, `get(id)`, `create()`, `findOrCreate()`, `update()`, `delete()`                                |
| `floorPlans`   | `list()`, `get(id)`, `getActiveByVenueId()`, `create()`, `update()`, `activate()`, `delete()`, `bulkUpdatePositions()`, `assignTable()`, `removeTable()` |
| `availability` | `getTimeSlots(params)`, `getDates(params)`                                                                                                               |
| `holds`        | `create(data)`, `get(id)`, `release(id)`, `confirm(id, details)` — requires `setSessionId()`                                                             |

## Auth Token Injection

The `getAccessToken` callback is called on every request. If it returns a token, `Authorization: Bearer <token>` is added. Works with `useAccessToken()` from `@mbe/auth`:

```typescript
const api = createApiClient({
  baseUrl: "/api",
  getAccessToken: () => useAccessToken(), // in React context
});
```

## Retry Logic

- Retries on **502, 503, 504** and network errors (`TypeError`)
- Does **not** retry on 400, 401, 404, 500
- Exponential backoff: 1s, 2s, 4s... with +/-20% jitter
- Configurable via `maxRetries` (default: 3, set 0 to disable)

## Error Handling

```typescript
import { ApiClientError } from "@mbe/api-client";

try {
  await api.users.get("bad-id");
} catch (error) {
  if (error instanceof ApiClientError) {
    error.statusCode; // 404
    error.method; // "GET"
    error.path; // "/api/v1/users/bad-id"
    error.response; // Full ApiError object (RFC 9457)
  }
}
```

`ApiValidationError` is thrown when a Zod schema is passed and response data fails validation.

## Zod Validation

Pass a schema as the last argument to any base client method:

```typescript
import { z } from "zod";
const UserSchema = z.object({ id: z.string(), name: z.string() });
const user = await api.client.get("/api/v1/users/me", UserSchema);
```

## Timeout

Default 30s per request via `AbortSignal.timeout()`. Caller-provided `AbortSignal` is combined with the timeout signal using `AbortSignal.any()`.

## Testing Patterns

Mock global `fetch` with `vi.stubGlobal`:

```typescript
const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

mockFetch.mockResolvedValueOnce(
  new Response(JSON.stringify({ data: { id: "1" } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
);

const client = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });
```

## Commands

```bash
pnpm build          # Compile TypeScript
pnpm test           # Run tests
pnpm test:contract  # Run contract tests only
pnpm lint           # ESLint
pnpm typecheck      # Type check
```
