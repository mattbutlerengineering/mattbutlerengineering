---
stage: review
run: feature:booking-guest-reuse
date: 2026-09-15
assumptions:
  - "No live user: every severity and every fix-or-defer decision in this file is mine, and each is logged here."
  - "Minor 1 (prettier on `ux.md` / `autorun-brief.md`, Verify hand-off F1) fixed in this commit: docs-only, and CI's Build job runs `prettier --check .` on any PR that carries code."
  - 'Minor 2 (`guestId: ""` reaches the FK and answers 500) deferred: unreachable from the shipped dialogs, the FK rejects the write so nothing persists, and sibling `tableId` / `venueId` share the gap — seeded rather than widening the diff.'
  - "Minor 3 (listbox unmounts during the 300 ms pause; an Escape in that window closes the dialog) deferred: a design choice the tests pin, narrow window; seeded."
  - "Minor 4 (`${id}-hint` convention unpinned, hand-off F7) deferred: same-monorepo convention, no defect today; seeded."
  - "Minor 5 (Guest row created before the conflict check, reviewer agent's quality note) deferred: benign side effect, the fix moves the create into `createWithConflictCheck`'s transaction; seeded."
  - "Design (a) Zod `ReservationSchema.guest` accepted: required for SC8 on the wire, additive, snapshot refreshed, backward-compatibility test green; its one side effect (the relation now serialises on every `Reservation#` route) is recorded under the pre-existing holds-confirm gap."
  - "Design (b) Clear keeps the typed name accepted; `ux.md` :58 / :139 amended rather than the code."
  - "Design (c) two polite regions per dialog accepted; `ux.md` :281 amended."
  - "Design (d) listbox hides during the pause: accepted as shipped, seeded (Minor 3)."
  - "Design (f) SC11 header allowlist and SC12 '201, never read' accepted; `prd.md` SC11 / SC12 amended."
  - "Pre-existing gaps (open create route, holds-confirm `guestId`, notification consent, `recordVisit`, contact normalisation) recorded and seeded, not fixed — findings on pre-existing code stay out of the diff per the brief."
  - "`e2e-selector-drift-reviewer` and `generated-artifact-determinism-reviewer` not re-dispatched; Verify's PASS records are cited."
  - "No code changed in Review, so no package gate was re-run here; the `reviewer` agent's in-worktree runs and Verify's whole-suite lines stand as the evidence."
---

# Review: Reuse existing guests at booking time

## Scope

Branch `worktree-booking-guest-reuse`, `origin/main` `da54bd57b` → `5b2a6ead2` (33 commits, 68 files), read in the worktree. Three passes — correctness, design, security — over every production surface the diff touches:

- Server: `services/reservations/src/services/guest-link.ts` (`resolveGuestLink`, `linkOrCreateGuest`), `routes/reservations.ts` (walk-in verification, `isVenueMember`, create-route linking), `routes/public-reservations.ts` (resolve after the venue 404, `withoutGuestLink` on the 201), `services/serializers.ts`, `services/reservation.ts` (`createWalkIn` `guestId`, `guest` include).
- Contracts: `packages/types` (`guestId` on `WalkInBodySchema` / `CreateReservationBodySchema`; `guest` on `ReservationSchema`; `WalkInRequest`), `packages/api-client` (`walkIn` `guestId?`), rialto `useEscapeKey` + `.changeset/use-escape-key-default-prevented.md`.
- Client: `apps/hospitality` `crm/GuestLookup`, `crm/GuestHistoryStrip`, `guest-prefill.ts`, `guest-lookup-rows.ts`, `guest-signals.ts` / `GuestCard.tsx`, `hooks/useGuestLookup.ts`, `NewReservationDialog`, `WalkInDialog`, `WaitlistPage`, `useTimelineData` / `TimelinePage`, E2E `api-mocks.ts` / `reservations.spec.ts` / `walkin.spec.ts`.
- Read for parity, not changed: `packages/auth/src/fastify/authz.ts` (`requireVenueAccess`), `plugin.ts` (`hasPermission`), rialto `Input` / `useField` / `useCombobox`, all eleven `useEscapeKey` consumers, `routes/guests.ts` `/search` preHandlers, `routes/holds.ts`, `services/confirm-hold.ts`, `booking-notifications.ts`, `job-worker.ts`, `contact-policy.ts`, `prisma/schema.prisma` (read-only).

