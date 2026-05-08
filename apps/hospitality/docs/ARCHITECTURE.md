# Hospitality App — Architecture Guide

> Harness context for AI agents. Describes the data flow, component architecture,
> API surface, and real-time sync patterns. Read this before making architectural
> changes or adding new features.

---

## System Overview

```
┌─────────────────────────────────────────────────┐
│                   Browser                        │
│                                                  │
│  ┌──────────┐  ┌────────────┐  ┌──────────────┐ │
│  │ Auth0    │  │ React SPA  │  │ SSE Client   │ │
│  │ (OIDC)   │──│ (Vite)     │──│ (EventSource)│ │
│  └──────────┘  └─────┬──────┘  └───────┬──────┘ │
│                      │                  │        │
└──────────────────────┼──────────────────┼────────┘
                       │ REST             │ SSE
                       ▼                  ▼
              ┌────────────────┐  ┌──────────────┐
              │ API Server     │  │ Event Stream │
              │ (Fastify)      │──│ /events/     │
              │ /api/v1/*      │  │  stream      │
              └────────┬───────┘  └──────────────┘
                       │
                       ▼
              ┌────────────────┐
              │ PostgreSQL     │
              │ (Prisma ORM)   │
              └────────────────┘
```

---

## Authentication Flow

```
User opens app
  → App.tsx checks useAuth().isAuthenticated
    → false: redirect to Auth0 login
    → true: render DashboardLayout + Outlet
  → Auth0 callback: /hospitality/callback → redirects to /
  → accessToken injected into all API calls via @mbe/api-client
```

**Key files:**

- `src/App.tsx` — auth gate, callback route
- `src/main.tsx` — AuthProvider setup, route definitions
- `src/constants/auth.ts` — env var validation (fails fast if missing)

**Agent constraint:** Never bypass auth checks. All API calls must use `createApiClient` or `ApiClient` with `getAccessToken`.

---

## Data Flow Patterns

### Pattern 1: Page-Level Fetch

Most pages follow this pattern:

```typescript
// 1. Create API client (memoized on accessToken)
const api = useMemo(
  () =>
    createApiClient({
      baseUrl: import.meta.env.VITE_API_URL ?? "",
      getAccessToken: () => accessToken,
    }),
  [accessToken]
);

// 2. Fetch on mount or dependency change
useEffect(() => {
  async function load() {
    setIsLoading(true);
    try {
      const response = await api.reservations.list({ date, limit: 50 });
      setReservations(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  }
  load();
}, [api, date]);
```

**Agent constraint:** Always handle loading, error, and empty states. Use `PaginatedResponse<T>.data` for the array.

### Pattern 2: Optimistic Updates

Used for real-time feel (table status toggle, reservation edit):

```typescript
// 1. Update local state immediately
setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, status: nextStatus } : t)));

// 2. Call API
try {
  await api.tables.updateStatus(tableId, nextStatus);
} catch {
  // 3. Revert on failure
  setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, status: previousStatus } : t)));
}
```

**Agent constraint:** Always revert optimistic updates on API failure. Never mutate state directly.

### Pattern 3: Real-Time SSE

The `useReservationEvents` hook manages a persistent SSE connection:

```
Browser ──EventSource──→ /api/v1/events/stream?venueId=X
  ← reservation:created { ...reservation }
  ← reservation:updated { ...reservation }
  ← reservation:cancelled { ...reservation }
  ← table:updated { ...table }
  ← hold:created { ...hold }
  ← hold:released { ...hold }
  ← hold:confirmed { ...reservation }
```

**Reconnection:** Exponential backoff, max 30 seconds. Uses `useRef` for stable callbacks.

**Agent constraint:** When adding SSE event handlers, use callback refs (not inline functions) to avoid reconnection on every render.

### SSE Reconnection Strategy

The `useReservationEvents` hook implements exponential backoff reconnection:

```typescript
// Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
reconnectAttempts.current += 1;

reconnectTimeoutRef.current = setTimeout(() => {
  connectRef.current?.();
}, delay);
```

**Reconnection Flow:**

1. Connection drops → `onerror` fires
2. Wait `delay` ms (1s, 2s, 4s, ... 30s max)
3. Attempt reconnection
4. If fails, increment counter and retry
5. After 5 consecutive failures, continue with 30s intervals

**Max Retries:** Unlimited (will keep trying indefinitely)
**Max Backoff:** 30 seconds

### Message Ordering Guarantees

The SSE stream provides **at-least-once delivery** with the following guarantees:

- Events are delivered in **chronological order** (server-side timestamp)
- The server uses a **sequence number** (`eventId`) for ordering
- Client uses `Last-Event-ID` header for reconnection resumption

