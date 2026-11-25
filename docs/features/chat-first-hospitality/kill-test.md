# Chat-first onboarding: kill test

Source: #9381 (plan), #9473 (spike), #9476 (cost). Route: `POST /api/gen/onboarding` (`services/agent/src/routes/gen-onboarding.ts`).

## Rule

Ten location and timezone phrasings run through the route on the `locationTime` step with the cheap model (`gen-provider.ts` default). A phrasing is **wrong** if the proposed `ianaTimezone` is not the expected zone (or a zone with identical rules), or the tool call is rejected by the tool's validation or by `applyOnboardingPatch`. **More than 2 wrong or rejected in 10 kills the idea** at the cheap model's price. A turn that asks one short follow-up instead of guessing counts as correct only for the "Central time please" and "Montreal" style phrasings that are genuinely ambiguous (marked below), never for a plain city.

The phrasings and expected patches live in `services/agent/src/routes/gen-onboarding-kill-test.fixture.ts`; a unit test pins that every expected patch passes the tool's validation.

## Live result: pending

The live-model run needs a model key and could not run in the implementing sandbox. To run it: start the agent service with `ANTHROPIC_API_KEY`, POST each phrasing with `{ "messages": [{ "role": "user", "content": "<phrasing>" }], "step": "locationTime", "draft": { "ianaTimezone": "", "currencyCode": "" } }`, read the `onboarding_patch` line from the ndjson, and fill the table.

| #   | Phrasing                             | Expected `ianaTimezone` | Expected `currencyCode` | Proposed patch | Outcome |
| --- | ------------------------------------ | ----------------------- | ----------------------- | -------------- | ------- |
| 1   | We're in Lisbon                      | Europe/Lisbon           | EUR                     | pending        | pending |
| 2   | Pacific time, Seattle                | America/Los_Angeles     | USD                     | pending        | pending |
| 3   | Our restaurant is in Toronto         | America/Toronto         | CAD                     | pending        | pending |
| 4   | Mexico City, we bill in pesos        | America/Mexico_City     | MXN                     | pending        | pending |
| 5   | London, UK                           | Europe/London           | GBP                     | pending        | pending |
| 6   | Central time please (ambiguous)      | America/Chicago         | USD                     | pending        | pending |
| 7   | Sydney, Australia                    | Australia/Sydney        | AUD                     | pending        | pending |
| 8   | Montreal, prices in Canadian dollars | America/Toronto         | CAD                     | pending        | pending |
| 9   | We are in Paris                      | Europe/Paris            | EUR                     | pending        | pending |
| 10  | Honolulu, Hawaii                     | Pacific/Honolulu        | USD                     | pending        | pending |

Wrong or rejected: pending of 10. Decision: pending.

## Route design (answers #9473's "smallest route design")

- **Unscoped route, not a client-only tool.** `POST /api/gen/onboarding` takes no `venueId`. The model call has to run server-side (the key is server-side); only the tool is client-applied.
- **Auth:** same `requireAuth` as every gen route, plus the per-identity rate limit and the aggregate daily spend ceiling. The caller is any signed-in user, so identity is the only key available before a venue exists: the cost ceiling is keyed by user id.
- **No write, no network in the tool.** `propose_onboarding_patch` only validates shape and returns the patch; the server holds no onboarding state. The client applies it through `applyOnboardingPatch`, which re-validates with the step's own validator.

## Cost (#9476)

- Ceiling: **$0.05 per user over a 24 h onboarding window**, override with `GEN_ONBOARDING_CEILING_USD`. At the cheap model that is roughly ten or more turns. Past it the route answers HTTP 200 with one line `{"type":"onboarding_ceiling","fallback":"form","ceilingUsd":0.05}`; the client continues with the plain form, no error toast.
- Each request reserves one worst-case turn (the output cap's cost) at preflight and settles to the real cost when the run finishes, fails or aborts, so parallel requests from a user at $0 cannot all pass. A request that dies before the run starts (for example a tool-setup throw) leaves its reservation held until the 24 h window ends.
- State is in process memory, so with N instances one user can spend up to N times the ceiling; the aggregate `GEN_DAILY_CEILING_USD` still bounds the total.
- Each turn logs two lines, both with `userId`:
  - `gen-onboarding cost log` (`logGenCost`: tokens, cache, duration)
  - `gen-onboarding spend` (`costMicroUsd` for that turn)

### Cost per completed onboarding

Cost per onboarding is the sum of `costMicroUsd` per user. An onboarding is completed when that user's venue is created at Launch; join on user id:

```text
# 1. total spend per user (log pipeline of choice; shown as jq over exported JSON lines)
jq -s '[ .[] | select(.msg == "gen-onboarding spend") ]
       | group_by(.userId)
       | map({ userId: .[0].userId, usd: (map(.costMicroUsd) | add) / 1e6 })' agent.log > spend.json

# 2. keep users that completed onboarding (venue created by that user), then average
jq --slurpfile done completed-user-ids.json \
   '[ .[] | select(.userId as $u | $done[0] | index($u)) ] | (map(.usd) | add) / length' spend.json
```

Cost per started onboarding is the same average without step 2. `completed-user-ids.json` is the list of owner ids from venues created in the window (the source of that list depends on what Launch records; confirm when the mount issue lands).
