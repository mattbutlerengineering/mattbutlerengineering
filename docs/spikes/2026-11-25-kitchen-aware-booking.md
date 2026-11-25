# Spike: Kitchen-Aware Booking

Refs #9494. Source: `docs/ideas/2026-10-11.md` #5. Decision doc only, no code.

## Answer first

The pacing engine the wedge needs already exists. A venue-wide "max covers per window" cap is
enforced on every booking path today. What is missing is a way for an operator to set it, see it
work, and set it per service. There is no POS, KDS or ticket-time data in the codebase, and the
charter rules out POS integration.

**Recommendation: build the wedge, narrowed to a standing pacing editor plus a "refused by
pacing" counter.** Defer the prep sheet and pre-orders. Cut anything that needs POS data.

## What kitchen-capacity data exists today

| Signal                   | Exists?                | Where                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Covers per time window   | Yes                    | `Reservation.startTime` + `partySize` (`services/reservations/prisma/schema.prisma`)                                                                                                                                                                                                                                                                                                                             |
| Standing pacing cap      | Yes, engine only       | `PacingRule { maxCoversPerSlot, timeWindowMinutes? }` in `VenueSettings.pacingRules` (`packages/types/src/venue.ts`). Enforced by `checkPacingForSlot` (`packages/availability/src/slot-rules.ts`), called from `listSlots`/`judge` (`packages/availability/src/slots.ts`) and `assertBookable` (`services/reservations/src/services/assert-bookable.ts`, error `PACING_EXCEEDED`). Only the first rule is read. |
| Tonight pacing override  | Yes, with UI           | Tonight date rule payload `{ pacing: { covers } }` (`packages/types/src/schemas/availability-config.ts`), folded into `pacingCovers` in `packages/availability/src/resolve-day.ts`. UI: `apps/hospitality/src/components/availability/TonightControl.tsx`.                                                                                                                                                       |
| Per-service pacing       | Reserved, not built    | `ScheduleService.rules` is a JSON column whose schema comment says "P3 turn times, pacing, party limits, windows". No zod schema for it exists in `availability-config.ts`.                                                                                                                                                                                                                                      |
| Standing pacing UI       | No                     | No reference to `pacingRules` or `maxCoversPerSlot` anywhere in `apps/hospitality/src`. Only settable through the venue `settings` JSON.                                                                                                                                                                                                                                                                         |
| Service pacing (turns)   | Partial                | `TableEvent` logs every `Table.status` change (`AVAILABLE`/`OCCUPIED`/`DIRTY`/`READY`) with timestamps. Seated-to-dirty is a turn time. Duration targets live in `durationRules` (`VenueSettings`).                                                                                                                                                                                                              |
| Menus                    | Yes, no kitchen fields | `Menu` / `MenuSection` / `MenuItem` (name, price, `AVAILABLE`/`SOLD_OUT`/`HIDDEN`). No station, prep time, course or portion fields. No link from `Reservation` to any menu item.                                                                                                                                                                                                                                |
| Dietary data             | Yes                    | `Guest.dietaryRestrictions` (JSON), surfaced per reservation in `services/reservations/src/services/briefing.ts`. `Reservation.occasion` is also there.                                                                                                                                                                                                                                                          |
| Ticket times / KDS / POS | No                     | No POS, KDS or ticket code in `services/reservations/src`. POS is an unchecked Phase 5+ item in `docs/plans/2026-01-31-hospitality-platform-roadmap.md` and a non-goal in `PRODUCT.md`.                                                                                                                                                                                                                          |
| Turned-away demand       | Yes, cause-blind       | `NoSlotSearch` counts public searches that found no slot (#9484). It does not record why (pacing vs tables vs hours).                                                                                                                                                                                                                                                                                            |

What can be captured without POS:

- A cap per service and per window, set by the operator (the kitchen's stated capacity).
- Why a slot was refused. `judge` already knows the limit it hit (`assert-bookable.ts` maps
  `pacing` to "over the pacing limit").
- Turn-time drift against `durationRules`, from `TableEvent`.
- Later, pre-ordered dishes, which would be the only dish-level signal.

What cannot be captured: station load, real ticket times, dish mix. Those need POS or KDS data.

## Smallest wedge

The idea doc proposed "a covers-per-15-minutes pacing rule enforced in `slot-rules.ts`". That rule
ships already. So the wedge is to make it usable and measurable.

1. **Standing pacing editor.** A field in the availability hub or settings: "max covers starting in
   any N minutes". Writes `VenueSettings.pacingRules[0]`. No schema change.
2. **Per-service cap.** Give `ScheduleService.rules` a versioned zod schema with
   `pacing: { covers, windowMinutes }`. Resolve it in `resolveDay` the same way `pacingCovers` is
   resolved for Tonight, taking the minimum of venue, service and Tonight caps. Additive, no
   migration (the column exists).
3. **Refusal reason counter.** Add a `reason` to what `NoSlotSearch` counts, or a sibling counter,
   so the operator sees "12 searches refused by pacing on Friday 7:00-7:30". Additive migration.

Explicitly out of the wedge: the prep sheet, pre-orders, station-level caps, any POS read.

## Kill test

Time box: 30 days after the editor ships to the live demo and to any real operator using the app.

- **Adoption:** at least one venue sets a standing or per-service cap and keeps it on for 14
  consecutive days. A per-service cap is a config save, so it lands in `availability_changes` (the
  audit log of availability edits). A venue `settings` write has no history today, so item 1 must
  write an audit row, or the test reads a daily snapshot of the setting instead.
- **Effect:** on paced services, the share of tables whose seated-to-dirty time exceeds the
  `durationRules` target by more than 15 minutes drops by at least 20% against the same weekdays
  in the 4 weeks before. Measured from `TableEvent`.

If no venue turns a cap on within 30 days, cut the rest of the idea and update the showcase copy.
If a cap is on but late turns do not move, keep the editor (it is cheap) and cut the forecasting
half.

Honest limit: the live deployment is Tier 1 with a demo venue. The effect half of the test needs
one real operator. Without one, only the adoption half can run.

## Cost estimate

Issue-sized pieces, each one PR:

| #   | Piece                                                      | Size | Notes                                     |
| --- | ---------------------------------------------------------- | ---- | ----------------------------------------- |
| 1   | Standing pacing editor (UI + venue settings write)         | S    | Engine and API already exist.             |
| 2   | `ScheduleService.rules` pacing schema + `resolveDay` merge | M    | Pure engine change, property tests exist. |
| 3   | Per-service pacing field in the service editor             | S    | Depends on 2.                             |
| 4   | Refusal reason on lost-demand counter                      | M    | Additive migration.                       |
| 5   | "Refused by pacing" panel on the dashboard heat map        | S    | Depends on 4.                             |
| 6   | Late-turn metric from `TableEvent` (kill test instrument)  | M    | Read-only aggregate.                      |

Deferred, priced for reference only: tomorrow's prep sheet from booked covers and dietary data (M,
read-only over `briefing.ts` data); pre-order a dish at booking (L, touches the booking widget,
schema and possibly deposits).

## Recommendation

**Build the wedge (items 1-6). Defer the prep sheet and pre-orders until the kill test passes.
Cut station-level and POS-based capacity.**

Reasons:

- The engine work is done and tested. The gap is an operator surface, which is cheap and directly
  felt by a venue (theme 2, "how is tonight going?").
- It stays inside the charter. No POS, no new paid infrastructure, additive schema only.
- The kill test can run on data the service already records (`TableEvent`, `availability_changes`).
- The forecasting half has no dish-level signal without POS. Building it first would be guesswork.

## Proposed child issues

**Proposed, not filed: the Owner decides.**

1. **feat(hospitality): standing pacing editor.** AC: an operator sets "max N covers per M minutes"
   and the public widget stops offering slots past it; covered by an e2e or route test.
2. **feat(availability): per-service pacing in `ScheduleService.rules`.** AC: a versioned zod
   schema; `resolveDay` applies min(venue, service, Tonight); property tests still fail on a
   broken merge.
3. **feat(hospitality): per-service pacing field.** AC: the service editor reads and writes the new
   rule; the availability preview shows the effect.
4. **feat(reservations): record the refusal reason for lost demand.** AC: each no-slot search is
   counted with its limiting reason (pacing, tables, hours, closure); additive migration.
5. **feat(hospitality): "refused by pacing" view.** AC: the dashboard heat map can filter to pacing
   refusals per 15-minute window.
6. **feat(reservations): late-turn metric.** AC: per service, the share of turns over the duration
   target by more than 15 minutes, from `TableEvent`; exposed to the dashboard and the kill test.
