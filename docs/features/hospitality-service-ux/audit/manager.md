# UX audit — Setup & Management journeys (Restaurant Manager persona)

Playbook read (`playbook.md` §§ Finding format, Ordering, 1 Correctness, 10 Inert mechanisms). Tree audited: `.claude/worktrees/hospitality-service-ux` @ `5f642aa42` (= origin/main). Read-only on source; only artifacts written are Playwright specs under `apps/hospitality/e2e/.ux-audit/specs/manager/` (git-excluded) and files under the scratch dir.

Path shorthands used below:

- `OUT` = `/private/tmp/claude-501/-Users-mbutler-github-mattbutlerengineering/7021d85d-b6aa-49c2-ad30-8ddcadb02175/scratchpad/ux-audit/out/manager`
- `SRC` = `apps/hospitality/src` (inside the worktree)
- Probe records: `OUT/probes/probe.jsonl` (T1–T12) and `OUT/probes/probe2.jsonl` (R1–R4, C1–C2); screenshots `OUT/probes/*.png`; walker output `OUT/<slug>/{desktop,tablet,mobile,desktop-full}.png`, `aria.yaml`, `meta.json`.

## 2. What was walked

- **Route walker** (light scheme, admin session, operational fixture venue), viewports 1440×900 / 1024×768 / 375×812: `/setup`, `/setup/hours`, `/onboarding`, `/reservations`, `/guests`, `/floor-plans`, `/floor-plans/fp_e2e_001`, `/settings`, `/profile`, `/admin`, `/booking-widget`, `/chat` → `OUT/<slug>/`.
- **Interaction probes** (desktop unless noted): setup state (floor plans empty) and "Review" CTA; hours reachability for an operational venue; Reservations 500 / empty / 1.8 s slow / tablet touch targets / row click; Guests empty, Add Guest validation, Add Guest 500, drawer, edit-save 500; Floor Plans nested buttons + empty; Editor table select, Delete Table (button + Delete key), Add Table 500, tablet targets; Settings theme PATCH 500 (mouse and keyboard), duration select control, reload persistence; theme matrix (server pref × OS scheme, fresh contexts); Chat send with 500; zero-venue account; Onboarding all 6 steps incl. Back/Next preservation, hours validation, Blank floor plan, Launch with venue POST 500; Booking widget, Admin 500, Profile save 500; loading states at 1.8 s for settings/guests/floor-plans/admin/profile/reservations.
- **Dark scheme**: covered via the theme matrix (T7/C1: `data-theme` flips to dark with OS dark or stored pref) rather than a second full walk.
- **Harness artifacts excluded** (dead `VITE_API_URL`, not product): `GET /api/health/system` (ERR_CONNECTION_REFUSED), SSE `GET /api/v1/events/stream` (ERR_ABORTED) and the resulting "Reconnecting — showing last known status" banner on the editor, `GET /api/v1/venues/ven_e2e_001/table-statuses` (unmocked, refetch loop), `/api/gen/agent` when not explicitly mocked. Also my own harness errors: the first T3/T5/T10 runs aborted because `page.unroute()` removed `mockApi`'s handler and because the by-slug mock answers 200 for every slug (wizard read it as "taken") — re-run cleanly as R1–R3 with `by-slug` → 404.

## 3. Findings (ranked by leverage)

### [NO-DEAD-END-01] Once a venue is operational there is no way to edit operating hours

