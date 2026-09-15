---
stage: verify
run: feature:booking-guest-reuse
date: 2026-09-15
tree: "worktree-booking-guest-reuse @ ceea02b21 (32 commits over origin/main da54bd57b; 67 files, +6081/−89); every command ran from /Users/mbutler/github/mattbutlerengineering/.claude/worktrees/booking-guest-reuse on Node v22.22.3; tree clean before and after except for this file"
assumptions:
  - "Graded against prd.md's SC1–SC15 wording; where a breakdown accept line is narrower or wider than the SC it delivers, the SC text wins and the breakdown line is cited beside it. Breakdown items the SC map does not attach to an SC (M1.2, M2.1–M2.5, M6.1) are graded as criteria 16–22 on their own accept lines."
  - "SC3/SC4's 'Guest row count' and SC1/SC8/SC12's 'stored row' are proven through the mocked `guestService` / `confirmHold` / `prisma` call arguments the service and route tests assert, not through a database. No integration database exists for this stage; nothing here touched a Prisma client for real."
  - "SC11's 'identical headers' is accepted with the test's own allowlist of `x-ratelimit-*` (99→98 between the two injects) and `date` — both are per-request state of the same in-process app, not a matched/unknown signal. Marked PARTIAL by wording, PASS in substance."
  - "SC12 says the route test 'asserts the stored reservation does not carry it'; the test proves it one level up (`guestService.getById` never called, every `confirmHold` call's `guestDetails.guestId !== 'gst_evil'`, the public JSON schema declares no `guestId`) and tolerates 201 or 400. Marked PARTIAL by wording, PASS in substance."
  - "Behavioural check (a): all three surfaces keep the typed name on Clear (`setFocus('guestName', { shouldSelect: true })`) and revert only the prefilled contact fields. ux.md § States 'Cleared' (:139) and Flow 1 step 6 (:58) say the field reverts too; ux.md :45 ('reverts what the pick filled') is compatible with keeping the name. Implement flagged the choice and pinned it in tests, so it is recorded as PARTIAL and handed to Review as a doc-or-code decision, not routed back as a failure."
  - "Behavioural check (b): each dialog has two polite regions (the dialog's LiveStatus plus the listbox's own `role=status`). Judged against ux.md § Announcements :271 ('the listbox's own region'), which is more specific than § Conventions :281 ('one polite region'). PASS with the tension noted for Review."
  - "Behavioural check (c): the listbox hides during the 300 ms debounce pause (`useGuestLookup` resets `query` to '' until the timer settles). ux.md :133 neither permits nor forbids the gap, so this is a judgement PASS with a note."
  - "M2.1's accept line `git grep defaultPrevented packages/rialto/dist/lib/hooks` cannot literally succeed: `dist/` is gitignored. The compiled guard was found with a plain grep in the built chunk instead and the criterion is graded on that."
  - "E2E evidence comes from the scratchpad harness (port 3012, synthetic OIDC session written to `e2e/.auth/auth-state.json`, `playwright.local.config.ts`, `--no-deps --project=chromium`, 1 worker, 0 retries), not from the committed `auth.setup.ts` Auth0 flow. No Auth0 credentials were used or available; the committed E2E job in CI is the only place the real login runs."
  - "The three root gates (`pnpm regen --check`, `check-adr`, `check-deps`) were run once during the stage and once more at write-up so their output could be captured to log files; both runs were green. No red gate was re-run in this stage."
  - "The whole-tree prettier failure on `docs/features/booking-guest-reuse/ux.md` and `autorun-brief.md` is recorded under § Failures with routing, not against an SC: SC13/M6.3 name only `apps/hospitality/CLAUDE.md` and `apps/hospitality/docs/USER-FLOWS.md`, which pass. Neither failing file was authored by Implement, and Verify does not fix."
  - "Lint warning totals (hospitality 132, rialto 160) were not diffed against origin/main; the grading is 0 errors plus a read of every warning in a touched file. The `react-hooks/incompatible-library` warnings at the three new `watch('guestName')` sites are the React Compiler declining to compile those components, not a rule violation."
  - "Both reviewer subagents (`e2e-selector-drift-reviewer`, `generated-artifact-determinism-reviewer`) were re-dispatched by this stage on the committed range and their reports are quoted; Implement's earlier runs in breakdown.md § Notes are prior evidence only."
  - "`date:` is the local calendar date the stage ran (2026-09-15 PDT)."
---

# Verification: Reuse existing guests at booking time

## Summary

**30 criteria: 27 PASS, 3 PARTIAL (SC11, SC12, behavioural (a)), 0 FAIL**, plus one gate failure outside the criteria (prettier on two UX-stage docs, routed to Ship/Review). Every SC1–SC15 has targeted test evidence with named passing tests; the two PARTIALs on SC11/SC12 are wording gaps between the PRD sentence and what the route tests literally assert, both satisfied in substance. The one behavioural deviation from ux.md — Clear keeps the typed name — is deliberate, flagged by Implement, and pinned by tests on all three surfaces; it needs a doc-or-code decision from Review, not a re-implementation.

**Verdict: advance to Review.**

Whole-suite gates on `ceea02b21` (all `exit=0`):

