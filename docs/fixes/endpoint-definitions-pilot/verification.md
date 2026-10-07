---
stage: verify
run: maintenance:endpoint-definitions-pilot
date: 2026-10-05
verified-head: 98dbf5862
base: 2433bbdbd
assumptions:
  - "Soft gate: breakdown items 3.8 (PR 3 gates/open/merge) and 4.1 (release.md cost table) are open by design — both belong to Ship. Skill default taken: verify the completed subset (M1, M2, 3.1–3.7) and record the gap."
  - "No prd.md (maintenance run). Criteria = defect.md target state 1–5 + breakdown acceptance criteria across PR 1–3 + autorun-brief constraints, per the autorun dispatch."
  - "origin/main advanced from the PR base 2433bbdbd to ad1cf6102 during Verify (#6059, docs-only: docs/backlog.md + docs/fixes/sse-event-catalog/release.md). Every 'vs origin/main' comparison below is taken against the merge base 2433bbdbd, which is what PR #6060 diffs against; the new main commit touches no file in this diff."
  - "Regression demo (maintenance-run centerpiece) = the pre-migration client restored verbatim from 2433bbdbd, plus one deliberately drifted body key — both named in the dispatch. Each was reverted and the dist rebuilt before the next check."
  - "CI Gate is reported for the verified head 98dbf5862 at time of writing. This verification.md commit moves the PR head, so CI re-runs on the new head; Ship must read CI Gate on the final head."
---

# Verification: declare an endpoint once — guests-domain pilot (PR 3, #6060)

## Summary

**15 PASS, 0 FAIL, 2 pending (Ship-owned: CI Gate on final head / 3.8, release.md
cost table / 4.1).** The guests domain is declared once in `@mbe/types`,
routes and client both derive from it, route-contract parity is `[]` over 11
compared endpoints, and the guard demonstrably fails when the pre-migration
client or a drifted body key is reintroduced. OpenAPI for the 11 guests
operations differs from the base by exactly the decision-2 `enum` property;
entity baselines are untouched; no runtime dependency was added.

Environment: fresh worktree on `refactor/endpoint-defs-pr3` @ `98dbf5862`.
`pnpm install --frozen-lockfile` → `Done in 4.4s`; `pnpm build --filter @mbe/cli...`
→ `6 successful, 6 total`; `pnpm build --filter @mbe/types --filter @mbe/api-client --force`
→ `2 successful, 2 total`, `Cached: 0 cached` (route-contract loads both from
`dist/`, so a forced rebuild rules out stale-dist false parity).

## Criteria & evidence

### C1 — Route-contract guests parity is `[]` (defect target 3; breakdown 3.5)

- Check: `pnpm --dir tools/route-contract exec vitest run src/route-contract.test.ts --reporter=verbose`; plus a temporary probe test (created, run, deleted — `git status` clean after) printing `schemaParityReport(report, PARITY_DOMAINS)`.
- Evidence:
  ```
  ✓ ... schema parity ... > compared something in every parity domain 5ms
  ✓ ... schema parity ... > has client↔route parity on every compared body, query and response 2ms
  Tests  7 passed (7)
  PROBE {"failures":[],"comparedPerDomain":{"guests":11}}
  ```
  `known-parity-gaps.ts` is deleted in the diff (`tools/route-contract/src/known-parity-gaps.ts | 29 -------`); the assertion is `expect(measured, …).toEqual([])` (`route-contract.test.ts:92`).
- Result: PASS

### C2 — Regression: the guard fails when the pre-migration client returns (maintenance centerpiece)

- Check: `git show 2433bbdbd:packages/api-client/src/guests.ts > packages/api-client/src/guests.ts`, force-rebuild `@mbe/api-client`, run `route-contract.test.ts`; then `git checkout -- packages/api-client/src/guests.ts`, rebuild, re-run.
- Evidence (restored old client):
  ```
  × has client↔route parity on every compared body, query and response 5ms
  AssertionError: guests.list  GET /api/v1/guests  [query] client declares no schema; the route registers one
  guests.search  GET /api/v1/guests/search  [query] client declares no schema; the route registers one
  guests.getSegments  GET /api/v1/guests/segments  [query] client declares no schema; the route registers one
  guests.create  POST /api/v1/guests  [body] client declares no schema; the route registers one
  guests.findOrCreate  POST /api/v1/guests/find-or-create  [body] client declares no schema; the route registers one
  guests.update  PATCH /api/v1/guests/route-contract-placeholder  [body] client declares no schema; the route registers one
  guests.addNote  POST /api/v1/guests/route-contract-placeholder/notes  [body] client declares no schema; the route registers one
  guests.getLapsing  GET /api/v1/guests/lapsing  [query] client declares no schema; the route registers one
  guests.getLapsing  GET /api/v1/guests/lapsing  [response] client declares no schema; the route registers one
  guests.sendWinBack  POST /api/v1/guests/route-contract-placeholder/win-back  [response] client declares no schema; the route registers one
  Tests  1 failed | 6 passed (7)
  ```
  The 10 failures are exactly PR 2's measured `KNOWN_PARITY_GAPS`. After restore + rebuild: `Tests  95 passed (95)`.
