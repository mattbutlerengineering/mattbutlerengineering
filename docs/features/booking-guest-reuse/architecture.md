---
stage: architect
run: feature:booking-guest-reuse
date: 2026-09-15
assumptions:
  - "Q1 (orchestrator) LINK-ONLY: a booking never edits the matched guest's name, email, phone or dietary restrictions on any path. `guestService.findOrCreate` is not reused (it applies `buildGuestUpdateData`); a resolve-only module `guest-link.ts` is added instead. The 'additive dietary merge' the orchestrator allowed is not done — none of the three surfaces collects dietary data."
  - "Q2 (orchestrator): the public widget path links on exact match and otherwise stores `guestId: null` and creates no Guest row; no widget UI, api-client or `@mbe/types` change on the public side. Timing parity: the email and phone lookups run whenever their inputs are present, never short-circuited on a hit, and the public 201 body is scrubbed to today's wire shape (`guestId: null`, `guest: null`) whether or not a match occurred."
  - "Q3 (orchestrator): the waitlist recognises and prefills only; nothing new is persisted, `WaitlistEntry` and `packages/types/src/schemas/waitlist.ts` are untouched, and seating a waitlist row still calls `api.reservations.walkIn` without a `guestId`."
  - "Q4 (orchestrator): `visitCount` never accrues in production (`recordVisit` has no non-test caller); out of scope. The strip, the listbox rows and the walk-in block therefore show real guests with no visit label after ship; recorded as a known limitation, not a defect of this run."
  - "Hard constraint (brief): no Prisma schema change and no migration. `Reservation.guestId` and the two compound uniques on Guest are sufficient."
  - "Flag 1 (unattended): the lookup is an app-level composition in `apps/hospitality/src/components/crm/` over rialto's exported `useCombobox` + `Input` + `Button`/`Badge`/`Tag`/`Text`, with the listbox portaled to `document.body` exactly as rialto `Select` does. Rialto `Combobox` is not extended."
  - "Flag 2 (unattended): rialto `useEscapeKey` gains `if (e.defaultPrevented) return;` (one line, patch changeset). The lookup calls `preventDefault()` on the Escape that closes its listbox, as rialto `Autocomplete`/`Combobox`/`useCombobox` already do, so the dialog's handler ignores that keypress."
  - "Flag 3 (unattended): `createWalkIn` writes `guestId: data.guestId ?? null` and includes `guest: { select: { visitCount, communicationPreference, unsubscribed } }`, matching `create` / `createWithConflictCheck`."
  - "Flag 4 (unattended): `guestId` is declared (`z.string().optional()`) on `CreateReservationBodySchema` and `WalkInBodySchema`. Ownership is checked server-side by `resolveGuestLink` (guest.venueId must equal the body's venueId; unknown id and foreign id give the same 400). On `POST /api/v1/reservations` (optionalAuth, no venue guard today) CRM linking of any kind runs only for an authenticated venue member; a supplied `guestId` from anyone else is 403. `PublicReservationBodySchema` is unchanged (SC12)."
  - "Flag 5 (unattended): no phone or email normalization this run — exact string match against stored values, the same contract `findOrCreate` and the compound uniques already have. Formatting or case differences miss the match; on the staff path that creates a duplicate Guest (SC4). Recorded as a known limitation and a backlog seed (canonical form + backfill needs a human)."
  - "Flag 6 (unattended): E2E plan is in § E2E; `api-mocks.ts` search mock also matches on phone, the walk-in POST mock echoes `guestId` and attaches `guest` from the fixture; specs scope guest-name text to rows/cards or close the listbox before asserting."
  - "Where resolution runs (unattended): the three routes call `resolveGuestLink` / `linkOrCreateGuest` and pass the resulting `guestId` into the existing service contracts; `createWithConflictCheck` and `confirmHold` are unchanged in signature. SC4's Guest create happens before `bookSlot`, so a booking that then fails on conflict leaves a real (empty-history) Guest behind — accepted, same as a Guests-page create. A concurrent first-time create hitting the unique constraint is re-resolved once and linked."
  - "`POST /api/v1/holds/:id/confirm` (public rate-limited, accepts caller `guestId`, returns the guest relation) is pre-existing and outside the PRD's scope; left untouched and named for the backlog."
  - "Prefill, revert and the linked guest are state of the surface (react-hook-form `watch`/`setValue`/`getValues`, prior art `EditReservationDrawer.tsx:78`, `ProfilePage.tsx:362`), not of the lookup; the strip is fed by the search row already in memory (no second fetch)."
  - "G1 (unattended, Architect re-entry 2026-09-15): the `GuestLookup` listbox entrance is CSS-only — one `@keyframes` (fade + 4 px rise) in `GuestLookup.module.css` over `var(--rialto-duration-standard) var(--rialto-ease-precision)`, `animation: none` under `@media (prefers-reduced-motion: reduce)`, no exit animation. No gate hook and no import: `framer-motion` is not added to `apps/hospitality` (rialto declares it as a peer + devDependency, not a dependency as Decompose recorded — either way it does not resolve from the app), `useMotionPreset()` is not needed for a CSS channel, and `pnpm-lock.yaml` does not change. ux.md assumption 16 ('keeps rialto's reduced-motion-gated entrance') is read as: an entrance is nice-to-have, reduced-motion compliance is mandatory, none would have been acceptable. Alternatives (a) direct dependency + `useMotionPreset()` and (c) a rialto motion primitive are recorded in § Decisions & alternatives."