- **Evidence**: `OUT/setup-hours/meta.json` (url ends `/timeline`, h1 "Timeline"); `OUT/setup/meta.json` (same); probe `T2` in `OUT/probes/probe.jsonl`: `hoursUrl=…/timeline`, `hoursTextHits` = 0 on `/settings`, `/profile`, `/floor-plans`, dashboard. Code: `SRC/components/DashboardLayout.tsx:106-108` redirects any `/setup*` path to `/timeline` when readiness is `operational`; `SRC/pages/SetupHoursPage.tsx` is the only hours editor; `SRC/pages/VenueOnboardingPage.tsx` is create-only (`readOnly={launch.venueId !== null}`); only other `operatingHours` readers are `HomePage.tsx` / `PublicBookingPage.tsx` (display).
- **Reproduction**: sign in with the fixture venue (7-day hours set), open `/setup/hours` → land on Timeline; browse Settings/Profile/Floor Plans → no hours control anywhere.
- **Impact**: High. Hours drive availability and the public booking page; a manager who changes seasonal hours, adds a holiday closure, or fixed a typo at onboarding has no path except a new venue. The persona's most routine "management" task is unreachable.
- **Effort**: M — exempt `/setup/hours` from the operational redirect and link it from Settings (or a Venue card on the dashboard); the page itself already exists.
- **Risk**: LOW — `SetupHoursPage` snapshots `selectedVenue?.operatingHours` into `useState` once (see Suspicions), so verify it re-seeds on venue switch.
- **Keeps it fixed**: an e2e that loads `/setup/hours` with an operational venue and asserts the hours form renders; a nav-coverage test that every `STEP_CONFIG.path` is reachable in the operational state.
- **Fix sketch**: in `DashboardLayout.tsx:106-108` redirect only `/setup` (the checklist), not `/setup/hours`; add "Operating hours" to Settings → a "Venue" card, with the venue switcher respected.

### [CORRECTNESS-02] Settings → Theme dropdown is painted underneath the next card; "Dark" cannot be chosen with a mouse