- Result: PASS

### C3 — Regression: a drifted request-body key fails the build

- Check: in the PR 3 facade, `addNote` body `{ text }` → `{ note: text }`; `pnpm --dir packages/api-client typecheck`; revert; rebuild.
- Evidence:
  ```
  -    return (await this.client.call(guestsEndpoints.addNote, { params: { id }, body: { text } }))
  +    return (await this.client.call(guestsEndpoints.addNote, { params: { id }, body: { note: text } }))
  src/guests.ts(102,87): error TS2353: Object literal may only specify known properties, and 'note' does not exist in type '{ text: string; }'.
   ELIFECYCLE  Command failed with exit code 2.
  restored
  ```
- Result: PASS

### C4 — One Zod definition drives route schema, client method and TS types (defect target 1; breakdown 3.1, 3.2)

- Check: static inspection of `packages/types/src/endpoints/guests.ts` and the two consumers; `packages/types` tests (cover the 11-pair test, the "imports Zod only" test and the `z.infer` type assertions).
- Evidence:
  ```
  32:export const GUESTS_PREFIX = "/api/v1/guests";
  11:import { z } from "zod";
  12:import { defineEndpoint, problem } from "./define.js";
  13:import { paginatedResponseSchema } from "../schemas/common.js";
  packages/types: Test Files  15 passed (15)   Tests  304 passed (304)
  ```
  `services/reservations/src/routes/guests.ts`: `registerEndpoint` occurrences = 12 (import + 11 routes).
- Result: PASS

### C5 — Guests routes migrated; inline schemas and route generics gone (defect target 2; breakdown 3.3)

- Check: `grep -cE 'type: "object"|createListResponseSchema|fastify\.(get|post|patch|delete)<' services/reservations/src/routes/guests.ts`.
- Evidence:
  ```
  0
  ```
  (base: 15 inline `type: "object"` literals per breakdown Notes; file 597 → 327 lines, diff `558 +++----`).
- Result: PASS

### C6 — Client facade holds no URL literal, no method string, no hand-picked schema (breakdown 3.4)

- Check: `grep -nE '"/api|`/api|"(GET|POST|PATCH|DELETE)"|Schema\b' packages/api-client/src/guests.ts`.
- Evidence:
  ```
  9:  FindOrCreateGuestBodySchema,
  14:export type FindOrCreateGuestRequest = z.input<typeof FindOrCreateGuestBodySchema>;
  ```
  The only schema reference is type-level (`z.input`), as the item specifies. No URL or method literal.
- Result: PASS

### C7 — `guests.test.ts` and `guests-dietary.test.ts` unchanged and green (breakdown 3.3)

- Check: `git diff --stat 2433bbdbd HEAD -- services/reservations/src/routes/guests.test.ts services/reservations/src/routes/guests-dietary.test.ts`; then run them with the OpenAPI and schema-baseline tests.
- Evidence:
  ```
  (diff --stat: no output)
  ✓ src/schemas/schemas.test.ts (22 tests) 10ms
  ✓ src/routes/guests-openapi.test.ts (2 tests) 484ms
  ✓ src/routes/guests-dietary.test.ts (5 tests) 1318ms
  ✓ src/routes/guests.test.ts (25 tests) 5127ms
  Test Files  4 passed (4)
  Tests  54 passed (54)
  ```
- Result: PASS

### C8 — OpenAPI output unchanged except the decision-2 line (brief constraint; breakdown 3.6)

- Check: `git diff 2433bbdbd HEAD -- services/reservations/src/routes/__snapshots__/guests-openapi.test.ts.snap`.
- Evidence (entire diff):
  ```
  @@ -326,6 +326,12 @@ exports[`guests OpenAPI baseline > matches the recorded swagger paths for the gu
                             "type": "number",
                           },
                           "communicationPreference": {
  +                          "enum": [
  +                            "email_only",
  +                            "sms_only",
  +                            "both",
  +                            "transactional_only",
  +                          ],
                             "type": "string",
                           },
  ```
  Exactly the recorded decision-2 property (`getLapsingGuests` → 200 → `data.items.communicationPreference`). Documentation-only; wire bytes unchanged. **Reviewer checkpoint stands** (breakdown 3.1) — the PR description must call it out.
- Result: PASS

### C9 — Entity baselines unchanged (breakdown 1.2, 3.1, 3.6)

- Check: `git diff --stat 2433bbdbd HEAD -- services/reservations/src/schemas/`.
- Evidence:
  ```
  (no output)
  ```
  Covers `schema-baseline.json` and `schemas/__snapshots__/schemas.test.ts.snap`; `schemas.test.ts` 22/22 green (C7).
- Result: PASS

### C10 — ADR-002 RFC 7807 envelope preserved

- Check: count `Error#` component refs (`def-4`) in the guests OpenAPI snapshot, head vs base.
- Evidence:
  ```
  head: 18
  base: 18
  ```
- Result: PASS

### C11 — `/api/v1` prefix unchanged (ADR-007)

