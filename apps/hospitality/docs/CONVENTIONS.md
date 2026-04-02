# Hospitality App Conventions

Architectural constraints for AI agents writing code in this app. Each pattern includes a real snippet from the codebase and constraints to follow.

---

## 1. Page Structure Pattern

**When:** Creating a new page component.

Every page follows this file layout:

```
/* -- Constants ------------------------------ */
/* -- Loading skeleton ----------------------- */
/* -- Sub-components (dialogs, drawers, etc) - */
/* -- Main component ------------------------- */
```

The main component is the only export. Loading skeletons and sub-components are private functions in the same file.

**From `GuestsPage.tsx`:**

```tsx
/* -- Constants -------------------------------- */

const SEGMENT_ACCENT_COLORS = [
  "var(--rialto-accent)",
  "var(--rialto-success)",
  "var(--rialto-warning)",
  "var(--rialto-text-secondary)",
] as const;

/* -- Loading skeleton ------------------------- */

function GuestsLoadingSkeleton() {
  return (
    <div className={styles.container}>
      <PageHeader title="Guests" description="Manage your guest directory" />
      <SkeletonGroup>
        <div className={styles.segmentsGrid}>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} variant="card" width="100%" height={80} />
          ))}
        </div>
        <Skeleton variant="card" width="100%" height={300} />
      </SkeletonGroup>
    </div>
  );
}

/* -- Main component --------------------------- */

export function GuestsPage() {
  // ...
}
```

**Constraints:**
- Every page must have a `LoadingSkeleton` component that mirrors the page layout
- Use `PageHeader` from `../components/PageHeader` for the title/description
- Section comments use `/* -- label --- */` format
- Only the main page component is exported (named export, not default)

---

## 2. Data Fetching Pattern

**When:** A page or hook needs to call the API.

Memoize the API client with `useMemo` keyed on `accessToken`. Fetch with `useCallback` + `useEffect`. Handle errors with `err instanceof Error ? err.message : "fallback"`.

**From `GuestsPage.tsx`:**

```tsx
const { accessToken } = useAuth();

const api = useMemo(
  () =>
    createApiClient({
      baseUrl: import.meta.env.VITE_API_URL ?? "",
      getAccessToken: () => accessToken,
    }),
  [accessToken]
);

const fetchGuests = useCallback(async () => {
  if (!selectedVenueId) {
    setIsLoading(false);
    return;
  }

  setIsLoading(true);
  setError(null);

  try {
    const [guestsResponse, segmentsResponse] = await Promise.all([
      searchQuery
        ? api.guests.search({ venueId: selectedVenueId, query: searchQuery })
        : api.guests.list({ venueId: selectedVenueId, limit: 50 }),
      api.guests.getSegments(selectedVenueId),
    ]);

    setGuests(guestsResponse.data);
    setSegments(segmentsResponse);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Failed to load guests");
  } finally {
    setIsLoading(false);
  }
}, [api, selectedVenueId, searchQuery]);

useEffect(() => {
  fetchGuests();
}, [fetchGuests]);
```

**Constraints:**
- Never use raw `fetch` -- always use `createApiClient` from `@mbe/api-client`
- Always memoize the API client: `useMemo(() => createApiClient(...), [accessToken])`
- Wrap fetch functions in `useCallback` so they can be called from effects and event handlers
- Use `Promise.all` for parallel requests
- Always set `isLoading` in `finally` block
- Error messages must be user-friendly strings, not raw Error objects

---

## 3. Custom Hook Pattern

**When:** Extracting reusable data-fetching or stateful logic from a page.

Hooks return a typed result object. Pure computation is extracted to standalone functions above the hook.

**From `useDashboardStats.ts`:**

