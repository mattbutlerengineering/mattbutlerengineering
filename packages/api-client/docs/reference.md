# @mbe/api-client reference

File map, quick-start example, client method inventory and code examples, moved out of [CLAUDE.md](../CLAUDE.md) so they don't load into context every time an api-client file is read. The rules (subpath exports, auth token injection, retry gating, error handling, validation, timeout, testing pattern) stay in CLAUDE.md. The source of truth is `src/`.

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

| Client         | Key Methods                                                                                                                                                                                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`        | `me()`, `list()`, `get(id)`, `create()`, `update()`, `delete()`, `updatePreferences()`                                                                                                                                                                                                                                                |
| `reservations` | `list(params)`, `me()`, `get(id)`, `create()`, `update()`, `cancel()`, `cancelWithReason()`, `walkIn()`                                                                                                                                                                                                                               |
| `venues`       | `list()`, `get(id)`, `getBySlug()`, `create()`, `update()`, `delete()`                                                                                                                                                                                                                                                                |
| `venueGroups`  | `list()`, `get(id)`, `create()`, `update()`, `delete()`                                                                                                                                                                                                                                                                               |
| `tables`       | `list(params)`, `get(id)`, `create()`, `update()`, `delete()`, `updateStatus()`                                                                                                                                                                                                                                                       |
| `guests`       | `list(params)`, `search(params)`, `getSegments(venueId)`, `get(id)`, `create()`, `findOrCreate()`, `update()`, `delete()`                                                                                                                                                                                                             |
| `floorPlans`   | `list()`, `get(id)`, `getActiveByVenueId()`, `create()`, `update()`, `activate()`, `delete()`, `bulkUpdatePositions()`, `assignTable()`, `removeTable()`                                                                                                                                                                              |
| `availability` | `getTimeSlots(params)`, `getDates(params)`                                                                                                                                                                                                                                                                                            |
| `holds`        | Staff (JWT): `create(data)`, `get(id)`, `release(id)`, `confirm(id, details)` — requires `setSessionId()`. Public (slug-scoped, no auth): `createForVenue(slug, data)`, `getForVenue(slug, holdId)`, `releaseForVenue(slug, holdId)`, `confirmForVenue(slug, holdId, details)` — `createForVenue` adopts the server-minted session id |
| `publicVenue`  | `guestRisk(slug, params)`, `recognizeGuest(slug, email)`, `joinWaitlist(slug, data)`, `waitlistEstimate(slug, statusToken)`, `depositIntent(slug, data, sessionId)` — unauthenticated booking widget surface                                                                                                                          |
| `waitlist`     | `list(venueId)`, `get(id)`, `create(data)`, `seat(id)`, `cancel(id)`, `notify(id)`, `expire(id)` — authenticated staff-facing walk-in queue management                                                                                                                                                                                |

## Auth Token Injection

```typescript
const api = createApiClient({
  baseUrl: "/api",
  getAccessToken: () => useAccessToken().accessToken, // in React context
});
```

## Zod Validation

```typescript
import { z } from "zod";
const UserSchema = z.object({ id: z.string(), name: z.string() });
const user = await api.client.get("/api/v1/users/me", UserSchema);
```

## Testing Patterns

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