- Check: `grep` the registration and the definition prefix; `app.ts` is not in the PR diff.
- Evidence:
  ```
  services/reservations/src/app.ts:248:  await fastify.register(guestRoutes, { prefix: "/api/v1/guests" });
  packages/types/src/endpoints/guests.ts:32:export const GUESTS_PREFIX = "/api/v1/guests";
  ```
- Result: PASS

### C12 — No new runtime dependency; rest of api-client untouched (brief constraint)

- Check: `git diff --stat 2433bbdbd HEAD` and `git diff 2433bbdbd HEAD -- '**/package.json' package.json pnpm-lock.yaml`.
- Evidence: 24 files changed. In `packages/api-client/src` only `guests.ts` and `guests.test.ts` (deleted) appear. `pnpm-lock.yaml` has no diff. The only `package.json` change:
  ```
  -  "description": "... Nothing imports this package — it only runs in CI.",
  +  "description": "... Nothing imports this package — it only runs in CI.",
  ```
  (`tools/route-contract/package.json` — same JSON string value, `—` escape rewritten to a literal em-dash; no dependency field touched. See Flags.)
- Result: PASS

### C13 — Affected package tests green (breakdown gates)

- Check: `pnpm --dir <pkg> test` for each touched/consuming package.
- Evidence:
  ```
  packages/types           Test Files 15 passed (15)   Tests 304 passed (304)              exit=0
  packages/api-client      Test Files 18 passed (18)   Tests 311 passed (311)              exit=0
  packages/service-bootstrap Test Files 13 passed (13) Tests 181 passed (181)              exit=0
  tools/route-contract     Test Files 8 passed (8)     Tests 95 passed (95)                exit=0
  services/reservations    Test Files 110 passed | 4 skipped (114)
                           Tests 1739 passed | 16 expected fail | 150 skipped (1905)   exit=0
  apps/hospitality         Test Files 181 passed (181) Tests 2532 passed (2532)            exit=0
  ```
  `packages/api-client` 311 = 328 − 17 deleted shallow tests (breakdown 3.7).
- Result: PASS

### C14 — Repo-wide typecheck and lint (breakdown gates; Vitest does not typecheck)

- Check: root `pnpm typecheck`, root `pnpm lint`.
- Evidence:
  ```
  Tasks:    52 successful, 52 total
  tc_exit=0
  Tasks:    52 successful, 52 total
  lint_exit=0
  ```
- Result: PASS

### C15 — Generated artifacts current

- Check: `pnpm regen --check`.
- Evidence:
  ```
  All generated artifacts are up to date.
  regen_exit=0
  ```
- Result: PASS

### C16 — `CI Gate` green on the final head (breakdown 3.8) — PENDING

- Check: `gh pr view 6060`, `gh pr checks 6060`, check-runs API for `98dbf5862`.
- Evidence:
  ```
  {"headRefOid":"98dbf58625e05825ab09865b60a4c296a9852858","isDraft":true,"mergeStateStatus":"UNKNOWN","state":"OPEN"}
  Build          pending  .../actions/runs/37270011893/job/111635746764
  Test (Node 22) pending  .../actions/runs/37270011893/job/111635746703
  (check-runs API: no `CI Gate` check run on 98dbf5862 yet)
  ```
  Not dispatched (a CI run exists and is in progress). This commit moves the head; Ship re-reads `CI Gate` on the final head.
- Result: PENDING (Ship)

### C17 — Measured per-endpoint cost recorded in `release.md` (defect target 4; breakdown 4.1) — PENDING

- Check: data present in `breakdown.md` § Notes → "Measured cost (item 4.1 data)"; `release.md` is Ship's artifact and does not exist yet.
- Result: PENDING (Ship transcribes)

## Failures

None.

## Not verified

- **Full reservations OpenAPI document diff vs base.** Only the 11 guests operations are snapshotted (`guests-openapi.test.ts`). Non-guests operations are evidenced indirectly: no other route file, no `app.ts`, and no `schemas/` file appears in the diff, and entity baselines are byte-identical. A whole-document `app.swagger()` diff against a base build was not run.
- **Route-side drift demo.** Routes now derive their schema from the same definition the client uses, so a route-only body drift cannot be produced without reverting a route to a hand-written schema; that case was not exercised.
- **Runtime behaviour of decision 1** (`getLapsing` / `sendWinBack` now validating responses) against production payloads — covered only by unit tests in `client.test.ts` and response parity; no live probe (no deploy in this stage).
- **Non-URL-safe id encoding** (behaviour change 3) — covered by PR 1's `call` unit tests; not re-exercised here.
- **`apps/hospitality` bundle size delta vs main** — not measured (breakdown Notes already record `size:check` within budget, delta unmeasured).

## Flags

- `tools/route-contract/package.json` carries a drive-by change (`—` → `—` in `description`), almost certainly from the formatting hook; value-identical, no dependency impact. Ship/Review may keep or revert it.
- Test counts differ from the breakdown's PR 3 gate notes (`packages/types` 304 vs 299, `apps/hospitality` 2532 vs 2523); all pass. Recorded so a reader does not mistake the figures for the Notes' numbers.