```tsx
// Return type is explicitly defined
export interface UseDashboardStatsResult {
  reservations: readonly Reservation[];
  stats: DashboardStats;
  isLoading: boolean;
  error: string | null;
}

// Fallback constant for empty state
const FALLBACK_STATS: DashboardStats = {
  totalReservations: 0,
  expectedCovers: 0,
  upcomingCount: 0,
  cancellationRate: 0,
  cancellationTrend: "neutral",
};

// Pure computation extracted from hook
function computeStats(reservations: readonly Reservation[]): DashboardStats {
  if (reservations.length === 0) return FALLBACK_STATS;
  // ...
}

export function useDashboardStats(): UseDashboardStatsResult {
  const { accessToken } = useAuth();
  const { selectedVenueId } = useVenue();
  const [reservations, setReservations] = useState<readonly Reservation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: import.meta.env.VITE_API_URL ?? "",
        getAccessToken: () => accessToken,
      }),
    [accessToken]
  );

  // ... fetch logic ...

  const stats = useMemo(() => computeStats(reservations), [reservations]);

  return { reservations, stats, isLoading, error };
}
```

**Constraints:**
- Export both the hook and its result type interface
- Use `readonly` arrays in state: `useState<readonly Reservation[]>([])`
- Extract pure computation into standalone functions above the hook (not inside it)
- Memoize derived data with `useMemo`
- Use `useVenue()` context for venue ID -- don't re-fetch venues in every hook
- Always return `isLoading` and `error` alongside data

---

## 4. Sub-Component Pattern

**When:** Extracting a presentational component from a page.

Sub-components live in `src/components/<domain>/` and receive data via props (no direct API calls). Use `readonly` for array props.

**From `ReservationList.tsx`:**

```tsx
import { Card, Text, Badge, Skeleton } from "@mbe/rialto";
import type { Reservation } from "@mbe/types";
import styles from "../../pages/HomePage.module.css";

const STATUS_VARIANT: Record<string, "neutral" | "success" | "warning" | "error"> = {
  PENDING: "warning",
  CONFIRMED: "success",
  CANCELLED: "error",
  COMPLETED: "neutral",
  NO_SHOW: "error",
};

interface ReservationListProps {
  readonly reservations: readonly Reservation[];
  readonly isLoading: boolean;
}

export function ReservationList({ reservations, isLoading }: ReservationListProps) {
  if (isLoading) {
    return (
      <Card title="Today's Reservations">
        <Skeleton variant="rect" height={120} width="100%" />
      </Card>
    );
  }

  const active = reservations.filter(
    (r) => r.status !== "CANCELLED" && r.status !== "NO_SHOW"
  );

  if (active.length === 0) {
    return (
      <Card title="Today's Reservations">
        <Text variant="body" color="secondary">
          No reservations today
        </Text>
      </Card>
    );
  }

  const sorted = [...active].sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <Card title="Today's Reservations">
      <ul className={styles.reservationList}>
        {sorted.map((r) => (
          <li key={r.id} className={styles.reservationItem}>
            {/* ... */}
          </li>
        ))}
      </ul>
    </Card>
  );
}
```

**Constraints:**
- Sub-components handle their own loading/empty states -- the parent just passes data
- Props interface uses `readonly` modifier on the interface and `readonly` arrays
- Sort/filter creates new arrays (`[...active].sort(...)`) -- never mutate props
- Static lookup maps (like `STATUS_VARIANT`) are module-level constants, not inline
- Sub-components use Rialto components for all UI -- no raw HTML elements for buttons, inputs, etc.

---

## 5. Context Pattern

**When:** Sharing state across multiple pages (e.g., venue selection).

Create a context with provider, consumer hook, and localStorage persistence.

**From `VenueContext.tsx`:**

```tsx
interface VenueContextValue {
  venues: readonly Venue[];
  selectedVenueId: string | null;
  selectedVenue: Venue | null;
  setVenueId: (id: string) => void;
  isLoading: boolean;
  isMultiVenue: boolean;
}

const STORAGE_KEY = "mbe-hospitality-venue-id";

function readStoredVenueId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeVenueId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore storage errors */
  }
}

const VenueContext = createContext<VenueContextValue | null>(null);

export function VenueProvider({ children }: VenueProviderProps) {
  // ... fetch venues, manage selection, persist to localStorage ...

  const value = useMemo<VenueContextValue>(
    () => ({
      venues,
      selectedVenueId,
      selectedVenue,
      setVenueId,
      isLoading,
      isMultiVenue,
    }),
    [venues, selectedVenueId, selectedVenue, setVenueId, isLoading, isMultiVenue]
  );

  return (
    <VenueContext.Provider value={value}>{children}</VenueContext.Provider>
  );
}

export function useVenue(): VenueContextValue {
  const context = useContext(VenueContext);
  if (!context) {
    throw new Error("useVenue must be used within a VenueProvider");
  }
  return context;
}
```

