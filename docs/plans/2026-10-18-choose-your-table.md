# Choose Your Table — feasibility check + build plan

> **Status: future plan — unblocked, not yet filed.** Needs no venue history and no LLM key. Nothing here is filed as an issue; run `/decompose` on this file to start it. File references verified against `main` at `56fedb2c2`, 2026-10-18.

## Context

The hospitality product has no users yet and needs a feature that makes both guests and owners say "wow". Choose Your Table: in the booking widget, after date, time and party size, the guest sees the venue's **real floor plan** — tables that fit glow — and taps the window booth they want. Owners tag tables (window, booth, patio, bar) and can optionally put a small premium on the best seats.

Why it lands: every single booking becomes a product showcase on the owner's own site; a per-table premium is new revenue (revenue is what makes owners switch tools); incumbents mostly offer a "seating preference" dropdown, not a real map. Matt loved it (2026-10-18). Companion plans: Snap Your Room (#7047), Brand Match (#7048) restyles this map, Dress Rehearsal (#7049) is the recommended build-first sibling.

## Verdict: feasible — the booking core already does the hard part

The riskiest piece looked like table-pinned holds with race safety. **It already exists**:

| Piece                                                                   | Exists?                 | Where                                                                                                                                                                             |
| ----------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Holds and reservations are pinned to a table (`tableId` required)       | yes                     | `ReservationHold`, `Reservation` in `services/reservations/prisma/schema.prisma`                                                                                                  |
| Hold creation accepts an optional caller-chosen `tableId`               | yes                     | `holdService.create` (`services/reservations/src/services/hold.ts:49-161`): validates table-in-venue (:85), pre-checks fit + pacing (:109), auto-picks only when absent (:93-107) |
| Race guard so two guests can't hold the same table                      | yes                     | per-table advisory lock + conflict re-check inside the hold transaction (`hold.ts:131`)                                                                                           |
| Party-fits rule + conflict data + pure table selection                  | yes — reuse             | `findSuitableTables` / `fetchConflictData` / `selectBestTable` (`services/reservations/src/services/availability.ts:308-345`)                                                     |
| Public hold route forwards a `tableId`                                  | **no** — small change   | `services/reservations/src/routes/public-holds.ts:88,124-128` body is `{ date, startTime, endTime, partySize }` only                                                              |
| Public per-table availability ("which tables are free at 19:30 for 4?") | **no** — new read       | public availability is slot-level only: `routes/public-availability.ts` returns `TimeSlot[]` via `availabilityService.generateTimeSlots`                                          |
| Public floor plan geometry                                              | **no** — new read       | no `/public/v1` floor-plan route registered in `services/reservations/src/app.ts`                                                                                                 |
| Read-only canvas for guests                                             | yes                     | `FloorPlanCanvas` `readOnly` prop (`apps/hospitality/src/components/floor-plan/FloorPlanCanvas.tsx:52`)                                                                           |
| Structured table features (window, booth, …)                            | **no** — only free-text | `Table.location` string                                                                                                                                                           |
| Deposit/payment step to carry a premium                                 | yes                     | `booking-widget/PaymentStep.tsx`, `routes/public-deposits.ts`, `effectiveDepositPolicy.ts`                                                                                        |

## Approach

### 1. Table features (owner side)

`Table.features` (`string[]` enum: `window | booth | patio | bar | quiet | view`) — one additive migration (nullable/default `[]`; `migration-reviewer`). Tag picker in the floor plan editor's table details. Zod in `@mbe/types`.

### 2. Public floor plan + per-table availability (one read)

`GET /public/v1/venues/:slug/table-map?date&time&partySize` under `publicVenueScoped` (same pattern as `routes/public-venues.ts`), returning the **active** floor plan's tables as `{ id, name, shapeMetadata, capacity, features, available, premiumCents? }` — geometry, names and availability for one slot only; **never** reservation or guest data. `available` comes from a new pure `availableTablesAt(tables, start, end, reservations, holds)` sitting next to `selectBestTable`, fed by the existing `findSuitableTables` + `fetchConflictData`.

**Consistency invariant (property test):** for any seeded fixture, `generateTimeSlots` says a slot is available ⇔ `availableTablesAt` returns ≥ 1 table for it. The map must never offer a table the slot engine wouldn't, or vice versa. Also respect pacing the way `holdService` does (a free table in a paced-out slot is not available).

Public rate limit per IP (anonymous surface — see gotchas § Fastify / rate limiting: don't move the limiter's hook).

### 3. Public hold accepts an optional `tableId`

Add optional `tableId` to `publicHoldBodyJsonSchema` and forward it at `public-holds.ts:128` into `holdService.create`, which already validates and locks it. Lost race → existing "Table is not available for this time slot" → widget refreshes the map and says "Someone just grabbed that one".

### 4. Widget step

New optional "Choose your table" step after time selection in `useBookingFlow`: read-only `FloorPlanCanvas`, fitting+free tables highlighted, feature chips, tap to select. **"Any table" stays the default and is one tap away** — picking is a delight, never a gate. Accessible fallback: a listbox of available tables (name, seats, features) for screen readers and narrow screens (mirror `TimeSlotListbox.tsx`). Strings in `en-US.json` / `fr-CA.json`.

### 5. Premium seats (optional, last)

`Table.premiumCents` (owner-set). Selected premium table adds to the deposit via the existing `PaymentStep` / `public-deposits` flow — integer cents only, idempotency preserved, clear refund/cancellation semantics. Requires `stripe-flow-reviewer`.

## Risks

- **Availability drift** between slot engine and table map → the property test in step 2 is the gate.
- **Privacy** of a public endpoint that knows table occupancy → expose a single-slot boolean only, no reservation ids, names, or durations; RLS/venue scoping per ADR-020/026.
- **Payments** (step 5) → isolated last, behind specialist review; steps 1–4 ship without money.
- **Owner floor plans that don't match reality** → owner can disable guest table choice per venue (default off until they've reviewed their map).

## Delivery

`/decompose` into ordered issues: (1) `Table.features` + editor tags, (2) `availableTablesAt` + consistency property test, (3) public `table-map` route, (4) public hold `tableId` passthrough, (5) widget step + accessible list fallback, (6) per-venue enable toggle, (7) E2E, (8) premium seats. Steps 1–7 are the shippable feature. TDD each. Recommended to build after Dress Rehearsal (#7049), which is client-side and lower risk.

## Verification

- Unit/property: `availableTablesAt` vs `generateTimeSlots` agreement across seeded fixtures; feature schema.
- Route: `table-map` returns no reservation/guest fields (response schema snapshot); 404 unknown slug; rate limit; public hold with foreign-venue `tableId` → 4xx; concurrent holds on one table → exactly one succeeds (integration test against the advisory lock).
- E2E (hospitality Playwright): widget → date/party/time → map shows highlighted tables → pick → hold → confirm → reservation lands on that table in the timeline; "any table" path unchanged.
- Manual: preview deploy with a real floor plan; keyboard + screen-reader pass on the listbox fallback.
