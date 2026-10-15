---
stage: architect
run: maintenance:waitlist-estimate-null
date: 2026-10-13
ux: skipped — maintenance run; render copy change is a work item, not a design stage
assumptions:
  - "Brief leaves the notifyPositionUpdate either/or open. Taken: WIRE it (deleting regresses #6493's intent and orphans its tests/interface), notifying only entries whose position improved, after the recalc in seat/cancel/expire paths. SMS-volume concern flagged for the blueprint gate — the Owner can flip this to delete before Implement."
  - "withLiveEstimates semantics: a null live estimate REPLACES the stored value (guest sees 'estimate unavailable'), rather than keeping a stale join-time number. The brief's 'null end to end, never 0' is read as covering the read path too."
  - "Stages ran inline (no per-stage subagent) under the run's $6.44 ceiling; artifacts remain the only inter-stage state."
---

# Architecture: nullable waitlist estimate, correct free-window, live position SMS

Scaled to blast radius: one service (`services/reservations`), three shared
packages, one UI surface. No new services, no new deps.

## Design

### 1. `estimatedWaitMinutes: number | null` end to end

The estimator already returns `number | null`; the fix removes every
coercion between it and the guest:

- **DB**: `prisma/schema.prisma:293` → `Int?`; migration
  `ALTER TABLE waitlist_entries ALTER COLUMN estimated_wait_minutes DROP NOT NULL`.
  Additive-nullable: existing rows keep their values; no backfill. The
  legacy rescale SQL (`waitlist.ts:87`) propagates NULL arithmetically —
  correct by accident, left alone (out of scope per defect.md).
- **Types/schemas**: `packages/types/src/waitlist.ts` +
  `schemas/waitlist.ts` field → `number | null` / zod `.nullable()`;
  reservations route JSON schemas (`public-waitlist.ts`, `waitlist.ts`
  routes) → `type: ["integer", "null"]`.
- **Service**: `waitlistService.create` drops `?? 0` (`waitlist.ts:106`)
  and stores the estimator's value as-is; `withLiveEstimates`
  (`waitlist.ts:132`) and the status GET (`public-waitlist.ts:189`) pass
  null through (replace, don't keep — see assumptions).
- **Render**: SMS copy (`packages/notifications/src/twilio-sms-adapter.ts:119`)
  and widget views (`apps/hospitality/src/components/booking-widget/
WaitlistConfirmationView.tsx`, `LiveWaitlistConfirmation.tsx`) render
  "estimate unavailable" (exact copy at Implement, matching existing
  widget voice) when null; never "0 min".

Rejected: sentinel `-1` (smuggles the same lie through every consumer);
keeping 0 (the defect); dropping the column for compute-only (join-time
estimate is part of the entry's record and the staff list sorts on it).

### 2. `freeInMs` window from `freeAt`, not now

`waitlist-estimate.ts`: compute `freeAt` first (current occupier's
`endTime`, else `now`), then a table is blocked iff an upcoming booking
starts inside `[freeAt, freeAt + duration)`:

```
freeAt  = current ? current.endTime : now
blocked = own.some(r => r.startTime >= freeAt && r.startTime < freeAt + duration)
return blocked ? null : freeAt - now
```

Pure-function change; the regression case is the issue's: now 19:00,
duration 90 m, occupied until 21:00, next booking 21:15 ⇒ blocked (15-min
gap), not "free in 120". Boundary: a booking starting exactly at `freeAt`
blocks (inclusive lower bound); at `freeAt + duration` does not.

### 3. Wire `notifyPositionUpdate`

`waitlist.ts`'s position-recalc path (the `$transaction` feeding
`recalculatePositions`, reached from seat/cancel/expire) returns the
entries whose position changed; callers then invoke
`waitlistNotifier.notifyPositionUpdate` for each entry whose position
**improved**, outside the transaction (notification failure never rolls
back seating — same fire-and-forget posture as `notifyAdded`). No schema
change; the notifier and its tests already exist.

## Decisions record

- Nullable estimate end to end (no ADR; recorded here) — one-way-ish door
  (public API field goes nullable; un-nulling needs backfill + consumer
  sweeps); sentinel / keep-0 / drop-column rejected above.
- Window fix and notifier wiring: one-line records here; reversible,
  unsurprising once stated — no ADR.

## Test ordering (drives Decompose)

New tests at the intended interface first, against today's code (RED):
estimator window case; create-with-no-fitting-table stores/returns null;
status GET surfaces null; SMS/widget render of null; position-improved
notification. Existing suites (`waitlist*.test.ts`, route tests, widget
tests) must stay green apart from assertions that pinned the defect
(e.g. `?? 0`).
