---
stage: review
run: feature:hospitality-service-ux
date: 2026-09-11
assumptions:
  - "Severity arbitration and the fix/defer call on majors belong to the user (review skill step 7). Autorun has no user, so the skill's own default was taken: Review does not carry implementation, no finding was fixed here, and every major is recorded as deferred **with a reason** rather than silently carried. The release bar the brief set — no merge past an unfixed *critical* finding — is the one this artifact adjudicates, and it is met."
  - "The brief named no baseline SHA. The diff reviewed is `git diff origin/main...HEAD` — HEAD `e4437d9a2` on `worktree-hospitality-service-ux`, `origin/main` `2d8f69b2a` after `git fetch origin`, merge-base `5b1f1309f`. Every baseline read used `git show origin/main:<path>`; the local main checkout was never read."
  - "Review inherits Verify's evidence base, which is entirely local (no Auth0 E2E credentials — a standing gap on Matt since 2026-08-31). No production evidence was manufactured to close it. Every behavioural claim below is read from source at `e4437d9a2`, or quoted from a gate this stage ran itself."
---

# Review: hospitality service UX

## Scope

162 files, +15,883 / −1,667 across 42 commits: `apps/hospitality` (135 files —
`src/**` and `e2e/**`), `packages/rialto` (8 — `Drawer` size `compact`,
`CommandPalette` `rankCommandMatch`, plus two changesets), `docs/features/**`
(13), and the regenerated `llms*.txt` / `metrics/ai-antipattern-baselines.json`.

Three passes were run over that diff — correctness, design, security — graded
against the PRD's 42 committed criteria (A1–A10, B1–B3, NF1–NF5) and the
autorun brief's lens table. Every high-risk new module was read in full rather
than skimmed from the diff: `utils/seated.ts`, `components/timeline/seat-guest.ts`,
`hooks/useFocusAfter.ts`, `hooks/useStatusMessage.ts`, `hooks/useViewport.ts`,
`lib/describe-api-error.ts`, `components/timeline/{TimelineGrid,TimelineMobileView,ReservationSheet,TimelineEmptyNight,WalkInDialog,TableStatusMenu}.tsx`,
`pages/{TimelinePage,BriefingPage,WaitlistPage,ReservationsPage}.tsx`, and both
rialto components.

Gates this stage ran itself, from inside `apps/hospitality`:

- `pnpm typecheck` — clean, exit 0.
- `pnpm lint` — **127 problems, 0 errors**. Every warning was traced to a
  pattern already present at `origin/main` (`BriefingPage.tsx:170` `new Date()`
  during render, `ReservationsPage.tsx:166` setState-in-effect, the module-scope
  date default in `TimelinePage.tsx:43`, the duplicate `role="status"` regions
  and `size="sm"` toolbar controls on `/reservations`) and demoted to a
  flagged-not-fixed observation rather than a finding of this run.

Three specialist reviewers were dispatched in parallel, each on its own scratch
path, each warned that the main checkout is ~150 commits stale and must read
baseline only via `git show origin/main:<path>`:

| Reviewer                                                                             | Verdict                                                                             |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `e2e-selector-drift-reviewer` (mandated by the brief for any `apps/*/e2e/**` change) | 0 critical, 3 major, 5 minor across 4 spec files + the mock harness                 |
| `rialto-prop-drift-detector`                                                         | 0 critical, 1 major, 2 minor; no prop-signature drift, no new setState-in-useEffect |
| `adr-compliance-reviewer`                                                            | 0 critical, 0 major, 1 minor across 6 files; `check-adr` clean                      |

## Findings

### Major: `occupiedCaption` tells the Host to turn a table the party in front of them is still sitting at

- Scenario: reservation R is CONFIRMED, 19:00–21:00, at table T5; the Host
  seated it at 19:00, so T5 is `OCCUPIED`. At 21:01 the party is still at the
  table, running over. `isSeated` (`apps/hospitality/src/utils/seated.ts:26`)
  clamps at `at <= end`, so it now returns `false`. Two consequences land on
  the same panel: `statusWord` (`components/timeline/seat-guest.ts:21-23`)
  reverts the chip from "Seated" to "Confirmed", and `occupiedCaption`
  (`seat-guest.ts:38-45`) — guarded only by `if (seated || …)` — starts
  rendering **"T5 is still occupied — turn it or move the party."** The
  function's own docstring states the invariant it has just broken: _"the table
  is OCCUPIED, but not by this party."_ It is, and the instruction is wrong
  about the floor. Surfaces: `ReservationDetails` (desktop sidebar / phone
  drawer) and `ReservationSheet` (tablet sheet, line 56). A party running past
  its slot is routine, not an edge case.