**Sequence Diagram:**

```
Client connects      →  EventSource with Last-Event-ID: 100
Server sends         ←  id:101, event: reservation:created
Server sends         ←  id:102, event: reservation:updated
Connection drops     →  (client disconnects)
Client reconnects     →  EventSource with Last-Event-ID: 102
Server resumes       ←  id:103, event: reservation:created
Server sends         ←  id:104, event: table:updated
```

### Duplicate Detection

After reconnection, **duplicates may occur**:

1. Client reconnects with `Last-Event-ID: 102`
2. Server resumes from `103`, but `102` may be re-delivered
3. Client must deduplicate by `id`

**Deduplication Pattern:**

```typescript
const processedIds = useRef(new Set<string>());

function handleEvent(event: ReservationEvent) {
  if (processedIds.current.has(event.id)) {
    return; // Skip duplicate
  }
  processedIds.current.add(event.id);

  // Process the event
  switch (event.type) {
    case "reservation:created":
      setReservations((prev) => [...prev, event.data]);
      break;
    case "reservation:updated":
      setReservations((prev) => prev.map((r) => (r.id === event.data.id ? event.data : r)));
      break;
  }
}
```

### Service Restart Behavior

When the reservations service restarts:

1. **During restart** (~5-10 seconds): SSE connection fails
2. **Client reconnects** automatically with exponential backoff
3. **Last-Event-ID resume**: Server delivers missed events since last `id`
4. **Client deduplicates**: Already-processed events are skipped

**Health Check Recovery:**

```typescript
// Server sends heartbeat every 30s to detect stale connections
// If no heartbeat for 60s, client triggers reconnect
const heartbeatTimeout = 60000;
```

### Event Types Reference

| Event Type              | Payload           | Client Action          |
| ----------------------- | ----------------- | ---------------------- |
| `reservation:created`   | `Reservation`     | Add to list            |
| `reservation:updated`   | `Reservation`     | Update in list         |
| `reservation:cancelled` | `Reservation`     | Remove from list       |
| `table:updated`         | `Table`           | Update table state     |
| `hold:created`          | `ReservationHold` | Add hold indicator     |
| `hold:released`         | `ReservationHold` | Remove hold indicator  |
| `hold:confirmed`        | `Reservation`     | Convert to reservation |

---

## Component Architecture

### Layout Hierarchy

```
<AuthProvider>
  <RialtoProvider>
    <BrowserRouter basename="/hospitality">
      <App>                          // Auth gate
        <DashboardLayout>            // Sidebar + main content
          <DashboardSidebar>         // Nav sections, collapsible, mobile drawer
          <main>
            <Outlet />               // Lazy-loaded pages
          </main>
          <GenCopilot />             // AI assistant (conditional)
          <CommandPalette />         // ⌘K navigation
        </DashboardLayout>
      </App>
    </BrowserRouter>
  </RialtoProvider>
</AuthProvider>
```

### Component Groups

| Group               | Location                           | Purpose                                                                                       |
| ------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------- |
| `timeline/`         | `src/components/timeline/`         | TimelineGrid, ReservationBlock, CancelDialog, EditDrawer, WalkInDialog                        |
| `booking-widget/`   | `src/components/booking-widget/`   | BookingWidget (4-step), DatePartySelector, TimeSlotPicker, GuestDetailsForm, ConfirmationView |
| `floor-plan/`       | `src/components/floor-plan/`       | FloorPlanCanvas (Konva.js), TableShape, NewFloorPlanDialog, AddTableDialog                    |
| `venue-onboarding/` | `src/components/venue-onboarding/` | 5-step wizard: BasicInfo, Location, Hours, Settings, Confirmation                             |
| `dashboard/`        | `src/components/dashboard/`        | ReservationList, ActivityFeed (used by HomePage)                                              |

### Styling Rules

1. **CSS Modules** for all component styles (`.module.css`)
2. **Rialto tokens** for all visual values — `var(--rialto-*)` only, no hardcoded colors
3. **CSS logical properties** — `inline-start` not `left`, `block-end` not `bottom`
4. **Rialto easing** — `var(--rialto-ease-precision)` for transitions
5. **Rialto components** for UI primitives — never raw `<button>`, `<input>`, `<select>` in pages

---

## API Surface

### Reservations

| Method | Endpoint                                     | Used By                                  |
| ------ | -------------------------------------------- | ---------------------------------------- |
| `GET`  | `/api/v1/reservations?date=&venueId=&limit=` | HomePage, TimelinePage, ReservationsPage |
| `POST` | `/api/v1/reservations`                       | WalkInDialog                             |
| `PUT`  | `/api/v1/reservations/:id`                   | EditReservationDrawer                    |
| `PUT`  | `/api/v1/reservations/:id/cancel`            | CancelReservationDialog                  |
| `PUT`  | `/api/v1/reservations/:id/seat`              | TimelinePage (seat action)               |