```
apps/hospitality       Test Files  174 passed (174)   Tests  2398 passed (2398)
services/reservations  Test Files   93 passed (93)    Tests  1409 passed (1409)
packages/types         Test Files   11 passed (11)    Tests   282 passed (282)
packages/api-client    Test Files   19 passed (19)    Tests   300 passed (300)
packages/rialto        Test Files  149 passed (149)   Tests  2313 passed (2313)
typecheck ×5           exit=0 (tsc --noEmit; api-client -p tsconfig.test.json)
lint apps/hospitality  ✖ 132 problems (0 errors, 132 warnings)
lint packages/rialto   ✖ 160 problems (0 errors, 160 warnings)
lint reservations/types/api-client   exit=0, no output
pnpm regen --check     All generated artifacts are up to date.
check-adr              ✅ No architectural violations detected.
check-deps             ✅ All external dependencies are consistent across the monorepo.
pnpm --dir apps/hospitality build   ✓ built in 969ms
pnpm --dir apps/hospitality size    exit=0 (10 budgets, none exceeded)
pnpm check:markdown    exit=0
pnpm check:prettier    exit=1  ← ux.md, autorun-brief.md (see § Failures)
E2E run 1 (walkin + reservations)   14 passed (29.1s)
E2E run 2 (whole mocked project)   103 passed (3.6m)   realtime-collaboration 3/3, no isolation re-run needed
```

## Criteria & evidence

| #   | Criterion                                                       | Result  |
| --- | --------------------------------------------------------------- | ------- |
| 1   | SC1 pick submits `guestId`, stored, no new Guest                | PASS    |
| 2   | SC2 strip shows visits / no-shows / allergies                   | PASS    |
| 3   | SC3 exact same-venue match links, no new row, email wins        | PASS    |
| 4   | SC4 no match → one new Guest, linked                            | PASS    |
| 5   | SC5 foreign-venue match never linked                            | PASS    |
| 6   | SC6 lookup failure never blocks submit (3 surfaces)             | PASS    |
| 7   | SC7 walk-in without lookup is byte-for-byte today's             | PASS    |
| 8   | SC8 walk-in with pick stores `guestId`, block shows ordinal     | PASS    |
| 9   | SC9 waitlist lookup, prefill, entry carries only today's keys   | PASS    |
| 10  | SC10 public confirm links by email, then phone; unknown null    | PASS    |
| 11  | SC11 matched vs unknown response identical                      | PARTIAL |
| 12  | SC12 public body never reads `guestId`                          | PARTIAL |
| 13  | SC13 gates                                                      | PASS    |
| 14  | SC14 rialto-only, tokens, reduced motion, no setState-in-effect | PASS    |
| 15  | SC15 docs                                                       | PASS    |
| 16  | M1.2 `api.reservations.walkIn` accepts `guestId`                | PASS    |
| 17  | M2.1 rialto `useEscapeKey` ignores a consumed Escape            | PASS    |
| 18  | M2.2 `getRiskLabel`/`getRiskVariant` lifted to `guest-signals`  | PASS    |
| 19  | M2.3 `guest-lookup-rows` helpers                                | PASS    |
| 20  | M2.4 `guest-prefill` rule                                       | PASS    |
| 21  | M2.5 `useGuestLookup` hook                                      | PASS    |
| 22  | M6.1 E2E mocks + selector-drift review                          | PASS    |
| 23  | (a) Clear reverts the name                                      | PARTIAL |
| 24  | (b) two polite regions per dialog                               | PASS    |
| 25  | (c) listbox hides during the debounce pause                     | PASS    |
| 26  | (d) SC11 seam equivalence                                       | PASS    |
| 27  | (e) SC12 "never read" vs 400                                    | PASS    |
| 28  | (f) `recordVisit` has zero callers                              | PASS    |
| 29  | (g) Zod `ReservationSchema.guest` pinned                        | PASS    |
| 30  | (h) `aria-describedby` `${id}-hint` element exists              | PASS    |

### 1. SC1 — Picking a suggested guest submits that guest's id as `guestId`; the created reservation's `guestId` equals it; no new Guest row

- Check: component test asserts the `onConfirm`/`api.reservations.create` payload after a pick; route test (M1.7 (c)) asserts an in-venue `guestId` is persisted and `create` is never called on the guest service.
- Evidence:

  ```
  CMD: pnpm --dir apps/hospitality exec vitest run src/components/reservations/NewReservationDialog.test.tsx -t "returning guest lookup" --reporter=verbose
  ✓ NewReservationDialog > returning guest lookup > picking Priya links the booking, prefills her contact details and shows the strip
  ✓ NewReservationDialog > returning guest lookup > leaves today's payload untouched when the lookup is ignored
  Tests  7 passed | 19 skipped (26)   exit=0

  CMD: pnpm --dir services/reservations exec vitest run src/routes/reservations.test.ts -t "member gate and guest linking" --reporter=verbose
  ✓ POST /v1/reservations — member gate and guest linking (booking-guest-reuse M1.7) > (c) member supplying an in-venue guestId → 201 with the link, create never called
  Tests  7 passed | 66 skipped (73)   exit=0

  CMD: pnpm --dir services/reservations exec vitest run src/services/guest-link.test.ts -t "resolveGuestLink|linkOrCreateGuest" --reporter=verbose
  ✓ resolveGuestLink (M1.3) > (a) accepts a supplied id that belongs to the venue and skips the contact lookups
  ✓ resolveGuestLink (M1.3) > (g) never calls findOrCreate, update or create
  ✓ linkOrCreateGuest (M1.4) > returns a resolve hit unchanged and never calls create
  Tests  18 passed (18)   exit=0
  ```

- Result: PASS

### 2. SC2 — After a pick, the dialog shows visit count, no-show count and dietary restrictions with allergies distinguished as `GuestCard` does

