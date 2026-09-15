---
stage: architect
run: feature:hospitality-service-ux
date: 2026-09-04
assumptions:
  - '"Local" is the browser clock, not the venue''s IANA zone, for A1/A2 — one module (`utils/local-clock.ts`) owns the calendar-day and hour reads, and every printed time already comes from the same clock (`formatTime`, `computeReservationLayout`). Why: the two defects are UTC-vs-local (`toDateString`, `getUTCHours`), and the venue zone would only be honest if block layout and `formatTime` moved to it too — a change across every time-printing surface, for a viewer outside the venue''s zone that no story in this run covers. In the harness (venue and machine both America/Los_Angeles) the two choices are indistinguishable. What would change it: a story for a remote manager reading tonight''s grid from another zone; the swap is `local-clock.ts` plus a `timeZone` option on `formatTime`/`computeReservationLayout`.'
  - 'Palette ranking lives in rialto''s `CommandPalette` (a pure `rankCommandMatch`, prefix > word-start > substring > initials, groups ordered by best match), not in the app. Why: the palette owns the query — the app never sees what the Host typed, so it cannot rank; today''s initials heuristic also makes "Waitlist" match "walk" at all. Losing alternative: reorder `groups` so Actions render first (fixes P14 by tie-break only, leaves the false match, has no ranking to test). Cost: a rialto patch changeset. What would change it: `CommandPalette` exposing the query (`onQueryChange`) — then the app could rank.'
  - 'The tablet sheet needs a rialto `Drawer size="compact"` (bottom ≈ 240 px; right/left 320 px) — `size="default"` on `side="bottom"` is `min(50vh, 480px)` = 384 px at 768 tall, which leaves three table rows, not the ≥ 5 the UX stage designed. Losing alternative: keep `default` and accept three rows (A5''s 4-hour span still passes because a bottom sheet never covers hours). What would change it: the UX stage accepting three rows.'
  - "`ErrorRetryBanner` evolves in place (optional `title`, `details`, `onRetry`; `error` stays a sentence string) instead of a new `ErrorNotice` — because in-flight files (`FloorPlanEditorPage`, `LaunchStep`) call it with a string and may not be touched. What would change it: the in-flight run landing; then a rename is a follow-up."
  - 'The guest booking widget (`useBookingFlow`, `WaitlistJoinView`) adopts `describeApiError` with the Host-voice table verbatim — B1 says no rendered text anywhere outside in-flight files may be a request line, and the widget''s `err.message` for a 5xx is one. The `network` sentence ("Check the venue''s connection") reads oddly for a guest; surfaced below. What would change it: UX supplying a guest variant (one table row, one `audience` argument).'
  - "B3's rialto half (#4970, `useFocusTrap` `initialFocus`/restore) stays routed. The walk-in dialog's first focus is an app-level effect (focus the pressed party-size control after the trap runs), and focus return is owned by `TimelinePage` at event time, so nothing in this run depends on the rialto change. What would change it: nothing in this run; #4970 remains the right home for a reusable option."
  - "This run's `TimelineGrid.tsx` edits stay off PR #4967's two hunks except one line — the `isSeated` prop on `<ReservationBlock>` sits inside #4967's block-render hunk. Whichever lands second re-applies that one line. What would change it: deriving the seated mark inside `ReservationBlock` from a context — rejected as a hidden input to a memoised component."
  - 'The E2E mock''s "today" (`api-mocks.ts` `todayReservations`) becomes the runner''s local day (`toLocaleDateString("en-CA")`), the twin of `localDateString` — so app and mock agree on every machine (UTC runners and a Pacific laptop alike). The fixture venue''s `America/New_York` is irrelevant under the browser-clock decision. What would change it: the venue-zone decision above.'
  - 'Amendment 2026-09-04: the ⌘K "New Reservation" intent (`/reservations?new=true`; `parseReservationsIntent` / `stripReservationsIntent` in `utils/timeline-intent.ts`; read by `ReservationsPage` on render) mirrors the walk-in intent by construction — the same key convention (`<key>=true`, exact value), the same module and test file, the same derive-on-render / strip-on-close / `replace: true` shape, and the same Escape-to-the-page''s-own-button focus rule — so the two contracts cannot drift apart. What would change it: a third page intent (then the module is renamed `url-intent.ts` around one generic pair), or UX giving the Reservations create a sentence and a row focus target (then success focuses the new row instead of the page heading).'
surfaced:
  - 'Copy gap (UX): the guest widget now shows the Host table''s sentences; the `network` row says "Check the venue''s connection" to a guest on their phone. One guest variant of that row closes it.'
  - 'Rialto change proposed with changeset (patch): `Drawer` gains `size="compact"` (bottom `min(40vh, 240px)`, right/left `min(320px, calc(100vw - 48px))`) — story + a11y test included; `pnpm regen` after (rialto-catalog schemas + llms).'
  - "Rialto change proposed with changeset (patch): `CommandPalette` ranks matches (`rankCommandMatch`, exported) and orders groups by best match when a query is present; the initials match becomes strict (each query character opens a word, query length ≤ word count). Existing tests unaffected (no test depends on the loose initials match); one story added."
  - '`Stat` needs no rialto change: `KpiStat` (app) renders "—" and overrides the group `aria-label` with "<label>, unavailable" — `Stat` spreads `HTMLAttributes` after its own `aria-label`, so the override wins.'
  - "PR #4967 reports `mergeStateStatus: UNKNOWN` (dispatch said BLOCKED) — observed, not a blocker."
  - "StrictMode Escape-path suspicion — verified by reading, not at runtime: `WalkInDialog`/`CancelReservationDialog` capture `document.activeElement` in a mount effect declared before `useFocusTrap`; StrictMode's double-invoke re-runs the capture after the trap has moved focus into the panel, so the restore target becomes the dialog's own first button and focus lands on `<body>` in dev. The same shape exists in rialto's `useReturnFocus` (Drawer, Dialog, DropdownMenu, CommandPalette) — belongs to #4970. This run removes the dependency by capturing at event time in the page."
  - "B1's regression guard is a vitest source scan (`lib/describe-api-error.guard.test.ts`), not a lint rule — the eslint plugin is outside this run's allowed paths."
  - "`useDashboardStatsQuery.getTodayString` (UTC day for the dashboard's reservation count) is the same defect class as A1, outside the 14 stories; backlog seed (b) in routing.md already holds it, and `localDateString` is its one-line fix."
---

# Architecture: Hospitality service UX — an honest tablet at the door

## Approach

Fourteen stories, one shape: **the page owns outcomes; the control owns its own failure; pure functions own the facts that were wrong.** Nothing here adds a backend, a schema, or a route. The work is four seams and a handful of pure modules that the existing pages adopt.

1. **Facts as pure functions.** Every correctness defect the audit measured is a function that read the wrong clock, the wrong field, or nothing at all: `isToday` (UTC), the Briefing segment (UTC hours), "Seated" (never derived), the palette match (no ranking), the walk-in intent (no URL contract). Each becomes a small, tested function with one caller set: `localDateString`/`localHour`, `segmentForHour`, `isSeated`/`seatedReservationIds`, `rankCommandMatch`, `parseTimelineIntent`/`stripTimelineIntent`. Decompose can TDD each in isolation.
2. **One voice for bad news.** `describeApiError(error)` turns any thrown value into `{ category, detail, retryable, recovery, raw }` using the UX copy table verbatim. `ErrorRetryBanner` is the single rendering of an error anywhere in the app (title from the surface, detail from the helper, raw line demoted behind "Show details", Retry when retryable). A source-scan test keeps raw `err.message` from ever being rendered again.
3. **Load state and mutation state are different things.** `TimelinePage`'s ternary is replaced by two independent axes: the grid area shows skeleton / grid / empty-night / nothing-loaded by the **fetch** state only; mutation failures render inside the acting dialog or as a dismissible banner above a grid that never unmounts. Dialogs rethrow so the page never has to know how a dialog shows an error; the page only handles success (selection, announcement, focus).
4. **Outcomes are spoken and focused by the page.** Two small hooks — `useStatusMessage` (one `role=status` region per page) and `useFocusAfter` (focus a target after the next render) — are the only way a result reaches a screen reader or the keyboard. Pages call them from event handlers; no component restores focus on its own any more.