**Constraints:**
- Context default is `null`, not a fake default -- the consumer hook throws if used outside the provider
- `useMemo` the context value object to prevent unnecessary re-renders
- Wrap localStorage in try/catch -- storage can be unavailable (private browsing, quota exceeded)
- Storage keys use `mbe-hospitality-` prefix
- Use cancellation flag (`let cancelled = false`) in async effects to prevent state updates after unmount
- Export both the provider and the consumer hook, plus the value type

---

## 6. SSE Integration Pattern

**When:** Subscribing to real-time reservation/table events.

Use the `useReservationEvents` hook. Callbacks must be stored in refs to avoid reconnections.

**From `useReservationEvents.ts`:**

```tsx
// Store callbacks in refs to avoid reconnecting on callback changes
const callbacksRef = useRef({
  onReservationCreated,
  onReservationUpdated,
  onReservationCancelled,
  onHoldCreated,
  onHoldReleased,
  onHoldConfirmed,
  onTableUpdated,
  onError,
});

// Update callbacks ref when they change
useEffect(() => {
  callbacksRef.current = {
    onReservationCreated,
    onReservationUpdated,
    // ...
  };
});

// Exponential backoff reconnection
eventSource.onerror = () => {
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
  reconnectAttempts.current += 1;

  reconnectTimeoutRef.current = setTimeout(() => {
    connectRef.current?.();
  }, delay);
};
```

**Usage in a page:**

```tsx
useReservationEvents({
  venueId: selectedVenueId ?? undefined,
  onReservationCreated: (reservation) => {
    setReservations((prev) => [...prev, reservation]);
  },
  onReservationUpdated: (reservation) => {
    setReservations((prev) =>
      prev.map((r) => (r.id === reservation.id ? reservation : r))
    );
  },
  enabled: !!selectedVenueId,
});
```

**Constraints:**
- Never pass inline arrow callbacks that depend on state -- the hook uses refs internally, but the page-side callbacks should use state updater functions (`setPrev((prev) => ...)`) to avoid stale closures
- Always pass `enabled: !!selectedVenueId` to prevent connecting before venue selection
- The hook manages its own reconnection with exponential backoff (1s, 2s, 4s, ... capped at 30s)
- `connectRef` uses `useLayoutEffect` to stay in sync -- this is intentional, do not change to `useEffect`
- The cleanup function closes the EventSource and clears reconnect timeouts

---

## 7. Form Pattern

**When:** Building forms (dialogs, settings, inline editors).

Use controlled inputs with individual `useState` calls. Reset state on close. Disable submit while in-progress.

**From `GuestsPage.tsx` (AddGuestDialog):**

```tsx
function AddGuestDialog({ open, onClose, onSubmit, isSubmitting, error }: AddGuestDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const handleClose = useCallback(() => {
    setName("");
    setEmail("");
    setPhone("");
    setNotes("");
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    await onSubmit({ name, email, phone, notes });
    setName("");
    setEmail("");
    setPhone("");
    setNotes("");
  }, [name, email, phone, notes, onSubmit]);

  return (
    <Dialog open={open} onClose={handleClose} title="Add Guest"
      footer={
        <Stack direction="row" gap="sm" justify="end">
          <Button variant="ghost" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit}
            disabled={isSubmitting || name.trim().length === 0}>
            {isSubmitting ? "Adding..." : "Add Guest"}
          </Button>
        </Stack>
      }>
      <Stack gap="md">
        {error && <Alert variant="error">{error}</Alert>}
        <Input label="Name" type="text" placeholder="Full name"
          value={name} onChange={(e) => setName(e.target.value)} required />
        {/* ... more inputs ... */}
      </Stack>
    </Dialog>
  );
}
```

