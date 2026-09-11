# Hospitality UX audit — cluster: code-level cross-cutting sweep (xcut)

Playbook read: `~/.claude/plugins/cache/skills/idea-to-prod/0.1.0/skills/audit/references/playbook.md` §§ Finding format, Ordering, 1, 10, 11 — yes. Tree audited: `.claude/worktrees/hospitality-service-ux` @ `5f642aa42` (= origin/main). Read-only; only artifacts written are `apps/hospitality/e2e/.ux-audit/specs/xcut/xcut{,2}.spec.ts` (git-excluded) and `scratchpad/ux-audit/out/xcut/*` (JSON + PNG evidence, referenced below as `out/…`).

## 1. Per-page matrix

Legend: ✅ present / ❌ absent or broken / ⚠ partial / — not applicable. Grep-derived unless marked (repro). "RM" = reduced-motion; rialto `styles/global.css:19` zeroes every CSS animation/transition under `prefers-reduced-motion`, so RM is ✅ everywhere at the CSS layer.

| Page                                   | Error recovery                                                 | Loading         | Empty state                                        | Responsive               | RM          | Focus mgmt                                                      |
| -------------------------------------- | -------------------------------------------------------------- | --------------- | -------------------------------------------------- | ------------------------ | ----------- | --------------------------------------------------------------- |
| TimelinePage                           | ❌ error box **replaces grid**, no retry, never clears (repro) | ❌ spinner only | ❌ flat text, no link                              | ✅ 2 @media + `isMobile` | ✅ own rule | ❌ focus→`<body>` after success; initial focus on "1" (repro)   |
| ReservationsPage                       | ❌ `isError` ×3, no retry banner                               | ✅ Skeleton     | ❌ flat "No reservations"                          | ✅ 2                     | ✅ own      | ⚠ hand-rolled NewReservationDialog (trap ✅)                    |
| WaitlistPage                           | ⚠ per-card inline errors, raw `.message`, no retry             | ✅ Skeleton     | ❌ flat "No one waiting"                           | ❌ 0 @media (flex-wrap)  | ✅          | —                                                               |
| BriefingPage                           | ❌ `isError` ×3, no retry                                      | ✅ Skeleton     | ❌ flat "No reservations"                          | ❌ 0                     | ✅          | —                                                               |
| GuestsPage                             | ✅ banner + `problemDetails.detail`                            | ✅ Skeleton     | ❌ flat "No guests yet"                            | ✅ 2                     | ✅          | ❌ rialto Dialog focuses "Close dialog" first (repro)           |
| HomePage                               | ✅ banner                                                      | ✅ Skeleton     | ⚠ widget-level flat                                | ✅ 2                     | ✅ own      | —                                                               |
| FloorPlansPage                         | ⚠ banner, but clone error → 1×1px sr-only (repro)              | ✅ Skeleton     | ❌ flat, no CTA though header has "New Floor Plan" | ❌ 0 (auto-fill grid)    | ✅          | ❌ Clone `opacity:0` on focus; `<button>` in `<button>` (repro) |
| FloorPlanEditorPage                    | ✅ fetch + save banners w/ retry                               | ❌ spinner only | ❌ flat "Add tables from the sidebar"              | ✅ 1                     | ✅ own      | ⚠ hand-rolled AddTableDialog (trap ✅)                          |
| AdminPage                              | ✅ banner                                                      | ✅ Skeleton ×6  | ⚠ live-region text, flat                           | ✅ 4                     | ✅          | —                                                               |
| ProfilePage                            | ✅ banner; inline success 3s                                   | ✅ Skeleton ×6  | —                                                  | ✅ 1                     | ✅          | —                                                               |
| SettingsPage                           | ✅ banner + detail; inline success 3s                          | ✅ Skeleton ×6  | —                                                  | ✅ 1                     | ✅          | —                                                               |
| BookingWidgetDemoPage                  | ✅ banner                                                      | ✅ Skeleton ×4  | ✅ TimeSlotPicker "Set hours" CTA                  | ✅ 1                     | ✅          | —                                                               |
| VenueOnboardingPage                    | ✅ LaunchStep banner + retry                                   | —               | —                                                  | ✅ 1                     | ✅ own      | ✅ live regions, roving tabindex                                |
| SetupPage                              | —                                                              | ❌ none         | —                                                  | ❌ 0                     | ✅          | —                                                               |
| SetupHoursPage                         | ⚠ `role=alert`, no retry                                       | ❌ none         | —                                                  | ❌ 0                     | ✅          | —                                                               |
| PublicBookingPage                      | — (guest cluster)                                              | —               | ✅ EmptyState + Back CTA                           | ❌ 0                     | ✅          | —                                                               |
| ManageReservationPage                  | ⚠ static "Invalid Link"/"Link Expired"                         | ❌              | —                                                  | ❌ 0                     | ✅          | —                                                               |
| AuthFailure / SignOut / Loading / Chat | trivial pages                                                  | —               | —                                                  | 0 @media (fluid)         | ✅          | —                                                               |