- Check: `GuestHistoryStrip.test.tsx` with the SC2 fixture (4 visits, 1 no-show, `["shellfish"]`); allergy entries use the error `Tag` with an `Allergy:` prefix — `GuestCard.tsx:115` filters with the same `isAllergyTag`.
- Evidence:

  ```
  CMD: pnpm --dir apps/hospitality exec vitest run src/components/crm/GuestHistoryStrip.test.tsx -t "GuestHistoryStrip" --reporter=verbose
  ✓ GuestHistoryStrip > is a group named by the linked title and lists visits, no-shows and risk
  ✓ GuestHistoryStrip > marks allergies with the error Tag and an Allergy: prefix, other restrictions plain
  ✓ GuestHistoryStrip > renders the zero state without a segment Badge, no-shows or tags
  Tests  6 passed (6)   exit=0

  GuestCard.tsx:115  const allergyRestrictions = (guest.dietaryRestrictions ?? []).filter(isAllergyTag);
  ```

- Result: PASS

### 3. SC3 — No pick + exact same-venue email/phone match links that guest; Guest count unchanged; email precedence

- Check: `guest-link.test.ts` (c)/(d) and `reservations.test.ts` (e); "row count unchanged" is proven as `create` never called (see assumptions).
- Evidence:

  ```
  ✓ resolveGuestLink (M1.3) > (c) email wins over phone when both match different guests, and both lookups ran
  ✓ resolveGuestLink (M1.3) > (d) falls back to the phone match when only the phone hits
  ✓ linkOrCreateGuest (M1.4) > returns a resolve hit unchanged and never calls create
  ✓ POST /v1/reservations — member gate and guest linking (M1.7) > (e) member with no guestId and an exact email match → 201 linked to the match, create never called
  ```

- Result: PASS

### 4. SC4 — No pick + no match creates one new Guest and links it

- Check: `guest-link.test.ts` create cases; `reservations.test.ts` (f).
- Evidence:

  ```
  ✓ linkOrCreateGuest (M1.4) > miss + email + name → create called once with { venueId, name, email } (no phone key) and its id is the link
  ✓ linkOrCreateGuest (M1.4) > miss + phone + name → create called with { venueId, name, phone } (no email key)
  ✓ linkOrCreateGuest (M1.4) > create rejecting with P2002 → contact lookups run a second time and the winner's id is the link
  ✓ POST /v1/reservations — member gate and guest linking (M1.7) > (f) member with no match, email and name → one Guest created and linked
  ```

- Result: PASS

### 5. SC5 — An exact match in a different venue is never linked

- Check: `resolveGuestLink` (b) rejects a foreign-venue id (`guest.venueId === venueId` check at `guest-link.ts:37-38`); contact lookups are venue-scoped through Prisma compound uniques.
- Evidence:

  ```
  ✓ resolveGuestLink (M1.3) > (b) rejects an unknown id and a foreign-venue id with the same GUEST_NOT_IN_VENUE object

  CMD: pnpm --dir services/reservations exec vitest run src/services/guest.test.ts -t "compound key" --reporter=verbose
  ✓ guestService > findByEmail > finds guest by venue + email compound key
  ✓ guestService > findByPhone > finds guest by venue + phone compound key
  Tests  2 passed | 32 skipped (34)   exit=0
  guest.test.ts asserts: where: { venueId_email: { venueId: "venue-1", email: "guest@example.com" } }
                         where: { venueId_phone: { venueId: "venue-1", phone: "+15551234567" } }
  ```

- Result: PASS

### 6. SC6 — Lookup failure never blocks submit on any of the three surfaces

- Check: one test per surface with the search mock rejecting; `GuestLookup` keeps the field usable and shows the caption once.
- Evidence:

  ```
  ✓ NewReservationDialog > returning guest lookup > a failed lookup never blocks submit (SC6)
  ✓ WalkInDialog > returning guest lookup (M3.1, #4990) > a failed lookup never blocks Seat now (SC6)
  ✓ WaitlistPage > returning guest lookup (M4.1, #4990) > a failed lookup never blocks adding (SC6)
  ✓ GuestLookup > shows the failure caption once per episode, keeps the field usable, and clears it on recovery
  ✓ useGuestLookup > reports failed when the search errors
  ```

- Result: PASS

### 7. SC7 — With no lookup interaction the walk-in payload and outcome are exactly today's

- Check: dialog, hook, service and route each assert no `guestId` key when nothing was picked; existing walk-in tests and `walkin.spec.ts` pass unchanged in intent.
- Evidence:

  ```
  ✓ WalkInDialog > returning guest lookup (M3.1, #4990) > leaves today's payload byte-for-byte when the lookup is ignored (SC7)
  ✓ useTimelineData > mutation: createWalkIn > sends no guestId key at all when the dialog omits it (SC7)
  ✓ reservationService > createWalkIn > writes guestId null and links nothing when no guestId is supplied (SC7)
  ✓ Reservation Routes > POST /v1/reservations/walk-in > (c) never looks a guest up when no guestId is supplied
  ✓ ReservationsClient > walkIn > sends no guestId key at all when it is omitted (never defaults to null)
  E2E run 1: ✓ e2e/walkin.spec.ts:27:3 › CF-3: Walk-in creation › creates walk-in and verifies timeline update
             ✓ e2e/walkin.spec.ts:120:3 › walk-in success → the new block is selected, in view and focused
  ```

- Result: PASS

### 8. SC8 — A walk-in seated with a picked guest stores its `guestId`; the timeline block shows the visit label