- Note on the `endTime` clamp itself: it is deliberate and defensible —
  `seated.ts`'s docstring gives the reason ("a lingering table that turns
  OCCUPIED for the next party never marks the finished one"), and removing it
  would mark two reservations seated at one table. The defect is that
  `occupiedCaption` was not given the same reasoning; it infers "occupied by
  someone else" from `seated === false`, which the clamp makes untrue for a
  bounded window.
- Decision: deferred — no committed criterion covers it (A4.2 is a one-way
  "only for" constraint, so _not_ saying Seated is not a breach of it), it is
  copy on a panel rather than a write path, and the fix is a behaviour change
  to a shared helper that wants a RED-first test. Routes to Implement.

### Major: B3.2's "never `<body>`" does not hold in the phone viewport

- Scenario: the phone branch of `TimelinePage` (`pages/TimelinePage.tsx:372-381`)
  renders `TimelineMobileView`, not `TimelineGrid`. `TimelineMobileView`
  contains **zero** `data-testid` attributes — verified by grep — so no node
  matching `reservation-block-<id>` exists on that surface. Three success-path
  handlers target exactly that id via `blockTestId` (`TimelinePage.tsx:86-88`):
  `handleWalkIn` (:291), `handleSeat` (:255), `handleCancel` (:264). On a phone
  the target can never resolve, and `useFocusAfter` is documented and tested to
  _keep_ an unresolved request rather than fall back
  (`✓ useFocusAfter > keeps an unresolved target until it is replaced, then drops it`).
  In each case the element that had focus is unmounted by the same handler —
  the walk-in dialog's Confirm, the cancel dialog's Confirm, and the Seat Guest
  button (which disappears once `canSeat` sees the table go `OCCUPIED`) — so
  focus lands on `<body>`. B3.2 reads _"After each of those success paths
  `document.activeElement` is a control inside `main` — the opener, or the newly
  created block/row — never `<body>`"_, with no viewport qualifier. Verify
  recorded B3.2 as PASS on evidence measured where the grid renders (P04:
  `"focusAfterSuccess": { "tag": "BUTTON", "text": "Seat Guest" }`); that
  evidence is true and does not reach the `viewport === "phone"` branch.
