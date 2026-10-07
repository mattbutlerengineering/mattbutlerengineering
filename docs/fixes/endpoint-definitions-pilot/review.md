---
stage: review
run: maintenance:endpoint-definitions-pilot
date: 2026-10-05
reviewed-head: fb9d2dc8e (review fixes on top: b06bf63f3, 8051c7b1d)
base: 2433bbdbd
pr: 6060
assumptions:
  - "Scale: maintenance refactor with re-entry architect; per the protocol's Run scale, Review scales to blast radius. PR 3 is the first PR to change runtime code paths (11 routes + 11 client methods), so it gets the full three passes; the PR 1/PR 2 machinery (already reviewed and merged in #6052/#6056) gets a light design pass only as exercised by the guests migration."
  - "No docs/standards.json exists in this repo (skill step 5: proceed); no finding cites a standards slug."
  - "Decision 2 verdict ACCEPT taken by the Review stage under the autorun dispatch's explicit checkpoint instruction (ACCEPT/REJECT with reasoning); reasoning recorded below. Matt can still reverse it — the fallback (`z.string()`) is one line plus a snapshot update."
  - "Drive-by `tools/route-contract/package.json` description re-escape (`\\u2014` → literal em dash): reverted per the dispatch rule 'revert if formatting noise unrelated to the change' (commit b06bf63f3). The pre-commit prettier pass left the escape intact, so the revert holds."
  - "Reviewer-gate minor (query-value coverage) fixed in Review rather than deferred: it took one test file, with no production code change."
  - "Non-critical findings that would widen PR 3's file set (app.ts, an ambient d.ts relocation) deferred to later domain runs rather than fixed here — skill default: minors may be deferred freely, with a reason."
---

# Review: declare an endpoint once — guests-domain pilot (PR 3, #6060)

## Scope

`git diff 2433bbdbd fb9d2dc8e` (merge base = origin/main at PR 2's squash
`2433bbdbd`), 9 commits, 20 files: `packages/types` (entity schemas,
`endpoints/guests.ts`, aliases, tests), `packages/api-client/src/guests.ts`
(facade) and the deleted `guests.test.ts`, `services/reservations/src/routes/guests.ts`
and its OpenAPI snapshot, `tools/route-contract` (gaps list deleted, driver
`finally`), regenerated llms artifacts, and run docs. Light design pass over
the merged machinery as used here: `defineEndpoint`, `registerEndpoint`
(`packages/service-bootstrap/src/register-endpoint.ts`), `ApiClient.call`
(`packages/api-client/src/client.ts:162-198`).

Checks run by this stage:

- Handler bodies: `git diff -w` of the route file filtered of schema/registration
  lines leaves only route generics, path strings and inline response objects —
  no handler-body line changed (11 handlers before, 11 after).
- preHandlers: whitespace-normalized extraction of every `preHandler: [...]`
  base vs head — identical apart from prettier's trailing comma on 4 arrays.
- `services/reservations/src/routes/guests.test.ts`, `guests-dietary.test.ts`:
  0 diff lines. No `eslint-disable`, `ts-ignore`, `ts-expect-error`, `.skip(` or
  `.only(` added anywhere in the diff.
- `node tools/cli/dist/index.js check-adr` → "No architectural violations detected."
- Callers of the facade outside hospitality: `services/agent/src/routes/gen-agent-tools.ts:63`
  (`guests.search({ venueId: venueId ?? "", query })`) — same query bytes before
  and after (`buildQueryString` keeps `venueId=`).

## Decision-2 checkpoint — verdict: ACCEPT

The one OpenAPI change: `enum: [email_only, sms_only, both, transactional_only]`
added under `/api/v1/guests/lapsing` → `get` → `200` →
`data.items.communicationPreference` (verification C8, 6 snapshot lines).

Reasoning:

1. **It documents what the wire already guarantees.** The value comes from
   `guest.communicationPreference` (`services/reservations/src/services/lapsed-guest-scan.ts:36`),
   a Prisma column typed by `enum CommunicationPreference { email_only sms_only both transactional_only }`
   (`services/reservations/prisma/schema.prisma:36-41,186`). The server cannot
   emit any other value, so the enum is a true statement, not a new constraint.
2. **The rest of the contract already says it.** `GuestSchema.communicationPreference`
   (the `Guest#` component every other guests operation returns) has carried this
   enum all along; the `LapsingGuest` TS type was already `CommunicationPreference`.
   Bare `type: "string"` on the lapsing route was the one place the three
   statements disagreed — the drift the run exists to remove (defect.md § Evidence).