- Check: service persists a supplied `guestId` (M1.5); route verifies it before writing (M1.6); hook forwards it (M3.2); `ReservationBlock` renders the ordinal when `visitCount > 1`; E2E "12th visit".
- Evidence:

  ```
  ✓ reservationService > createWalkIn > persists a supplied guestId and includes the guest relation (booking-guest-reuse M1.5)
  ✓ POST /v1/reservations/walk-in > (a) rejects a guestId from another venue with 400 before any write (booking-guest-reuse M1.6)
  ✓ POST /v1/reservations/walk-in > (b) persists an in-venue guestId and returns reservation.guest on the 201 body
  ✓ useTimelineData > mutation: createWalkIn > forwards guestId to reservations.walkIn when the dialog supplies one (M3.2, SC8)
  ✓ TimelinePage > walk-in flow > calls createWalkIn from useTimelineData
  ✓ ReservationBlock > returning guest visit count > shows visit count in details when guest.visitCount > 1
  ✓ ordinalVisit > returns '12th visit' for 12 (teen exception)          (9 passed)
  E2E run 1 + run 2: ✓ e2e/walkin.spec.ts:149:3 › Walk-in with a returning guest: pick from the combobox, seat, block reads the visit ordinal › phone digits list Alice Johnson; the pick shows her strip and the new block reads '12th visit'
  ```

- Result: PASS

### 9. SC9 — Waitlist lookup offers the guest, shows the strip, prefills Phone; the entry carries only today's keys

- Check: `WaitlistPage.test.tsx` M4.1 describe; waitlist schema and route unchanged on the branch.
- Evidence:

  ```
  CMD: pnpm --dir apps/hospitality exec vitest run src/pages/WaitlistPage.test.tsx -t "returning guest lookup" --reporter=verbose
  ✓ WaitlistPage > returning guest lookup (M4.1, #4990) > swaps the field for the lookup, keeping the test id and the label
  ✓ WaitlistPage > returning guest lookup (M4.1, #4990) > typing a known phone lists Alice; picking fills the phone, shows 'Recognised' and announces
  ✓ WaitlistPage > returning guest lookup (M4.1, #4990) > Clear with the phone unedited empties it, drops the strip, says 'Guest cleared.'
  ✓ WaitlistPage > returning guest lookup (M4.1, #4990) > Clear keeps a phone the Host edited after the pick
  ✓ WaitlistPage > returning guest lookup (M4.1, #4990) > submits exactly { venueId, partySize, guestName, guestPhone } after a pick — no guestId
  Tests  6 passed | 33 skipped (39)   exit=0

  git diff --stat origin/main...HEAD -- packages/types/src/schemas/waitlist.ts services/reservations/src/routes/waitlist.ts   → empty
  ```

- Result: PASS

### 10. SC10 — Public confirm links by exact `guestEmail`, else `guestPhone`; unknown stores `guestId: null`

- Check: route tests in `public-reservations.test.ts` (M5.2).
- Evidence:

  ```
  CMD: pnpm --dir services/reservations exec vitest run src/routes/public-reservations.test.ts -t "guest link on the public confirm" --reporter=verbose
  ✓ guest link on the public confirm (M5.2) > SC10: when email and phone match different guests, the email match is the link
  ✓ guest link on the public confirm (M5.2) > SC10: a phone-only match links to the phone's guest
  ✓ guest link on the public confirm (M5.2) > SC10: no match passes no guestId to confirmHold
  Tests  6 passed | 15 skipped (21)   exit=0   (full file: 21 passed)
  ```

- Result: PASS

### 11. SC11 — Matched and unknown responses identical in status, headers and body once ids, timestamps and manage token are normalised

- Check: the two-inject diff test and `withoutGuestLink`; header allowlist read from the test source.
- Evidence:

  ```
  ✓ guest link on the public confirm (M5.2) > SC11: both lookups run for a matched and an unknown contact alike, decided by input
  ✓ guest link on the public confirm (M5.2) > SC11: the 201 is identical matched or unknown, while the notifier still sees the link
  ✓ withoutGuestLink > nulls guestId and guest on a linked reservation and leaves every other key as it was
  ✓ withoutGuestLink > never mutates its input and always returns a new reference      (3 passed)

  public-reservations.test.ts:292  const VOLATILE_HEADERS = [/^x-ratelimit-/, /^date$/];
  :    expect(stable(unknown.headers)).toStrictEqual(stable(matched.headers));
  :    expect(unknown.headers["content-length"]).toBe(matched.headers["content-length"]);
  :    expect(normalise(unknown.json())).toStrictEqual(normalise(matched.json()));
  ```

- Result: PARTIAL — status, `content-length`, every non-volatile header and the normalised body are asserted equal; `x-ratelimit-*` and `date` are allowlisted, which the PRD sentence does not mention. Satisfied in substance (those two headers vary per request regardless of match).

### 12. SC12 — The public body still does not accept a caller-supplied `guestId`

- Check: route test sends `guestId: "gst_evil"`; JSON schema test asserts no `guestId` on the public body.
- Evidence:

  ```
  ✓ guest link on the public confirm (M5.2) > SC12: a guestId in the public body is never read
  public-reservations.test.ts:429-441  expect([201, 400]).toContain(response.statusCode);
                                       expect(guestService.getById).not.toHaveBeenCalled();
                                       for (const [args] of vi.mocked(confirmHold).mock.calls) expect(args.guestDetails.guestId).not.toBe("gst_evil");

  CMD: pnpm --dir packages/types exec vitest run src/json-schema.test.ts -t "booking-guest-reuse M1\.1|SC12" --reporter=verbose
  ✓ guestId on the staff booking request bodies (M1.1) > publicReservationBodyJsonSchema declares no guestId (SC12)
  Tests  5 passed | 64 skipped (69)   exit=0
  ```