**From `SettingsPage.tsx` (server-persisted preference):**

```tsx
const updatePreference = useCallback(
  async <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccessMessage(null);

      const updatedUser = await usersClient.updatePreferences({ [key]: value });
      setUser(updatedUser);
      setSuccessMessage("Settings saved");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  },
  [accessToken]
);
```

**Constraints:**
- Use individual `useState` per field -- no form library, no single state object
- Reset all fields on dialog close and after successful submit
- Show `isSubmitting` state on the submit button (text changes: "Add Guest" -> "Adding...")
- Disable both Cancel and Submit while submitting
- Validation is inline: `disabled={isSubmitting || name.trim().length === 0}`
- Error display uses `<Alert variant="error">` inside the form
- Success messages auto-dismiss with `setTimeout(() => setSuccessMessage(null), 3000)`
- localStorage-backed settings use helper functions with try/catch (see `readLocalStorage`/`writeLocalStorage` in SettingsPage)

---

## 8. CSS Module Pattern

**When:** Styling page-specific layouts.

Each page has a co-located `.module.css` file. All values use Rialto design tokens. Use CSS logical properties.

**From `GuestsPage.module.css`:**

```css
.container {
  padding: var(--rialto-space-lg);
}

.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-block-end: var(--rialto-space-lg);
  gap: var(--rialto-space-md);
}

.segmentCard {
  border-inline-start: 3px solid var(--rialto-border);
  border-radius: var(--rialto-radius-soft);
  padding-inline-start: var(--rialto-space-xs);
}

.tableRow {
  cursor: pointer;
  transition: background-color 150ms var(--rialto-ease-precision);
}

.tableRow:hover {
  background: var(--rialto-surface-recessed);
}

.mobileCard:focus-visible {
  outline: none;
  box-shadow: var(--rialto-shadow-focus);
}

/* Responsive: mobile cards replace desktop table */
@media (max-width: 768px) {
  .desktopTable {
    display: none;
  }
  .mobileCards {
    display: flex;
    flex-direction: column;
    gap: var(--rialto-space-sm);
  }
}

@media (max-width: 480px) {
  .container {
    padding: var(--rialto-space-md);
  }
}
```

**Constraints:**
- Never hardcode colors -- use `var(--rialto-*)` tokens for colors, spacing, radii, shadows, typography, and easing
- Use logical properties: `margin-block-end` not `margin-bottom`, `padding-inline-start` not `padding-left`
- Breakpoints: `768px` for tablet, `480px` for mobile
- Mobile-first pattern: hide desktop table at 768px, show mobile cards
- Transitions use `var(--rialto-ease-precision)` easing
- Focus styles use `var(--rialto-shadow-focus)` -- never use browser default outline without replacement
- Screen-reader-only class `.srOnly` uses the standard clip-rect technique
- Class names are camelCase (CSS Modules convention)

---

## 9. Error Handling Pattern

**When:** Every page and component that fetches data.

Handle the loading/error/empty trifecta. Order: loading skeleton first, then error alert, then empty state, then content.

**From `GuestsPage.tsx`:**

```tsx
// 1. Loading state -- show skeleton
if (isLoading && guests.length === 0) {
  return <GuestsLoadingSkeleton />;
}

// 2. Inside the main return, show error alert (dismissible)
{error && (
  <Alert variant="error" dismissible onDismiss={() => setError(null)}>
    {error}
  </Alert>
)}

// 3. Empty state -- only show when not loading and no error
{!isLoading && !error && guests.length === 0 && (
  <div aria-live="polite" role="status">
    <EmptyState
      heading={searchQuery ? "No guests found" : "No guests yet"}
      description={
        searchQuery
          ? "Try adjusting your search query."
          : "Guests will appear here once they make a reservation."
      }
    />
  </div>
)}

// 4. Content -- only show when not loading and no error and data exists
{!isLoading && !error && guests.length > 0 && (
  <>
    {/* ... table/cards ... */}
  </>
)}
```