Predecessor artifacts read in full: `prd.md`, `ux.md`, `architecture.md`, `breakdown.md` (§ Notes, every Implement deviation), `verification.md` (27 PASS / 3 PARTIAL / 0 FAIL; hand-off F1–F10).

Specialists dispatched from Review: `adr-compliance-reviewer`, `reviewer`. Cited from Verify (not re-dispatched): `e2e-selector-drift-reviewer` — "No selector/mock drift detected — locators are scoped and mocks advance state."; `generated-artifact-determinism-reviewer` — "PASS — generated artifacts are deterministic and in sync".

## Findings

No Critical. No Major. Five Minor, one fixed here, four deferred with seeds in `docs/backlog.md`.

### Minor: `ux.md` and `autorun-brief.md` fail `prettier --check` (Verify F1)

- Scenario: this PR carries code, so `ci.yml` `detect-changes.has_code=true` → Build runs `pnpm repo-audit` → `prettier --check .`; `.prettierignore` does not exclude `docs/features/**`. Both files were red at HEAD (`ux.md` :240-244 table padding; `autorun-brief.md` :9 emphasis marker, :80/:90 list indentation), so `CI Gate` would be red and `--auto` would never merge — the 2026-08-31 class in `gotchas.md § CI`.
- Decision: fixed — `pnpm exec prettier --write docs/features/booking-guest-reuse/` in this commit (both files plus the amended `ux.md` / `prd.md` and this file); `pnpm exec prettier --check docs/features/booking-guest-reuse/` is clean afterwards.

### Minor: `guestId: ""` passes the schema, skips the verification gate and reaches the FK as `""` (500, not 400)

- Scenario: a venue member POSTs `/api/v1/reservations/walk-in` with `{ tableId, partySize, venueId, guestId: "" }`. `WalkInBodySchema.guestId` is `z.string().optional()` (no `.min(1)`), so validation passes; `if (request.body.guestId)` is false so `resolveGuestLink` never runs; `createWalkIn` writes `guestId: data.guestId ?? null` = `""` into `guest_id` (`Reservation.guestId String? @relation(fields: [guestId], references: [id])`), Postgres rejects the FK inside `bookSlot`'s transaction (no `catch` in `book-slot.ts`), the error reaches the Fastify handler and the member gets a 500 "Internal Server Error" instead of the route's own 400. Same shape on `POST /api/v1/reservations`: `""` is falsy for the `!isMember && guestId` gate and for `linkOrCreateGuest`'s id branch, and when no contact match resolves the body still carries `""` into `createWithConflictCheck`. Nothing persists; no cross-venue link is possible (the FK has no row to point at). The dialogs spread `guestId` only from a picked `Guest`, so no shipped client sends `""`.
- Decision: deferred — reachable only by a hand-built request from an authenticated member, no write survives, and sibling `tableId` / `venueId` in the same bodies have the identical gap (a pre-existing class this field joined). Seeded: `.min(1)` on both Zod fields or `!== undefined` in the two gates, with a test.

### Minor: the listbox unmounts during the 300 ms pause, and an Escape in that window closes the dialog (design (d))