- Decision: deferred — real, but not critical: the Host can Tab, no data is
  lost, and the phone is the narrowest of the three viewports this run built
  for (ux.md's Screen 4 sheet is the _tablet_). The fix is a per-viewport focus
  target (a `data-testid` and `tabIndex={-1}` on the mobile card, or a
  `pageHeading` fallback), plus a unit test at phone width. Routes to Implement.

### Major: dialog dismissal drops focus to `<body>` on all three dismissal paths, and Verify's proposed one-line fix would land it on the wrong button

- Scenario: this is the finding the brief handed down as REFUTED, and the
  refutation holds — it is **not** StrictMode-only. Verify re-measured it
  against `vite build` + `vite preview` and recorded `"afterEscape": { "tag":
"BODY", "isBody": true }` at both t0 and t400 (PROD-1), and the same for the
  Cancel button (PROD-3). Read in code, the loss is wider than the two gestures
  measured. `WalkInDialog` routes **three** dismissals to the same `onClose` —
  `useEscapeKey(onClose, true)` (:63), the Cancel button (:208), and
  `handleOverlayClick` (:116-124) — and `handleWalkInClose`
  (`TimelinePage.tsx:215-223`) restores focus only when `openedFromUrl`, so all
  three lose it for a click-opened dialog. The dialog does this deliberately;
  its own suite names the owner: _"focus return belongs to the page"_.
- The extension this stage adds: there are **two** click openers, not one — the
  toolbar Walk-in button (`TimelinePage.tsx:447-450`, the one holding
  `walkInButtonRef`) and the quiet-night CTA
  (`TimelineEmptyNight.tsx:38` → `TimelinePage.tsx:399`, which has no ref).
  Verify's proposed fix — _"one line of page-level focus restoration … the same
  `focusAfter({ kind: "element", … })` it already uses for the URL path"_ —
  would, applied literally, send focus from the middle of an empty grid to the
  toolbar button the Host never pressed. The fix needs to capture the opener at
  open time (the pattern `openEditDrawer` at `TimelinePage.tsx:267-271` already
  uses), not hard-code one ref.
- Decision: deferred — **and the "StrictMode-only" framing is not carried
  forward; it is known wrong.** Non-blocking because no committed criterion
  covers it: B3.2 is scoped to _success_ paths by its own first words, B3.3 is
  explicitly optional and conditioned on Architect pulling the rialto half in
  (it did not), and the PRD's routing sentence says in the same breath that
  "success paths do not depend on it". Routes to Implement, with the opener-
  capture note above attached so the one-liner is not applied as written.

### Major (specialist — `rialto-prop-drift-detector`): a hand-written CommandPalette mock is green at 26/26 while no longer mirroring the ranking it claims to mirror

- Scenario: `apps/rialto-web/src/pages/examples/CommandPaletteExamplePage.test.tsx`
  carries a behavioural replica of `CommandPalette` (lines 43-210) whose header
  comment claims it "mirrors the real component's observable contract …
  substring filtering, group headers ordered by the `groups` prop". This run's
  headline rialto change makes that false: the real component now rank-sorts
  items and re-sorts sections by best rank (`CommandPalette.tsx:126-165`). The
  reviewer worked the inversion through concretely — for query `"Terrace"`,
  `Terrace Suite 507 · South Wing` (Rooms) ranks 0 and
  `Diego Alvarez · Terrace Suite 507` (Reservations) ranks 1, so the real
  component leads with Rooms while the mock leads with Reservations; the test at
  :427-445 does ArrowDown + Enter and asserts `/south wing/i`, which passes
  against the mock and would fail against the component. 26/26 green. This is
  the "shipped but never exercised" shape: a suite that reads as coverage of the
  change and pins nothing about it.
- Decision: deferred — it is a test-fidelity defect in a showcase app, not
  product behaviour, and no criterion covers it. Fix is one of: import the real
  `rankCommandMatch` into the mock, port the rank + section sort, or narrow the
  header comment and rewrite the order-dependent assertion.

### Major (specialist — `e2e-selector-drift-reviewer`): `timeline.spec.ts` is the one spec in this run that does not guard the `role="alert"` collision its four siblings do

- Scenario: `apps/hospitality/e2e/timeline.spec.ts:269` uses a bare
  `getByRole("alert")`. Two sources of `role="alert"` co-exist on TimelinePage —
  `ErrorRetryBanner`'s rialto `Alert variant="error"` (`Alert.tsx:112`) and
  `DashboardLayout`'s session `Banner variant="warning"`
  (`Banner.tsx:112`, rendered at `DashboardLayout.tsx:339` whenever
  `showRefreshBanner`). Two matches → Playwright strict-mode throw on
  `toContainText`. This run's own `briefing.spec.ts:155`, `profile.spec.ts:34`,
  `waitlist.spec.ts:139` and `reservations.spec.ts:102` each carry the comment
  _"DashboardLayout's session Banner is also role=alert in CI"_ and `.filter()`
  accordingly; `timeline.spec.ts` is the one that does not. The paired
  `toHaveCount(0)` at :236 and :272 fails the same way but silently — it goes
  red rather than throwing, for a reason the test is not about.
- Decision: deferred — a CI flake in an advisory suite (`Hospitality E2E` is not
  a required check), one-line fix mirroring the sibling specs. Routes to
  Implement alongside the mock fix below.

### Major (specialist — `e2e-selector-drift-reviewer`): the E2E mock's local-day fix re-dates the day but not the clock, so blocks fall outside the grid west of UTC−7

- Scenario: `apps/hospitality/e2e/api-mocks.ts:316` now builds the day with
  `toLocaleDateString("en-CA")` — a real fix for the 17:00-Pacific empty-grid
  bug (A1/P01), and genuinely tested at `fixtures/api-mocks-table-status.test.ts:171-183`
  under a pinned `TZ=America/Los_Angeles`. But only the date **prefix** is
  rewritten (:326-327); the times keep the fixture's `Z` suffix. The grid
  positions blocks by browser-local hours (`reservationLayout.ts:28`
  `start.getHours()`, window `startHour=11..endHour=23`), so the two halves
  agree only for runner zones ≈ UTC−7 … UTC+2: at PST (−8) an 18:00Z row lands
  at `left = −120px`, at UTC+5 at `left = −1200px`. It fails as a **pass** — a
  negatively-positioned block still has a bounding box, so `toBeVisible()`
  (`timeline.spec.ts:40,185,256`) stays green; only `toBeInViewport()`
  (`walkin.spec.ts:113`) and `.click()` in the non-UTC-pinned describes break.
  The new unit test asserts `r.date` and the startTime's date prefix, never a
  local clock hour, so it reads as full coverage of "the mock is local-correct"
  while covering half.
- Decision: deferred — CI is UTC, where the new expression is identical to the
  old `slice`, so **CI behaviour is unchanged and safe**; the exposure is local
  runs west of UTC−7 (i.e. Matt's own machine, PST half the year). Fix is to
  build `startTime`/`endTime` from the local day plus the intended local
  wall-clock, the pattern `briefing.spec.ts:12` `atLocal()` already gets right.

### Minor: the Briefing's segment labels and its buckets disagree for the 20:00–20:59 band

- Scenario: `BriefingPage.tsx:52-56` moved the Dinner/Late boundary from
  `hour < 20` (baseline, confirmed by `git show origin/main:…`) to `hour < 21`,
  while `TIME_SEGMENTS` (:36-41) still reads "Dinner (6–8 PM)" / "Late (after
  8 PM)". A Host filtering **Late** at 20:30 sees `No late seatings tonight.`
  (:259) while a 20:30 party is on the book under Dinner.
- This was raised as a major and then withdrawn on re-reading: `ux.md:89`
  decides it explicitly — _"bucketing uses local hour (Early < 18:00, Dinner
  18:00–20:59, Late ≥ 21:00). The 'Dinner (6–8 PM)' wording stays because it
  matches the door's vocabulary."_ — and PRD A2.1's clause keys on the
  _local-hour range_, not the label text, so the criterion is met. The
  divergence is a documented, signed-off decision, not decay.
