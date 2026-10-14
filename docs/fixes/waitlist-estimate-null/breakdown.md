---
stage: decompose
run: maintenance:waitlist-estimate-null
date: 2026-10-13
assumptions:
  - "Five work orders from the reserved block WO-1..WO-5, one PR for the set (blast radius is one coherent contract change; splitting the nullable type across PRs would leave main red between them). The conductor may still dispatch WOs as separate Worker steps on this branch."
  - "Tracker: no issue creation or mirroring — the brief says the conductor owns tracker state. Intake #6580 is recorded in defect.md and closes at Ship, outside this run (stop-after: decompose)."
  - "WO-5 (wire notifyPositionUpdate) carries the architecture's flagged assumption; the Owner can veto it to 'delete' at the blueprint gate without touching WO-1..WO-4."
---

# Breakdown: nullable waitlist estimate, correct free-window, position SMS

Progress lives in the checkboxes — Implement checks items off as acceptance
criteria are met. Order is dependency order; WO-1 is independent of WO-2..4.
TDD per item: the RED test named in Accept is written and seen failing
before the code moves.

## Milestone (one PR): `fix(waitlist): null estimates stay null; free-window from freeAt; position SMS` — Closes #6580

- [ ] **WO-1: `freeInMs` window from `freeAt`** — compute `freeAt` (current
      occupier's `endTime`, else `now`) first; blocked iff an upcoming
      occupying booking starts in `[freeAt, freeAt + duration)`; return
      `freeAt - now`.
  - Accept: RED first in `waitlist-estimate.test.ts`: now 19:00, duration
    90 m, table occupied until 21:00, next booking 21:15 ⇒ estimator does
    NOT count it free at 120 (blocked ⇒ null when it is the only table).
    Boundary pins: booking at exactly `freeAt` blocks; at
    `freeAt + duration` does not. Existing estimator tests green.
  - Files: `services/reservations/src/services/waitlist-estimate.ts` (+test).
  - Blocked by: —
- [ ] **WO-2: nullable column + types/schemas** — `schema.prisma:293`
      → `Int?` with migration `DROP NOT NULL` on
      `waitlist_entries.estimated_wait_minutes`; `packages/types`
      waitlist type + zod schema `.nullable()`; reservations route JSON
      response schemas → `type: ["integer", "null"]`.
  - Accept: RED first: a type-level or schema test asserting null is
    accepted (zod parse + route serialization of a null estimate).
    Migration is additive-nullable only (no data rewrite);
    `pnpm --dir services/reservations typecheck` green.
  - Files: `services/reservations/prisma/schema.prisma` + new migration,
    `packages/types/src/waitlist.ts`,
    `packages/types/src/schemas/waitlist.ts`, route schemas in
    `services/reservations/src/routes/{waitlist,public-waitlist}.ts`.
  - Blocked by: —
- [ ] **WO-3: service stores and serves null** — drop `?? 0` in
      `waitlistService.create` (`waitlist.ts:106`); `withLiveEstimates`
      replaces the stored value with the live result INCLUDING null
      (`waitlist.ts:132`); status GET passes it through
      (`public-waitlist.ts:189`).
  - Accept: RED first in `waitlist.test.ts` / `public-waitlist.test.ts`:
    no fitting table ⇒ create persists null and join response carries
    `estimatedWaitMinutes: null` (not 0); status GET returns null when the
    live estimator returns null even if a number is stored.
  - Files: `services/reservations/src/services/waitlist.ts`,
    `services/reservations/src/routes/public-waitlist.ts` (+tests).
  - Blocked by: WO-2
- [ ] **WO-4: render null as "estimate unavailable"** — SMS "added" copy
      (`packages/notifications/src/twilio-sms-adapter.ts:119`) and widget
      views (`WaitlistConfirmationView.tsx`, `LiveWaitlistConfirmation.tsx`)
      render the unavailable copy on null; never "0 min"/"est. 0 min wait".
  - Accept: RED first: adapter test asserting the null-estimate SMS body;
    widget tests asserting the null render in both views. Copy matches
    existing widget voice; no view renders "0 min" for null.
  - Files: `packages/notifications/src/twilio-sms-adapter.ts` (+test),
    `apps/hospitality/src/components/booking-widget/
WaitlistConfirmationView.tsx`, `LiveWaitlistConfirmation.tsx` (+tests).
  - Blocked by: WO-2 (nullable type reaches consumers)
- [ ] **WO-5: wire `notifyPositionUpdate`** — position-recalc path in
      `waitlist.ts` surfaces entries whose position improved; seat/cancel/
      expire callers invoke `waitlistNotifier.notifyPositionUpdate` for
      each, fire-and-forget outside the transaction (same posture as
      `notifyAdded`).
  - Accept: RED first: seating entry #1 notifies waiting entries whose
    position improved, exactly once each; a notifier failure does not fail
    the seat/cancel request; no notification when position is unchanged.
    `notifyPositionUpdate` gains ≥1 production caller (grep), or — Owner
    veto at the gate — is deleted along with interface/tests.
  - Files: `services/reservations/src/services/waitlist.ts`,
    `src/routes/waitlist.ts` callers (+tests).
  - Blocked by: —
- [ ] **Gate: suites + typecheck green, PR opened** — `pnpm --dir
    services/reservations test` + `typecheck`, `pnpm --dir
    packages/types test`, `pnpm --dir packages/notifications test`,
      hospitality widget tests; then PR per the repo's local-ci-precheck
      hook; conductor owns review/merge.
  - Accept: all named suites green; PR body carries `Closes #6580`,
    WO-1..WO-5 ids, and the Merge danger section (door: one-way-ish —
    public API field goes nullable, per ADR-088; blast radius: waitlist
    join/status consumers and SMS copy).
  - Blocked by: WO-1, WO-2, WO-3, WO-4, WO-5

## Notes

- Out of scope (defect.md Notes): `waitlist.ts:87` rescale SQL,
  `slot-rules.ts:82` empty-`durationRules` throw — seed at Operate.
- Run stops here per `stop-after: decompose` (blueprint gate,
  conductor batch b20261014). Verify remains mandatory when the run
  resumes at Implement.
