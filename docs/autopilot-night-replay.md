# Autopilot night-replay eval harness

Nothing acts on its own before it is measured (`docs/ideas/2026-10-11.md` #2, `docs/ideas/2026-10-12.md` #4). This harness replays synthetic nights through a proposer and scores its suggestions. Issue #9490; the proposal engine is #9491.

Code: `services/reservations/src/autopilot/replay/`. It is pure: no database, no SSE, no network, no LLM calls.

## Run it

```bash
pnpm --dir services/reservations exec vitest run src/autopilot
```

It runs in CI with the rest of the reservations tests. A model-backed proposer (#9491) must be gated behind an explicit env flag (for example `AUTOPILOT_EVAL_ALLOW_MODEL=1`) that CI never sets; the default suite stays deterministic.

## Plugging in a proposer (#9491)

```ts
import { runHarness } from "./harness.js";
const report = runHarness(myProposer); // { nights, aggregate, passed }
```

The engine is `createProposalEngine()` in `../proposal-engine.ts`. A `Proposer` has `propose({ nightId, at, event, state })` and returns zero or more suggestions: `{ kind: "reseat", reservationId, toTableId }` or `{ kind: "waitlist_offer", entryId, tableId }`. It is called after every event, in time order, with the state after that event. The shipped baseline is `neverSuggests`.

## Scoring

Each suggestion is judged against the state it was made in:

- **Harmful**: illegal at that moment. Unknown or inactive table, a table that cannot move to `OCCUPIED` under the real table state machine (`tableMachine` in `table-state-machine.ts`, so only `AVAILABLE`), party size outside `minCovers`..`maxCovers ?? capacity`, a table held by another booked, arrived or seated reservation (double-booking), a reservation already seated or done, a waitlist entry not waiting.
- **True positive**: legal, equals a not-yet-claimed known-good move, and made inside that move's `[windowStart, windowEnd]`.
- **False positive**: legal but anything else: wrong move, outside the window, a duplicate, or any suggestion on a night with no good moves.
- **Missed**: a known-good move never claimed.

`precision = TP / (TP + FP + 5 * harmful)` (1 when nothing was suggested), `recall = TP / (TP + missed)` (1 when the night has no good moves), `f1` as usual. The aggregate sums counts across nights, then derives the metrics once.

## Pass bar

`PASS_BAR` in `pass-bar.ts`, on the aggregate over all nights:

| Metric    | Bar     |
| --------- | ------- |
| precision | >= 0.9  |
| recall    | >= 0.75 |
| harmful   | 0       |

Plus a per-night rule (`passesNightBar`): a night with no good moves must see **zero** suggestions, so a noisy proposer cannot hide in pooled counts. `HarnessReport.passed` needs both the pooled bar and every night's rule.

`neverSuggests` scores precision 1, recall 0: it fails the bar by design, so doing nothing is not a pass. A noisy proposer fails on the do-nothing nights (`quiet-night`, `held-table-trap`, `oversized-party`); a harmful one fails on `harmful`.

## Adding a night

Add a `Night` to `nights.ts` and to `NIGHTS`: an initial floor state, time-ordered events (minutes since open; table status changes must follow AVAILABLE -> OCCUPIED -> DIRTY -> READY -> AVAILABLE; `reservation_seated` moves its table to OCCUPIED, so the table must be AVAILABLE), and `goodMoves` with a window. Leave `goodMoves` empty for a night where silence is right. The test suite checks every good move is legal at the start of its window. A `windowStart` must equal an event time, since a proposer is only asked after events. Parties that join by `waitlist_joined` get `joinedAt` stamped with the event time.

The corpus has eight nights, including a best-fit choice between two legal tables (`best-fit-choice`), a legal move that is only good inside its window (`late-offer`), and scarce-table allocation (`scarce-big-table`: the only 6-top turns with a party of 4, a party of 2 and a party of 6 waiting; it must go to the party of 6, the 4-top later goes to the party of 4, and the party of 2 is offered neither).

## The proposal engine (#9491)

`services/reservations/src/autopilot/proposal-engine.ts`. Deterministic and rule-based (no model), built on the same legality rules as the scorer (`harmReason`, `tableBlocker`, `tableMachine`, party fit), so it cannot propose a harmful move. It suggests only; nothing is applied and there is no write path.

- Waitlist offers: the longest-waiting party first, each given the legal free table that wastes the fewest seats; one table per party. Lookahead: a table is held back from a party when taking it would leave fewer materially larger waiting parties (`MIN_LARGER_PARTY_GAP`, 2 or more seats) seatable from the remaining free tables (a small bipartite match, so chains such as a 2 / 5 / 6 on a 5-top and 6-top are covered). The big table goes to the party that needs it ("Seat the Garcias (6) at T1 — T1 is held back so larger waiting parties can all be seated"); everyone else is filled first-come-first-served. Every proposal is still filtered through `harmReason`.
- Reseats: a booked or arrived party moves to a smaller legal table when that frees the table a waiting party needs (and that party has no legal table of its own).
- At most `MAX_PROPOSALS` (3) per call, each with a short reason, for example "Seat the Garcias (6) at T2 — T2 is free and the best fit; they've waited 25 min".
- `proposeMoves(state, at)` is the pure function. `createProposalEngine()` is the harness `Proposer`; it is edge-triggered (a move already made is not repeated while it stays valid), so keep one instance per host session. **For #9492:** the side panel should render the pure `proposeMoves(state, at)` on every snapshot and track dismissals itself, because the edge-triggered `createProposalEngine` hides a still-valid move after its first emission, which would make a panel go blank while the move is still good.
- Latency budget: `PROPOSAL_LATENCY_BUDGET_MS = 50` (p95, 40 tables / 30 reservations / 10 waiting), pinned over 300 iterations in `proposal-engine.test.ts`. Measured around 1 ms per call.

## Live data mapping

`live-snapshot.ts` (`buildLiveSnapshot`) is a pure adapter from rows the services already return to the engine's input; #9492 reads the rows and calls it. It adds no endpoint.

| Harness phase | Real data                                                                                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `booked`      | `PENDING` or `CONFIRMED`, not seated, not marked arrived                                                                                                    |
| `arrived`     | as `booked`, and the id is in `arrivedReservationIds` (the database has no arrival state; the host stand supplies it)                                       |
| `seated`      | `PENDING` or `CONFIRMED`, the table is `OCCUPIED`, and `startTime` has passed (conservative: an overstaying party and the next booking both read as seated) |
| `done`        | `COMPLETED`, `CANCELLED` or `NO_SHOW`                                                                                                                       |

Table status maps one to one (`AVAILABLE`, `OCCUPIED`, `DIRTY`, `READY`). Waitlist: `waiting` is `waiting`; `notified` and `seated` are `seated` (already offered or placed); `expired` and `cancelled` are dropped. The snapshot clock is `at = 0` with `joinedAt = -minutesWaited`. Because any booked reservation holds its table, the engine never offers a table with a later booking tonight; that is deliberately safe, and loosening it is a separate change.