- Decision: deferred — `ux.md` owns the wording; changing it is a copy decision
  for UX, not a defect Review may re-open. Recorded so the label/bucket gap is
  visible to whoever next reads the Briefing.

### Minor: `ReservationSheet`'s More button points `aria-controls` at an id that does not exist while collapsed

- Scenario: `components/timeline/ReservationSheet.tsx:156` sets
  `aria-controls={detailId}` unconditionally, but the `<Stack id={detailId}>` it
  names renders only inside `{expanded && …}` (:166). Collapsed — the sheet's
  default on every fresh selection — the reference dangles, which axe's
  `aria-valid-attr-value` flags and which the WAI-ARIA disclosure pattern
  addresses by omitting `aria-controls` when the content is not rendered. The
  suite only checks the reference _after_ the click (`ReservationSheet.test.tsx:319-324`).
- Decision: deferred — `aria-expanded` carries the state correctly, so no
  assistive-tech user is misinformed; one-line fix
  (`aria-controls={expanded ? detailId : undefined}`).

### Minor (specialist — `adr-compliance-reviewer`): six new E2E error mocks send the retired pre-ADR-008 envelope

- Scenario: `briefing.spec.ts:144`, `profile.spec.ts:23`,
  `reservations.spec.ts:90`, `waitlist.spec.ts:130`, `timeline.spec.ts:10`,
  `walkin.spec.ts:6` mock 500s with `{"error":"server error"}` — a shape
  ADR-008 records as removed once every consumer migrated (#3348), with
  `ProblemDetails` the single wire and in-memory error shape. All six are new in
  this branch (baseline count 0 for each; `dashboard.spec.ts:55` has the same
  shape but is pre-existing and was not flagged). They pass because
  `parseProblemDetails` → `extractDetail` (`packages/api-client/src/problem-details.ts:35`)
  reads `obj.detail ?? obj.message ?? obj.error`, so the legacy body degrades —
  the specs exercise the degradation path, not what production sends. Latent
  rather than live only because `serverError` is not in `describe-api-error.ts`'s
  `SHOWS_PROBLEM_DETAIL` set, so `detail` is never rendered on this path.
- Decision: deferred — RFC 7807 bodies, per the in-repo precedent at
  `onboarding.spec.ts:265-270`. Bundle with the other E2E fixes.

### Minor (specialist findings, recorded without restating): five further E2E drifts and two rialto contract gaps

- `e2e-selector-drift-reviewer`, minors: unscoped `getByText("Live")`
  (`timeline.spec.ts:17`, `timeline-interaction.spec.ts:13`); a
  `getByRole("row", { name: /^Table / })` filter that matches every row and only
  passes because of the priority sort (`timeline-interaction.spec.ts:143`);
  module-load vs request-time day computation that breaks a run straddling local
  midnight (`timeline.spec.ts:35,146` and siblings); the single-reservation
  by-id handler still reading the raw fixture, so list and detail disagree on
  date and identity (`api-mocks.ts:360-389`); and an unexercised success path —
  nothing clicks Seat Guest and asserts the block flips to seated, although the
  mock supports it.
- `rialto-prop-drift-detector`, minors: `rankCommandMatch` is exported as public
  API but does not trim, and returns `0` rather than `null` for an empty query,
  contradicting its own JSDoc (`CommandPalette.tsx:87-97`); and the new
  "ArrowDown + Enter select the top-ranked item" test
  (`CommandPalette.test.tsx:198-213`) is vacuous — only one item matches, so
  `(0+1) % 1 === 0` and the test passes with ArrowDown broken.
- Decision: deferred — all freely deferrable per the review skill.

## Passes with no findings

**Security — clean.** No new `fetch(` or `EventSource` anywhere in the diff (new
hooks route through `useApiClient` / `create-query-hook`); no secrets, tokens,
`jwt.*`, JWKS fetch, manual `Bearer`, or token in `localStorage`; no
`dangerouslySetInnerHTML`, `innerHTML`, `eval`, or `new Function`; no new
`document.cookie` or storage writes. The only hrefs built from data are
`mailto:`/`tel:` on server-issued guest fields (`crm/GuestCard.tsx:197,202`),
where the scheme prefix forecloses `javascript:`. `describe-api-error.ts` is a
fixed copy table with a `SHOWS_PROBLEM_DETAIL` allowlist of exactly
`{conflict, validationError, badRequest}` — a server `detail` reaches the screen
only on those three, so a 500's internals cannot leak into the UI; the raw line
survives only behind `Collapsible`, which the reviewer confirmed omits collapsed
content from the DOM entirely (`Collapsible.tsx:119` — `{isOpen && (…)}`), which
is also what makes B1.1's "no request line is rendered" measurement sound.
`useFocusAfter`'s `testId` selector escapes quotes and backslashes
(`useFocusAfter.ts:27`) and has a test for it. ADR-003 and ADR-007 clean.

**Design — clean apart from the E2E-envelope minor above.** `check-adr` reports
`✅ No architectural violations detected`. ADR-001: zero hardcoded colours,
`rgb()`/`hsl()` or raw easings added across all 16 changed CSS modules; the two
`rgba()` hits in the dialog modules are pre-existing and this diff only deletes
rules there. New components compose rialto rather than hand-rolling
(`TableStatusMenu`→`DropdownMenu`, `ReservationSheet`→`Drawer`,
`TimelineEmptyNight`→`EmptyState`, `TimelineSkeleton`→`Skeleton`,
`ErrorRetryBanner`→`Alert`+`Collapsible`). ADR-025: `useScrollToNow.ts:21-22`
resolves through `useMotionPreset()` and derives `ScrollBehavior` from
`precision.duration === 0`. Both published-source rialto changes carry
changesets, `registry.json` is byte-identical to generator output, and
`DrawerProps.size` was widened additively on an already-optional prop — all 50
`<Drawer` call sites still typecheck.

**Rialto `setState`-inside-`useEffect` (the brief's standing flag): none
introduced.** Two exist in `CommandPalette.tsx` (the reset-on-open at 175-181
and the index clamp at 187-189) and both are **byte-identical to
`origin/main`** (baseline 149-155 and 161-163) — pre-existing, untouched. The
clamp was chased down rather than filed as a hunch: a faithful port of
`rankCommandMatch` plus the real 16-item hospitality palette, run exhaustively
over every 1–4 character query, produced `no same-length reorder found over 1-4
char queries`, so the new ranking cannot strand `activeIndex` on that palette
today. It stays latent, not live, and is not this run's.

**Correctness, on the parts that came back clean.** `seatedReservationIds` is
pure and correctly resolves tables by `tableId` with absent → not seated. The
`isToday`/now-line move from `toDateString` (UTC) to `localDateString` is right
and is what A1 was about. `canSeat` keys on table status alone — an earlier
hypothesis that it would re-offer "Seat Guest" after `endTime` was checked
against the code and dropped. The `Today` button renders only when `!isToday`,
so an earlier concern that it would not re-scroll is void. `KpiStat` spreads
`aria-label` only when the value is nullish, so an explicit `undefined` cannot
erase `Stat`'s own label. `LiveStatus` is mounted from first render and remounts
per `seq`, so a repeated sentence is re-announced. The Waitlist's
`focusAfterRemoval` fallback chain (next card → `waitlist-empty` → page heading)
matches ux.md rule (d) and is covered case-by-case. `rialto` `Card` spreads rest
props onto `motion.div`, so the `tabIndex={-1}` / `data-testid` focus targets
this run added actually reach the DOM.

## Verdict

**CRITICAL: NO. Zero critical findings. Nothing blocks Ship.**

Six majors and eight minors, none of them a stop. Every major is a defect in a
surface this run improved rather than a regression it introduced, none touches a
write path, none loses data, and none is covered by a committed criterion except
the phone-viewport focus gap — whose criterion (B3.2) holds everywhere the grid
renders. The brief's release authorization bars "any merge past an unfixed
critical review finding"; there is no such finding.

**On the refuted StrictMode focus loss:** the refutation stands and is confirmed
independently here. It is real, production-reproducible, and wider than
measured — three dismissal paths, two click openers. Graded **major,
non-blocking**. The "StrictMode-only" framing is not carried forward; it is
known wrong, and it must not be reused as a reason to defer. The deferral reason
is a different and honest one: no committed criterion covers dialog dismissal.

**On the five PARTIALs (A6.2, A7.1, A9.1, B1.1, NF5): I agree with all five
exactly as Verify recorded them, with no softening and no upgrades.**

- **A6.2** — agree. ⌘K "New Floor Plan" belongs to the in-flight
  `venue-onboarding-floor-plan` run (#4751, open) by the PRD's own out-of-scope
  clause. Refusing to grade a clause the run was barred from touching is the
  correct call; a PASS here would have been a fabrication.
- **A7.1** — agree, and this one was re-derived rather than accepted. The
  criterion says "two actions"; `TimelineEmptyNight.tsx:36-46` renders exactly
  one per variant via a ternary. The narrowing is _better than the criterion_:
  the omitted action is a no-op in each case — "go to Today" while already on
  today, "start a walk-in" for a night that is not tonight. The literal text is
  what is wrong, not the code, and PARTIAL records that honestly instead of
  quietly passing it.
- **A9.1** — agree. The shape is verified outright; the 1 s bound is verified in
  the committed E2E and at the PRD's documented 2 s fallback in the harness. The
  gap is the harness, and saying so beats claiming a bound that was not measured.
- **B1.1** — agree, and this is the most disciplined of the five. The tree-wide
  guard passes; two of the five named surfaces (Add Table, Onboarding launch)
  still render the request line, and both are Out-of-scope files belonging to
  the in-flight floor-plan run. Verify recorded the criterion as written rather
  than resolving the ambiguity in its own favour, which is the right instinct.
- **NF5** — agree. Its remaining clauses are Ship's and Review's by
  construction; this artifact discharges the Review clause, and Verify could not
  have.

**Also handed to Ship, unchanged from Verify:** no production evidence exists
for the authenticated dashboard (no Auth0 E2E credentials — a standing gap on
Matt since 2026-08-31, not a defect of this run), so nothing in this artifact
or Verify's is evidence about the deployed dashboard; issue **#5035** is still
open although its work item is done, and closing it is Ship's; and
`e2e/realtime-collaboration.spec.ts`'s two-context failure is a pre-existing
harness flake, characterised and proven not to be this run's doing.

**Recommended routing for the deferred work** (none of it gating): one Implement
pass bundling the three E2E fixes (alert filter, wall-clock re-dating, RFC 7807
bodies) with the two focus fixes (opener capture on dismissal, a phone-viewport
focus target), and a second, separable pass for `occupiedCaption` and the
CommandPalette mock.

Next stage: **Ship**.