- Scenario: Host types `pri` — list shows two rows. Host types `y`: `useGuestLookup` sets `query` to `""` until the timer settles (`useGuestLookup.ts:52`), so `hasContent` is false and the list unmounts; `open` stays true (`handleChange` calls `openList()`). Inside that window the Host presses Escape to dismiss the list they just saw: `GuestLookup`'s Escape case `preventDefault`s only when `visible`, so the event reaches rialto `useEscapeKey` unconsumed and the whole dialog closes with the half-typed form. After the pause the list is back and Escape is consumed as intended. `ux.md` :133 ("Typing again cancels the pending request; stale responses never open a list over newer text") is satisfied by the shipped reading; the flicker and the Escape edge are the cost.
- Decision: deferred — the alternative (`preventDefault` whenever `open`) would swallow the first Escape on a field with one typed character and no list, which `GuestLookup.test.tsx:229` deliberately pins the other way; keeping the previous rows during the pause is the real fix and is a small design change, not a review-time patch. Seeded.

### Minor: `aria-describedby` leans on rialto `useField`'s `${id}-hint` id and nothing pins it (Verify F7)

- Scenario: while the failure caption shows, `GuestLookup.tsx:229-231` sets `aria-describedby` to `${inputId}-hint ${captionId}`, reproducing the id rialto `Input` gives its hint (`useField.ts:144` `hintId = \`${id}-hint\``, `:156` `descriptionProps: { id: hintId }`). A rialto rename of that id would keep the hint visible and the caption linked while silently detaching the hint from the field during failure episodes only; `GuestLookup.test.tsx:299`asserts the caption id is in`describedby`, not the hint's.
- Decision: deferred — same monorepo, one definition, no defect today. Seeded: one assertion in `GuestLookup.test.tsx` (or rialto `Input` exposing `descriptionProps.id`).

### Minor: on `POST /api/v1/reservations` a Guest row is created before the slot is known bookable (reviewer agent, quality)

- Scenario: a venue member submits `{ guestName: "Ada", guestEmail: "new@example.com", … }` onto a slot that conflicts. `linkOrCreateGuest` (`reservations.ts:430-448`) runs before `createWithConflictCheck`, finds no match and creates Ada's Guest row; the booking then answers 409 and Ada exists with no reservation. A retry links to her via `findByEmail` (no duplicate), so the residue is CRM noise, not corruption; SC4 is worded for a successful submit.
- Decision: deferred — the fix moves the create inside `createWithConflictCheck`'s write callback (a transaction the architecture kept the resolver out of), out of proportion for a review-time change. Seeded.

### Design deviations adjudicated (no code change)

- (a) Zod `ReservationSchema.guest` optional-nullable (Implement M1.1): **accepted.** Without it `fast-json-stringify` drops the undeclared `guest` and SC8's `visitCount` never reaches the wire; the addition is additive, `contract.test.ts` keeps the Zod ↔ JSON keys in sync, the service snapshot was refreshed (`94f69e764`) and its backward-compatibility test passed unchanged. Side effect recorded below (holds confirm).
- (b) Clear keeps the typed name, selected (Verify F2): **accepted as shipped**; `ux.md` :58 and :139 amended (`> Amended 2026-09-15 (Review): …`). `ux.md` :45 and the "text selected so the Host can retype at once" clause already assume a full name in the field; reverting to the pre-pick fragment would be worse for the retype.
- (c) Two polite regions per dialog (Verify F6): **accepted**; `ux.md` :281 amended. `:271` already assigns results / loading / no-match to "the listbox's own region"; the dialog's own `LiveStatus` carries pick, clear and the failure sentence. Each region has one job.
- (d) Listbox hides during the pause: **accepted**, seeded (Minor above).
- (e) `${id}-hint` coupling (F7): deferred, seeded (Minor above).
- (f) SC11 header allowlist (F8) and SC12 "201, never read": **accepted**; `prd.md` SC11 and SC12 amended. The test allowlists exactly `x-ratelimit-*` and `date`, asserts `content-length` equal and that no other header differs; a 400 on a foreign `guestId` would itself be a signal that the key means something.
- (g) `guest-signals.ts` lift: **confirmed** — `getRiskVariant` / `getRiskLabel` bodies are byte-identical to what `GuestCard.tsx` lost; `GuestCard` imports them and changes nothing else; `GuestCard.test.tsx` unchanged and green.
- (h) rialto `useEscapeKey` change: **confirmed** well-formed and backwards compatible. `.changeset/use-escape-key-default-prevented.md` is `"@mattbutlerengineering/rialto": patch` with a body. The guard is a strict narrowing (ignore only an Escape something already consumed); all eleven consumers read (`Dialog`, `Drawer`, `Popover`, `Tooltip`, `HoverCard`, `DropdownMenu`, `ContextMenu`, `CommandPalette`, and the three hospitality dialogs) — every rialto handler that `preventDefault`s Escape does so only while its own list is open, so no consumer loses an Escape it used to get.