- Result: PARTIAL — the PRD says "asserts the stored reservation does not carry it"; the test asserts it at the `confirmHold` seam and that the id is never looked up, and tolerates 201 or 400. Satisfied in substance.

### 13. SC13 — Gates

- Check: lint/typecheck/test in the five packages; regen, check-adr, check-deps; touched E2E specs; size-limit; lockfile untouched.
- Evidence: see § Summary block. Additionally:

  ```
  git diff --stat origin/main...HEAD -- pnpm-lock.yaml   → empty
  E2E diff: e2e/api-mocks.ts +19/−1, e2e/reservations.spec.ts +3/−1, e2e/walkin.spec.ts +44/0 (waitlist/create-reservation/timeline*/dashboard untouched, all green in run 2)
  Run 2 tally (103): a11y 1, auth 3, booking-widget-calendar 1, booking-widget 3, briefing 4, create-reservation 4, dashboard 5, deposit-enabled-config 2, floor-plan-status 1, floor-plan 2, guests 13, offline-shell 2, onboarding 10, profile 1, realtime-collaboration 3, reservations 8, settings 4, timeline-intent 3, timeline-interaction 10, timeline-keyboard-nav 2, timeline 12, waitlist 3, walkin 6
  size: Hospitality App (JS) 12.22/500 kB · CSS 1.09/150 · Floor Plan Editor 2.73/3.5 · Venue Onboarding 5.97/7.5 · Canvas Vendor 81.57/100 · React Vendor 76.28/85 · Rialto Vendor 68.66/72 · Router Vendor 26.37/29 · JSON Render Vendor 31.07/32 · Auth Vendor 19.52/21 (brotlied) exit=0
  ```

  Lint warnings in touched files (none are errors): `react-hooks/incompatible-library` at `NewReservationDialog.tsx:115:21`, `WalkInDialog.tsx:84:21`, `WaitlistPage.tsx:133:21` (each `const guestName = watch("guestName")`) and `GuestLookup.test.tsx:94:14`; `@eslint-react/no-forward-ref` at `WaitlistPage.test.tsx:149:5` (test mock). No warning on `GuestLookup.tsx`, `GuestHistoryStrip.tsx`, `useGuestLookup.ts` or the rialto `useEscapeKey` files.

- Result: PASS

### 14. SC14 — Rialto components only, colours via `--rialto-*`, reduced motion on new animation, no `setState` in `useEffect`

- Check: greps over the new component files; effect bodies read.
- Evidence:

  ```
  GuestLookup.module.css: no colour literals (no #hex / rgb( / hsl( ); all colour via var(--rialto-*)
  :42  animation: listboxEnter var(--rialto-duration-standard) var(--rialto-ease-precision) both;
  :46  @keyframes listboxEnter
  :57  @media (prefers-reduced-motion: reduce)  →  :59  animation: none;
  :69, :91  min-height: 44px
  GuestLookup.tsx / GuestHistoryStrip.tsx imports: @mattbutlerengineering/rialto, react, react-hook-form, @mbe/types only; no framer-motion; no raw <button|input|select>
  useGuestLookup.ts:43-50  effect body arms a ref timer only; setSettled is called inside the timer callback
  GuestLookup.tsx:121-126  failure latch is a guarded setFailureShown during render (snapshot pattern); :128-130 effect calls announce() only
  ```

- Result: PASS

### 15. SC15 — `apps/hospitality/CLAUDE.md` Key Components and `docs/USER-FLOWS.md` Flow 3 / Flow 5 reflect the change

- Check: string presence, `pnpm check:markdown`, prettier on the two files.
- Evidence:

  ```
  apps/hospitality/CLAUDE.md:42-43        crm/GuestLookup, crm/GuestHistoryStrip
  apps/hospitality/docs/USER-FLOWS.md     GuestLookup/GuestHistoryStrip at :84, :98, :99, :148, :157; "the profile isn't edited" at :148
  CMD: pnpm check:markdown   exit=0
  CMD: pnpm exec prettier --check apps/hospitality/CLAUDE.md apps/hospitality/docs/USER-FLOWS.md
  Checking formatting...
  All matched files use Prettier code style!
  exit=0
  ```

- Result: PASS

### 16. M1.2 — `api.reservations.walkIn` accepts `guestId`

- Check: client test on the POST body.
- Evidence:

  ```
  CMD: pnpm --dir packages/api-client exec vitest run src/reservations.test.ts -t "guestId" --reporter=verbose
  ✓ ReservationsClient > walkIn > passes guestId through in the POST body when supplied (booking-guest-reuse M1.2)
  ✓ ReservationsClient > walkIn > sends no guestId key at all when it is omitted (never defaults to null)
  Tests  2 passed | 30 skipped (32)   exit=0
  ```

- Result: PASS

### 17. M2.1 — rialto `useEscapeKey` ignores an Escape whose default was prevented (+ test + changeset + built guard)