### Tables

| Method   | Endpoint                         | Used By                                           |
| -------- | -------------------------------- | ------------------------------------------------- |
| `GET`    | `/api/v1/tables?venueId=&limit=` | TimelinePage, HomePage                            |
| `POST`   | `/api/v1/tables`                 | AddTableDialog                                    |
| `PUT`    | `/api/v1/tables/:id`             | FloorPlanCanvas (position), TimelinePage (status) |
| `DELETE` | `/api/v1/tables/:id`             | FloorPlanEditorPage                               |

### Venues

| Method | Endpoint                | Used By                                         |
| ------ | ----------------------- | ----------------------------------------------- |
| `GET`  | `/api/v1/venues?limit=` | TimelinePage, GuestsPage, BookingWidgetDemoPage |
| `POST` | `/api/v1/venues`        | VenueOnboardingPage                             |

### Guests

| Method | Endpoint                                | Used By                |
| ------ | --------------------------------------- | ---------------------- |
| `GET`  | `/api/v1/guests?venueId=&limit=`        | GuestsPage             |
| `GET`  | `/api/v1/guests/search?venueId=&query=` | GuestsPage             |
| `GET`  | `/api/v1/guests/segments?venueId=`      | GuestsPage             |
| `POST` | `/api/v1/guests/find-or-create`         | GuestsPage (Add Guest) |

### Floor Plans

| Method | Endpoint                           | Used By             |
| ------ | ---------------------------------- | ------------------- |
| `GET`  | `/api/v1/floor-plans?limit=`       | FloorPlansPage      |
| `GET`  | `/api/v1/floor-plans/:id`          | FloorPlanEditorPage |
| `POST` | `/api/v1/floor-plans`              | NewFloorPlanDialog  |
| `PUT`  | `/api/v1/floor-plans/:id/activate` | FloorPlanEditorPage |

### Users

| Method | Endpoint                        | Used By                   |
| ------ | ------------------------------- | ------------------------- |
| `GET`  | `/api/v1/users/me`              | ProfilePage, SettingsPage |
| `GET`  | `/api/v1/users?page=&limit=`    | AdminPage                 |
| `PUT`  | `/api/v1/users/:id`             | ProfilePage               |
| `PUT`  | `/api/v1/users/:id/preferences` | SettingsPage              |

### Events

| Method      | Endpoint                         | Used By                   |
| ----------- | -------------------------------- | ------------------------- |
| `GET` (SSE) | `/api/v1/events/stream?venueId=` | useReservationEvents hook |

---

## State Management

**No global store.** State is managed via:

1. **React hooks** (`useState`, `useMemo`, `useCallback`) — page-level state
2. **Custom hooks** — shared logic (`useDashboardStats`, `useReservationEvents`, `useTheme`, `useCommandPalette`)
3. **Context** — theme only (`ThemeContext`)
4. **localStorage** — theme preference, venue defaults, sidebar collapse state

**Known gap:** No cross-page state sync. If a reservation is edited on TimelinePage, ReservationsPage shows stale data until reload. A global state layer (Zustand, TanStack Query) would fix this.

---

## Testing Architecture

### E2E Tests (Playwright)

```
apps/hospitality/e2e/
├── fixtures.ts        # authPage fixture with Auth0 login
├── *.spec.ts          # Test specs
```

**Auth pattern:** Uses Resource Owner Password Grant (no browser login flow). Requires `E2E_AUTH*` env vars.

**Agent constraint:** New E2E tests MUST use the `authPage` fixture from `e2e/fixtures.ts`, not raw `page`.

### Unit Tests (Vitest)

Component tests colocated with source files (e.g., `VenueOnboardingPage.test.tsx`).

---

## Common Pitfalls for Agents

1. **Don't create API clients inside useEffect** — memoize with `useMemo` keyed on `accessToken`
2. **Don't use raw HTML elements in pages** — always use Rialto components
3. **Don't hardcode colors** — use `var(--rialto-*)` tokens, including for SVG fills/strokes
4. **Don't forget cleanup** — useEffect cleanup for SSE, timers, AbortController
5. **Don't mutate state** — always use immutable updates (`{ ...obj }`, `.map()`, `.filter()`)
6. **Don't skip error states** — every API call needs loading, error, and empty handling
7. **Don't import from relative paths without `.js`** — ES modules require explicit extensions
8. **Don't use `react-router-dom` v5 APIs** — use v7 APIs (`useNavigate`, not `useHistory`)