---

# Architecture: Reuse existing guests at booking time

## Approach

One read-only identity seam on the server, one lookup field on the client, and nothing in between changes shape. Server: a new `services/reservations/src/services/guest-link.ts` resolves "which existing guest, if any, does this booking belong to" — by verified id, else exact email, else exact phone, always within the venue, never writing to a profile (Q1). The three booking routes (`POST /api/v1/reservations`, `POST /api/v1/reservations/walk-in`, `POST /public/v1/venues/:slug/reservations`) call it and hand the resulting `guestId` to the service methods that already write `guestId` (`createWithConflictCheck`, `createWalkIn`, `confirmHold`). The staff path alone adds "create when nothing matched" (SC4); the public path scrubs link fields from its response and runs the same lookups either way so matched and unknown are indistinguishable (SC11). Client: one `GuestLookup` field mounted where the Guest name `Input` is today on all three surfaces, composed in `apps/hospitality` over rialto's `useCombobox` + `Input`, with a `GuestHistoryStrip` under it after a pick. The surfaces own prefill/revert and the picked `guestId`; the lookup owns typing, searching, the listbox and the failure caption. The prior art matched: `guest-identity.ts` (pure identity helpers), `confirm-hold.ts` (a standalone booking-time function module), `venueIdFromEntity` in `routes/guests.ts` (foreign/unknown entity answered identically), `serializeManagedReservation` (narrowing a reservation for unauthenticated callers), rialto `Autocomplete.tsx`/`Select.tsx` (combobox wiring, portaled listbox), `useGuestRecognition.ts` (event-driven 300 ms debounce), `GuestCard.tsx` + `guest-signals.ts` (segment/allergy/risk rules), `useStatusMessage` + `LiveStatus` (one polite region, spoken from handlers).

## Components

### `guest-link.ts` — booking-time guest resolution (server, new)

- Responsibility: given `{ venueId, guestId?, guestEmail?, guestPhone?, guestName? }`, answer with a `guestId` to store or a rejection — and never write to an existing profile. Two exports: `resolveGuestLink` (read-only) and `linkOrCreateGuest` (resolve, then create a bare Guest when nothing matched and a contact was given — staff path only). Email match takes precedence over phone (as `findOrCreate` does). Cross-venue is impossible by construction: lookups go through `guestService.findByEmail(venueId, …)` / `findByPhone(venueId, …)` on the compound uniques, and a supplied id is accepted only when `guest.venueId === venueId`.
- Collaborators: `guestService.getById/findByEmail/findByPhone/create` (reads and the one create); called by `routes/reservations.ts` (two handlers) and `routes/public-reservations.ts`. Prior art: `guest-identity.ts` for placement and naming, `confirm-hold.ts` for a function module returning a discriminated result.

### `guestService` (server, unchanged surface)

- Responsibility: unchanged. `findByEmail`, `findByPhone`, `getById`, `create` are the reads/writes `guest-link.ts` needs; all exist. `findOrCreate` is not called by any booking path.
- Collaborators: Prisma `guest` model.

### `reservationService.createWalkIn` (server, edit)

- Responsibility: additionally persist `guestId: data.guestId ?? null` and include the guest relation so the response and the `reservation:created` SSE payload carry `guest.visitCount` (SC8). `guestEmail`/`guestPhone` stay `null` — the walk-in dialog collects neither; the linked profile carries the contact.
- Collaborators: `bookSlot`, `toReservation` (`PrismaReservationRow.guest` already typed), `routes/reservations.ts`.

### Route handlers (server, edit)

- `POST /api/v1/reservations`: decides whether the caller is a venue member (`request.user` + `fastify.venueMembershipLookup`, the same lookup `requireVenueAccess` uses), then for members calls `linkOrCreateGuest` and passes `guestId` into `createWithConflictCheck` unchanged. Non-members: today's behaviour (no link, no create); a supplied `guestId` → 403.
- `POST /api/v1/reservations/walk-in`: when `body.guestId` is present, `resolveGuestLink({ venueId, guestId })` → 400 on rejection, else `createWalkIn` with the id.
- `POST /public/v1/venues/:slug/reservations`: `resolveGuestLink({ venueId: venue.id, guestEmail, guestPhone })` before `confirmHold`; passes `guestId` in `guestDetails`; replies with `withoutGuestLink(reservation)`; the notifier still receives the full reservation.
- Collaborators: `guest-link.ts`, `createProblemDetails` (ADR-002), `venueMembershipLookup` (ADR-020).

### `withoutGuestLink` (server, new, in `serializers.ts`)

