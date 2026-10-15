---
stage: capture
run: maintenance:waitlist-estimate-null
date: 2026-10-13
re-entry: architect
intake: "#6580"
assumptions:
  - "Autorun brief answered the capture interview; no live user input. Brief gaps logged per artifact."
  - "Work-already-in-flight check COULD NOT RUN: this worktree has no GitHub credential (no gh, no tracker tools permitted). Verified instead that no docs/fixes run directory claims this defect and no local branch carries a fix; the conductor owns PR-level dedup for batch b20261014."
---

# Defect: waitlist "no estimate" collapses to 0 min; blocking window measured from now; position-update SMS dead

Residual of #6493 (closed by #6556). #6556 moved waitlist estimates to
on-read turnover math but left three defects. All evidence below re-verified
against this worktree (HEAD `46e759ff9`, which contains #6556 = `a57113bf3`).

## Defect

Three observed-vs-expected gaps in `services/reservations`:

1. **"No estimate" is stored and rendered as 0 minutes.** When the turnover
   estimator returns null (no fitting table, no tables, or every fitting
   table blocked), `waitlistService.create` coerces it: `(...)(position,
partySize) ?? 0` (`src/services/waitlist.ts:106`). The join response
   (`src/routes/public-waitlist.ts:123`) and the "added" SMS
   (`src/services/twilio-sms-adapter.ts:119`) then tell the guest
   "est. 0 min wait". `withLiveEstimates` keeps the stored value when the
   estimator returns null (`waitlist.ts:132`), and the public status GET
   does the same (`public-waitlist.ts:189`) — so "0 min" persists for the
   life of the entry. Expected: null end to end, rendered "estimate
   unavailable", never 0.

2. **Estimator's blocking window is measured from now, not from when the
   table frees.** `src/services/waitlist-estimate.ts:35-37`:
   `startTime > now && startTime < now + duration`. With now 19:00,
   duration 90 min, a table occupied until 21:00 and its next booking at
   21:15, the table is "not blocked" (21:15 ≥ 20:30) and counted free in
   120 min although only a 15-min gap exists. Expected window:
   `[freeAt, freeAt + duration)`.

3. **`notifyPositionUpdate` is dead code.** Defined and returned
   (`src/services/waitlist-notifier.ts:118`, `:179`) with its own unit
   tests, but zero production callers (grep: only the definition, the
   interface at `:76`, the return at `:179`, and test mocks).
   seat/cancel/markNotified recalc positions but never notify — the #6493
   evidence line is still true. Expected: wired after position
   recalculation, or deleted.

## Reproduction / Evidence

Verified in this worktree 2026-10-13:

- `waitlist.ts:106` — `: ((await loadEstimator(venueId, new Date()))(position, partySize) ?? 0);`
- `waitlist.ts:132` — `return minutes === null ? entry : { ...entry, estimatedWaitMinutes: minutes };`
- `waitlist-estimate.ts:35-37` — `blockedByUpcoming` compares `r.startTime` against `(now, now + durationMs)`.
- `public-waitlist.ts:123` / `:189` — join response and status GET surface `estimatedWaitMinutes` unchanged.
- `prisma/schema.prisma:293` — `estimatedWaitMinutes Int @map("estimated_wait_minutes")` (NOT NULL — null cannot currently be stored).
- `notifyPositionUpdate` grep — no caller outside tests.

RED tests to write first (per issue #6580, at the intended interface,
against today's code):

- occupied-until-21:00 table with a 21:15 booking (duration 90 min, now
  19:00) ⇒ NOT counted free at 120 min;
- no fitting table ⇒ join returns null estimate (not 0), SMS and status
  render "estimate unavailable".

## Root-cause hypothesis

Hypothesis, not a finding: #6556 made the estimator honestly return
`number | null` but stopped at the service boundary — the storage column,
API schema, and SMS copy still assume a number, so `?? 0` was used to
bridge the type gap; and `freeInMs` checks "is a booking inside my dining
window starting now" (a seat-now question) where the estimator needs "is
there a booking inside the window starting when the table frees".

## Blast radius

Guest-facing, worst on busy nights: every venue whose waitlist fills while
no table fits shows guests "0 min wait" at join (web widget + SMS) and for
the life of the entry on the public status page. Misleading but not
data-corrupting; no money path. Since #6556 merged (2026-10-13). The dead
notifier means guests never learn their position changed — a silent
feature gap since #6493. Fix touches: estimator (pure function), waitlist
service, Prisma schema (column → nullable), public routes/schemas, SMS
adapter, hospitality widget render — one service plus one UI surface.

## Ruled out

- Estimator math itself returning 0 for "no table": `estimateWaitFromTurnover`
  already returns null (`waitlist-estimate.ts:59`) — the collapse happens at
  the call sites, not in the estimator.
- None else yet; no dead ends walked.

## Notes

Out of scope for this run (noted in #6580, candidates for seeds at
Operate): `waitlist.ts:87` legacy rescale SQL (`estimated/position ×
newPosition`) now meaningless on fallback paths; `slot-rules.ts:82` throws
on `durationRules: []` without `defaultReservationDuration` (predates
#6556, reached by every waitlist read).

Run stops after Decompose (`stop-after: decompose` in autorun-brief.md) —
blueprint gate for conductor batch b20261014; Implement onward is
dispatched separately. Reserved ids for this item: ADR 88, WO 1-5.