- **Evidence**: `OUT/probes/c2-theme-listbox-open.png` (listbox shows "System" then disappears under the Notifications card); `C2-theme-click-dissection` in `probe2.jsonl`: `hitAtDarkCenter = "H3 … text=Notifications"`, listbox `position:absolute; z-index:50` at y 404–510 while Notifications card starts y≈452; `afterFullClick = {dataTheme:"light", ls:null}`. `C1-theme-control`: mouse pick of Dark → no change, no PATCH; keyboard (Enter, ↓↓, Enter) → `data-theme="dark"`, `PATCH {"theme":"dark"}` sent; the duration select in the _last_ card works by mouse. Code: `packages/rialto/src/components/Select/Select.module.css:84-91` (absolute dropdown, no portal); `packages/rialto/src/components/Card/Card.module.css:1-16` (Card is `position:relative` with a transform-based hover lift on a composed `aluminumPolished` surface — a stacking context, so the dropdown's z-index cannot escape the card).
- **Reproduction**: `/settings` → click Theme → click "Dark" (or "Light" when current is System). Nothing happens; the click lands on the Notifications heading. Earlier probe `T6-theme500` recorded the same null result and was misread as a save failure.
- **Impact**: High for a visible setting: the control looks broken to every mouse/touch user; also masks the save-error path entirely. Affects any rialto `Select` whose listbox extends past its Card.
- **Effort**: S — portal the Select dropdown (or give Card `overflow: visible` and drop the stacking-context trigger while at rest).
- **Risk**: LOW/MED — portaling changes focus/scroll handling in the Select; Card transform is design-visible (hover lift).
- **Keeps it fixed**: rialto Select story/test with two stacked Cards asserting `elementFromPoint` over the last option is the option; hospitality e2e that mouse-selects Dark and asserts `data-theme`.
- **Fix sketch**: render `.dropdown` through a portal positioned by the trigger's rect; alternatively `isolation`/`z-index` on the open Select's Card so the open card wins over siblings.

### [CORRECTNESS-03] On the setup checklist, "Review" for Venue Basics opens a _blank_ New Venue wizard

- **Evidence**: `T1` in `probe.jsonl`: steps list shows Venue Basics complete with a "Review" button; `afterReview.url = …/onboarding`, `venueNameValue = ""`; `OUT/probes/t1-setup-desktop.png`, `t1-after-review.png`. Code: `SRC/pages/SetupPage.tsx:14` (`path: "/onboarding", ctaLabel: "Review Venue Details"`); `VenueOnboardingPage.tsx` has no edit mode.
- **Reproduction**: venue exists, no floor plan → `/setup` → click "Review" on Venue Basics → empty "Let's give your venue a home" form with Step 1 active.
- **Impact**: High for first-run managers: the one place that promises a review of what they entered instead invites them to create a second venue (and a duplicate slug conflict) or lose trust that the first save landed.
- **Effort**: M — either a read-only venue summary (data already on `selectedVenue`) or hide "Review" until an edit surface exists.
- **Risk**: LOW.
- **Keeps it fixed**: unit test on `SetupPage` that a completed step's CTA never routes to a creation flow; e2e asserting the venue name is present after clicking Review.
- **Fix sketch**: `STEP_CONFIG.onboarding.path` → a venue details view (pairs with finding 01's Venue card); until then render the completed step as a static "Done — E2E Test Bistro" row with no button.

### [TONE-04] Error copy is the raw HTTP request line on five manager surfaces

- **Evidence**: Reservations `OUT/probes/t3-reservations-500.png` ("GET /api/v1/reservations?date=2026-09-03&venueId=ven_e2e_001&limit=50 failed: 500 …"); Admin `T11-admin500` ("GET /api/v1/users?page=1&limit=10 failed: 500 …"); Add Table `OUT/probes/r2-add-table-500.png` ("POST /api/v1/tables failed: 500 …"); Profile `R4-profile500` ("PATCH /api/v1/users/usr_e2e_001 failed: 500 …"); Onboarding launch `OUT/probes/r3-launch-500.png` ("POST /api/v1/venues failed: 500 …"). Source of the prefix: `packages/api-client/src/client.ts:320`; consumers that surface `.message` verbatim: `SRC/pages/ReservationsPage.tsx:111`, `AdminPage.tsx:200`, `ProfilePage.tsx:185,239`, `FloorPlanEditorPage.tsx:125,142,205,218`, `components/floor-plan/AddTableDialog.tsx:86`. Guests and Settings already use `problemDetails.detail` (`GuestsPage.tsx`, `SettingsPage.tsx:145`) — so the app has two error voices.
- **Reproduction**: force a 500 on any of the listed calls (probe specs do this); the banner shows method, path, query string and status.
- **Impact**: Medium-high, cross-cutting. A FOH manager reads `venueId=ven_e2e_001&limit=50` where they need "Couldn't load tonight's reservations." It also leaks internal IDs/query shape to a screenshot-happy user. Cheap to fix once.
- **Effort**: S — one helper (`humanError(err)` returning `problemDetails.detail ?? friendly default`) used at the nine call sites, or make `ApiClientError.message` human and move the request line to a `debugMessage` field.
- **Risk**: LOW.
- **Keeps it fixed**: unit test on the helper; a lint rule / grep test that no page renders `error.message` from an `ApiClientError` directly.
- **Fix sketch**: in `client.ts:320` keep the prefix for logs only; expose `userMessage` = `detail ?? title ?? "Something went wrong"`; pages render `userMessage`.

### [RECOVER-05] Reservations list failure: no Retry, and the KPI cards report "Total 0 / Confirmed 0" as if the night were empty

- **Evidence**: `OUT/probes/t3-reservations-500.png` (four stat cards show 0 while the alert says the fetch failed; no retry button); `T3-500` in `probe.jsonl`: `retryButtons=0`. Code: `SRC/pages/ReservationsPage.tsx:190-192` renders a plain `<Alert variant="error">`; stats are derived from an empty array on error. Reservations is not on the completed error-retry list in `docs/IMPROVEMENT-BACKLOG.md`.
- **Reproduction**: `/reservations` with `GET /api/v1/reservations*` → 500.
- **Impact**: High during service: zeros read as truth ("no bookings tonight") — a correctness lie layered on a dead end; the only recovery is a full reload.
- **Effort**: S — swap to the existing `ErrorRetryBanner` (already used on Home/Guests/Floor Plans/Admin) and suppress/blank the stat cards while `error` is set.
- **Risk**: LOW.
- **Keeps it fixed**: e2e: 500 → banner with Retry, stats show "—", Retry with 200 restores rows.
- **Fix sketch**: `ReservationsPage.tsx:190` → `<ErrorRetryBanner error={humanError(queryError)} onRetry={refetch} />`; render stat values as `—` when `queryError`.

### [INERT-06] The server-side theme preference is written but never read; page theme and the Theme control disagree

- **Evidence**: `T7-matrix` in `probe.jsonl`: fresh context, server pref `dark` + OS light → `data-theme="light"`; server `light` + OS dark → `dark`; `C1-theme-control`/`C1-after-reload`: keyboard-selecting Dark sends `PATCH {"theme":"dark"}` and sets `localStorage mbe-theme-preference=dark`, yet the combobox keeps showing the server value ("Light" — mock returns the fixture, but the split is structural). Code: `SRC/pages/SettingsPage.tsx:226-236` (`value={preferences.theme}` from the server, `onChange` → `setLocalTheme` + PATCH); `SRC/main.tsx:316-330` seeds `ThemeContext` from rialto `useThemeState` which reads only `localStorage`/`prefers-color-scheme` (`packages/rialto/src/hooks/useThemeState.ts:10,23,33`). Grep: nothing feeds `user.preferences.theme` into the theme state (only `AdminPage.tsx:132` displays it).
- **Reproduction**: set theme on device A; open the app on device B (or a private window): B renders per OS, while Settings claims the server choice.
- **Impact**: Medium. A "preference" that is saved with a network round-trip and a "Settings saved" toast but has no effect anywhere is a writer with no reader (playbook §10); the visible symptom is a Select whose label contradicts the page.
- **Effort**: S — when `localStorage` has no value, seed from `user.preferences.theme` after `/users/me` resolves; or stop persisting theme server-side and make the Select read `useTheme().theme`.
- **Risk**: LOW — avoid a flash: apply after auth resolves only when local pref is absent.
- **Keeps it fixed**: unit test on the seeding hook; e2e with server pref dark + OS light asserting `data-theme="dark"` and Select shows Dark.
- **Fix sketch**: in `main.tsx` ThemeBoot, `useEffect(() => { if (!localStorage.getItem(KEY) && user?.preferences.theme) setTheme(user.preferences.theme) })`; Settings Select `value={theme}` from context.

### [NO-DEAD-END-07] `/chat` drops the manager out of the app shell, has no heading or way back, and a failed send is silent

- **Evidence**: `OUT/chat/desktop.png` and `OUT/chat/meta.json` (h1 `[]`, `landmarks.main = 0`, buttons `["", "Send"]`, only the top MBE bar); `OUT/probes/t8-chat-500.png` after sending with `/api/gen/agent` → 500: the user bubble appears, no assistant reply, no error, `retry=0`, Send disabled. Code: `SRC/pages/ChatPage.tsx:13-21` renders `<ChatPanel standalone onClose={() => navigate(-1)}>` outside `DashboardLayout`; there is no visible close/back control.
- **Reproduction**: sidebar → Tools → Chat; type anything with the agent unreachable.
- **Impact**: Medium. Sidebar navigation that removes the sidebar is disorienting; on failure the manager sees a frozen composer with no explanation. (Agent is "Tools", not the critical path, hence below the setup findings.)
- **Effort**: S-M — mount ChatPage inside `DashboardLayout` (or add a header with title + Back) and render the stream error state in `ChatPanel`.
- **Risk**: LOW.
- **Keeps it fixed**: walker meta assertion that every route has an `h1` and a `main` landmark; e2e: 500 → visible error with Retry.
- **Fix sketch**: route `/chat` as a child of the dashboard layout with `<Heading level=1>Chat</Heading>`; in the chat hook, surface `humanError(err)` as an assistant-side system message with "Try again".

### [RECOGNIZE-08] Reservation rows have one invisible action — jump to that day's Timeline — and no detail, edit or cancel from the list

- **Evidence**: `R1-rowjump` in `probe2.jsonl`: the only interactive element per row is an `opacity:1; position:absolute` overlay button with `aria-label "View Alice Johnson reservation on timeline"` and empty text; hover reveals nothing (`hoverButtons=[""]`); click → `/timeline?date=2026-09-04` with `highlighted=0` (`OUT/probes/r1-after-row-click.png`); Table column shows raw ids `tbl_e2e_003/002/004`. Code: `SRC/pages/ReservationsPage.tsx:235-257` (`rowButton`, `navigate(\`/timeline?date=${reservation.date}\`)`, `reservation.table?.name ?? reservation.tableId`).
- **Reproduction**: `/reservations` → click any row.
- **Impact**: Medium. Scope calls for detail/edit/cancel from the list; today the list is a read-only mirror whose click target is undiscoverable (no affordance, no chevron) and lands the manager on a grid without pointing at the booking. Raw `tbl_*` ids are a recognition failure on every row.
- **Effort**: M — a row drawer (reuse the guest drawer pattern) or at minimum a visible "View on timeline" link per row plus `?reservation=<id>` to highlight; join table names.
- **Risk**: LOW/MED (deep-link handling on Timeline is listed complete — ensure the param exists before relying on it).
- **Keeps it fixed**: e2e asserting a visible per-row action and that landing highlights the reservation; unit test that Table cell never renders an `tbl_` id.
- **Fix sketch**: replace the overlay with a trailing cell containing `<Button variant="ghost">View</Button>` + status actions (Confirm/Cancel with ConfirmDialog); resolve table names via the floor-plan tables query.

### [CALM-09] Floor-plan editor confirms Delete Table with a native `window.confirm`, while the same page uses rialto `ConfirmDialog` for unsaved changes

- **Evidence**: `R2-delete` and `R2-kbd-delete` in `probe2.jsonl`: `nativeDialogs=[{type:"confirm", message:"Delete this table? This action cannot be undone."}]`, `rialtoDialogs=0` for both the Delete Table button and the Delete key. Code: `SRC/pages/FloorPlanEditorPage.tsx:134` (`window.confirm`), `:172` (Delete/Backspace key path), `:383` (`ConfirmDialog` for unsaved changes).
- **Reproduction**: open `/floor-plans/fp_e2e_001`, select table 1, click Delete Table (or press Delete).
- **Impact**: Medium-low. The browser dialog is unstyled, unthemed, blocks the tab, ignores reduced-motion/brand, and cannot be tested or announced consistently; it also violates the app's own "Rialto components exclusively" rule.
- **Effort**: S — reuse the existing `ConfirmDialog` with the same copy.
- **Risk**: LOW.
- **Keeps it fixed**: lint rule banning `window.confirm/alert/prompt` under `apps/`; unit test asserting the dialog role is present after clicking Delete Table.
- **Fix sketch**: `pendingDelete` state → `<ConfirmDialog title="Delete this table?" confirmLabel="Delete" variant="danger">`; confirm → existing mutation.

### [INCLUSIVE-10] Floor Plans cards nest a button inside a button

- **Evidence**: `T5-nested` in `probe.jsonl`: `button button` matches `["Clone"]`; card accessible name is "Clone Main Floor Active 2 tables Updated 12/31/2025"; walker `OUT/floor-plans/meta.json` console error from React about `<button>` inside `<button>`. Code: `SRC/pages/FloorPlansPage.tsx:143-176`.
- **Reproduction**: `/floor-plans` with one plan; inspect the card.
- **Impact**: Medium for keyboard/AT users: one tab stop announces both actions, activation is ambiguous, and Clone is reachable only by mouse in some browsers; invalid HTML.
- **Effort**: S.
- **Risk**: LOW.
- **Keeps it fixed**: axe rule `nested-interactive` in the page test; walker assertion `button button` count = 0.
- **Fix sketch**: card as a `<div>` with the title as the link/button (`Open floor plan: …`) and Clone as a sibling button in the card footer.

### [TIME-11] Tablet targets across the shell and editor are 28–34 px tall

- **Evidence**: `T3-touch-tablet` (1024×768): sidebar items 239×32, top nav links ~32 h, venue switcher 34 h, breadcrumb "Home" 45×24, theme toggle 36×36; `R2-editor-tablet`: "Back to floor plans" 28×28, "Set as Active" 115×30, "+ Add Table" 107×30, "Saved" 73×28, All Tables rows 223×28, canvas tables 34×34 (`OUT/probes/r2-editor-tablet.png`, `OUT/reservations/tablet.png`).
- **Reproduction**: resize to 1024×768; measure with devtools.
- **Impact**: Medium. PRODUCT.md names the FOH manager on a tablet; every primary navigation target is under the 44 px floor, so mis-taps during service are likely.
- **Effort**: M — size tokens on `GlobalNav` items/buttons at `≤1024px` (`min-block-size: 44px`), editor toolbar `size="md"`.
- **Risk**: MED — visual baselines (rialto-web/Storybook) will need regeneration.
- **Keeps it fixed**: a tablet e2e that asserts every `nav a, nav button, main button` has `height ≥ 44` (allow-list icons that have ≥44 px hit area via padding).
- **Fix sketch**: in rialto GlobalNav/Button, a `--rialto-target-min: 44px` applied under a coarse-pointer media query (`@media (pointer: coarse)`), which also keeps desktop density.

### [INCLUSIVE-12] Every route shares one `document.title` ("Dashboard - Matt Butler Engineering")

- **Evidence**: all 12 walker `OUT/*/meta.json` `title` fields identical. Code: `SRC/components/LoginGate.tsx:56-58` is the only writer.
- **Reproduction**: open any two dashboard routes; compare tab titles/history entries.
- **Impact**: Low-medium: tab switching, browser history and screen-reader page announcement cannot distinguish Reservations from Settings; an easy, whole-app win.
- **Effort**: S.
- **Risk**: LOW.
- **Keeps it fixed**: walker assertion that `title` differs across routes and starts with the `h1`.
- **Fix sketch**: `useDocumentTitle(\`${pageName} · ${venue?.name ?? "Hospitality"}\`)`in`DashboardLayout` driven by the route handle.

## 4. Suspicions and below-the-cut items

**Reproduced but not worth a ranked slot (low leverage):**

- Empty states carry no inline next action and use ISO dates: Reservations "No reservations found for 2026-09-03." (`T3-empty`), Guests "Get started by adding your first guest." with the button only in the header (`T4-empty`), Floor Plans likewise (`T5-empty`). Add a CTA to `EmptyState`; format the date like the Timeline header does.
- Add Guest validation is a dialog-level banner: email input has `aria-invalid=null`, `aria-describedby=null` (`T4-validation`; `SRC/pages/GuestsPage.tsx:114`). The edit drawer already does field-level errors — reuse that.
- Loading patterns differ by page at 1.8 s: Handshake "Winding things up" (any page while `/users/me` is slow), one skeleton row on Reservations, plain "Loading users..." / "Loading your profile..." text, and a bare header with nothing on Floor Plans (`T12-*`, `OUT/probes/t12-floor-plans-loading.png`). Pick skeleton-per-page; the Handshake instrument itself is on-brand.
- Profile page shows engineering telemetry to a manager: a flip clock, "Session active", "Token lifetime elapsed 2%" (`OUT/probes/t11-profile-save-500.png`). Consider hiding behind Admin.
- Onboarding Review lists weekdays lowercase ("monday 09:00 - 22:00") while the hours step capitalises them (`R3-steps4-6`).
- Editor page has no `h1` (all headings are `h2`: "Main Floor", "Table Details", "All Tables") — `OUT/floor-plans-fp-e2e-001/meta.json`, `R2-delete.headings`.

**Argued only (not browser-reproduced):**

- `SetupHoursPage.tsx` seeds `useState(selectedVenue?.operatingHours ?? {})` once; switching venue while on the page would show the previous venue's hours. Matters more once finding 01 makes the page reachable.
- Floor-plan **Activate failure** path not exercised: the button is labelled "Set as Active" and my `/^activate/` locator missed it; code path `FloorPlanEditorPage.tsx:200-205` renders `err.message` (so it would inherit finding 04's raw request line).
- Booking-widget device frame: measured `[class*="deviceFrame"]` width 798 after choosing Mobile — the selector may have matched a wrapper; unverified against the 375 px AC.
- Editor autosave (1 s debounce, `FloorPlanEditorPage.tsx:148-156`) coexists with a "Save Changes / Saved" button; after a drag the label flips to "Saving..." then "Saved" — the button's role when autosave exists is unclear, but no failure was observed.

## 5. Already good

- **Onboarding wizard** (Flow 1): slug auto-generates ("the-gilded-fern") with a live "Slug is available" hint; timezone defaults to the browser zone with searchable IANA options; Back preserves name and timezone; hours step blocks Next with "At least one day must be open" and seeds 09:00–22:00 when a day is toggled; floor-plan templates carry honest copy ("No tables — your Timeline stays empty until you add some"); Launch failure shows a staged "Launching…" with "Couldn't create the venue", "Retry picks up at Venue." and a working Retry, keeping all entered data (`OUT/probes/r3-*.png`). Tone here is the app's best.
- **Failed saves keep the manager's work**: Add Guest 500 keeps the dialog open with the name intact; guest edit 500 stays in edit mode with edits preserved ("Guest update failed (probe)" via `problemDetails.detail`); Add Table 500 keeps "Probe 9" in the field; Profile save 500 stays in edit mode with the new name (`T4-*`, `R2-add500`, `R4-profile500`).
- **Guest drawer** recognises the guest well: VIP/regular tags, 12 visits, dietary note, contact, recent reservations; focus is trapped in the dialog (`T4-drawer`).
- **Admin list** uses `ErrorRetryBanner` with a working Retry (`T11-admin500`).
- **Zero-venue account** lands directly on the wizard with no dashboard flash; `/guests` also routes there (`T9`).
- **Theme respects OS scheme** when the preference is "system" (`T7`), and keyboard selection in the rialto Select works end to end (`C1`).
- Settings copy is honest about scope ("These are stored locally on this device"); Booking Widget says plainly that embed/copy is "coming soon… not functional yet" rather than shipping a dead button.
- Unsaved-changes `ConfirmDialog`, breadcrumbs, venue selector, ⌘K search affordance in the sidebar are present as the backlog claims.

## 6. Coverage

| Scope item                                                                             | Status                                                                                                                                                    |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flow 1 `/onboarding` all steps incl. Floor plan + Launch (+ POST 500)                  | audited-found (only TONE-04 raw copy; otherwise Already good)                                                                                             |
| Zero-venue state                                                                       | audited-clean                                                                                                                                             |
| `/setup` checklist                                                                     | audited-found (CORRECTNESS-03)                                                                                                                            |
| `/setup/hours`                                                                         | audited-found (NO-DEAD-END-01); the form itself not-reached (unreachable for the operational fixture; setup-state redirect not probed with hours missing) |
| Flow 5 `/guests` search, drawer, Add Guest validation, edit-save 500, empty            | audited-found (below-the-cut: validation association, empty CTA); rest clean                                                                              |
| Flow 6 `/floor-plans` list, empty, nested buttons                                      | audited-found (INCLUSIVE-10)                                                                                                                              |
| Flow 6 editor: select, delete (button + key), Add Table 500, unsaved indicator, tablet | audited-found (CALM-09, TONE-04, TIME-11); drag/snap and Activate-failure not-reached; back-warning listed complete, not re-tested                        |
| Reservations list: filters/status/search UI, 500, empty, slow, row click, tablet       | audited-found (RECOVER-05, RECOGNIZE-08, TIME-11); filter/status/search interactions and cancel-from-list not-reached (no such affordance exists)         |
| `/settings` theme (mouse/keyboard/500/reload), toggles                                 | audited-found (CORRECTNESS-02, INERT-06)                                                                                                                  |
| `/profile` edit + save 500                                                             | audited-found (TONE-04; telemetry below-the-cut)                                                                                                          |
| `/admin` 500 / empty                                                                   | audited-clean (raw copy noted under TONE-04)                                                                                                              |
| Flow 7 `/booking-widget` venue select, device frame, embed copy                        | audited-clean on copy; embed copy AC not implemented by design (page says so); device-frame width is a Suspicion                                          |
| `/chat`                                                                                | audited-found (NO-DEAD-END-07)                                                                                                                            |
| Loading (slow mock) per page                                                           | audited (below-the-cut inconsistency)                                                                                                                     |
| Dark scheme                                                                            | audited via theme matrix; no full dark walk                                                                                                               |
| document.title / landmarks / h1 across routes                                          | audited-found (INCLUSIVE-12; editor/chat h1 below-the-cut)                                                                                                |