- Responsibility: `{ ...reservation, guestId: null, guest: null }` — the public confirm body keeps today's exact shape and reveals nothing about the CRM. Pinned by a test the way `serializeManagedReservation`'s narrowing is.
- Collaborators: `routes/public-reservations.ts` only.

### Schemas and types (`packages/types`, `packages/api-client`, edit)

- Responsibility: declare what the wire already accepts — `guestId: z.string().optional()` on `WalkInBodySchema` and `CreateReservationBodySchema`; `WalkInRequest.guestId?: string`; `api.reservations.walkIn` param type gains `guestId?: string`. `ConfirmHoldBodySchema`, `PublicReservationBodySchema`, `CreateWaitlistBodySchema`, `ReservationSchema` unchanged.
- Collaborators: `toRequestJsonSchema` (route JSON schemas regenerate from the Zod), `apps/hospitality` callers.

### `useGuestLookup` (client hook, new, `apps/hospitality/src/hooks/useGuestLookup.ts`)

- Responsibility: turn typed text into rows: 2-character minimum, 300 ms debounce driven from the change handler (timer in a ref, cleanup effect only clears — `useGuestRecognition.ts`, no `setState` in an effect body), `useGuestSearch({ venueId, query, enabled })`, then `rows = data.slice(0, 6)`, `hasMore`, `isLoading`, `failed`. Stale responses cannot show over newer text because each query is its own TanStack key.
- Collaborators: `useGuestSearch` (`useGuests.ts`), `GuestLookup`.

### `GuestLookup` (client component, new, `components/crm/GuestLookup.tsx` + `.module.css` + `.test.tsx`)