**From `ReservationList.tsx` (sub-component level):**

```tsx
if (isLoading) {
  return (
    <Card title="Today's Reservations">
      <Skeleton variant="rect" height={120} width="100%" />
    </Card>
  );
}

if (active.length === 0) {
  return (
    <Card title="Today's Reservations">
      <Text variant="body" color="secondary">
        No reservations today
      </Text>
    </Card>
  );
}
```

**Constraints:**
- Loading skeletons must match the shape of the actual content (same widths, approximate heights)
- Error alerts are dismissible with `onDismiss={() => setError(null)}`
- Empty states differentiate between "no data" and "no results for search"
- Use `aria-live="polite"` and `role="status"` on dynamic status messages
- Screen-reader count announcements: `<span className={styles.srOnly} aria-live="polite">`
- Sub-components handle their own loading/empty states -- the parent should not conditionally render them

---

## 10. Testing Pattern

**When:** Writing E2E tests for the hospitality app.

Use the `authPage` fixture from `e2e/fixtures.ts` for authenticated tests. Use the base `test` for unauthenticated tests.

**From `e2e/fixtures.ts`:**

```tsx
import { test as base } from "@playwright/test";
import type { Page } from "@playwright/test";
import { injectAuth0Session } from "./auth-helpers.js";

export const test = base.extend<{ authPage: Page }>({
  authPage: async ({ page }, use) => {
    await injectAuth0Session(page);
    await use(page);
  },
});

export { expect } from "@playwright/test";
```

**From `e2e/auth.spec.ts`:**

```tsx
import { test, expect } from "./fixtures.js";
import { test as base } from "@playwright/test";

// Unauthenticated tests use `base`
base.describe("Authentication -- unauthenticated", () => {
  base("unauthenticated user sees login prompt", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("http://localhost:3002/hospitality/");

    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
    await expect(page.getByTestId("dashboard-layout")).not.toBeVisible();

    await context.close();
  });
});

// Authenticated tests use custom `test` with `authPage`
test.describe("Authentication -- authenticated", () => {
  test("programmatic login loads dashboard", async ({ authPage }) => {
    await expect(authPage.getByTestId("dashboard-layout")).toBeVisible();
    await expect(authPage.getByRole("button", { name: "Sign In" })).not.toBeVisible();
  });

  test("authenticated session persists across navigation", async ({ authPage }) => {
    await authPage
      .getByRole("button", { name: "Reservations" })
      .or(authPage.getByText("Reservations"))
      .first()
      .click();

    await expect(authPage.getByTestId("dashboard-layout")).toBeVisible();
  });
});
```

**Constraints:**
- Always import `test` and `expect` from `./fixtures.js` for authenticated tests
- Use `authPage` fixture -- it handles Auth0 ROPC login automatically
- For unauthenticated tests, import `test as base` from `@playwright/test` and create a fresh browser context
- Use `getByRole` and `getByTestId` selectors -- never use CSS selectors
- Use `.or()` for elements that may have different accessible names
- Test files live in `e2e/` directory with `.spec.ts` extension
- Requires `E2E_AUTH*` env vars (see `.env.example`)

---

## Quick Reference: Import Conventions

```tsx
// React hooks
import { useState, useEffect, useMemo, useCallback } from "react";

// Auth
import { useAuth } from "@mbe/auth/react";

// API client
import { createApiClient } from "@mbe/api-client";

// UI components (always from Rialto)
import { Button, Card, Alert, Text, Stack, Skeleton, SkeletonGroup } from "@mbe/rialto";

// Types (use `import type`)
import type { Reservation, Venue, Guest } from "@mbe/types";

// Local components
import { PageHeader } from "../components/PageHeader";

// Contexts
import { useVenue } from "../contexts/VenueContext.js";

// CSS Modules
import styles from "./MyPage.module.css";
```

**Import order:** React -> external packages -> `@mbe/*` -> local components -> local hooks/contexts -> CSS modules. Use `import type` for type-only imports. Local imports within the app use `.js` extensions.