3. **Wire bytes unchanged.** fast-json-stringify does not enforce `enum`; Fastify
   does not validate responses. No code generator consumes the document: no
   `openapi.json` is tracked, nothing in `.github/` or `turbo.json` runs
   `services/reservations`' `build:openapi` script, and the in-repo readers are
   swagger UI, route-contract's parity guard and the `guests-openapi` snapshot.
4. **The fallback costs more than it saves.** `z.string()` would keep
   `LapsingGuest` a hand interface (or widen it to `string`, breaking the
   widget's narrowing at `LapsingGuestsWidget.tsx:28`), re-creating a second
   statement of the shape in the pilot that is meant to prove one statement suffices.

Interaction with decision 1: with the enum, a hypothetical out-of-enum value
would now fail client validation (see the decision-1 finding below). Point 1
makes that unreachable without a Prisma migration, which would itself change
`GuestSchema` and be caught by the entity baselines.

## Findings

No critical findings. No major findings. Five minors (one fixed, four
deferred) plus one reverted drive-by.

### Minor: decision 1 turns a lapsing-payload mismatch into a silently empty widget (reported, not shown)

- Scenario: if the server ever returned a `/lapsing` row the schema rejects
  (e.g. a future nullable `name`), `ApiClient.request` raises `ApiValidationError`
  after calling `onError` (`client.ts:150-157`). Hospitality wires `onError` to
  `reportApiError` (`apps/hospitality/src/hooks/useApiClient.ts:14`, Sentry), the
  query hook surfaces an error, and `HomePage.tsx:41` destructures
  `data: lapsingGuests = []` without reading `error` — the widget renders empty
  with no on-screen message. Before PR 3 the same payload would have rendered
  (possibly wrong). For `sendWinBack` the mutation rejects and the user's click
  has no visible outcome beyond Sentry.
- Production risk today: none found. Every field is guaranteed by its source —
  `name`/`email`/`phone` from the guest row, enum from the Prisma enum, the three
  numbers from `detectLapse` which returns finite values for ≥3 visits
  (`lapse-detector.ts:21-45`), and the route's response schema (same 8 fields)
  strips extras before they reach the client. Response parity (`toEqual([])`)
  now fails CI if route and client schemas diverge, which is the drift that
  would cause this.
- Standard: none
- Decision: deferred — accepted behaviour of decision 1 (architecture § Decisions,
  "reversible per endpoint"); the 8 other guests methods have taken this path
  since before the run. Surfacing `error` on the lapsing widget is a UX change
  outside this refactor's scope.

### Minor: the guests prefix is stated twice (definition + app.ts mount)

- Scenario: `GUESTS_PREFIX = "/api/v1/guests"` (`packages/types/src/endpoints/guests.ts`)
  and `fastify.register(guestRoutes, { prefix: "/api/v1/guests" })`
  (`services/reservations/src/app.ts:248`). Changing one without the other is
  not silent: `registerEndpoint`'s `relativeUrl` throws at boot
  (`register-endpoint.ts:56-63`), and route-contract fails. So this is a
  residual duplicate statement, guarded loudly — not drift.
- Standard: none
- Decision: deferred — mounting from `GUESTS_PREFIX` touches `app.ts` and the
  route-literal ratchet; fold into the next domain run, where the same question
  arises for every domain prefix (record in release.md's per-domain notes).

### Minor: ambient `*?raw` module declaration lives in `packages/types/src`

- Scenario: `packages/types/src/endpoints/raw-imports.d.ts` is labelled
  test-only but sits in the package source, so it is in scope for the production
  compile too. A future non-test `import x from "./foo?raw"` in `@mbe/types`
  would typecheck and then fail at runtime under Node (no Vite). Nothing does
  that today.
- Standard: none
- Decision: deferred — no current failure; moving it under a test-only
  tsconfig `include` is a later-domain tidy-up.

### Minor: the "imports Zod only" test only sees `from "…"` specifiers

- Scenario: `endpoints/guests.test.ts`'s regex `from\s+"([^"]+)"` would miss a
  side-effect `import "fastify"` or a dynamic `import()`. The module graph is
  what keeps `@mbe/types` safe for the client bundle; today's file has only
  static `from` imports.
- Standard: none
- Decision: deferred — the api-client size-limit budget (unchanged 592/406/902 B)
  is the real backstop against a server import leaking into the bundle.

### Minor (reviewer gate): deleted tests that pinned query values had no replacement

- Scenario: commit `98dbf5862` claimed the deleted `api-client/src/guests.test.ts`
  query assertions moved to route-contract parity and tsc. Parity compares the
  definition's query schema with the route's (`tools/route-contract/src/route-contract.ts:247-251`),
  not the values the facade sends, and every `list`/`search` query key is
  optional, so `list` dropping `limit` or swapping `page`/`limit` passed
  typecheck, parity and the hospitality tests (which mock the facade). In
  production `useGuests.ts:29`'s `limit: 50` would silently become the
  server default of 10.
- Standard: none
- Decision: fixed — `packages/api-client/src/guests-query.test.ts` (3 cases:
  `list` with and without page/limit, `search` with all keys; pathnames read
  from `guestsEndpoints`, no route literal). RED: facade with `limit` and `query`
  dropped → 2/3 fail (`- "limit": "50"`, `- "query": "Bob"`). GREEN: restored
  facade → api-client 314/314; typecheck, lint clean; AI-antipattern ratchet within
  baseline. Commit `8051c7b1d`.

### Fixed in Review: drive-by `tools/route-contract/package.json` description edit

- Scenario: `—` → literal `—` in `description`. Value-identical, unrelated
  to the migration, noise in a reviewed diff.
- Standard: none
- Decision: fixed — reverted byte-for-byte to the merge base (`b06bf63f3`);
  `git diff 2433bbdbd HEAD -- tools/route-contract/package.json` is empty.

## Key questions from the dispatch

- **URL-encoding of path ids** — `interpolatePath` `encodeURIComponent`s each
  `:param`; queries go through `URLSearchParams`. For cuid ids and plain
  venue ids the bytes are identical to the old template strings. The only
  difference is for non-URL-safe input, where the new behaviour is the correct
  one (the old `/api/v1/guests/${id}` would have let `../` or `?` change the
  request target). Not a finding.
- **Fixture / test quality** — `guest-schemas.test.ts` pins both nullable fields
  and the enum rejection; `_typeLevelAssertions` is enforced by
  `tsconfig.test.json` (mutation-checked in PR 1). `endpoints/guests.test.ts`
  pins the 11-row pilot table, one-2xx, and problem-on-every-error. The
  `client-inventory.test.ts` case was correctly re-pointed from `getLapsing`
  (which now has a schema) to `delete` (body-less 204). The deleted
  `api-client/src/guests.test.ts` was verified to still pass against the new
  facade before deletion, and its coverage-moved claim was mutation-proven
  (breakdown Notes 3.7: body key → typecheck fails; path typo → route-contract
  fails twice).
- **ADR-002** — every guests error status is a `problem()` (test-enforced) and
  renders as `Error#` (`def-4`) in the snapshot on all 11 operations
  (verification C10). **ADR-007** — `/api/v1` prefix unchanged; `check-adr` clean.
- **Generated-artifact determinism** — PR 3 adds no `addSchema` and does not
  touch `services/reservations/src/schemas/`, so the positional `def-N` refs
  cannot renumber; the snapshot diff is exactly the decision-2 lines. llms
  artifacts regenerated in `67909654a` (`pnpm regen --check` clean per
  verification C15).

## Reviewer gate

Repo `reviewer` subagent on `2433bbdbd..fb9d2dc8e` against breakdown 3.1–3.7:
**PASS, score 8/10.** It rebuilt `@mbe/types`, `@mbe/api-client` and
`@mbe/service-bootstrap` with `--force`, ran route-contract 95/95, the new
`packages/types` guests tests 7/7 and the reservations guests + dietary + OpenAPI
tests 32/32, and got clean `tsc` for api-client, reservations and types. All seven
items met. It compared every handler body and preHandler array line by line
(verbatim apart from 4 reflows) and confirmed the three declared behaviour
changes are the only ones. It also noted one harmless extra: `list` query key
order is now fixed at `venueId, page, limit`. Score capped at 8 by one minor
`incomplete` finding (query-value coverage, see Findings) — fixed in Review.

## Passes with no findings

- **Correctness:** no defect with a failure scenario. Handlers and preHandlers
  moved verbatim; facade signatures and return types unchanged; query keys and
  bytes preserved for every in-repo caller.
- **Security:** no new input surface; request validation still Zod-derived at the
  route (same JSON schemas, snapshot-proven); path ids now encoded; no secrets;
  error envelopes unchanged.
- **Design:** matches architecture § Components and § Interfaces; the three
  minors above are residual duplication or test-strength notes, not contract
  decay.

## Verdict

**Ready to ship.** No unfixed critical; no major. The reviewer gate's
minor is fixed (`8051c7b1d`), the drive-by is reverted (`b06bf63f3`), and
four minors are deferred with reasons. Ship owns 3.8 (CI Gate on the final head,
PR description carrying the decision-2 checkpoint — now ACCEPTED — and the
behaviour-change list) and 4.1 (release.md cost table, with the prefix-duplication
note for later domains).