Horizontal overflow probe (repro, `out/xcut/H-overflow-targets.json`): **0 px** on all 14 routes at 390 / 768 / 1440 — the 10 pages with no `@media` are fluid via flex, not broken.

## 2. Findings (ranked by leverage)

### [RECOVER-01] A failed timeline mutation strands the dialog in "Seating…" forever and replaces the whole grid with the error — with no way back

- **Evidence**: `apps/hospitality/src/pages/TimelinePage.tsx:280-289` — `handleWalkIn` catches and `setError(...)` but never rethrows, so the child's `await onConfirm()` resolves; `src/components/timeline/WalkInDialog.tsx:75-90` — `setIsLoading(false)` exists only in the `catch`, never on the resolved path; `TimelinePage.tsx:195` declares `error` and **no `setError(null)` exists anywhere in the file**; `TimelinePage.tsx:414-421` — the render ternary is `isLoading ? spinner : fetchError ? box : error ? box : tables…`, so any page-level error removes the grid. Same swallow-and-`setError` shape on `handleSeat` :247, `handleCancel` :256, `handleEdit` :266, `handleTableStatusChange` :291; same child-only `setIsLoading(false)` in `CancelReservationDialog.tsx:52-59` and `EditReservationDrawer.tsx:81-88`.
- **Reproduction**: `xcut2.spec.ts` C2, 500 on `POST /reservations/walk-in` (`out/xcut/C2-stuck-walkin.json`, `C2-stuck-seating.png`): `gridBefore:1 → gridDuring:0`; submit button text `"Seating…"`, disabled, unchanged after **10 s**; the error `role=alert` renders _behind_ the modal overlay; after Escape `dialogAfterEsc:0, gridAfterEsc:0` — the timeline is gone for the rest of the visit and the alert reads `POST /api/v1/reservations/walk-in failed: 500 Database connection lost`.
- **Impact**: the host-stand hot path. One transient 5xx during service = spinner that never stops, then a blank timeline until a hard reload. The backlog's own P0 #1 ("Buttons show Saving… for max 10 s, then revert with error") is unmet on exactly the page it named.
- **Effort**: S. **Risk**: LOW — rethrow from the page handlers (or return a result) and let each dialog own its error; render the mutation error _alongside_ the grid, not instead of it; clear on next attempt.
- **Keeps it fixed**: `nothing` today. Ship a `TimelinePage.test.tsx` case: reject `createWalkIn` → dialog shows error, button re-enabled, grid still rendered.
- **Fix sketch**: `handleX` → `try { … } catch (e) { setError(msg); throw e; }`; move `error` out of the grid ternary into a dismissible `ErrorRetryBanner` above it; `setError(null)` at the top of every handler.

### [TONE-01] Raw `METHOD /path failed: 500 detail` is the default error copy