Two shapes were compared for the whole feature. **Shape B — a `TimelineController` hook** that owned selection, dialogs, errors, announcements and focus behind one interface — was rejected: it would have moved 300 lines out of `TimelinePage.tsx` into a module with a wider interface than the page itself and no second consumer (a "manager" by another name). Shape A (above) keeps the page as the orchestrator and pushes only the reusable, testable parts down: the four pure-fact modules and the two outcome hooks, each with at least two consumers.

Rialto's vocabulary falls short in exactly two places, both proposed with changesets: `Drawer size="compact"` (the tablet sheet height) and ranked matching in `CommandPalette` (the app cannot rank a query it never sees). Everything else is composition.

## Components

All paths are under `apps/hospitality/src/` unless prefixed `packages/`.

### `utils/local-clock.ts` (new)

- Responsibility: the one place the app reads the calendar day and the hour of a `Date` for display decisions. `localDateString(now)` (en-CA `YYYY-MM-DD`), `localHour(now)`, `isLocalToday(dateString, now)`. Replaces `toDateString` (UTC) in `TimelineGrid` and `getUTCHours` in `BriefingPage`; adopted by `TimelinePage`'s `todayStr`, `handleToday`, and the day arrows (already en-CA, now via one name).
- Collaborators: `TimelineGrid`, `TimelinePage`, `BriefingPage` (`segmentForHour`), the E2E mock's twin.

### `lib/describe-api-error.ts` (new)

- Responsibility: map any thrown value to the house-voice description. Categorises `ApiClientError.category` (`@mbe/api-client`), the two non-HTTP cases (network `TypeError` after retries; timeout `DOMException` name `TimeoutError`/`AbortError` from `AbortSignal.timeout`), and everything else as `unknown`. Uses `problemDetails.detail` verbatim for `conflict`/`validationError`/`badRequest` when present. Mirrors `describe-auth-error.ts` (same folder, same shape of regex-free categorisation).
- Collaborators: `ErrorRetryBanner`, every page and dialog that catches, `use-form-state.ts`, `useBookingFlow.ts`, `WaitlistJoinView.tsx`, the guard test.

### `components/ErrorRetryBanner.tsx` (evolved)

- Responsibility: the only rendering of an error to a person. `Alert variant="error"` with `title` (surface-owned), `error` (the detail sentence), optional `details` (raw request line inside a `Collapsible` whose trigger reads "Show details", body `Text variant="caption"`), optional Retry (`Button variant="secondary" size="md"`, ≥ 44 px on coarse pointers) and dismiss (`dismissible` + `onDismiss`). Existing string callers keep working: `title`, `details`, `onRetry` are optional.
- Collaborators: `describeApiError`; callers — `TimelinePage` (load banner, table-status banner, nothing-loaded empty state's description), `WalkInDialog`, `CancelReservationDialog`, `EditReservationDrawer`, `ReservationDetails`/`ReservationSheet` (Seat Guest error), `BriefingPage`, `ReservationsPage`, `WaitlistPage` (form + row), `HomePage`, `AdminPage`, `ProfilePage`, `GuestsPage`, `SettingsPage`, `FloorPlansPage`, `BookingWidgetDemoPage`.

### `lib/describe-api-error.guard.test.ts` (new, test-only)

- Responsibility: B1's regression guard. Walks `src/**/*.{ts,tsx}` (not `*.test.*`), fails on `/\b(?:err|error|fetchError|queryError|loadError|saveError|e)\s*\??\.message\b/` outside an explicit allowlist: `lib/describe-api-error.ts`, `lib/describe-auth-error.ts`, `pages/AuthFailurePage.tsx` (auth voice, auth run), `components/booking-widget/PaymentStep.tsx` (Stripe's own user-facing message), and the in-flight run's files (`pages/FloorPlanEditorPage.tsx`, `components/floor-plan/**`, `components/venue-onboarding/**`, `hooks/useFloorPlans*`). Each allowlist entry carries its reason in the test source.
- Collaborators: none at runtime.

### `utils/seated.ts` (new)

- Responsibility: ux.md Decision (a) as code. `isSeated(reservation, tableStatus, now)` and `seatedReservationIds(reservations, tables, now)`; the only definition of the word "Seated".
- Collaborators: `TimelinePage` (computes the set once per render from `reservations`, `tables`, `useNow()`), `TimelineGrid` → `ReservationBlock` (glyph + "…confirmed, seated"), `ReservationDetails`/`ReservationSheet` (status line "Seated" and the Seat Guest rule), `TimelineMobileView` (card mark).

### `utils/timeline-intent.ts` (new)

- Responsibility: the URL contract for "open the Timeline in a state": `parseTimelineIntent(searchParams)` → `{ walkIn: boolean; selectedId: string | null }` from `walkin=true` / `selected=<id>`; `stripTimelineIntent(searchParams)` → a new `URLSearchParams` without those keys (immutable). `date` stays with `useUrlParams`.
- Collaborators: `TimelinePage` (reads on render, strips on close via `setSearchParams(prev => strip(prev), { replace: true })`), producers — `use-command-palette.ts`, `HomePage`, `WaitlistPage`'s toast action.

### `hooks/useStatusMessage.ts` + `components/LiveStatus.tsx` (new)

- Responsibility: one polite `role="status"` region per page and one way to speak into it. `useStatusMessage()` → `{ status: { seq, text } | null, announce(text) }`; `LiveStatus` renders `<div role="status" aria-live="polite" className={visuallyHidden}><span key={seq}>{text}</span></div>` so an identical sentence twice is still announced (the keyed span remounts).
- Collaborators: `TimelinePage`, `WaitlistPage`, `ReservationsPage`, `BriefingPage`.

### `hooks/useFocusAfter.ts` (new)

- Responsibility: move focus to something that may not exist yet. `useFocusAfter()` → `{ focusAfter(target) }`; targets are `{ kind: "element", element }`, `{ kind: "testId", testId }`, `{ kind: "pageHeading" }` (the `PageHeader` `h1`, given `tabIndex={-1}`). An effect after every commit resolves the pending target, focuses it, and clears it; a target that never resolves is dropped when a new one is requested. Event-time capture (`focusAfter({ kind: "element", element: e.currentTarget })` recorded when a dialog opens) replaces the effect-time capture that StrictMode breaks.
- Collaborators: `TimelinePage` (new block after walk-in: `reservation-block-<id>`; the changed block after seat/cancel; the Edit button after edit; the status trigger after a table change; the Walk-in button after Escape from a URL-opened dialog; page heading after Retry), `WaitlistPage` (Guest name field; next entry card or the "No one waiting" heading; Notify).

### `hooks/useViewport.ts` (new; replaces `useIsMobile` in `TimelinePage`)