## Pre-existing, out of scope

Recorded with a scenario each; none is in the diff and none is fixed here (seeded in `docs/backlog.md`).

- **`POST /api/v1/reservations` has `optionalAuth` and no `requireVenueAccess`.** An anonymous caller, or an authenticated operator of venue A, POSTs `{ venueId: "B", tableId: <B's table>, … }` and holds a table at venue B; the branch's member gate (`isVenueMember`) guards only the `guestId` / contact linking, so a non-member without `guestId` still gets 201, unlinked — exactly today's behaviour, deliberately untouched.
- **`POST /api/v1/holds/:id/confirm` accepts an unauthenticated caller's `guestId`.** `preHandler: publicRateLimitHook` only; `ConfirmHoldBodySchema.guestId` is declared and `confirmHold` writes it through with no venue check. A hold holder who knows a guest's id (cuid — unguessable, but visible to that venue's staff) links their booking to a stranger's profile in any venue. New on this branch: because `ReservationSchema.guest` is now on the wire and the route's 201 is `Reservation#`, the same call now also returns that guest's `visitCount` / `communicationPreference` (`confirm-hold.ts:127` include), which `fast-json-stringify` used to drop. `resolveGuestLink({ venueId: hold.venueId, guestId })` → 400 is the ready-made fix, as the walk-in route does.
- **A linked public booking follows the matched profile's `communicationPreference`.** `deliverReminder` (`job-worker.ts:50`) and `sendBookingCancelled` (`booking-notifications.ts:145`) resolve the channel from `reservation.guest`, which was always null on the public path until `resolveGuestLink` started linking; the confirmation itself does not read `guest`. A guest whose profile says SMS-only who books through the widget with email and no phone now gets no email reminder where an unlinked booking would have; the profile's `unsubscribed` flag is read by no delivery path (`grep unsubscribed` → only `routes/reservations.ts:658`, a staff echo). Whether transactional messages should follow a staff-set preference is a consent decision nobody has recorded.
- **`guestService.recordVisit` has zero production callers** (Verify F3, #4990). `visitCount` never rises from a booking, so the strip's "12 visits", the block's "12th visit" and the `communicationPreference` routing above run on counts entered elsewhere. Pre-existing on `main`; this run only made the counts visible.
- **No email / phone normalisation** (architecture Flag 5, § Known limitations). `findByEmail` / `findByPhone` are exact matches against the compound uniques; `Priya@Example.com` against a stored `priya@example.com` misses, and on the staff path `linkOrCreateGuest` then creates a duplicate Guest (SC4). The Architect recorded the limitation; the seed now exists in `docs/backlog.md`.

## Specialist verdicts

- `adr-compliance-reviewer`: "LGTM — no ADR violations found. ADR compliance: PASS." Read all 24 active ADRs; per-ADR: ADR-002/008 (problem details via `createProblemDetails`, discriminated union in `guest-link.ts`) PASS; ADR-003/010 (auth through `@mbe/auth`, public route unauthenticated by design, `withoutGuestLink` scrubs) PASS; ADR-020 (`isVenueMember` uses exactly `hasPermission(user, "admin")` + the injected `venueMembershipLookup` on `user.raw.sub`, mirrors `requireVenueAccess`'s matrix, 403 text byte-identical) PASS; ADR-026 (new queries venue-scoped by construction) PASS; ADR-001 / ADR-025 (rialto + tokens; CSS-only entrance under `prefers-reduced-motion`) PASS; ADR-007 / 013 / 024 / 005 PASS or n/a.
- `reviewer`: "Verdict: PASS 7/10." Ran in the worktree: `services/reservations` 195/195, `apps/hospitality` 364/364 across the 15 touched test files, `packages/types` 124/124, `packages/api-client` 32/32, rialto 414/414; `tsc --noEmit` clean in the four packages; ESLint 0 errors. Two issues: (1) the prettier failure on the two docs — fixed here; (2) the Guest-row-before-conflict-check ordering — Minor above, deferred and seeded. Verified clean: member gate vs `requireVenueAccess`; `guest-link.ts` contracts (resolve-only, same frozen object for unknown and foreign ids, both lookups by input, P2002 re-resolve); empty strings (`guestEmail` is `z.email()` so `""` is rejected; `guestPhone` / `guestName` `""` are falsy → no lookup, no create); SC10–SC12; `useEscapeKey` against every rialto Escape handler; `useGuestLookup` staleness; `GuestCard` unchanged; SC9; SC14.

## Passes with no findings

- **Correctness.** `resolveGuestLink`: id branch is venue-scoped (`guest.venueId === venueId`), unknown and foreign ids return the one frozen `GUEST_NOT_IN_VENUE`; contact branch runs both lookups by input under `Promise.all`, email wins over phone; `""` is treated as absent everywhere by truthiness, matching `findOrCreate`. `linkOrCreateGuest`: returns early on `!ok` or a hit, requires name + one contact, spreads `email` / `phone` only when present; P2002 → one re-resolve; a double miss returns `{ ok: true, guestId: null }` (booking proceeds unlinked, no throw); any other error propagates. Walk-in route: verification before any write, same 400 message for unknown and foreign ids, one `getById` read either way (no timing or message oracle). Create route: `isVenueMember` parity with `requireVenueAccess` confirmed line by line (anonymous → false, `hasPermission(user, "admin")` → true, else `lookup(user.raw.sub, venueId)`); a body without `venueId` is non-member (nothing to link into); non-member + `guestId` → 403 "You do not have access to this venue"; member + foreign id → 400; the body is spread with the resolved id only when a link resolved. Public route: venue 404 thrown before the resolver; `guestId: link.ok ? (link.guestId ?? undefined) : undefined`; the 201 is `withoutGuestLink(...)` and every error path throws `AppError` before a reservation exists, so no public reply carries a link; the notifier receives the linked object. `createWalkIn` `guestId: data.guestId ?? null` plus the `guest` include; `useTimelineData` / `TimelinePage` widen the type and forward unchanged. Client: `useGuestLookup` arms a ref timer per trimmed-text change, cleanup clears it, only the timer callback sets state, `query` is the settled text so a superseded key never shows; `applyPick` fills only `field in current` with truthy profile values and snapshots `{ before, filled }`, `applyClear` restores only where `current[field] === filled` (both pinned in `guest-prefill.test.ts`); the picked name is not searched (`text: ""` while `query === picked.name`); the failure latch is render-time derivation with one `announce` from an effect keyed on the latch; the portaled listbox is `position: fixed; z-index: 10000`, repositioned on `resize` and capture-phase `scroll` while visible; `WaitlistPage` speaks pick / clear through the page's `announce` and its payload is unchanged (`toStrictEqual` + `not.toHaveProperty("guestId")`).
- **Security.** `guestId` ownership is venue-scoped on every path that trusts it (walk-in: `resolveGuestLink` before write; create: member gate then `resolveGuestLink` inside `linkOrCreateGuest`); the public path never reads or emits `guestId` (schema undeclared, handler destructures five fields, 201 scrubbed, SC11 equivalence test green with `x-ratelimit-remaining` the only differing header); the walk-in 400 leaks nothing beyond "not yours here". `GET /api/v1/guests/search` keeps `requireAuth` + `requireVenueAccess(fastify.venueMembershipLookup, venueIdFromQuery)`. Announcements carry name, counts and allergy tags to the Host's screen reader inside the staff app only; no new log line; no secrets. No route-level `config.rateLimit` added or moved on either route file (the #4492 class), so the global limiter and `publicRateLimitHook` are untouched.
- **Design.** Rialto-only composition (`Input` + `useCombobox` + `Text` / `Badge` / `Tag` / `Button variant="ghost"` / `Stack`), tokens only in both new CSS modules, CSS-only entrance gated by `prefers-reduced-motion`, no `setState` in a `useEffect` body, copy sourced once from `guest-lookup-rows.ts` for strip and announcement, load-bearing labels and button names unchanged, `data-testid`s preserved, changeset present for the published rialto change, E2E mocks advance state and the new locators are unique (Verify's drift review).

## Verdict

**Ready to ship.** Zero Critical, zero Major; one Minor fixed in this commit (prettier), four Minors deferred with seeds; both specialists PASS (ADR compliance PASS; reviewer PASS 7/10, its only blocking item being the prettier failure fixed here). The docs now say what the code does (`ux.md` :58 / :139 / :281, `prd.md` SC11 / SC12 amended in place). Five pre-existing gaps are recorded above for the human and seeded; none is introduced or widened by this diff except the `guest` relation now serialising on the pre-existing holds-confirm route, which is called out with its ready-made fix.

## Hand-off for Ship

- PR body must include `Closes #4990`. Never write to #4990 from the pipeline (no comments, no labels).
- PR carries a published-rialto change: `.changeset/use-escape-key-default-prevented.md` (`@mattbutlerengineering/rialto`: patch — `useEscapeKey` ignores an Escape whose default was already prevented). Repo policy requires the changeset for Build to pass; release notes should name it.
- Pre-PR gate: `pnpm exec prettier --check docs/features/booking-guest-reuse/` (clean at this commit) and `pnpm regen --check` (clean; no code changed in Review).
- Flags for a human reviewer, in order of weight:
  1. Pre-existing holds-confirm `guestId` gap now also returns `guest` on its 201 (see § Pre-existing) — seeded with the fix; worth pulling forward.
  2. Consent: linked public bookings now route reminders / cancellations by the profile's `communicationPreference` (§ Pre-existing) — a decision, not a defect.
  3. `recordVisit` has no caller (F3, #4990) — counts on the new strip are only as good as data entered elsewhere.
  4. ADR promotion candidate from `architecture.md` § ADRs: "Guest identity at booking time is resolve-only — a booking may link to a profile but never mutates it."
  5. E2E watch item F4 (`walkin.spec.ts:50→53`, `:131→132`, `realtime-collaboration.spec.ts:176→179` click "Seat now" without blurring the combobox) — 26/26 green locally under Verify's harness; the `Hospitality E2E` job is advisory.
  6. F5 `apps/hospitality/e2e/screenshots/` untracked and not ignored (root `.gitignore:144` is root-anchored) — hygiene, not this run.
  7. F9 three `react-hooks/incompatible-library` warnings on `watch("guestName")` — the app's existing class, 0 errors.
  8. F10 `packages/types/llms.txt` lost `durationMinutes?` from `WalkInRequest` — `pack.ts:56`'s five-member cap, not staleness; `regen --check` green.
- Backlog: eight seeds appended to `docs/backlog.md` in this commit (`(from: feature:booking-guest-reuse)`).