- **Evidence**: `packages/api-client/src/client.ts:320-321` — `ApiClientError.message = "${method} ${path} failed: ${status} ${detail}"`; 27 sites use `err instanceof Error ? err.message : "Failed to …"` (e.g. `TimelinePage.tsx:252,263,273,287,295`, `WaitlistPage.tsx:96,222,231`, `FloorPlanEditorPage.tsx:125,142,205`, `WalkInDialog.tsx:91`, `CancelReservationDialog.tsx:58`), plus 8 `ErrorRetryBanner error={error.message}` sites (`HomePage.tsx:59`, `FloorPlansPage.tsx:132`, `AdminPage.tsx:200`, `ProfilePage.tsx:239`, …). Only 6 sites unwrap `problemDetails.detail` (`use-form-state.ts:47`, `GuestsPage.tsx:253`, `SettingsPage.tsx:144,171`, `PaymentStep.tsx:80`, `WaitlistJoinView.tsx:72`). Raw enum to humans: `src/components/dashboard/ReservationList.tsx:65` renders `{r.status}` (`CONFIRMED`, `NO_SHOW`) while `src/utils/reservation-display.ts:23 STATUS_LABEL` exists and is used on `ReservationsPage.tsx:270` and `TimelinePage.tsx:154`; a third private formatter lives at `TimelineMobileView.tsx:58`. Generic fallbacks: `DashboardLayout.tsx:356-357` "Something went wrong / An unexpected error occurred in this page.", `use-form-state.ts:49` "An error occurred", 31 × "Failed to …".
- **Reproduction**: `out/xcut/F-floorplans.json` → `"Error: POST /api/v1/floor-plans/fp_e2e_001/clone failed: 500 Database connection lost"`; `out/xcut/C2-stuck-walkin.json` alerts → `"POST /api/v1/reservations/walk-in failed: 500 Database connection lost"`.
- **Impact**: the brand voice ("Wrong door. That page never made the list." — `apps/marketing/src/pages/NotFoundPage.tsx:26`) is absent from the operator app; instead the house shows HTTP verbs, paths and status codes to a host mid-service. 10 worst: the two above; `ReservationList.tsx:65` `NO_SHOW`; `DashboardLayout.tsx:356-357`; `use-form-state.ts:49`; `WaitlistPage.tsx:257` "Failed to seat guest."; `FloorPlanEditorPage.tsx:125` "Failed to save changes — positions reverted"; `SettingsPage.tsx:145` "Failed to save settings: {detail}"; `CancelReservationDialog.tsx:58`; `EditReservationDrawer.tsx:86`.
- **Effort**: S–M. **Risk**: LOW — one `describeApiError(err)` helper (like the existing `src/lib/describe-auth-error.ts`) mapping `category` → house copy, swapped into the 35 sites; `STATUS_LABEL` into `ReservationList`.
- **Keeps it fixed**: an ESLint rule or unit test asserting no `err.message` reaches `setError`/`ErrorRetryBanner` outside the helper; snapshot of `describeApiError` copy.
- **Fix sketch**: `describeApiError(err): { title, detail, retryable }` keyed on `ApiClientError.category`; never render `.message`.

### [INERT-01] ⌘K "Actions" and the dashboard "New Walk-In" are navigations — `?walkin=true` has zero readers

- **Evidence**: `src/hooks/use-command-palette.ts:49-66` — "New Reservation" → `navigate("/timeline")` (the New Reservation dialog lives on `/reservations`, `ReservationsPage.tsx:183`), "Walk-in Guest" → `/timeline?walkin=true`, "New Floor Plan" → `/floor-plans` (dialog trigger is `FloorPlansPage.tsx:116`, not opened); `HomePage.tsx:64` "New Walk-In" → `navigate("/timeline")`. `TimelinePage.tsx:22-27` `timelineFilterSchema` has only `date`; `grep -rn walkin src` → 0 readers outside the palette and the dialog's own element ids.
- **Reproduction**: `xcut.spec.ts` A (`out/xcut/A-walkin-param.json`): `GET /timeline?walkin=true` → `dialogs: 0`.
- **Impact**: 3 of 5 palette "Actions" and the dashboard's primary CTA promise an action and deliver a page. The keyboard user still has to find the Walk-in button.
- **Effort**: S. **Risk**: LOW.
- **Keeps it fixed**: `TimelinePage.test.tsx`: render with `?walkin=true` → dialog open; `use-command-palette.test.ts` asserts New Reservation targets `/reservations?new=true`.
- **Fix sketch**: add `walkin`/`new` to the URL schemas, derive dialog-open from the param on first render, strip it on close; point "New Floor Plan" at `/floor-plans?new=true`.

### [RECOVER-02] Floor-plan Clone: failure is announced only to screen readers, the control is invisible to keyboard users, and it's a `<button>` inside a `<button>`