- Check: hook test; changeset present; guard in the built output.
- Evidence:

  ```
  CMD: pnpm --dir packages/rialto exec vitest run src/hooks/useEscapeKey.test.ts -t "useEscapeKey" --reporter=verbose
  ✓ useEscapeKey > calls onClose when Escape is pressed and enabled=true
  ✓ useEscapeKey > ignores an Escape whose default was already prevented (consumed by a nested listbox)
  Tests  7 passed (7)   exit=0
  .changeset/use-escape-key-default-prevented.md   "@mattbutlerengineering/rialto": patch
  packages/rialto/src/hooks/useEscapeKey.ts:28   defaultPrevented guard
  packages/rialto/dist/lib/chunks/useEscapeKey-BXL_c-zE.js:7   guard present (re-exported by dist/lib/hooks/index.js:2)
  Consumers: ✓ NewReservationDialog > Escape with the listbox open closes the list, not the dialog
             ✓ WalkInDialog > Escape with the listbox open closes the list, not the dialog
             ✓ NewReservationDialog > accessibility > closes and returns focus on Escape key   (plain Escape still closes)
  ```

- Result: PASS (the accept line's `git grep … dist` form cannot succeed on a gitignored dir; see assumptions)

### 18. M2.2 — `getRiskLabel`/`getRiskVariant` lifted into `guest-signals.ts`

- Evidence:

  ```
  ✓ guest-signals > getRiskLabel > risky → Risky / standard → Standard / trusted → Trusted
  ✓ guest-signals > getRiskVariant > risky → error / standard → warning / trusted → neutral    (6 passed)
  GuestCard.tsx: no `function getRisk` remains; GuestCard.test.tsx 38 passed (no-show risk badges unchanged)
  ```

- Result: PASS

### 19. M2.3 — `guest-lookup-rows.ts` pure helpers

- Evidence: `guest-lookup-rows.test.ts` 16 passed, incl. `formatGuestRowDetail > joins phone, email and visits with middle dots (ux.md § Copy)`, `stripTitle > names the linked profile and the recognised guest`, `pickAnnouncement > reads the ux.md pick sentence for a linked profile`, `does not mutate its inputs`.
- Result: PASS

### 20. M2.4 — `guest-prefill.ts` pure prefill/revert rule

- Evidence: `guest-prefill.test.ts` 8 passed, incl. `applyPick > only fills fields the form actually has (the waitlist has no email field)`, `applyClear > keeps a field the Host edited since the pick and restores the rest`, `returns new objects and leaves its arguments unchanged`.
- Result: PASS

### 21. M2.5 — `useGuestLookup` hook: 2-char minimum, 300 ms debounce, six-row cap with `hasMore`, `failed`

- Evidence: `useGuestLookup.test.ts` 7 passed: `stays disabled with empty rows under the 2-character minimum`, `enables the search for 2+ characters only after the 300 ms pause`, `collapses three keystrokes inside 300 ms into one query for the last text`, `caps rows at six and reports hasMore for a seventh match`, `reports failed when the search errors`.
- Result: PASS

### 22. M6.1 — E2E mocks match phones and attach `guest`; existing specs strict-mode clean; drift review

- Check: `walkin.spec.ts`, `reservations.spec.ts`, `waitlist.spec.ts`, `create-reservation.spec.ts`, `realtime-collaboration.spec.ts`, `timeline-keyboard-nav.spec.ts` all in run 2; `e2e-selector-drift-reviewer` re-dispatched on `origin/main...HEAD -- apps/hospitality/e2e`.
- Evidence:

  ```
  run 2: reservations 8, walkin 6, waitlist 3, create-reservation 4, realtime-collaboration 3, timeline-keyboard-nav 2 — all ✓
  e2e-selector-drift-reviewer: "Verdict: no strict-mode collision found. 0 DRIFT blocks; 1 minor volatile-text note; 0 mock gaps; 1 low-confidence watch item."
    — getByLabel(/guest name/i) resolves to one control per surface; every getByRole("status") is filtered/scoped; walkin.spec.ts:165 name filter narrows the 2-option list to one
    — mocks: api-mocks.ts:419-434 attaches guest {visitCount, communicationPreference} by body.guestId; buildReservationsList carries extraReservations through
    — watch: walkin.spec.ts:50→53, :131→132, realtime-collaboration.spec.ts:176→179 fill the name then click "Seat now" without blur; open listbox could intercept on a slow runner
  ```

- Result: PASS (watch item carried to hand-off F4)

### 23. (a) Clear reverts the name field

- Check: `handleClear` on each surface vs ux.md § Cleared (:139) and Flow 1 step 6 (:58).
- Evidence:

  ```
  NewReservationDialog.tsx:129-140  restores guestEmail/guestPhone from the snapshot, setLink(null), setFocus("guestName", { shouldSelect: true })
  WalkInDialog.tsx:92-97            setPickedGuest(null); // The typed name stays; ... setFocus("guestName", { shouldSelect: true })
  WaitlistPage.tsx:146-155          restores guestPhone, setRecognised(null), setFocus("guestName", { shouldSelect: true })
  ux.md:45   Clear: reverts what the pick filled (unless edited since), drops the link, removes the strip, focus → the field.
  ux.md:139  Cleared: strip gone; field and every prefilled field revert to pre-pick values unless edited since; ...; focus in the field with its text selected
  ux.md:58   Taps Clear: field, email and phone revert to what they held before the pick
  Pinned by: ✓ NewReservationDialog > Clear keeps an edited email, restores the previous phone, drops the strip and the link
             ✓ WalkInDialog > Clear drops the strip and the guestId, keeps the typed name focused and selected
             ✓ WaitlistPage > Clear with the phone unedited empties it, drops the strip, says 'Guest cleared.'
  ```

- Result: PARTIAL — contact fields revert as specified; the name field keeps the picked guest's name (selected) on all three surfaces, which ux.md :139/:58 say should revert. Deliberate, flagged by Implement, test-pinned. Routes to Review as a doc-or-code decision (hand-off F2).

### 24. (b) Two polite regions per dialog

- Evidence: `GuestLookup.tsx:266` renders its own `role="status"`; each host dialog keeps its `LiveStatus`. ✓ `GuestLookup > announces loading and no-match from its own polite region`; ✓ `NewReservationDialog > speaks the pick and the clear through the dialog's own LiveStatus`. ux.md :271 assigns results/loading/no-match to "the listbox's own region"; :281 says "each dialog gains one polite region".
- Result: PASS (wording tension noted, hand-off F6)

### 25. (c) Listbox hides during the debounce pause

- Evidence: `useGuestLookup.ts:43-50` sets `query` to `""` until the 300 ms timer settles, so `GuestLookup` renders no listbox during the pause; ✓ `useGuestLookup > enables the search for 2+ characters only after the 300 ms pause`; ✓ `GuestLookup > renders no listbox under the 2-character minimum`. ux.md :133 specifies the post-pause "Looking up guests…" row and cancellation of pending requests; it does not say whether the previous list stays visible during the pause.
- Result: PASS (judgement; see assumptions)

### 26. (d) SC11 seam equivalence

- Evidence: as § 11 — status, `content-length`, stable headers and normalised body strict-equal; `x-ratelimit-*`/`date` allowlisted; the notifier (behind the seam) still receives `guestId: "gst_1"` for the matched case and `null` for the unknown one.
- Result: PASS

### 27. (e) SC12 "never read" vs a 400

- Evidence: the test tolerates `[201, 400]`; run shows the route answers 201 (the body schema does not declare `guestId`, and the route passes the parsed body through — the extra key is ignored, not rejected). `guestService.getById` is never called, so `gst_evil` is never resolved; the public JSON schema declares no `guestId` (§ 12).
- Result: PASS

### 28. (f) `recordVisit` has zero callers

- Evidence:

  ```
  grep -rn "recordVisit" services/reservations/src --include='*.ts' | grep -v "\.test\.ts"
  services/reservations/src/services/guest.ts:249:  async recordVisit(guestId: string, visitDate: Date, spendAmount?: number): Promise<Guest | null> {
  ```

  Only the definition. `visitCount` therefore never accrues from a booking on this branch or on main; the "12th visit" label in E2E and the strip's counts come from fixture data.

- Result: PASS (the check confirms the known pre-existing defect; hand-off F3)

### 29. (g) Zod `ReservationSchema.guest` pinned

- Evidence:

  ```
  CMD: pnpm --dir packages/types exec vitest run src/reservation.test.ts -t "guest relation|guest: null" --reporter=verbose
  ✓ ReservationSchema > preserves the optional guest relation through parse (booking-guest-reuse M1.1)
  ✓ ReservationSchema > accepts guest: null and a guest without the optional unsubscribed flag
  ✓ ReservationSchema > rejects a guest relation whose visitCount is not a number
  Tests  3 passed | 52 skipped (55)   exit=0
  CMD: pnpm --dir services/reservations exec vitest run src/schemas/schemas.test.ts --reporter=verbose
  ✓ Reservation service schemas > ReservationSchema matches snapshot
  ✓ Reservation service schema backward compatibility > ReservationSchema has no breaking changes
  Tests  22 passed (22)   exit=0
  snapshot diff adds: guest anyOf { visitCount: number, communicationPreference: string|null, unsubscribed?: boolean; required visitCount, communicationPreference } | null
  ```

- Result: PASS

### 30. (h) `aria-describedby` points at an element with id `${id}-hint`

- Evidence:

  ```
  packages/rialto/src/components/Input/Input.tsx:104-107   {hint && (error ? … : <span key="hint" {...field.descriptionProps} className={styles.hint}>{hint}</span>)}
  packages/rialto/src/hooks/useField.ts:144   const hintId = `${id}-hint`;
  packages/rialto/src/hooks/useField.ts:156   descriptionProps: { id: hintId }
  GuestLookup.tsx: aria-describedby = `${inputId}-hint` (+ caption id while the failure caption shows)
  Tests assert the hint text (GuestLookup.test.tsx:144; dialog "wires the lookup field with the … hint" tests) and the caption id in describedby (:299); none asserts the `${id}-hint` id itself
  ```

- Result: PASS (by code reading; the id contract is rialto's and is not test-pinned on this branch — hand-off F7)

## Failures

- **prettier: `docs/features/booking-guest-reuse/ux.md`, `docs/features/booking-guest-reuse/autorun-brief.md`.** Not an SC failure (SC13/M6.3 name only the two app docs, which pass) but CI's Build job runs `pnpm repo-audit` → `pnpm check:prettier` (= `prettier --check .`, `ci.yml:320`), so this branch's first code-carrying PR run would go red on it, and the docs-only-PR gotcha (`gotchas.md § CI`, 2026-08-31) means a docs-only merge would poison later Builds instead.

  ```
  CMD: pnpm check:prettier (= prettier --check .) from worktree root
  [warn] docs/features/booking-guest-reuse/autorun-brief.md
  [warn] docs/features/booking-guest-reuse/ux.md
  [warn] Code style issues found in 2 files. Run Prettier with --write to fix.
  exit=1
  ```

  Diffs: ux.md :240-244 table column padding; autorun-brief.md :9 `_standing_` → `*standing*`, :80/:90 list-continuation indentation. Neither file is Implement's (UX stage / orchestrator). **Routes to Ship's pre-PR prettier step** (`pnpm exec prettier --check docs/features/<slug>/`), with a Review flag so the fix is in the PR and not a separate docs-only commit.

No criterion failed.

## Not verified

- **Real Auth0 E2E.** All Playwright evidence is from the synthetic-session harness (see assumptions). The committed `auth.setup.ts` path and the `Hospitality E2E` CI job were not run here; they are advisory in CI.
- **Database rows.** SC1/SC3/SC4/SC8/SC10/SC12's "stored"/"row count" clauses are proven at the mocked service/route seams, not against Postgres. No integration DB run.
- **`visitCount` accrual.** `recordVisit` has no caller, so a returning guest's count never rises from a real booking; the visit labels shown in tests and E2E are fixture values. Pre-existing, outside this run's scope (hand-off F3).
- **Tablet pointer / 44 px targets / reduced motion in a real browser.** Verified by CSS grep only (`min-height: 44px`, `prefers-reduced-motion` → `animation: none`); no device or OS-setting run.
- **Hint id contract.** `${id}-hint` is rialto `Input`'s behaviour, read from source; no test on this branch pins the id (hand-off F7).
- **M6.2's "screenshot saved beside the existing walk-in screenshots".** `walkin.spec.ts:171` writes `e2e/screenshots/walkin-returning-guest.png` and the run produced it, but the directory is untracked and was deleted per this stage's cleanup instruction (root `.gitignore:144 e2e/screenshots/` is root-anchored and does not cover `apps/hospitality/e2e/screenshots/`; `git ls-files` there is empty). Nothing tracked to verify.
- **Lint warning delta vs main.** Totals were not diffed; only 0 errors and a read of touched-file warnings.
- **Production / deployed behaviour.** Nothing is deployed from this branch; the run is prepare-and-stop at Ship.

## Verdict

**Advance to Review.** No SC failed; the two PARTIALs (SC11, SC12) are PRD-sentence-vs-assertion gaps satisfied in substance, and behavioural (a) is a deliberate, test-pinned deviation that needs a decision, not a rewrite. The single red gate is prettier on two non-Implement docs, which Ship's pre-PR step is already specified to catch; Review should make sure it lands inside the feature PR.

## Hand-off notes for Review

- **F1 — prettier on `ux.md` / `autorun-brief.md`** (§ Failures). Must be formatted in the same PR as the code; a separate docs-only commit skips `repo-audit` and reddens the next Build (`gotchas.md § CI`, 2026-08-31).
- **F2 — Clear keeps the typed name on all three surfaces** (§ 23). ux.md § States "Cleared" (:139) and Flow 1 step 6 (:58) say the field reverts; ux.md :45 and the pinned tests say it stays selected for immediate retype. Decide: patch ux.md :58/:139 to match, or route a code change. Verify recommends the doc patch (keeping the name is the cheaper "type a different name" path and is what Implement argued in the code comments).
- **F3 — `recordVisit` has zero production callers** (§ 28). `visitCount` never increments from a booking; the returning-guest ordinal and strip counts are only as good as data entered elsewhere. Known pre-existing defect (#4990 seeds it); needs its own capture run, not this PR.
- **F4 — E2E watch item, low confidence** (§ 22). `walkin.spec.ts:50→53`, `:131→132`, `realtime-collaboration.spec.ts:176→179` fill the guest name then click "Seat now" without blurring; the combobox now opens a fixed-position listbox ~300 ms after the last keystroke that could intercept the click on a slow runner. Passed 2/2 runs locally (14/14, 103/103). Cheap hardening if CI flakes: `press("Tab")` or `Escape` after the fill.
- **F5 — `apps/hospitality/e2e/screenshots/` is untracked and not ignored.** Root `.gitignore:144` is root-anchored. Both reviewers and Implement noted it; hygiene, not this run's scope.
- **F6 — two polite regions per dialog** (§ 24). ux.md :271 ("the listbox's own region") vs :281 ("one polite region"). Doc wording; consider aligning :281.
- **F7 — `${id}-hint` not test-pinned** (§ 30). GuestLookup relies on rialto `Input` rendering `descriptionProps.id = ${id}-hint`; a rialto change would silently break `aria-describedby`. Optional: one assertion in `GuestLookup.test.tsx`.
- **F8 — SC11 header allowlist** (§ 11). `x-ratelimit-*` and `date` are excluded from the identical-response diff. Reasonable; the PRD sentence could name them.
- **F9 — React Compiler skips** at `NewReservationDialog.tsx:115`, `WalkInDialog.tsx:84`, `WaitlistPage.tsx:133` (`watch("guestName")`): `react-hooks/incompatible-library` warnings, 0 errors. Same pattern as existing `watch` uses; no action unless the compiler skip matters for perf.
- **F10 — `packages/types/llms.txt` lost `durationMinutes?` from `WalkInRequest`.** Not staleness: `pack.ts:56` caps interface members at five and `guestId` pushed the sixth out (determinism reviewer). `pnpm regen --check` is green.
- **Reviewer records (this stage):** `e2e-selector-drift-reviewer` — "No selector/mock drift detected — locators are scoped and mocks advance state."; `generated-artifact-determinism-reviewer` — "PASS — generated artifacts are deterministic and in sync" (all 10 llms hunks trace to `.ts` sources in the same package; `pack.ts` untouched; byte-order sorts; no non-llms generated file in the diff; `regen --check` exit 0). The determinism reviewer saw `apps/hospitality/e2e/screenshots/` vanish mid-session — that was this stage's post-E2E cleanup, not a regen side effect.
