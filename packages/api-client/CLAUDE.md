# @mbe/api-client

Typed HTTP client for the MBE platform API. Wraps `fetch` with auth token injection, retry logic, timeout handling, and optional Zod validation.

## Structure

```
src/
├── agent-sessions.ts   # AgentSessionsClient
├── availability.ts     # AvailabilityClient, HoldsClient
├── briefing.ts         # BriefingClient — pre-arrival staff briefing entries
├── client.ts           # ApiClient base class, retry, timeout, errors
├── client.test.ts      # Core client tests
├── floor-plans.ts      # FloorPlansClient
├── guests.ts           # GuestsClient
├── health.ts           # HealthClient
├── index.ts            # createApiClient factory + re-exports
├── problem-details.ts  # Parses response bodies into typed RFC 7807 ProblemDetails
├── public-venue.ts     # PublicVenueClient — unauthenticated public booking widget surface
├── reservations.ts     # ReservationsClient
├── retry.ts            # Exponential-backoff retry policy shared by ApiClient
├── streaming.ts        # StreamingClient (SSE event streams)
├── tables.ts           # TablesClient
├── users.ts            # UsersClient
├── venues.ts           # VenuesClient, VenueGroupsClient
└── waitlist.ts         # WaitlistClient — authenticated staff-facing waitlist management
```

Subpath exports: `@mbe/api-client/users` and `@mbe/api-client/streaming` allow importing `UsersClient`/`StreamingClient` without pulling in the full barrel.

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

| Client         | Key Methods                                                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`        | `me()`, `list()`, `get(id)`, `create()`, `update()`, `delete()`, `updatePreferences()`                                                                     |
| `reservations` | `list(params)`, `me()`, `get(id)`, `create()`, `update()`, `cancel()`, `cancelWithReason()`, `walkIn()`                                                    |
| `venues`       | `list()`, `get(id)`, `getBySlug()`, `create()`, `update()`, `delete()`                                                                                     |
| `venueGroups`  | `list()`, `get(id)`, `getBySlug()`, `create()`, `update()`, `delete()`                                                                                     |
| `tables`       | `list(params)`, `get(id)`, `create()`, `update()`, `delete()`, `updateStatus()`                                                                            |
| `guests`       | `list(params)`, `search(params)`, `getSegments(venueId)`, `get(id)`, `create()`, `findOrCreate()`, `update()`, `delete()`                                  |
| `floorPlans`   | `list()`, `get(id)`, `getActiveByVenueId()`, `create()`, `update()`, `activate()`, `delete()`, `bulkUpdatePositions()`, `assignTable()`, `removeTable()`   |
| `availability` | `getTimeSlots(params)`, `getDates(params)`                                                                                                                 |
| `holds`        | `create(data)`, `get(id)`, `release(id)`, `confirm(id, details)` — requires `setSessionId()`                                                               |
| `publicVenue`  | `guestRisk(slug, params)`, `recognizeGuest(slug, email)`, `joinWaitlist(slug, data)`, `depositIntent(slug, data)` — unauthenticated booking widget surface |
| `waitlist`     | `list(venueId)`, `get(id)`, `create(data)`, `seat(id)`, `cancel(id)`, `notify(id)`, `expire(id)` — authenticated staff-facing walk-in queue management     |

## Auth Token Injection

The `getAccessToken` callback is called on every request. If it returns a token, `Authorization: Bearer <token>` is added. Works with `useAccessToken()` from `@mbe/auth` (which returns `{ accessToken, refreshError }`):

```typescript
const api = createApiClient({
  baseUrl: "/api",
  getAccessToken: () => useAccessToken().accessToken, // in React context
});
```

## Retry Logic

- Retries on **502, 503, 504** and network errors (`TypeError`)
- Does **not** retry on 400, 401, 404, 500
- Exponential backoff: 1s, 2s, 4s... with +/-20% jitter
- Configurable via `maxRetries` (default: 3, set 0 to disable)
- **Method-gated: only GET, HEAD, PUT, and DELETE are retried by default.** POST and PATCH are
  never replayed automatically — a gateway timeout that fires after the origin already committed
  (e.g. a 504 on `POST /reservations` after the row was created) would otherwise duplicate the
  side effect on every retry. The gate is driven by the method actually sent to `request()`, not
  which wrapper (`get`/`post`/…) was called. If a specific POST/PATCH call is known to be safe to
  replay (e.g. the origin dedupes on an idempotency key), opt in per-request with
  `{ idempotentRetry: true }`:

  ```typescript
  await api.client.post("/reservations", body, schema, { idempotentRetry: true });
  ```

- Retryable failed responses have their body cancelled before the next attempt so the underlying
  connection is released; only the final (non-retried) response is left intact for error parsing.

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
    error.problemDetails; // RFC 7807 ProblemDetails — the sole error shape (ADR-008)
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