- **Evidence**: `src/pages/FloorPlansPage.tsx:68-70` — catch → `setLiveMessage("Error: …")`; `:93-108` the only sink is a 1×1px clipped `role=status`; `:143-150` each card is a rialto `<Button>` wrapping `:170-181` a `<Button>` "Clone"; `src/pages/FloorPlansPage.module.css:71` `.cardActions { opacity: 0 }`, `:75` revealed on `.card:hover` only — no `:focus-within`.
- **Reproduction**: `xcut.spec.ts` F (`out/xcut/F-floorplans.json`): `nested: 1` (`document.querySelectorAll("button button")`), `opacityFocused: "0"` after `clone.focus()`, and after a 500 the only node carrying the error is `{ w: 1, h: 1 }`.
- **Impact**: sighted mouse users click Clone, nothing happens; keyboard/tablet users can't find Clone at all; nested interactive content is invalid HTML and confuses AT.
- **Effort**: S. **Risk**: LOW.
- **Keeps it fixed**: `FloorPlansPage.test.tsx`: reject clone → visible `role=alert`; axe `nested-interactive` rule in the e2e a11y pass.
- **Fix sketch**: card = `<article>` with a linked title; Clone as a sibling button; `.card:focus-within .cardActions { opacity: 1 }` or always-visible on `(hover: none)`; route the error through `ErrorRetryBanner`.

### [INCLUSIVE-01] Focus discipline: rialto `Dialog` focuses the Close button first, hand-rolled dialogs focus the wrong control, and every success path drops focus to `<body>`

- **Evidence**: `packages/rialto/src/hooks/useFocusTrap.ts:35` focuses `focusable[0]`; `packages/rialto/src/components/Dialog/Dialog.tsx:78-84` renders the `aria-label="Close dialog"` button before `children` → first focusable is Close (affects `GuestsPage.tsx:94` Add Guest, `TimelinePage.tsx:495` mobile Drawer, `FloorPlanEditorPage` ConfirmDialog). `WalkInDialog.tsx:139-149` — first focusable is party-size "1" though "2" is the selected default. Focus return lives only in `handleClose` (`WalkInDialog.tsx:45-48`, `CancelReservationDialog.tsx:42-45`); the success path is the parent's `setShowWalkInDialog(false)` (`TimelinePage.tsx:285`, `:261`) → unmount with no restore. `autoFocus`: 0 sites app-wide.
- **Reproduction**: `out/xcut/E-dialog-initial-focus.json` → `{ aria: "Close dialog" }`; `out/xcut/C-walkin-500.json` → initial focus `{ text: "1", pressed: "false" }`; `out/xcut/D-walkin-success.json` → `focusAfter: { tag: "BODY" }`.
- **Impact**: keyboard/AT users open a form and land on "dismiss"; after seating a guest they are teleported to the top of the document.
- **Effort**: M (rialto `Dialog` `initialFocus` prop + 4 hospitality dialogs). **Risk**: LOW–MED — rialto change touches every consumer; add as opt-in prop with a sensible default (first field, else primary action).
- **Keeps it fixed**: rialto `Dialog.test.tsx` "does not focus the close button first"; hospitality test asserting `document.activeElement` returns to the trigger after a successful submit.
- **Fix sketch**: `useFocusTrap(panelRef, open, { initialFocus })`; run `useReturnFocus` in the _parent-controlled_ dialogs (rialto already exports it) or call `onClose()` from the child on success.

### [TIME-01] Mutations succeed silently — 2 `toast()` calls in the whole app, `Toast.action` never used