- Responsibility: `"phone" | "tablet" | "desktop"` from `(max-width: 767px)` and `(max-width: 1024px)` media queries — `useState` initialised from `matchMedia` plus a `change` listener, the shape of the private `useIsMobile` that `TimelinePage.tsx` and `TimelineGrid.tsx` each define today. `TimelinePage`'s copy is replaced; `TimelineGrid`'s stays (it sits in the #4967 file and is not this run's concern).
- Collaborators: `TimelinePage` (phone → `TimelineMobileView` + right `Drawer`; tablet → grid + `ReservationSheet`; desktop → grid + sidebar). `TimelinePage.module.css` hides `.sidebar` below 1025 px (today 768).

### `components/timeline/TableStatusMenu.tsx` (new; replaces `TableStatusBadge` in the grid)

- Responsibility: ux.md Screen 6. `DropdownMenu` whose `trigger` is a rialto `Button variant="ghost"` carrying `StatusLED` (variant by status) + the status word + chevron, `aria-label="Table 3: Occupied. Change status"`, min 44 × 44 inside the 60 px row. Items from the exported pure `tableStatusMenuItems(status)` → `[{ id: "DIRTY", label: "Mark dirty" }]` from `TABLE_VALID_TRANSITIONS`. `pending` renders the gold in-flight treatment and disables the trigger.
- Collaborators: `TimelineGrid` (renders it in the row header), `TimelinePage` (`onTableStatusChange(tableId, next)` → `updateTableStatus`; owns pending id, banner, announcement, focus back to the trigger via `testId` `table-status-<id>`). `TableStatusBadge` stays for its other consumers.

### `components/timeline/TimelineSkeleton.tsx` (new)

- Responsibility: ux.md Screen 7 loading: header-row `Skeleton variant="rect" height={40}` + five `Skeleton variant="rect" height={60}` inside `<div role="status" aria-busy="true">` with visually-hidden text "Loading tonight's grid…" (the text is content, not a label, so it is announced). Wrapper `data-testid="timeline-skeleton"`.
- Collaborators: `TimelinePage`.

### `components/timeline/TimelineEmptyNight.tsx` (new)

- Responsibility: the overlay `EmptyState variant="flat"` on the hour area when tables exist and the night has no reservations. Props `{ variant: "today" | "otherDate" ; dateLabel; onWalkIn; onToday }` → copy from ux.md Screen 7 ("Quiet so far." + Walk-in primary; "Nothing on the book for Wednesday, Sep 4." + Back to today secondary). "No tables yet." is a page-level `EmptyState` (`TimelinePage`, action Floor plans) because there are no rows to overlay.
- Collaborators: `TimelineGrid` (renders it after the rows, positioned over the hour columns), `TimelinePage` (variant + handlers).

### `components/timeline/useScrollToNow.ts` (new)

- Responsibility: on mount and whenever `date` becomes today, scroll the grid's `scrollLeft` so the now-line sits at 25 % of `clientWidth` (`tableColumnWidth + offset − 0.25 × clientWidth`, clamped ≥ 0). `behavior` is `"instant"` when `useMotionPreset().precision.duration === 0`, else `"smooth"`. No-op when the now-line is absent.
- Collaborators: `TimelineGrid` (ref on `.gridWrapper`).

### `components/timeline/TimelineGrid.tsx` (edited — see § Sequencing against PR #4967)

- Responsibility: unchanged (rows, blocks, now-line, keyboard grid). Edits: `isToday` via `localDateString`; `useScrollToNow`; now-line gains `data-testid="now-line"`, an `aria-hidden` time label (`formatTime(now)`), and the gold token (`--rialto-accent`, was `--rialto-error`); `TableStatusMenu` in the row header; `TimelineEmptyNight` after the rows; `bottomInset` prop → `scroll-padding-block-end` on the wrapper (so a focused block never lands under the sheet); `seatedIds` prop → `isSeated` on each block.
- Collaborators: `TimelinePage`, `ReservationBlock` (new `isSeated` prop: `StatusLED variant="success" size="xs"` before the name, aria-label suffix ", seated"; `arePropsEqual` compares it), `TableStatusMenu`, `TimelineEmptyNight`, `useScrollToNow`.

### `components/timeline/ReservationDetails.tsx` (extracted from `TimelinePage.tsx`) + `ReservationSheet.tsx` (new)

- Responsibility: `ReservationDetails` is today's private component moved to its own file, with the status line and action set rewritten: status word from `isSeated` ("Seated") else `STATUS_LABEL`; caption "Table 4 is still occupied — turn it or move the party." when the table is OCCUPIED and this party is not seated; Seat Guest rendered when `status ∈ {PENDING, CONFIRMED}` and the table is not OCCUPIED; times via `formatTime`; a local `ErrorRetryBanner` (title "Guest not seated.") for a failed seat, focus staying on the button. `ReservationSheet` is the tablet composition: `Drawer side="bottom" size={expanded ? "default" : "compact"} title` with the summary row, tag row (segment badge + allergy tags by the Briefing rule), action row (each ≥ 44 px), and **More ▾** toggling `expanded` (reveals `GuestCard`, email, phone, notes). Desktop keeps the inline `Card` sidebar with `ReservationDetails`; phone keeps the right `Drawer`.
- Collaborators: `TimelinePage` (selection, `onSeat` returning a promise, `onEdit`, `onCancel`), `utils/seated.ts`, `components/crm/guest-signals.ts`, `GuestCard`.

### `components/crm/guest-signals.ts` (extracted from `GuestCard.tsx`)

- Responsibility: `ALLERGY_KEYWORDS`, `isAllergyTag(tag)`, `getSegmentLabel(visitCount, tags)`, `getSegmentVariant(label)` — the rules `GuestCard` already applies, exported once so the Briefing card and the sheet use the same ones.
- Collaborators: `GuestCard` (imports instead of defining), `BriefingCard`, `ReservationSheet`.

### `pages/BriefingPage.tsx` (edited)

- Responsibility: `segmentForHour(hour)` (exported, pure, replaces `getSegmentForTime`'s `getUTCHours`) fed by `localHour(new Date(entry.startTime))`; card time via shared `formatTime`; `BriefingCard` shows the segment `Badge` (guest-signals rule), occasion `Badge`, and per-tag dietary `Tag`s (`isAllergyTag` → `variant="error"` prefixed "Allergy:", else `"default"`); other `guest.tags` hidden. Empty (whole day / one segment) and loading copy per ux.md Screen 1; error → `ErrorRetryBanner` title "Couldn't load tonight's briefing." with Retry (`useBriefing`'s `refetch`) and announcement on success.
- Collaborators: `local-clock`, `format.ts`, `guest-signals`, `describeApiError`, `ErrorRetryBanner`, `useStatusMessage`, `DashboardLayout` (`ROUTE_LABELS.briefing = "Tonight's Service"`).

### `components/KpiStat.tsx` (new)

- Responsibility: `Stat` with an honest unknown. `{ label; value: number | string | null | undefined; size? }` → renders `value ?? "—"`, and only when the value is nullish spreads `aria-label={`${label}, unavailable`}` onto `Stat` (conditional spread — an explicit `undefined` would erase `Stat`'s own label).
- Collaborators: `ReservationsPage` (four KPIs), `TimelinePage` stats row (four figures; the row keeps its current layout so its bounding box does not move when data lands — A9).

### `pages/ReservationsPage.tsx`, `pages/WaitlistPage.tsx`, `pages/HomePage.tsx`, `hooks/use-command-palette.ts`, `components/dashboard/ReservationList.tsx` (edited)

- Responsibility: Reservations — `KpiStat`, five `Skeleton variant="text"` rows while loading, `ErrorRetryBanner` title "Couldn't load reservations." with Retry from `useReservations`' `refetch`, `EmptyState` per Screen 8, announcement + heading focus on Retry success. Waitlist — `useStatusMessage` sentences, `useFocusAfter` targets, `useToast().toast({ variant: "success", action: { label: "View on Timeline", onClick } })` navigating to `/timeline?date=<today>&selected=<id>`, errors via `ErrorRetryBanner` (titles "Not added." / "Not seated." / "Not notified."), the split-failure sentence reworded per Screen 9. Home — quick action "Walk-in" → `/timeline?walkin=true`; banner via the helper. Palette — item label "Walk-in guest"; `groups` become `["Actions", ...sections]` so Actions win a rank tie. `ReservationList` — `STATUS_LABEL[r.status]`.
- Collaborators: as named; the toast link's reservation id comes from the `Reservation` that `api.reservations.walkIn` already returns as the first step of `handleSeat` (the `useSeatWaitlistEntry` result is the waitlist entry, not the reservation).

### `components/timeline/WalkInDialog.tsx`, `CancelReservationDialog.tsx`, `EditReservationDrawer.tsx` (edited)

- Responsibility: each dialog owns its failure and nothing else. `onConfirm`/`onSave` **rethrow** on failure (the page's handler no longer catches), the dialog catches, renders `ErrorRetryBanner` (titles "Walk-in not seated." / "Reservation not cancelled." / "Changes not saved.", `details` = raw), returns the button to rest, keeps field values, and leaves focus on the submit button (409/422 → the Table control in the walk-in dialog). `WalkInDialog`: title "Seat walk-in", primary "Seat now"/"Seating…", party-size `Button size="md"` with `aria-pressed` (≥ 44 px on coarse pointers via a media-query rule in its module CSS), an effect after `useFocusTrap` that focuses the pressed control, the no-table caption (`Text variant="caption"`, also the disabled button's `aria-describedby`), and no focus-return code — the page owns it. `CancelReservationDialog` drops its `previouslyFocusedRef` for the same reason.
- Collaborators: `TimelinePage`, `describeApiError`, `ErrorRetryBanner`.

### `pages/TimelinePage.tsx` (edited — orchestrator)

- Responsibility: selection by **id** (`selectedId`, derived `selectedReservation = reservations.find(...)` so the panel is never stale after a refetch); dialog visibility = local state **or** URL intent (`intent.walkIn || showWalkInDialog`, rendered once `!isLoading && selectedVenueId`); close/success strips the intent. Grid area by fetch state only: `isLoading` → `TimelineSkeleton`; `fetchError && tables.length === 0` → `EmptyState` "Couldn't load tonight." with Retry and Walk-in disabled with its caption; `fetchError` with tables → `ErrorRetryBanner` "Couldn't load tonight's reservations." **above** the grid; `tables.length === 0` → "No tables yet."; else grid (with `TimelineEmptyNight` when `reservations.length === 0`). Mutation success handlers: `handleWalkIn` → `createWalkIn` (now returns the `Reservation`) → `setSelectedId`, announce, `focusAfter(testId)`; `handleSeat` → announce, focus the block; `handleCancel` → clear selection, announce, focus the block; `handleEdit` → announce, focus the Edit button; `handleTableStatusChange` → pending id, on failure a dismissible `ErrorRetryBanner` "Table status not changed." with Retry (re-sends the same transition), on success announce and focus the trigger. Stats row uses `KpiStat` ("—" while loading). Header: `IconButton` "Previous day"/"Next day", Today `Button variant="secondary"`, Walk-in `variant="primary"`, all `size="md"` with a coarse-pointer 44 px rule.
- Collaborators: everything above; `useTimelineData` (adds `refetch` for Retry; `createWalkIn: Promise<Reservation>`), `useNow` (60 s tick for `seatedIds`), `useVenue`, `useSSEStatus`.

### `packages/rialto/src/components/Drawer` (edited — changeset `drawer-compact-size.md`, patch)

- Responsibility: `size` gains `"compact"`: `.compact.bottom { height: min(40vh, 240px) }`, `.compact.right, .compact.left { width: min(320px, calc(100vw - 48px)) }`. Story "Bottom sheet, compact"; test asserting the class and the axe pass; `argTypes.size` options updated.
- Collaborators: `ReservationSheet`. Rebuild (`pnpm --dir packages/rialto build`) before `apps/hospitality` typechecks; `pnpm regen` afterwards (catalog schemas, llms).

### `packages/rialto/src/components/CommandPalette` (edited — changeset `command-palette-ranking.md`, patch)

- Responsibility: `rankCommandMatch(label, query): 0 | 1 | 2 | 3 | null` (exported from `CommandPalette.tsx`; 0 = label starts with query, 1 = a word starts with it, 2 = substring, 3 = strict initials, null = no match). `filtered` maps to `{ item, rank }`, drops nulls, stable-sorts by rank; `grouped` orders groups by the best rank they contain (stable on `groups` order on a tie) when a query is present, and by `groups` order otherwise. Story "Ranked results"; tests for the four tiers, the tie-break, and that "walk" no longer matches "Waitlist".
- Collaborators: `use-command-palette.ts` (Actions first in `groups` for the tie-break).

### `apps/hospitality/e2e/**` (edited/new — see § Test seam)

- Responsibility: `api-mocks.ts` `todayReservations()` re-dates to the runner's local day; the reservations list mock embeds the current table status after a `/tables/:id/status` PATCH (so `isSeated` derives correctly in E2E); new specs for the timeline states, the table-status menu, the intent URL, the Reservations retry, and the Waitlist announcements; existing specs updated for renamed copy ("Seat walk-in", "Seat now", "Walk-in guest", "Confirmed" chip).
- Collaborators: Verify.

## Data model

No persistence changes. Every new type is a render-time view model derived from what the queries already return.

| Type / value          | Shape                                                                                                                                                                                  | Owner (invariant lives here) | Access pattern                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------ |
| `ApiErrorDescription` | `{ category: ErrorCategory \| "network" \| "timeout" \| "unknown"; detail: string; retryable: boolean; recovery: "retry" \| "edit" \| "sign-in" \| "refresh" \| "none"; raw: string }` | `describeApiError`           | Built once per failure in the catch; rendered by `ErrorRetryBanner`                  |
| Seated set            | `ReadonlySet<string>` of reservation ids                                                                                                                                               | `seatedReservationIds`       | Computed per render in `TimelinePage` from `reservations × tables × now` (60 s tick) |
| `TimelineIntent`      | `{ walkIn: boolean; selectedId: string \| null }`                                                                                                                                      | `parseTimelineIntent`        | Read from `useSearchParams` on render; stripped (new `URLSearchParams`) on close     |
| Selection             | `selectedId: string \| null`; `selectedReservation` derived by lookup                                                                                                                  | `TimelinePage`               | Set by click / walk-in success / `selected=` intent; cleared on close/cancel         |
| `StatusMessage`       | `{ seq: number; text: string } \| null`                                                                                                                                                | `useStatusMessage`           | `announce()` from event handlers; rendered by `LiveStatus`                           |
| `FocusTarget`         | `{ kind: "element"; element } \| { kind: "testId"; testId } \| { kind: "pageHeading" }`                                                                                                | `useFocusAfter`              | One pending target; resolved after commit                                            |
| `Viewport`            | `"phone" \| "tablet" \| "desktop"`                                                                                                                                                     | `useViewport`                | Media-query subscription                                                             |
| `TableStatusMenuItem` | `{ id: TableStatus; label: string }`                                                                                                                                                   | `tableStatusMenuItems`       | From `TABLE_VALID_TRANSITIONS` (`@mbe/types`) — the API's own state machine          |
| `BriefingSegment`     | `"early" \| "dinner" \| "late"`                                                                                                                                                        | `segmentForHour`             | From `localHour(startTime)`                                                          |
| Match rank            | `0 \| 1 \| 2 \| 3 \| null`                                                                                                                                                             | `rankCommandMatch` (rialto)  | Per item per keystroke inside `CommandPalette`                                       |
| URL params            | `date=YYYY-MM-DD` (existing, `useUrlParams`); `walkin=true`; `selected=<reservationId>` (one-shot)                                                                                     | `timeline-intent`            | Producers: palette, Home, Waitlist toast                                             |

Invariants stated with their owners: "Seated" is never stored and never true outside `[startTime − 15 min, endTime]` (`isSeated`); a menu never offers a transition the API rejects (`tableStatusMenuItems` is a projection of `TABLE_VALID_TRANSITIONS`); the intent params never survive a close (`stripTimelineIntent` is called on every close path); a raw request line never reaches a person (`describeApiError` + guard test).

## Interfaces & contracts

### `localDateString(now: Date): string` / `localHour(now: Date): number` / `isLocalToday(date: string, now: Date): boolean`

- Input: any valid `Date`; `date` as `YYYY-MM-DD`.
- Output: `toLocaleDateString("en-CA")` (always `YYYY-MM-DD`); `getHours()` (0–23); equality of the two strings.
- Failure modes: an `Invalid Date` yields `"Invalid Date"` → `isLocalToday` is `false`, never throws. Tested with `vi.useFakeTimers()` + `vi.setSystemTime` at 23:30 and 00:30 local across a UTC boundary (the exact class of the bug).

### `segmentForHour(hour: number): BriefingSegment`

- Input: 0–23.
- Output: `< 18` → `early`; `18–20` → `dinner`; `≥ 21` → `late`.
- Failure modes: none (total function); out-of-range input is clamped by the caller's `localHour`.

### `describeApiError(error: unknown): ApiErrorDescription`

- Input: anything thrown — `ApiClientError`, `TypeError` (fetch failed after retries), `DOMException` (`TimeoutError`/`AbortError`), `Error`, or a non-error.
- Output: the ux.md table row for the category; `detail` = `problemDetails.detail` for 409/422/400 when non-empty; `raw` = `error.message` (or `String(error)`); `retryable` per the table; `recovery` names the offered control.
- Failure modes: never throws; unknown category → the `unknown` row ("That didn't go through. Try again — if it keeps happening, tell your manager."); never returns `undefined` or a bare status code in `detail` (snapshot test of every row).

### `ErrorRetryBanner` props

- Input: `{ title?: string; error: string; details?: string; onRetry?: () => void; onDismiss?: () => void }`.
- Output: `Alert variant="error"` (`role="alert"`, announced once as "title detail"); Retry only when `onRetry`; "Show details" `Collapsible` only when `details`; dismiss only when `onDismiss`.
- Failure modes: `error` is trusted to be a sentence (the guard test enforces it at the source); an empty `details` hides the collapsible.

### `isSeated(reservation, tableStatus, now): boolean` / `seatedReservationIds(reservations, tables, now): ReadonlySet<string>`

- Input: `Reservation`, the authoritative `Table.status` from the tables list (not the embedded `reservation.table`), `now`.
- Output: `status === "CONFIRMED" && tableStatus === "OCCUPIED" && now ∈ [startTime − 15 min, endTime]`; the set maps each reservation through its table (`tableId` lookup).
- Failure modes: a reservation whose table is absent from the list → not seated (and the detail panel reads "table unknown"); invalid `startTime` → `false`.

### `parseTimelineIntent(params: URLSearchParams): TimelineIntent` / `stripTimelineIntent(params): URLSearchParams`

- Input: the current search params.
- Output: `walkIn` is `true` only for `walkin=true` (case-sensitive value); `selectedId` is the trimmed `selected` value or `null`; `strip` returns a new instance with both keys deleted and every other key untouched.
- Failure modes: none; malformed values are treated as absent.

### `tableStatusMenuItems(status: TableStatus): TableStatusMenuItem[]`

- Input: a `TableStatus`.
- Output: one item per `TABLE_VALID_TRANSITIONS[status]` entry, label "Mark <state>" (lower-case state word).
- Failure modes: an unknown status → `[]` (the trigger renders disabled with its name).

### `rankCommandMatch(label: string, query: string): 0 | 1 | 2 | 3 | null` (rialto)

- Input: item label, non-empty query (caller trims; empty query means "no filtering").
- Output: 0 prefix, 1 word-start (any word after the first starts with the query), 2 substring, 3 strict initials (every query character opens the next word and `query.length ≤ words.length`), `null` otherwise. Case-insensitive.
- Failure modes: none; `"walk"` vs `"Waitlist"` → `null` (the false match today); `"wg"` vs `"Walk-in guest"` → 3.

### `useStatusMessage()` / `LiveStatus`

- Input: `announce(text: string)`.
- Output: a `{ seq, text }` the page renders through `LiveStatus` (mounted from first render, empty, so later changes are announced).
- Failure modes: none; two calls in one tick keep the last (one sentence per outcome).

### `useFocusAfter()`

- Input: `focusAfter(target: FocusTarget)`.
- Output: after the next commit in which the target resolves, `element.focus()`; then the request is cleared.
- Failure modes: unresolved target is kept until replaced (a walk-in whose block is still loading focuses when it renders; a cancelled block that never renders leaves focus where it was); `pageHeading` requires `PageHeader`'s `h1` to carry `tabIndex={-1}`.

### `TimelineGrid` props (added)

- Input: `seatedIds?: ReadonlySet<string>`, `bottomInset?: number` (px; `scroll-padding-block-end` on the scroll wrapper), `emptyNight?: { variant: "today" | "otherDate"; dateLabel: string; onWalkIn: () => void; onToday: () => void } | null`, `pendingTableId?: string | null`; `onTableStatusChange(tableId, next: TableStatus)` now receives the state the Host chose.
- Output: unchanged roles and test ids plus `data-testid="now-line"`, `table-status-<id>`, `timeline-empty-night`.
- Failure modes: none new.

### Dialog contracts — `WalkInDialog.onConfirm(data): Promise<void>`, `CancelReservationDialog.onConfirm(reason, note): Promise<void>`, `EditReservationDrawer.onSave(id, data): Promise<void>`

- Input: as today.
- Output: resolves on success (the page then closes, selects, announces, focuses).
- Failure modes: **rejects** on failure with the original error — the dialog renders `describeApiError(err)` in its `ErrorRetryBanner`, resets `isLoading` in `finally`, and stays open. `TimelinePage` handlers no longer swallow these errors.

### `useTimelineData` (changed)

- Input: `{ venueId, date }` as today.
- Output: adds `refetch(): Promise<void>` (both queries) and `createWalkIn(data): Promise<Reservation>` (returns `api.reservations.walkIn`'s result before `invalidateAll()`).
- Failure modes: unchanged — the api-client's contract applies: 30 s timeout per request (`AbortSignal.timeout`), 3 retries on 502/503/504 and network `TypeError`, then the error propagates to the caller's `describeApiError`. No new endpoints, no new request shapes (A4: only `PATCH reservations {status: "CONFIRMED"}`, `PATCH tables/:id/status`, `POST walk-in`, as today).

### Cross-process contract (existing, restated)

- The reservations API is the only remote seam; two adapters already face it (`@mbe/api-client` in the browser; `apps/hospitality/e2e/api-mocks.ts` in Playwright). Timeouts, retries and failure categories are the api-client's; this run adds no third adapter and changes no contract.

## Test seam

**Unit (vitest, `apps/hospitality`, `pnpm test` from inside the package).** Fake timers everywhere a clock matters: `vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-04T20:00:00"))` (local). Pure modules first — `local-clock.test.ts` (UTC-boundary cases), `describe-api-error.test.ts` (one case per table row, network/timeout/non-error, `problemDetails.detail` precedence, snapshot of copy), `describe-api-error.guard.test.ts`, `seated.test.ts` (window edges ±15 min, missing table, non-CONFIRMED), `timeline-intent.test.ts`, `TableStatusMenu.test.tsx` (`tableStatusMenuItems` per state; accessible name; menu opens on Enter/ArrowDown; Escape closes with no callback), `useFocusAfter.test.tsx`, `useStatusMessage.test.tsx`, `KpiStat.test.tsx` (dash + "unavailable" only when nullish), `guest-signals.test.ts`. Then components: `TimelineGrid.test.tsx` (existing file; add 20:00 now-line, hour-parameterised presence, absence on another date, `now-line` left within grid width, `seatedIds` → glyph + suffix, `emptyNight` overlay keeps rows, mock `./TableStatusMenu.js` instead of `../TableStatusBadge.js`), `useScrollToNow.test.tsx` (25 % rule, instant under reduced motion — mock `useMotionPreset`), `WalkInDialog.test.tsx` (rejecting `onConfirm` → banner with sentence, button back to "Seat now" within a tick, values kept, focus on the button; initial focus on the pressed control; caption when no table fits), `TimelinePage.test.tsx` (existing mocks; add: `/timeline?walkin=true` via `MemoryRouter initialEntries` opens the dialog and the param is gone after close; a rejecting walk-in leaves `timeline-grid` mounted; each failing handler leaves the grid; `fetchError` renders the banner beside the grid; `isLoading` renders the skeleton and dashes; seated party hides Seat Guest, pending party shows it; announcements per mutation; focus targets), `TimelineMobileView.test.tsx` (chip "Confirmed" filters CONFIRMED ∪ COMPLETED; "Seated" mark only under the rule), `BriefingPage.test.tsx` (17:30/18:30/21:00 bucketing with the printed "6:30 PM"; VIP badge; per-tag allergy variant; times "5:30 PM"; Retry), `ReservationsPage.test.tsx` (500 → banner + Retry + four dashes; Retry → rows), `WaitlistPage.test.tsx` (sentences, focus, toast action), `use-command-palette.test.ts` (label, groups order, `/timeline?walkin=true`), `DashboardLayout.test.tsx` (breadcrumb "Tonight's Service"), `ReservationList.test.tsx` (no raw enum). Rialto: `Drawer.test.tsx` (`compact` class, axe), `CommandPalette.test.tsx` (`rankCommandMatch` tiers; "walk" ranks "Walk-in guest" above "Waitlist"; ArrowDown/Enter select the top-ranked item; existing tests unchanged).

**E2E (Playwright, `apps/hospitality`, `pnpm exec playwright test <spec>`; `mockedPage` fixture = `mockApi` + `storageState`).** Route overrides layered with `page.route` after `mockApi` (Playwright matches the last-registered route first). Fixed clocks via `await page.clock.setFixedTime(new Date(\`${localToday}T20:00:00\`))`before`goto`. Specs: `timeline.spec.ts`(update: now-line present at 20:00 and 14:00,`scrollLeft`puts it at 25 %, header labels unchanged, skeleton before 1 s with`/tables`delayed 5 s, stats row bounding box identical before/after, empty night keeps rows and offers Walk-in + Today, fetch failure vs empty night vs other date distinguishable by role and text),`walkin.spec.ts`(update: "Seat walk-in"/"Seat now"; 500 → dialog error sentence, grid count stays 1, button resting within 1 s, Escape → Walk-in again shows no stale error; success → new block selected, in viewport, table named,`role=status`sentence,`document.activeElement`is the block),`timeline-interaction.spec.ts`(update: Seat Guest hidden for CONFIRMED+OCCUPIED, shown for PENDING; table-status menu: accessible name, one activation opens a menu and sends nothing, choosing sends exactly one PATCH, ≥ 44 × 44 at 1024 × 768; tablet sheet leaves ≥ 4 hours visible),`timeline-intent.spec.ts`(new:`/timeline?walkin=true`, ⌘K "walk" ⏎, Dashboard "Walk-in" ≤ 2 activations, each ends with the dialog open and focus inside), `reservations.spec.ts`(update: 500 → banner + Retry + dashes; stateful mock flips to 200 → rows + KPIs without reload),`waitlist.spec.ts`(update: sentences in`role=status`within 1 s, focus after add/seat/notify/cancel, toast with "View on Timeline"),`briefing.spec.ts`(new: segments, VIP, allergy, breadcrumb). The`e2e-selector-drift-reviewer` runs on every spec change; new test ids listed above exist to avoid text locators.

**Mock fixes (`e2e/api-mocks.ts`).** `todayReservations()` uses `new Date().toLocaleDateString("en-CA")` (comment names `localDateString` as its twin); `buildReservationsList()` overlays `tableUpdates` onto each reservation's embedded `table.status` so a seated party reads OCCUPIED on refetch; the walk-in route returns the created reservation with today's date and the chosen table. No fixture file is deleted.

**Verify re-runs the harness** from `apps/hospitality`: `pnpm exec playwright test -c e2e/.ux-audit/playwright.config.ts e2e/.ux-audit/specs/operator/probes.spec.ts` (and `probes2.spec.ts`, `walk.spec.ts`) against `pnpm --filter @mbe/hospitality dev -- --port 3002 --strictPort` with the git-excluded `storageState.json`; each probe ID in the PRD maps to the spec assertions above (P01→timeline now-line; P02→empty night; P03/P04→walk-in; P05/P12→seated; P06→focus after cancel/edit; P07/P14→intent; P08→briefing; P09→waitlist; P10→touch targets; P11→skeleton; P13→sheet/offline; P15→status menu). The harness runs the dev server, so StrictMode is on — the focus paths must pass there, which is why capture happens at event time.

## Traceability

| Criterion                                                                                       | Component / function                                                                                                                                                                                         | Test                                                                    |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| A1.1 now-line at 20:00 and 14:00, date label unchanged                                          | `localDateString` in `TimelineGrid` (`isToday`), `now-line` test id                                                                                                                                          | `TimelineGrid.test.tsx` (fake 20:00); `timeline.spec.ts` (`page.clock`) |
| A1.2 any local hour 11–23 on the local day; not on another date                                 | `isLocalToday`, `currentTimeOffset` (unchanged local hours)                                                                                                                                                  | `TimelineGrid.test.tsx` parameterised                                   |
| A2.1 17:30/18:30/21:00 → Early/Dinner/Late with printed times                                   | `segmentForHour(localHour(...))`, `formatTime`                                                                                                                                                               | `BriefingPage.test.tsx`; `briefing.spec.ts`                             |
| A2.2 segment and printed time from one clock                                                    | both read the browser clock (`localHour` ↔ `formatTime`)                                                                                                                                                     | `BriefingPage.test.tsx` asserts one formatter                           |
| A3.1 walk-in 500 leaves grid, human error in dialog, button resting ≤ 1 s                       | `WalkInDialog` (rethrow contract, `ErrorRetryBanner`), `describeApiError`; page no longer swaps the grid                                                                                                     | `WalkInDialog.test.tsx`, `TimelinePage.test.tsx`; `walkin.spec.ts`      |
| A3.2 seat/cancel/edit/table-status failures keep grid                                           | `ReservationDetails` local banner; Cancel/Edit dialogs; `TimelinePage` table-status banner                                                                                                                   | `TimelinePage.test.tsx` per handler                                     |
| A3.3 page-level error beside grid, dismissible, cleared by next attempt                         | `ErrorRetryBanner` `onDismiss` → page clears; conditional render (fresh `Alert` per error)                                                                                                                   | `TimelinePage.test.tsx`; `walkin.spec.ts` after-Escape                  |
| A4.1 Seat Guest hidden for CONFIRMED+OCCUPIED, shown for PENDING                                | `ReservationDetails`/`ReservationSheet` action rule                                                                                                                                                          | `TimelinePage.test.tsx`; `timeline-interaction.spec.ts`                 |
| A4.2 "Seated" only when the table is OCCUPIED; chip renamed                                     | `isSeated`, `ReservationBlock` suffix, `TimelineMobileView` chip "Confirmed"                                                                                                                                 | `seated.test.ts`, `TimelineMobileView.test.tsx`                         |
| A4.3 no new status writes                                                                       | `useTimelineData` unchanged request shapes                                                                                                                                                                   | diff review; api-mocks assert request bodies                            |
| A5.1 now-line inside viewport on load and on Today                                              | `useScrollToNow` (25 %)                                                                                                                                                                                      | `useScrollToNow.test.tsx`; `timeline.spec.ts`                           |
| A5.2 new reservation selected, in viewport, table named                                         | `createWalkIn` returns `Reservation`; `selectedId`; `useFocusAfter` (`testId`); `bottomInset`; announcement names the table                                                                                  | `TimelinePage.test.tsx`; `walkin.spec.ts`                               |
| A5.3 ≥ 4 hours visible at 1024 × 768 with a selection                                           | `useViewport` → `ReservationSheet` (`Drawer side="bottom" size="compact"`)                                                                                                                                   | `timeline-interaction.spec.ts` bounding boxes                           |
| A6.1 `/timeline?walkin=true` opens the dialog; param gone after close                           | `parseTimelineIntent` / `stripTimelineIntent`, `TimelinePage`                                                                                                                                                | `timeline-intent.test.ts`, `TimelinePage.test.tsx`                      |
| A6.2 ⌘K / Dashboard end with the dialog open and focused; ⌘K "New Reservation" opens its dialog | `use-command-palette.ts`, `HomePage`, `WalkInDialog` initial focus; `parseReservationsIntent` / `stripReservationsIntent`, `ReservationsPage` (§ Amendment 2026-09-04); "New Floor Plan" routed behind #4751 | `timeline-intent.spec.ts`; `reservations.spec.ts` ⌘K step               |
| A6.3 "walk" ⏎ → walk-in; prefix > word-start > substring                                        | `rankCommandMatch` (rialto), Actions-first `groups`                                                                                                                                                          | `CommandPalette.test.tsx`, `use-command-palette.test.ts`                |
| A6.4 dashboard path ≤ 2 activations                                                             | `HomePage` "Walk-in" → `/timeline?walkin=true`                                                                                                                                                               | `timeline-intent.spec.ts` click count                                   |
| A7.1 empty night: message + two actions, rows visible                                           | `TimelineEmptyNight` inside `TimelineGrid`                                                                                                                                                                   | `TimelineGrid.test.tsx`; `timeline.spec.ts`                             |
| A7.2 empty / failed / wrong date distinguishable                                                | `TimelineEmptyNight` variants; `ErrorRetryBanner` (`role=alert` + Retry) vs `EmptyState` (no alert role)                                                                                                     | `timeline.spec.ts` two mocks                                            |
| A8.1 status control names state and action                                                      | `TableStatusMenu` trigger `aria-label`                                                                                                                                                                       | `TableStatusMenu.test.tsx`; `timeline-interaction.spec.ts`              |
| A8.2 one activation never commits                                                               | `DropdownMenu` + `tableStatusMenuItems`; PATCH only on item select                                                                                                                                           | `TableStatusMenu.test.tsx`; E2E request sequence                        |
| A8.3 ≥ 44 × 44 at 1024 × 768                                                                    | `TableStatusMenu.module.css` min sizes                                                                                                                                                                       | E2E bounding box                                                        |
| A9.1 skeleton before 1 s, no counts                                                             | `TimelineSkeleton`, `KpiStat` dashes                                                                                                                                                                         | `TimelinePage.test.tsx`; `timeline.spec.ts` (delayed `/tables`)         |
| A9.2 stats row does not move                                                                    | stats row keeps its layout; only values change                                                                                                                                                               | `timeline.spec.ts` bounding box before/after                            |
| A10.1 VIP tag on the card                                                                       | `BriefingCard` segment `Badge` via `guest-signals`                                                                                                                                                           | `BriefingPage.test.tsx`                                                 |
| A10.2 only the allergy tag is `error`                                                           | `isAllergyTag` per tag                                                                                                                                                                                       | `BriefingPage.test.tsx`, `guest-signals.test.ts`                        |
| A10.3 "5:30 PM" everywhere                                                                      | shared `formatTime` (Briefing, `ReservationDetails`)                                                                                                                                                         | `BriefingPage.test.tsx`                                                 |
| A10.4 breadcrumb "Tonight's Service"                                                            | `ROUTE_LABELS.briefing`                                                                                                                                                                                      | `DashboardLayout.test.tsx`                                              |
| B1.1 no request line rendered; sentences on the named surfaces                                  | `describeApiError` adopted at every site listed in § Components; `ErrorRetryBanner`                                                                                                                          | guard test; `describe-api-error.test.ts` snapshot; manager E2E          |
| B1.2 `problemDetails.detail` shown; never `undefined`/status code                               | `describeApiError` precedence rule                                                                                                                                                                           | `describe-api-error.test.ts`                                            |
| B1.3 `ReservationList` labels                                                                   | `STATUS_LABEL`                                                                                                                                                                                               | `ReservationList.test.tsx`                                              |
| B1.4 regression guard                                                                           | `describe-api-error.guard.test.ts`                                                                                                                                                                           | itself                                                                  |
| B2.1 Reservations 500 → banner + Retry + dashes                                                 | `ReservationsPage` (`ErrorRetryBanner`, `KpiStat`)                                                                                                                                                           | `ReservationsPage.test.tsx`; `reservations.spec.ts`                     |
| B2.2 Retry → rows + KPIs without reload                                                         | `useReservations` `refetch`; announcement; heading focus                                                                                                                                                     | `reservations.spec.ts` stateful mock                                    |
| B3.1 `role=status` sentence per mutation ≤ 1 s                                                  | `useStatusMessage` + `LiveStatus`, ux.md sentences                                                                                                                                                           | unit per mutation; `walkin`/`timeline-interaction`/`waitlist` specs     |
| B3.2 focus never on `<body>` after success                                                      | `useFocusAfter` targets per the ux.md table; event-time capture for Escape                                                                                                                                   | E2E `document.activeElement` assertions                                 |
| B3.3 (optional) initial focus / Drawer restore                                                  | app-level effect in `WalkInDialog`; rialto Drawer already restores (`useReturnFocus`) — #4970 stays routed                                                                                                   | `WalkInDialog.test.tsx`                                                 |
| NF lint/typecheck/test green; TDD; E2E kept                                                     | every module above has a named test; no E2E file deleted                                                                                                                                                     | package gates                                                           |
| NF INCLUSIVE parity, 44 px, tokens, rialto only                                                 | `IconButton`/`Button size="md"` + coarse-pointer rules; `--rialto-accent` now-line; `DropdownMenu`, `Drawer`, `EmptyState`, `Skeleton`, `Collapsible`, `StatusLED`, `Toast`                                  | axe in unit tests; E2E bounding boxes                                   |
| NF TONE                                                                                         | copy from ux.md § Copy, verbatim in `describe-api-error.ts` and the sentence builders                                                                                                                        | snapshot tests                                                          |
| NF rialto change hygiene                                                                        | two changesets, stories, tests, `pnpm --dir packages/rialto build` before consumers, `pnpm regen`                                                                                                            | CI Build / Integrity                                                    |
| NF docs                                                                                         | `USER-FLOWS.md` Flow 3 step 1 and Flow 4 step 4 (one line each); `apps/hospitality/CLAUDE.md` untouched (no flow step lives there); `prettier --check docs/features/hospitality-service-ux/`                 | Ship                                                                    |

## Sequencing against PR #4967

PR #4967 (`perf(hospitality): memoize reservation layout style in TimelineGrid`, open, `mergeStateStatus: UNKNOWN` at the time of writing) touches `TimelineGrid.tsx` in exactly two hunks: (H1) a `reservationStyleById` `useMemo` inserted directly after `reservationsByTable` (today's lines 113–124, insertion at ≈ 125); (H2) the block-render map (today's lines ≈ 239–256), replacing the inline `computeReservationLayout` call with `reservationStyleById.get(reservation.id)!`. Its two new test files mock `../TableStatusBadge.js`; once the grid imports `TableStatusMenu` instead, those mocks become harmless no-ops and the real `TableStatusMenu` renders under jsdom (rialto `DropdownMenu` renders fine there).

This run's `TimelineGrid.tsx` edits and their anchors, chosen to stay ≥ 3 lines of context away from H1 and H2:

| Edit                                                                                   | Anchor (today's lines) | Distance from H1/H2 |
| -------------------------------------------------------------------------------------- | ---------------------- | ------------------- |
| `isToday = date === localDateString(currentTime)`                                      | 141                    | 16 below H1         |
| `useScrollToNow(scrollRef, currentTimeOffset)` after the offset memo                   | after 148              | 23 below H1         |
| `ref={scrollRef}` + `style={{ scrollPaddingBlockEnd: bottomInset }}` on `.gridWrapper` | ≈ 152–160              | above the rows      |
| `TableStatusMenu` replacing the `TableStatusBadge` block                               | 206–217                | 22 above H2         |
| `TimelineEmptyNight` after the rows, now-line test id / label / token                  | 259–270                | below H2            |
| **`isSeated={seatedIds?.has(reservation.id) ?? false}` on `<ReservationBlock>`**       | inside H2              | **overlaps**        |

The one overlap is a single added prop line. Whichever PR lands second re-applies it against the other's version of the JSX — a one-line conflict with an obvious resolution, recorded here so Decompose can put the grid item last and Implement can rebase deliberately. Components that touch `TimelineGrid.tsx`: `TableStatusMenu`, `TimelineEmptyNight`, `useScrollToNow`, `local-clock`, and the `seatedIds`/`bottomInset` props from `TimelinePage`. `reservationLayout.ts` is not touched (the browser-clock decision keeps block layout as it is).

## Stack & dependencies

- No new packages. `apps/hospitality` already depends on `@mbe/api-client`, `@mbe/types`, `@mattbutlerengineering/rialto`, `react-router`, `zod`, `react-hook-form`; rialto's `useMotionPreset` comes from `@mattbutlerengineering/rialto` (providers barrel).
- Rialto components used, all verified present with the props named: `Drawer` (`side="bottom"`, new `size="compact"`), `DropdownMenu` (`trigger: ReactElement`, `items`, keyboard nav), `EmptyState` (`heading`, `description`, `action: ReactNode`, `variant="flat"`, `size="sm"`), `Skeleton`/`SkeletonGroup`, `Alert` (`title`, `dismissible`, `onDismiss`, `actions`), `Collapsible` (`trigger`, `defaultOpen`), `Tag` (`default`/`error`; no `size`), `Badge`, `StatusLED` (`success`, `size="xs"`; note `danger` not `error`), `Stat` (`aria-label` override via spread), `SegmentedControl`, `IconButton` (`aria-label` required; `md` 36 px, `lg` 44 px), `Button` (`md`; coarse-pointer min-size rule in app CSS), `useToast` (`action`), `Text`, `Card`.
- Rialto components ux.md assumed that do **not** exist as assumed: `Toast` as a component (it is `useToast()` + the mounted `ToastProvider` — confirmed mounted in `main.tsx`); `Stat valueLabel` (solved app-side); `Drawer` ≈ 240 px bottom size (proposed `compact`); `CommandPalette` ranking (proposed). `EmptyState`'s prop is `heading`, not `title`; `Skeleton rect` needs an explicit `height`.
- Build order for Implement: rialto change → `pnpm --dir packages/rialto build` → `apps/hospitality` typecheck/test → `pnpm build --filter @mbe/cli...` → `pnpm regen` (catalog schemas, llms) → `pnpm regen --check`. Changesets: `.changeset/drawer-compact-size.md`, `.changeset/command-palette-ranking.md` (`"@mattbutlerengineering/rialto": patch`).
- CSS: tokens only (`--rialto-accent` for the now-line, focus ring, selected block, in-flight trigger; `--rialto-warning` for the caption's icon if any); logical properties; 44 px rules under `@media (pointer: coarse), (max-width: 1024px)` in each touched module (`TimelinePage`, `TimelineGrid`, `TableStatusMenu`, `WalkInDialog`, `ReservationSheet`, `ErrorRetryBanner`).

## Decisions & alternatives

- **Browser clock (`local-clock.ts`)** over the venue's IANA zone — the defects are UTC-vs-local; the venue zone is only honest if `formatTime` and `computeReservationLayout` move too, which no story asks for; the harness cannot tell them apart. Recorded as an assumption; swap is one module plus a `timeZone` option.
- **`describeApiError` in `apps/hospitality/src/lib`** over `@mbe/api-client` — the copy is the app's voice (a policy), the transport is a detail; both the dashboard and the guest widget live in this package; an api-client change would ripple to every service's llms and to size-limit for UI strings no service renders.
- **Seated set derived once in the page and passed down** over deriving in each block from `reservation.table` — one derivation, the authoritative tables list, one 60 s tick; the cost is one prop line inside #4967's hunk (named above). A context was rejected as a hidden input to a memoised component.
- **Dialogs rethrow; the page owns success** over page-level mutation error state — failure belongs with the control that can retry it (the same button), so the grid is never a casualty; the page's only error surface is the table-status banner, whose control is a tiny menu with nowhere to show a sentence.
- **Event-time focus capture in the page (`useFocusAfter`)** over effect-time capture inside dialogs — StrictMode re-runs mount effects after the trap has moved focus (mechanism confirmed by reading `WalkInDialog.tsx`); an event handler runs once.
- **`ErrorRetryBanner` evolved with optional `title`/`details`/`onRetry`** over a new `ErrorNotice` — in-flight callers pass a string and must not be touched; one component, one voice.
- **Ranking inside rialto's `CommandPalette`** over an app-side group reorder — the app never sees the query; the loose initials match is the bug, not just the order.
- **`Drawer size="compact"`** over `size="default"` for the sheet — 384 px leaves three rows; UX designed ≥ 5. Height change on More ▾ is instant (no height transition added) — calm, and reduced-motion-safe by construction.
- **`TableStatusMenu` composition (`DropdownMenu` + `Button` + `StatusLED`)** over changing `TableStatusBadge` — the badge's other consumers keep a tag; the grid needs a named, 44 px, menu-opening control. Undo-after-commit rejected by UX (one-way transitions).
- **Selection by id, object derived** over the stored `Reservation` object — the panel stops going stale after a refetch, the `selected=` intent needs an id anyway, and `handleEdit` no longer has to copy the result into state.
- **Source-scan guard test** over an eslint rule — the plugin is outside the run's allowed paths; the test names every allowlisted file with its reason.
- **`useViewport` three-way** over extending `useIsMobile` — the tablet needs its own composition; two booleans would have drifted.
- **#4970 stays routed** over pulling `useFocusTrap` options into this run — nothing here needs them; rialto's `Drawer` already restores focus via `useReturnFocus` (the B3 optional criterion's second half is already true outside StrictMode dev).
- **Guest widget adopts the Host table** over an allowlist — B1's literal scope; one copy row is surfaced for UX.

Parked questions, decided: (1) browser clock, `utils/local-clock.ts`, harness-agnostic; (2) `apps/hospitality/src/lib/describe-api-error.ts`; (3) `utils/seated.ts` (`isSeated`, `seatedReservationIds`), tested; (4) two named hunks, one one-line overlap, grid item last; (5) `api-mocks.ts` re-dates to the runner's local day and overlays table status onto embedded tables — modified, nothing deleted; (6) `FloorPlanEditorPage.tsx:125,142,205,218` and `components/floor-plan/AddTableDialog.tsx:86` are OUT (in-flight run; allowlisted in the guard with that reason); (7) #4970 routed, initial focus app-level; (8) StrictMode suspicion verified by reading (mechanism real, dev-only), design no longer depends on it — runtime confirmation left to Verify's harness run.

## ADRs

None warranted. Three-part test: none of the decisions is hard to reverse (each is one module or one prop), the surprising one (browser clock despite a venue zone) is recorded in this artifact's assumptions and in backlog seed (b), and the rialto changes are additive vocabulary. No ADR draft is included.

## Amendment 2026-09-04 — ⌘K "New Reservation" intent (closes breakdown gap G1)

PRD A6.2's second clause — ⌘K "New Reservation" ends with the new-reservation dialog open — had no contract: the palette item navigates to `/timeline`, and the dialog (`components/reservations/NewReservationDialog.tsx`) is owned by `pages/ReservationsPage.tsx` (`showNewReservationDialog`). This amendment mirrors the walk-in intent (§ Interfaces → `parseTimelineIntent` / `stripTimelineIntent`) key for key; nothing else in this design changes. "New Floor Plan" stays routed behind #4751.

### `/reservations?new=true` — URL form

- Same convention as `walkin=true`: lower-case key, the literal value `true`, one-shot. `date` and `status` stay with `useUrlParams` (`reservationsFilterSchema`), whose `setParam` copies `prev`, so the page's own filter writes never drop the intent.

### `parseReservationsIntent(params: URLSearchParams): ReservationsIntent` / `stripReservationsIntent(params): URLSearchParams` — in `utils/timeline-intent.ts`, beside the walk-in pair

- Input: the current search params.
- Output: `{ newReservation: boolean }` — `true` only for `new=true` (case-sensitive value); `strip` returns a new instance with `new` deleted and every other key untouched.
- Failure modes: none; a malformed value (`new=1`, `new=TRUE`, `new=`) is treated as absent — the dialog never opens and nothing is stripped.

### Producer — `hooks/use-command-palette.ts`

- `action-new-reservation` → `navigate("/reservations?new=true")` (today `/timeline`). Label unchanged; a sentence-case rename ("New reservation" — the page button's wording and Screen 10's "Walk-in guest" pattern) is UX's to make, not this amendment's.

### Consumer — `pages/ReservationsPage.tsx`

- `useSearchParams` beside `useUrlParams`; `const intent = parseReservationsIntent(searchParams)` on render — derived, no state, no effect. The dialog renders when `(intent.newReservation || showNewReservationDialog) && selectedVenueId && !tablesLoading` (`useTables`' `isLoading`): `NewReservationDialog` seeds `tableId` from `tables` once at mount (`useState(() => findBestTable(tables, 2))`), so a URL-open racing the tables query — every page load — would land on "No tables available" and never recover; the click path rarely races, the URL path always would. `onClose` and `handleCreateReservation` both clear the state and call `setSearchParams(prev => stripReservationsIntent(prev), { replace: true })`, so the param survives neither a close nor the back button.
- Focus (ux.md Decision (d)): the palette opener is unmounted by the time the dialog opens. Close without creating from a URL-opened dialog → `focusAfter({ kind: "element", element: <New reservation button> })`, the page's own control for the act — the reading the walk-in contract makes for the Walk-in button; a click-opened dialog keeps its own restore. Create success → `focusAfter({ kind: "pageHeading" })`, (d)'s last tier taken directly: the new row may sit outside the current `date` / `status` filter and `useFocusAfter` keeps an unresolved target forever, which would leave focus on `<body>`. No new `role=status` sentence — ux.md § Copy has none for a booked reservation and wording is UX's (NF TONE); the existing "N reservations shown" region already speaks on refetch.
- Failure modes: no venue selected → nothing renders (the same guard as the button's `disabled`); the param stays and the dialog opens on the render the venue resolves. Tables fetch failed → `isLoading` is false, the dialog opens against `tables ?? []` and shows its existing "No tables available" caption with Create disabled. Dialog already open by click when the intent arrives → `||` yields one dialog; the strip on close clears both. A bookmarked `?new=true` reopens the dialog on purpose — one-shot means "never survives a close", not "never re-enterable".

### Test seam

- `utils/timeline-intent.test.ts`: `new=true` → `true`; `new=TRUE` / `new=1` / absent → `false`; `strip` returns a different instance without `new`, `date` and `status` intact. `use-command-palette.test.ts`: `action-new-reservation` navigates to `/reservations?new=true`. `ReservationsPage.test.tsx`: `MemoryRouter initialEntries={["/reservations?new=true"]}` renders the dialog once `useTables` has loaded and not while `isLoading`; after close the URL carries no `new` and `document.activeElement` is the New reservation button; after a confirmed create it is the `h1`. E2E — one step in `e2e/reservations.spec.ts` (the page's own spec, M3; not `timeline-intent.spec.ts`, which #5034 creates in M4 and is named for the Timeline): `Meta+K` opens rialto's palette (`role="dialog"` "Command palette", `role="combobox"` "Search commands"), type "new res", Enter → URL on `/reservations`, `getByRole("dialog", { name: "New Reservation" })` visible with focus inside; Escape → URL without `new` (A6.2 second clause; probe P07's shape).

Surfaced: the click-opened dialog's success path already leaves focus on `<body>` today (`NewReservationDialog` restores focus only in `handleClose`, which success never calls) — outside G1 and ux.md's table; a backlog seed, not this amendment.