- Responsibility: the text field that is also the typeahead. Register-compatible (forwards `ref`, `name`, `onChange`, `onBlur` to rialto `Input`) so each surface keeps `register("guestName", …)`, its label text, `required` message and `/guest name/i` selectors. Owns: `role="combobox"` wiring (`aria-expanded`, `aria-controls`, `aria-activedescendant`, `aria-autocomplete="list"`, `aria-haspopup="listbox"`, `autoComplete="off"`), open/close/focused-index via `useCombobox({ items, containerRef, extraContainerRefs: [listRef] })` with the `openWithFocus(); setFocusedIndex(-1)` APG opening rialto `Combobox` uses, its own keydown (ArrowDown/Up, Home/End, Enter, Escape with `preventDefault`, Tab closes) — `useCombobox.handleKeyDown` is not used because it `preventDefault`s printable keys (it exists for `Select`'s button trigger); blur closes without a pick; options `onMouseDown` `preventDefault` so focus stays in the input (`Autocomplete.tsx`); the portaled `ul role="listbox"` positioned imperatively in a `useLayoutEffect` from the input's `getBoundingClientRect` (`Select.tsx:117-135`), with a CSS-only entrance — one `@keyframes` (fade + 4 px rise) declared in `GuestLookup.module.css` over `var(--rialto-duration-standard) var(--rialto-ease-precision)` and set to `animation: none` under `@media (prefers-reduced-motion: reduce)`, the app's own entrance pattern (`ConfirmationView.module.css`, `LaunchStagePanel.module.css`); no exit animation (the list unmounts on close) and no `framer-motion` import; status rows (loading / no match / "More matches — keep typing to narrow.") as `role="option" aria-disabled`; the failure caption under the hint; the results/loading/no-match sentences into the region it is given. Copy is ux.md § Copy verbatim.
- Collaborators: `useGuestLookup`, rialto `Input`, `useCombobox`, rialto motion CSS tokens (`--rialto-duration-standard`, `--rialto-ease-precision` — the values `precision` carries, reached through the stylesheet rather than a JS import), `guest-lookup-rows.ts`, the surface (props `venueId`, `label`, `hint`, `query`, `picked`, `onPick(guest)`, `onClear()`, `announce(text)`, `disabled`, `data-testid`).

### `guest-lookup-rows.ts` (client, pure, new, `components/crm/`)

- Responsibility: `formatGuestRowDetail(guest)` → `"{phone} · {email} · {N visits}"` omitting null/0, `"no contact on file"` when both contacts are null; `pickAnnouncement(mode, guest)` and the strip's visits/no-shows sentences. Pure like `guest-signals.ts`; unit tested.
- Collaborators: `GuestLookup`, `GuestHistoryStrip`.

### `guest-prefill.ts` (client, pure, new, `components/crm/`)

- Responsibility: the revert rule. `applyPick(current, profile) → { next, snapshot }` fills every field the profile has a value for and records `{ before, filled }` per field; `applyClear(current, snapshot) → next` restores `before` only where `current === filled` (edited-since values stay). Identical on the reservation dialog (email, phone) and the waitlist (phone).
- Collaborators: `NewReservationDialog`, `AddToWaitlistForm`.

### `GuestHistoryStrip` (client component, new, `components/crm/GuestHistoryStrip.tsx`)

- Responsibility: `role="group"` named by its title ("Using {name}'s profile" / "Recognised {name}"), `Button variant="ghost"` Clear with `aria-label="Clear {name}"`, segment `Badge` only when `getSegmentLabel` yields VIP or Repeat, visits or "No visits on record yet", no-shows with the risk `Badge`, dietary `Tag`s with `isAllergyTag` → `variant="error"` and "Allergy:" prefix, optional caption. No motion. Fed by the `Guest` from the search row.
- Collaborators: `guest-signals.ts` (`getSegmentLabel`, `getSegmentVariant`, `isAllergyTag`, plus `getRiskLabel`/`getRiskVariant` lifted there from `GuestCard.tsx` so both render the same rule), rialto `Stack`/`Badge`/`Tag`/`Text`/`Button`.

### Surfaces (client, edit)

- `NewReservationDialog`: replaces the Guest Name `Input` with `GuestLookup`; `pickedGuest` state; on pick `setValue("guestName")`, `applyPick` over `guestEmail`/`guestPhone`, strip with the link-only caption; on clear `applyClear`; submit adds `guestId: pickedGuest?.id`; one `useStatusMessage` + `LiveStatus` inside the panel. `useEscapeKey(handleClose, true)` unchanged (Flag 2 makes it ignore the consumed Escape).
- `WalkInDialog`: same field swap with label "Guest name (optional)", no prefill (no contact fields), strip without caption; `onConfirm` data gains `guestId?`; `TimelinePage` passes it to `api.reservations.walkIn`. Initial focus, party-size row, Table `Select`, `ErrorRetryBanner` unchanged. Listbox `aria-label="Guest suggestions"` so the Table `Select`'s `getByRole("listbox")` stays unambiguous.
- `WaitlistPage.AddToWaitlistForm`: field swap, `applyPick` over `guestPhone`, strip titled "Recognised {name}", announcements through the page's existing `announce()`; payload unchanged (`guestName`, `guestPhone`, `partySize`); `WaitlistRow.handleSeat` unchanged (Q3).
- `ReservationBlock`: unchanged — it already renders `ordinalVisit(visitCount)` when `reservation.guest.visitCount > 1`.

### rialto `useEscapeKey` (edit, `packages/rialto/src/hooks/useEscapeKey.ts`)

- Responsibility: ignore an Escape whose default was prevented — the standard "already consumed" signal, which rialto's own `Autocomplete`, `Combobox` and `useCombobox` already emit. Fixes the same double-close for `Select`/`Combobox` nested in `Dialog`/`Drawer`. Test added in `useEscapeKey.test.ts`; `.changeset/use-escape-key-default-prevented.md` (patch).
- Collaborators: every rialto overlay and the two app dialogs.

## Data model

No Prisma change and no migration (hard constraint). Everything needed exists:

- `Reservation.guestId String?` with the `guest Guest?` relation — written by all three paths today (`null` on walk-in and public).
- `Guest @@unique([venueId, email])`, `@@unique([venueId, phone])` — exact, venue-scoped identity; `findByEmail`/`findByPhone` are `findUnique` on them.
- `WaitlistEntry` has no guest link and gains none (Q3).
- Wire types: `Reservation.guest?: { visitCount; communicationPreference; unsubscribed? } | null` already exists; the walk-in response starts populating it.

Semantics fixed by this run: a booking may point at a Guest; a Guest is never modified by a booking. Profile edits stay on the Guests page (`PATCH /guests/:id`, `find-or-create`).

Access patterns this run adds, all point reads on existing indexes: `guest.findUnique` by `[venueId, email]`, by `[venueId, phone]`, and by `id` (then compared to `venueId`); one `guest.create` on the staff path. Consistency: the two compound uniques are the arbiter for concurrent first-time creates (the loser re-resolves and links); the reservation insert carries `guestId` inside the existing `bookSlot` transaction, so a failed booking never leaves a dangling link, and `DELETE /guests/:id` already refuses a guest with reservations, so a link cannot dangle later either. No cross-table transaction is added.

## Interfaces & contracts

### `resolveGuestLink(input): Promise<GuestLinkResult>` (`guest-link.ts`)

- Input: `{ venueId: string; guestId?: string | null; guestEmail?: string | null; guestPhone?: string | null }`.
- Output: `{ ok: true; guestId: string | null }` — `guestId` is the verified supplied id, else the email match, else the phone match, else `null`. `{ ok: false; code: "GUEST_NOT_IN_VENUE" }` when `guestId` is given and no guest with that id exists in `venueId` (nonexistent and foreign are the same answer — `venueIdFromEntity` precedent, no existence leak). When `guestId` is given, contact lookups are skipped (the pick wins). When not, `findByEmail` and `findByPhone` run together (`Promise.all`) whenever their input is present — decided by input, never by a hit — so SC11 timing is the same for matched and unknown.
- Failure modes: Prisma read errors propagate (500 via the service's normal path; no new failure domain — the insert that follows uses the same database). Nothing is retried; nothing is written.

### `linkOrCreateGuest(input): Promise<GuestLinkResult>` (`guest-link.ts`, staff only)

- Input: as above plus `guestName?: string | null`.
- Output: `resolveGuestLink`'s answer; when that is `{ ok: true, guestId: null }` and at least one of `guestEmail`/`guestPhone` and a `guestName` are present, `guestService.create({ venueId, name, email?, phone? })` and return the new id. No contact → `null` (a name-only staff booking stays unlinked, as today; the dialog requires email or phone anyway).
- Failure modes: unique violation on create (two first-time bookings for the same contact racing) → `resolveGuestLink` once more and return the winner's id; any other create error propagates. A booking that fails after the create (conflict/pacing) leaves the Guest — accepted (§ assumptions).

### `POST /api/v1/reservations` (staff/legacy, `optionalAuth`)

- Input: `CreateReservationBodySchema` + `guestId?: string` (now declared; the JSON schema already let it through).
- Output: 201 `{ data: Reservation }` with `guestId` and `guest` populated when linked (include unchanged). Member + `guestId` → verified link (SC1). Member + contact, no `guestId` → exact link (SC3) or create-and-link (SC4). Non-member/anonymous + contact → today's unlinked reservation.
- Failure modes: `guestId` from a non-member or anonymous caller → 403 `createProblemDetails(403, "Forbidden", "You do not have access to this venue")`; `GUEST_NOT_IN_VENUE` → 400 "Unknown guest for this venue"; 409/400 from `createWithConflictCheck` as today.

### `POST /api/v1/reservations/walk-in` (`requireAuth` + `requireVenueAccess(venueIdFromBody)`)

- Input: `WalkInBodySchema` + `guestId?: string`.
- Output: 201 `{ data: Reservation }`; with `guestId` the row stores it and `data.guest.visitCount` is present (SC8); without it, byte-for-byte today's payload and outcome (SC7). SSE `reservation:created` carries the same object; `table:updated` unchanged.
- Failure modes: `GUEST_NOT_IN_VENUE` → 400 "Unknown guest for this venue" (before any write); 409 on conflict as today.

### `POST /public/v1/venues/:slug/reservations` (public, rate-limited)

- Input: `PublicReservationBodySchema` unchanged; a caller-supplied `guestId` is not a declared field and is never read (SC12).
- Output: 201 `{ data: { reservation: withoutGuestLink(r), manageToken } }` — identical shape and values for matched and unknown guests apart from `reservation.id`, `createdAt`, `updatedAt` and `manageToken` (SC11). The stored row has `guestId` set on exact email, else exact phone, else `null` (SC10). `bookingNotifier.scheduleBookingNotifications` receives the unscrubbed reservation, so a linked guest's `communicationPreference` now steers the channel (`resolveChannel`) — an intended consequence, named here for Verify.
- Failure modes: unchanged (404/410/403/409/422 mapping from `confirmHold`). The lookup runs before hold validation, so error timings are also match-independent. Residual, not controllable: database-level timing of an index hit vs miss.

### `GuestLookup` props (client)

- Input: `venueId`, `label`, `hint`, `placeholder`, `query: string` (from `watch`), register bag (`ref`, `name`, `onChange`, `onBlur`), `picked: Guest | null`, `onPick(guest)`, `onClear()`, `announce(text)`, `disabled?`, `required?`, `data-testid?`.
- Output: calls `onPick` on tap/Enter; calls `onClear` when the field is wiped to empty while `picked`; otherwise plain `onChange` events. After a pick the field text is the guest's name only (the surface `setValue`s it); suggestions reopen at 2+ characters while editing; picking another guest replaces the link.
- Failure modes: `useGuestSearch` error → caption "Can't look up guests right now — type the details as usual.", announced once per episode, listbox closed, no control disabled, the next keystroke re-queries (SC6); the caption clears on the next success or an empty field.

### `GuestHistoryStrip` props (client)

- Input: `guest: Guest`, `mode: "linked" | "recognised"`, `caption?: string`, `onClear()`.
- Output: the group as ux.md § Strip; Clear returns focus to the field with its text selected (the surface does this via the register `ref`).
- Failure modes: none (pure render over data already held).

### `withoutGuestLink(reservation): Reservation` (`serializers.ts`)

- Input: a domain `Reservation`.
- Output: the same object with `guestId: null` and `guest: null`. Test pins that no other key changes and that both fields are null even when the input carries a link.
- Failure modes: none.

### Cross-process notes

- `GET /api/v1/guests/search` from the lookup: GET, idempotent, safe to retry; TanStack Query's configured retry applies unchanged, so the failure caption appears once the query settles in error, and the next keystroke is a fresh query. No new timeout is introduced; the api-client's are the contract.
- The three booking POSTs keep their retry semantics: not idempotent, never retried by the client, `bookSlot`'s advisory lock is the double-book guard. The lookups add two indexed point reads before the existing write — same database, same failure domain, no new timeout class.
- `useGuestLookup` has one consumer and `withoutGuestLink` one caller: neither is a seam. The hook follows the app's hooks-beside-components convention (`useGuestRecognition` ↔ the widget) so the search rules test without the DOM; the serializer is a pinned security rule, not an extension point.

## Stack & dependencies

- Fastify + Prisma reservations service, `@mbe/types` Zod → `toRequestJsonSchema`, ADR-002 problem details, ADR-020 membership lookup — no new runtime dependency.
- React + react-hook-form + TanStack Query (`createQueryHook`) in `apps/hospitality`; rialto primitives via `@mattbutlerengineering/rialto` and `@mattbutlerengineering/rialto/hooks` (`useCombobox`, `ComboboxItem`, `useEscapeKey`, `useFocusTrap` already imported by the dialogs); the listbox entrance is CSS-only over rialto's motion tokens (`--rialto-duration-standard`, `--rialto-ease-precision`) with `animation: none` under `prefers-reduced-motion` — no `framer-motion` in `apps/hospitality` (it is rialto's peer dependency, not resolvable from the app), no new hook, and `pnpm-lock.yaml` does not change.
- `react-dom` `createPortal` for the listbox (rialto `Select` precedent); no floating-ui or other positioning library.
- Playwright E2E with `api-mocks.ts` route mocks; vitest unit tests on both sides; a `.changeset` for the one-line rialto change (repo policy: published rialto source needs a changeset or Build fails).
- Docs: `apps/hospitality/CLAUDE.md` Key Components gains `crm/GuestLookup` + `crm/GuestHistoryStrip`; `apps/hospitality/docs/USER-FLOWS.md` Flow 3 gains the optional pick step, Flow 5 the typeahead entry (SC15).

## Decisions & alternatives

- **App-level `GuestLookup` over `useCombobox` + `Input`** over extending rialto `Combobox` — the four gaps (two-line rows, name-only write-back, open threshold, blur close) are all product behaviour of one app; `useCombobox` is exported precisely so a consumer can compose them, and rialto stays free of guest-shaped options and a prop-drift review.
- **Portal the listbox to `document.body`** over dropping `overflow-y: auto` from the dialog or an in-flow list — the dialog must still scroll at 768 px, an in-flow list shifts the contact row while typing, and `Select.tsx` already ships the portal + `extraContainerRefs` + `useLayoutEffect` positioning pattern.
- **CSS-only listbox entrance over rialto motion tokens** over (a) a direct `framer-motion` dependency in `apps/hospitality` for a `motion.ul` gated by `useMotionPreset()` (ADR-025) or (c) a rialto-exported motion-aware listbox primitive — `framer-motion` is rialto's peer, not resolvable from the app today, so (a) is a `pnpm-lock.yaml` importer change (cold fully-parallel CI, dep-graph regen, a `rialto-vendor`/index size re-measure) bought for a 150 ms fade, and (c) widens the run into the design system, a changeset and a build for one consumer. The CSS channel is already how this app enters things (`@keyframes` + `var(--rialto-ease-*)` + `@media (prefers-reduced-motion: reduce) { animation: none }` in `ConfirmationView`, `LaunchStep`, `LaunchStagePanel` and five more `.module.css`), `--rialto-duration-standard`/`--rialto-ease-precision` are the exact values `precision` carries (0.15 s, `cubic-bezier(0.2, 0, 0, 1)`), and vibes reach CSS tokens through ADR-022's seam — ADR-025's hook exists only because a framer config cannot be reached that way, so a CSS entrance needs neither the hook nor the library. Cost: no exit animation (the list unmounts on close) and the entrance is not a spring — both within ux.md § Reduced motion.
- **`useEscapeKey` honours `defaultPrevented`** over dialogs passing `enabled={!lookupOpen}` or the lookup calling `stopPropagation()` — the hook is the module that owns "when does Escape close an overlay", the signal is the one rialto's own comboboxes already emit, it fixes every nested overlay at once, and `stopPropagation` would depend on React's root-container delegation ordering rather than an explicit contract.
- **Resolution in a new `guest-link.ts` called from the routes** over a `guestService.findOrCreate` option flag or resolution inside `createWithConflictCheck`/`confirmHold` — `findOrCreate` mutates (Q1 forbids it), the two service methods are shared with paths that must not change (`holds.ts` confirm, `WaitlistRow` seating), and the routes already sequence services (`public-reservations.ts`), so the seam is real: three callers, one policy, zero writes.
- **Link/create on `POST /api/v1/reservations` only for venue members** over always or for any authenticated user — the route is `optionalAuth` with no venue guard and a pinned anonymous guest-booking test; linking or creating for anonymous callers would be a CRM oracle and a spam vector, and CRM access is membership-gated everywhere else (ADR-020, every `/guests` route).
- **Scrub `guestId`/`guest` from the public 201** over a new narrowed public type — keeps today's wire shape (no widget or api-client change, Q2) and gives SC11 an empty diff; a `PublicReservationView` would widen the change into `@mbe/types` and the widget for no user-visible gain.
- **Same answer for unknown and foreign `guestId`** over 404 vs 403 — mirrors `venueIdFromEntity`; a 404/400 split would tell a venue-B member whether a venue-A id exists.
- **Create before `bookSlot`, not inside the transaction** over `tx.guest.create` — a unique violation inside the transaction aborts it (Postgres), forcing a re-run of the whole booking; outside it the fallback is a second read. The cost is an occasional Guest with no reservation after a conflict, which the Guests page already tolerates from its own create.
- **No phone/email normalization** over a canonical E.164/lowercase form — a canonical form at lookup without a backfill misses every existing row; a backfill is production data surgery outside "no migration"; the brief fixed exact-match-only. Limitation recorded; seed for a human-owned follow-up.
- **Strip fed by the search row** over `useGuest(guestId)` — the row already carries `visitCount`, `noShowCount`, `riskScore`, `dietaryRestrictions`, `tags`; a second fetch adds a loading state inside a dialog for data we hold.
- **`getRiskLabel`/`getRiskVariant` lifted into `guest-signals.ts`** over duplicating them in the strip — the UX names `GuestCard`'s rule as the single source; lifting two pure functions is the smallest move that makes that literally true.
- **Debounce in the change handler with a ref timer** over `useGuestDirectory.ts`'s `useEffect` + `setDebouncedQuery` — SC14 forbids `setState` in effect bodies for this run; `useGuestRecognition.ts` is the in-house pattern that complies.
- **`guestEmail`/`guestPhone` stay `null` on a linked walk-in** over copying the profile's contact onto the row — SC7 pins today's payload, the dialog has no contact fields, and the linked profile answers "how do I reach them" without duplicating data that Q1 says the booking must not own.
- **Precedence and ownership rules inline in `resolveGuestLink`, tested through a mocked `guestService`** over a separate pure `chooseGuestMatch` — the rule is three comparisons; a pure module for it would be a name with nothing behind it. Recorded so it is a decision: if a fourth identity key ever arrives, extract it then. Tests follow `confirm-hold.test.ts` (module under test real, collaborators mocked).

### Surfaced flags — decisions

1. rialto `Combobox` vs app composition → app composition (above).
2. `useEscapeKey` double-close → one-line `defaultPrevented` guard in rialto + changeset; lookup `preventDefault`s the Escape it consumes.
3. Walk-in response `guest` → `createWalkIn` include gains the same `guest` select as `create`.
4. `guestId` validation/ownership → declared on both staff bodies; ownership in `resolveGuestLink`; membership gate on the `optionalAuth` route; public body unchanged.
5. Phone normalization → none; exact string match; limitation + backlog seed.
6. E2E → § E2E below; `e2e-selector-drift-reviewer` on the touched specs.

## E2E and test plan (for Implement)

- `apps/hospitality/e2e/api-mocks.ts`: `guests/search*` (`:525`) also matches when the query's digits are contained in the fixture phone's digits, so a phone key finds Alice/Carol; walk-in POST (`:404`) already spreads `body` (so `guestId` echoes) — add `guest: { visitCount, communicationPreference }` from the matching `guests-list` fixture when `body.guestId` is present, else `guest: null`.
- `walkin.spec.ts:47,131` and `waitlist.spec.ts:20,51,145`: `getByLabel(/guest name/i)` keeps resolving (label text unchanged; role is now `combobox`); typing ≥ 2 characters opens a listbox whose `role=option` rows contain guest names — assertions on a guest's name stay scoped (`reservationBlocks.filter`, `entryCard`, `getByRole("row")`) or the spec presses Escape/blurs first. `reservations.spec.ts:124` `getByText("Alice Johnson")` is unscoped and Alice is in both fixtures — scope it or close the listbox. Portaled options are found with `page.getByRole("option", …)`, not `dialog.getByRole(...)`.
- New E2E, optional: walk-in with a pick → block shows "12th visit" (fixture Alice, `visitCount: 12`).
- Unit, server: `guest-link.test.ts` (id verified / foreign id rejected / email precedence / phone fallback / both lookups called on no match / create on no match / unique-violation re-resolve / no `guestService.findOrCreate` or `update` call ever — SC3/SC4/SC5, Q1); `reservation.test.ts` `createWalkIn` stores `guestId` and includes `guest` (SC8); `reservations.test.ts` walk-in + create routes (403/400 mapping, member gate, `guestId` passthrough — SC1); `public-reservations.test.ts` SC10 (`confirmHold` called with `guestId` from `findByEmail`, else `findByPhone`, else undefined) and SC11 (two injects, normalise `id`/`createdAt`/`updatedAt`/`manageToken` and the `x-ratelimit-*` headers, assert `findByEmail`/`findByPhone` called in both, empty diff) and SC12; `serializers.test.ts` `withoutGuestLink`.
- Unit, client: `GuestLookup.test.tsx` (threshold, debounce, rows, keyboard, Escape `defaultPrevented`, blur close, failure caption — SC6), `guest-prefill.test.ts`, `guest-lookup-rows.test.ts`, `GuestHistoryStrip.test.tsx` (SC2 fixture: 4 visits, 1 no-show, `["shellfish"]`; zero state), the three surface tests (pick → payload `guestId`; walk-in `onConfirm` unchanged without a pick — SC7; waitlist payload unchanged — SC9), `useEscapeKey.test.ts` in rialto.
- Gates (SC13): `pnpm lint`/`typecheck`/`test` in `apps/hospitality`, `services/reservations`, `packages/types`, `packages/api-client`, `packages/rialto`; `pnpm build --filter @mbe/cli... && pnpm regen` (llms for every touched package); `check-adr`, `check-deps`; size-limit.

## Traceability

| Requirement                                                     | Component(s)                                                                                                                    |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Story 1 — suggestions as I type                                 | `GuestLookup`, `useGuestLookup`, `GET /guests/search` (existing)                                                                |
| Story 2 — visits / no-shows / allergies before confirm          | `GuestHistoryStrip`, `guest-signals.ts`                                                                                         |
| Story 3 — exact contact links without a pick                    | `linkOrCreateGuest`, `POST /api/v1/reservations` handler                                                                        |
| Story 4 — walk-in lookup I can ignore                           | `GuestLookup` in `WalkInDialog` (no threshold, no gate), SC7 contract                                                           |
| Story 5 — linked walk-in shows the visit label                  | `createWalkIn` include, `ReservationBlock` (unchanged)                                                                          |
| Story 6 — waitlist recognises a phone and prefills              | `GuestLookup` in `AddToWaitlistForm`, `guest-prefill.ts`                                                                        |
| Story 7 — staff bookings attach, no copies                      | `resolveGuestLink` / `linkOrCreateGuest` (Q1 resolve-only)                                                                      |
| Story 8 — widget booking lands on the known guest               | `resolveGuestLink` in `public-reservations.ts`, `confirmHold` (unchanged)                                                       |
| Story 9 — widget behaves identically either way                 | `withoutGuestLink`, always-run lookups, unchanged public body                                                                   |
| SC1 pick submits `guestId`, row stores it                       | `NewReservationDialog` submit, `createWithConflictCheck` (unchanged), route member gate                                         |
| SC2 strip shows visits/no-shows/dietary, allergies distinct     | `GuestHistoryStrip`, `isAllergyTag`                                                                                             |
| SC3 no-pick exact link, count unchanged, email precedence       | `linkOrCreateGuest` → `resolveGuestLink`                                                                                        |
| SC4 no-pick no-match creates one Guest and links                | `linkOrCreateGuest` → `guestService.create`                                                                                     |
| SC5 cross-venue never links                                     | compound uniques via `findByEmail`/`findByPhone`; `venueId` check on supplied id                                                |
| SC6 lookup failure never blocks submit                          | `GuestLookup` failure caption; no control tied to the query                                                                     |
| SC7 walk-in unchanged without lookup                            | `WalkInDialog` (payload unchanged), `createWalkIn` (`guestId ?? null`)                                                          |
| SC8 walk-in with pick stores `guestId`, block shows visit label | `WalkInBodySchema.guestId`, `resolveGuestLink` in the walk-in route, `createWalkIn` include, `ReservationBlock`                 |
| SC9 waitlist recognise + prefill, payload/schema unchanged      | `AddToWaitlistForm` + `guest-prefill.ts`; `waitlist.ts` untouched                                                               |
| SC10 public confirm links email then phone, unknown → null      | `resolveGuestLink` in `public-reservations.ts`                                                                                  |
| SC11 matched/unknown responses identical                        | `withoutGuestLink`, `Promise.all` lookups, lookup before hold validation                                                        |
| SC12 public body rejects caller `guestId`                       | `PublicReservationBodySchema` unchanged; handler never reads it                                                                 |
| SC13 gates                                                      | § E2E and test plan                                                                                                             |
| SC14 rialto only, tokens, reduced motion, no setState-in-effect | `GuestLookup`/`GuestHistoryStrip` (rialto primitives, reduced-motion CSS, imperative positioning), `useGuestLookup` (ref timer) |
| SC15 docs                                                       | `apps/hospitality/CLAUDE.md` Key Components, `USER-FLOWS.md` Flow 3 / Flow 5                                                    |

## Known limitations and seeds (not this run)

- Exact string identity: differently formatted phones or differently cased emails do not match; on the staff path SC4 then creates a duplicate. Seed: canonical form at write and lookup with a backfill (human-owned).
- `visitCount` never accrues (Q4): no real guest shows "N visits" or a block label until `recordVisit` has a caller.
- `POST /api/v1/reservations` has no `requireVenueAccess` (pre-existing); this run gates CRM linking on membership but does not change reservation creation itself. `POST /api/v1/holds/:id/confirm` accepts a caller `guestId` unauthenticated and returns the guest relation (pre-existing).
- A linked public booking now follows the guest's `communicationPreference` for notifications — intended, but new for known guests.

## ADRs

None created (unattended run; no files under `docs/adr/`). One decision is flagged for promotion by a human: **"Guest identity at booking time is resolve-only — a booking may link to a profile but never mutates it; profiles change only through the Guests routes."** It is cross-cutting (three routes, two services, the public widget), it will be re-litigated (dietary merge and phone normalization were both deferred against it), and reversing it later would mean bookings silently rewriting CRM data that cannot be un-rewritten.