- **Evidence**: `grep -rn "toast(" src` → `GuestDrawer.tsx:164` ("Guest updated") and `VenueOnboardingPage.tsx:87`; every other mutation closes a dialog and stops: `TimelinePage.tsx:247-289` (seat, cancel, edit, walk-in — 4), `WaitlistPage.tsx:87-95` (add → `reset()`), `:217-222` (notify — was an SMS sent?), `GuestsPage` add, `AddTableDialog`, `StaffDepositSection`. `packages/rialto/src/components/Toast/ToastAnimated.tsx:74` supports `action` (#4808); 0 hospitality usages.
- **Reproduction**: `xcut.spec.ts` D (`out/xcut/D-walkin-success.json`): after a successful walk-in `toasts: 0`, `liveTexts: []`, `confirmed: false`.
- **Impact**: the host can't tell "seated" from "nothing happened", and there is no Undo for the destructive ones (cancel, walk-in on the wrong table).
- **Effort**: M. **Risk**: LOW.
- **Keeps it fixed**: per-mutation test asserting a `role=status` announcement; a lint rule that `useMutation` hooks in `src/hooks/create-mutation-hook.ts` get an `onSuccess` announcement by default.
- **Fix sketch**: centralise in `create-mutation-hook.ts`: `onSuccess → toast({ title, action: { label: "Undo", onClick } })`; focus the new block/row after create.

### [CORRECTNESS-01] Floor-plan canvas paints a hardcoded light-paper grid in dark theme — and the backlog says all hardcoded colours are gone

- **Evidence**: `src/components/floor-plan/FloorPlanCanvas.tsx:15-20` — data-URI SVG with `fill="#f8f6f3"` / `stroke="#d8d4cd"`, applied as `backgroundImage` at `:121`, covering the token background in `FloorPlanCanvas.module.css:3`; `src/components/timeline/{WalkInDialog,CancelReservationDialog,EditReservationDrawer}.module.css:131/95/95` — `box-shadow: 0 0 0 2px rgba(59,130,246,.3)` (Tailwind blue-500) focus rings, violating rialto's "gold only for focus/active/in-flight"; 5 dialog overlays hardcode `rgba(0,0,0,.5)`; 14 non-token colour literals in hospitality CSS total. `apps/hospitality/docs/IMPROVEMENT-BACKLOG.md:21` — "[x] All hardcoded CSS colors replaced with Rialto tokens (all pages + all components)".
- **Reproduction**: `xcut.spec.ts` G with `localStorage.mbe-theme-preference=dark` (`out/xcut/G-dark-canvas.json`, `G-dark-canvas.png`): `theme: "dark", hasLightGrid: true` — screenshot shows a white canvas inside a dark UI.
- **Impact**: the editor is the one surface where the dark-first brand direction is visibly broken; the blue rings are off-brand on the two most-used dialogs.
- **Effort**: S. **Risk**: LOW.
- **Keeps it fixed**: extend `TableShape.test.tsx`'s token-drift guard to `FloorPlanCanvas`; a `pnpm check:tokens` grep in CI for `#[0-9a-f]{3,8}|rgba?\(` outside `var(--…, fallback)`.
- **Fix sketch**: draw the grid with `repeating-linear-gradient(var(--rialto-border) …)` or two `--rialto-*` vars read via `getComputedStyle` as `TableShape` does; replace blue rings with `composes: focusRing from surfaces.module.css`.

### [NO-DEAD-END-01] Empty states and the unknown-route catch-all end in a sentence, not a next step

- **Evidence**: 10 `<EmptyState>` usages, 2 with `action=` (`PublicBookingPage.tsx:63`, `TimeSlotPicker.tsx:139`); flat: `FloorPlansPage.tsx:135-138` ("No floor plans yet" — header button "New Floor Plan" at `:116` is not offered), `WaitlistPage.tsx:387`, `BriefingPage.tsx:211-214`, `ReservationsPage.tsx:204`, `SearchOrchestrator.tsx:53-60` ("No guests yet"); text-only hints: `TimelinePage.tsx:424-425` "Add tables in the Floor Plans section." (no link), `FloorPlanCanvas.tsx:181-182` "Add tables from the sidebar". `src/main.tsx:301` `{ path: "*", element: <Navigate to="/timeline" replace /> }` — silent redirect, no 404.
- **Reproduction**: grep counts above; `xcut.spec.ts` B (`out/xcut/B-404.json`): `/reservation/abc-typo` → `finalUrl: …/timeline`, `mentions404: false`.
- **Impact**: first-run states (zero floor plans / tables / guests / waitlist) — the moments the charter cares most about — are dead ends; a mistyped deep link silently lands on today's timeline.
- **Effort**: S. **Risk**: LOW.
- **Keeps it fixed**: a test iterating pages' empty states asserting a `button|link` inside `EmptyState`; a NotFound route test.
- **Fix sketch**: pass `action={<Button onClick=…>}` at the 6 sites; `Link` in the Timeline hint; port the marketing `NotFoundPage` voice into a hospitality 404 with "Back to tonight's service".

### [INCLUSIVE-02] `size="sm"` buttons are 23 px tall and used 60 times — including the walk-in party-size row

- **Evidence**: `packages/rialto/src/components/Button/Button.module.css:165-168` `.sm { padding: 4px 12px; font-size: 11px }` with no `min-height`; `src/components/timeline/WalkInDialog.tsx:139-149` party-size buttons `size="sm"`; 60 usages (`ReservationsPage` 7, `AdminPage` 7, `WaitlistPage` 6, `TimelinePage` 5, `HomePage` 4 quick actions, `BriefingPage` 4). `IMPROVEMENT-BACKLOG.md:54` "[ ] Touch targets are at least 44×44px" is open.
- **Reproduction**: `out/xcut/C-walkin-500.json` `partyBtnHeights: [23,23,23,23,23,23,23,23]`; `out/xcut/H-overflow-targets.json` at 768 px: 24–38 sub-44 px interactive elements per route (the rialto `GlobalNav` links at 23–32 px dominate; hospitality's own are the `sm` buttons).
- **Impact**: the party-size row is the first tap of every walk-in on a tablet host stand, at 23 px.
- **Effort**: M (rialto: `min-block-size: 44px` on touch via `@media (pointer: coarse)`; hospitality: promote hot-path buttons to `md`). **Risk**: MED — density changes on dense admin tables; scope by `(pointer: coarse)`.
- **Keeps it fixed**: extend the e2e a11y pass with a `target-size` (WCAG 2.5.8) check at 768 px.
- **Fix sketch**: `@media (pointer: coarse) { .sm { min-block-size: 44px } }` in rialto; WalkInDialog → `SegmentedControl` (rialto has one) sized for touch.

### [INERT-02] The server-side theme preference is written and displayed but never applied on load

- **Evidence**: `src/pages/SettingsPage.tsx:229-233` writes both `setLocalTheme(next)` and `updatePreference("theme", next)`; `src/hooks/use-theme.ts:33-42` and `packages/rialto/src/hooks/useThemeState.ts:49-50` read **only** `localStorage["mbe-theme-preference"]`; `grep -rn "preferences.theme" src` → only `SettingsPage.tsx:229` (select value) and `AdminPage.tsx:132` (display). No reader on boot.
- **Reproduction**: the grep set above is exhaustive — the persisted value has a writer, two displays, and no consumer on the path that decides the theme. `e2e/fixtures/user-me.json:9` pins `"theme": "light"` and the app still resolves `system`.
- **Impact**: a manager who chose dark on the office laptop gets `system` on the host-stand iPad; the Settings select shows a value the UI isn't honouring.
- **Effort**: S. **Risk**: LOW — hydrate local from server once when local is unset (never overwrite an explicit local choice).
- **Keeps it fixed**: `use-theme.test.tsx` case: server `dark` + empty localStorage → `data-theme="dark"`.
- **Fix sketch**: in the provider, `if (!stored && user?.preferences.theme) setTheme(user.preferences.theme)`.

### [RECOGNIZE-01] Walk-in and Waitlist — the two "face-to-face" moments — never recognise a returning guest

- **Evidence**: `src/components/timeline/WalkInDialog.tsx:161-167` — a single optional free-text "Guest Name", no phone/email, no lookup; `src/pages/WaitlistPage.tsx:118-128` collects `guestPhone` (validated) and `:270-285` renders only name / party / phone — no visit count, tags, dietary; `packages/types/src/schemas/waitlist.ts:6-7` carries no `guestId`. `src/hooks/useGuestRecognition.ts:19,49` is email-only and public-widget-only (1 consumer: `GuestDetailsForm.tsx:70`). The rich card exists — `src/components/crm/GuestCard.tsx:132-170` (segment, allergy highlight, visits, no-shows) — and is mounted only where a `guestId` already exists (`TimelinePage.tsx:74-76`, `EditReservationDrawer.tsx:99-101`).
- **Reproduction**: 0 recognition/guest-fetch call sites in `WalkInDialog.tsx` and `WaitlistPage.tsx` (grep `useGuest|guestId|recognition`); walk-ins are created with `guestName` only (`TimelinePage.tsx:276-289`) so the seated block can never show the visit badge (`ReservationBlock.tsx:34-36` needs `reservation.guest`).
- **Impact**: the regular who walks in is greeted as a stranger, and the nut-allergy note that `GuestCard` highlights in red is three clicks away in `/guests`.
- **Effort**: M (phone-or-email lookup via existing `api.guests.search`, optional `guestId` on walk-in/waitlist payloads). **Risk**: MED — touches the reservations service payloads.
- **Keeps it fixed**: `WalkInDialog.test.tsx`: typing a known phone renders `GuestCard`.
- **Fix sketch**: add a phone/name typeahead (`guests/search` exists, mocked at `api-mocks.ts:467`) to WalkInDialog and the waitlist card; pass `guestId` through `walkIn`/`createEntry`.

### [INERT-03] Shipped but never wired: `LapsingGuestsWidget`, and two "completed" backlog claims the code contradicts

- **Evidence**: `src/components/dashboard/LapsingGuestsWidget.tsx` (win-back CTA, `LapsingGuest` type) exported at `dashboard/index.ts:3`; `HomePage.tsx:7` imports `ReservationList, ActivityFeed, StatRow` only — 0 mounts anywhere. `IMPROVEMENT-BACKLOG.md:14` "[x] P0 #1 … `useApiCall` hook + `ErrorRetryBanner` adopted on HomePage, FloorPlansPage, FloorPlanEditorPage, GuestsPage (20 unit tests)" — `grep -rn useApiCall src` → 0 files (the banner _is_ on 9 pages, more than claimed; the hook does not exist); `:21` colours claim, see CORRECTNESS-01.
- **Reproduction**: `grep -rn LapsingGuestsWidget src docs` → only the barrel export and its own files; `grep -rln useApiCall apps/hospitality/src` → empty.
- **Impact**: a recognition feature (lapsing regulars) was built to the CTA and never shown; the done-list is the file that tells the next agent what not to refile, and it is wrong twice.
- **Effort**: S (mount the widget behind real data or delete it; correct the two lines). **Risk**: LOW.
- **Keeps it fixed**: `scripts/check-orphaned-tests.mjs`-style orphan check for exported-but-unimported components; the `/md-audit` pass over `docs/IMPROVEMENT-BACKLOG.md` (it is human-facing markdown and in scope).
- **Fix sketch**: mount `LapsingGuestsWidget` on HomePage fed by the existing `useGuestDirectory` segment query, or remove it; rewrite backlog lines 14 and 21 to what the code does.

## 3. Suspicions (argued, not reproduced)

- **`CancelReservationDialog` / `EditReservationDrawer` share RECOVER-01's stuck-spinner shape** (`CancelReservationDialog.tsx:52-59`, `EditReservationDrawer.tsx:81-88`, parents at `TimelinePage.tsx:256-275`) — same code pattern, only the walk-in path was driven in the browser.
- **BriefingPage / ReservationsPage query errors have no retry** (`isError` referenced 3× each, no `ErrorRetryBanner` import, `retry`/`refetch` 0 hits) — not driven.
- **`err.message` on a network failure** will read `"Failed to fetch"` (TypeError) — the harness's dead `VITE_API_URL` makes this indistinguishable from an artifact, so unreproduced.
- **`ErrorRetryBanner … onDismiss={() => {}}`** (`FloorPlansPage.tsx:132`): rialto `Alert` hides itself via internal `visible` state (`Alert.tsx:103`), so dismiss removes the only Retry while the query stays errored until remount.
- **Waitlist "Notify" gives no delivery feedback** (`WaitlistPage.tsx:217-222`) — success is silence; whether the SMS went is invisible.
- **Rialto ADR-025 migration is incomplete in rialto itself**: `Handshake`, `NeonSign`, `DepartureBoard`, `WatchLoader` call framer's `useReducedMotion` directly and never `useMotionPreset()` (0 hits) — they _do_ honour reduced motion, so this is an ADR-letter gap, rialto scope, not a hospitality defect.
- **Timeline visit badge depends on `reservation.guest`** — `services/reservations/src/services/reservation.ts:87,113` do include it, so not inert; but the e2e fixture has 0 `"guest":` keys, so the badge is never exercised by E2E.

## 4. Already good

- `ErrorRetryBanner` is on 9 pages (HomePage, FloorPlans, FloorPlanEditor ×2, Guests, Admin, Profile, Settings, BookingWidgetDemo, LaunchStep) — more than the backlog claims.
- Reduced motion: rialto `global.css:19` global rule + framer `useReducedMotion` in every animated component hospitality imports; `Toast`, `Dialog` collapse transitions under RM.
- Zero horizontal overflow on all 14 routes at 390/768/1440; Timeline swaps to `TimelineMobileView` ≤768.
- Timeline sidebar and `EditReservationDrawer` mount `GuestCard` (segment, allergy highlight, visits, no-shows) whenever a `guestId` exists — the recognition surface is right, it's the walk-in/waitlist entry points that miss it.
- All five hand-rolled dialogs have `role=dialog` / `aria-modal` / `aria-labelledby`, `useFocusTrap`, Escape, backdrop click, and focus return on cancel.
- 21 `aria-live` regions incl. sr-only result-count announcers on Guests/Admin/Reservations; `use-form-state.ts` unwraps `problemDetails.detail`; Settings/Profile show inline success with a 3 s auto-clear; FloorPlanEditor's Save button carries state ("Save Changes" → "Saving…" → "Saved").
- `TableShape.tsx` reads status colours from tokens with a drift-guard test on its fallbacks; `STATUS_LABEL` is used on Reservations and Timeline.
- Clone/create floor plan navigate straight into the editor (context carried); WaitlistPage's partial-failure copy ("Reservation created but the waitlist entry could not be marked seated — refresh and update it manually") is honest.
- `VenueOnboardingPage`: `ErrorRetryBanner` on launch, `role=status` celebration, roving-tabindex template picker.

## 5. Coverage

| #   | Sweep item                | Result                                                                                                                                                      |
| --- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Error recovery            | audited-**found** (RECOVER-01/02, TONE-01; banner coverage verified: on 9 pages, not on Timeline/Reservations/Briefing/Waitlist/SetupHours)                 |
| 2   | Loading states            | audited-**found** (spinner-only on Timeline/Editor; none on Setup/SetupHours/ManageReservation) — matrix only, no separate finding                          |
| 3   | Empty states              | audited-**found** (NO-DEAD-END-01: 2/10 with action)                                                                                                        |
| 4   | Microcopy voice           | audited-**found** (TONE-01; raw enum on dashboard)                                                                                                          |
| 5   | Focus & live regions      | audited-**found** (INCLUSIVE-01; live regions good; `aria-describedby`/`aria-invalid` delegated to rialto `Select`/`Input`, not re-verified in the browser) |
| 6   | Touch targets & tablet    | audited-**found** (INCLUSIVE-02; overflow clean)                                                                                                            |
| 7   | Motion & theme            | motion audited-**clean**; theme audited-**found** (CORRECTNESS-01, INERT-02)                                                                                |
| 8   | Navigation dead ends      | audited-**found** (INERT-01, NO-DEAD-END-01)                                                                                                                |
| 9   | Keyboard & ⌘K             | audited-**found** (INERT-01); no shortcut conflicts seen (Editor ⌘S / Delete / arrows are page-scoped)                                                      |
| 10  | Inert / hollow mechanisms | audited-**found** (INERT-01/02/03)                                                                                                                          |
| 11  | Recognition data          | audited-**found** (RECOGNIZE-01)                                                                                                                            |

Reached: `apps/hospitality/src/{pages,components/**,hooks,utils,lib,main.tsx,nav-sections.ts}`, `apps/hospitality/e2e/{api-mocks.ts,fixtures,.ux-audit}`, `apps/hospitality/docs/IMPROVEMENT-BACKLOG.md`, `packages/rialto/src/{components/{Dialog,Drawer,Alert,Toast,EmptyState,Button},hooks/{useFocusTrap,useThemeState},providers,styles/global.css,tokens}`, `packages/api-client/src/client.ts`, `packages/types/src/{schemas,reservation.ts,guest.ts,waitlist.ts}`, `services/reservations/src/services` (guest include only), `docs/adr/ADR-025`. Not reached: `PRODUCT.md`, `apps/hospitality/docs/USER-FLOWS.md`, booking-widget internals beyond grep (guest cluster), `ManageReservationPage` internals, SSE reconnect state machine beyond the banner, rialto `GlobalNav` (its 23–32 px links are the bulk of the sub-44 counts and are rialto's, not hospitality's).

Known/in-flight, cited not refiled: #4848 Auth0 branding, #4487 holds auth, #4746 NeonSign, venue-onboarding floor-plan run. Evidence dir: `scratchpad/ux-audit/out/xcut/` (A–H JSON, C/C2/D/F/G/H-*.png). Specs: `apps/hospitality/e2e/.ux-audit/specs/xcut/xcut.spec.ts`, `xcut2.spec.ts` (git-excluded).
