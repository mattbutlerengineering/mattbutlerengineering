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

A `Proposer` has `propose({ nightId, at, event, state })` and returns zero or more suggestions: `{ kind: "reseat", reservationId, toTableId }` or `{ kind: "waitlist_offer", entryId, tableId }`. It is called after every event, in time order, with the state after that event. The shipped baseline is `neverSuggests`.

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

`neverSuggests` scores precision 1, recall 0: it fails the bar by design, so doing nothing is not a pass. A noisy proposer fails on the do-nothing nights (`quiet-night`, `held-table-trap`); a harmful one fails on `harmful`.

## Adding a night

Add a `Night` to `nights.ts` and to `NIGHTS`: an initial floor state, time-ordered events (minutes since open; table status changes must follow AVAILABLE -> OCCUPIED -> DIRTY -> READY -> AVAILABLE), and `goodMoves` with a window. Leave `goodMoves` empty for a night where silence is right. The test suite checks every good move is legal at the start of its window.
