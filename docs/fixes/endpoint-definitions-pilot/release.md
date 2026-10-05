---
stage: ship
run: maintenance:endpoint-definitions-pilot
date: 2026-10-05
pr: 6060
merge-commit: 17b1edceb
assumptions:
  - "Release authorization is the autorun brief's (Matt, 2026-10-04). Conditions checked before merging: `reviewer` PASS 8/10 with its finding fixed, `CI Gate` check run SUCCESS on the final head `21e56cee5`, and no unfixed critical. Decided without live user input under that authorization."
  - "origin/main had moved (`2433bbdbd` → `b50540242`: #6055 reservation-transition-effects, #6059 docs). It was merged into the PR branch, not rebased, so the reviewed commits keep their SHAs. Git auto-resolved the one shared file (`services/reservations/src/routes/guests.ts`) with no conflict markers, so there was no manual resolution to make. The merged hunk was read and kept both intents."
  - "`deploy-static.yml` was dispatched by hand because its `push.paths` does not list `packages/api-client/**` or `packages/types/**`, and the hospitality bundle inlines both, including decision 1's new runtime validation. A dispatch sets marketing, hospitality and rialto-web all to deploy, so the other two sites redeploy from main's current state. This was accepted as the only CI-mediated way to redeploy hospitality, the same trade-off `maintenance:api-client-route-contract` recorded."
  - "The reservations service's OpenAPI document is not publicly reachable. On `api.mattbutlerengineering.com`, `/docs/json` answers with the users-api document ('MBE Users API', 7 paths), and every reservations-prefixed docs path probed returns 404. The decision-2 enum line is therefore proven by the committed `guests-openapi` snapshot (CI-green), not by a live probe. Logged as not verified live."
  - "The per-domain estimates in § Measured cost are derived by scaling the pilot's per-endpoint figures by each domain's endpoint count (defect.md / architecture.md counts). Route-file size and inline-object counts are measured today with `wc -l` / `grep -c` on origin/main. Estimates are labelled as estimates. The next-domain ordering in the backlog seed follows the cost table: domains that need no machinery extension come first, then the ones that do. It does not apply the brief's 'newest features first' preference, because feature age was not measured."
  - "Deferred review minors go to `docs/backlog.md` as seeds, appended at the end of the file. Producers append and never reorder, per the protocol."
---

# Release: declare each guests endpoint once (`maintenance:endpoint-definitions-pilot`, PR 3 #6060)

This run shipped in three squash merges. The first two were additive and are
already in production:

| PR    | Merge       | What                                                                                                                                                |
| ----- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| #6052 | `93b318192` | Endpoint-definition machinery: `defineEndpoint`, `toResponseJsonSchema`, `registerEndpoint`, `ApiClient.call`. Nothing used it yet.                 |
| #6056 | `2433bbdbd` | The guard: guests OpenAPI baseline + route-contract schema parity, with 10 `KNOWN_PARITY_GAPS` pinned                                               |
| #6060 | `17b1edceb` | **This release.** The 11 guests endpoints are each declared once in `@mbe/types`, and routes, client and TS types derive from them. Parity is `[]`. |

No version, tag or changeset. Every touched package is a private workspace
package, and nothing is published to npm.

## Pre-flight

- [x] **Verification green.** `verification.md` records 15 PASS, 0 FAIL, and 2
      pending items that belong to Ship. C16 (`CI Gate` on the final head) is
      closed below. C17 (the cost table) is closed by § Measured cost.
- [x] **Review gate.** `review.md` has no critical and no major finding. The
      `reviewer` subagent gave PASS 8/10, and its one minor (query-value
      coverage) was fixed in `8051c7b1d`. The drive-by edit was reverted in
      `b06bf63f3`. Four minors are deferred with reasons (see § Backlog seeds).
- [x] **Decision 2 accepted** (review.md § Decision-2 checkpoint). It is stated
      in the PR description, with the behaviour-change list:
  1. `getLapsing`/`sendWinBack` now validate their responses at runtime (decision 1).
  2. One OpenAPI documentation line: `enum` on `communicationPreference` in the lapsing response (decision 2).
  3. Path ids are now URL-encoded with `encodeURIComponent`. Bytes are identical for cuid/uuid ids.
- [x] **No secrets in the diff.** Gitleaks Secret Scan passed on the PR and on
      the main push (run 37275291896). No configuration or env var was added.
- [x] **Migrations/data.** None. No Prisma schema or migration file is in the diff.
- [x] **Rollback plan concrete** (below).
- [x] **Main moved, so it was merged in and every gate re-run.** `git fetch` showed
      origin/main at `b50540242`, two commits past the PR base `2433bbdbd`:
      #6055 and #6059. `git merge origin/main` → `21e56cee5`. Git auto-merged
      `services/reservations/src/routes/guests.ts`: #6055's one-line change
      (`scanLapsedGuests(venueId, (vid, guests) => fastify.reservationEvents.emitLapsingGuests(vid, guests))`)
      now sits inside the migrated `registerEndpoint` handler for `getLapsing`
      (line 262). There were no conflict markers, and both intents are kept.
      Re-verified on the merge commit:
  - `pnpm install --frozen-lockfile` passed. Then `pnpm build --filter @mbe/cli... --filter @mbe/types... --filter @mbe/api-client... --filter @mbe/service-bootstrap... --force` ran 11/11 tasks with 0 cached.
  - Root `pnpm typecheck`: 52/52. Root `pnpm lint`: 52/52.
  - Tests: `packages/types` 304, `packages/api-client` 314, `packages/service-bootstrap` 181, `tools/route-contract` 95, `services/reservations` 1767 passed / 150 skipped, `apps/hospitality` 2532. All pass.
  - `pnpm regen --check`: "All generated artifacts are up to date."
  - `node scripts/check-ai-antipatterns.mjs`: "All patterns within baseline."

## Rollback plan

PR 3 is the only release here that changes runtime code paths. PR 1 and PR 2
are additive (unused machinery plus tests) and can stay in place.

```bash
# from a clean checkout of main
git fetch origin && git checkout -b revert/endpoint-defs-pr3 origin/main
git revert --no-edit 17b1edceb          # the #6060 squash commit
pnpm build --filter @mbe/cli... && pnpm regen   # llms artifacts follow the revert
git push -u origin revert/endpoint-defs-pr3
gh pr create --title "revert: refactor(guests): declare each guests endpoint once (#6060)" --body "Rollback of #6060"
# merge on CI Gate green; deploy-services.yml runs on the push (services/reservations, packages/types paths)
gh workflow run deploy-static.yml --ref main    # hospitality bundle: api-client/types are not in its push.paths
```

The revert restores the KNOWN_PARITY_GAPS list and the hand-written client.
Both still pass against PR 2's guard, which was designed to be green either
way. #6055's `emitLapsingGuests` callback is in the squash's handler body, so
a revert conflict is possible if a later commit touches that handler. In that
case, keep the callback line.

## Release log

1. `git fetch origin` → origin/main `b50540242` (it had moved from `2433bbdbd`).
2. `git merge origin/main --no-edit` → `21e56cee5`, auto-merged with no conflicts. The guests.ts hunk was inspected (above).
3. Rebuild and full gate re-run → all green (Pre-flight).
4. `gh api -X PATCH …/pulls/6060 -F body=@…` → description now states the decision-2 ACCEPT, the behaviour-change list and the merge with main. The response body contained "ACCEPTED".
5. `git push origin refactor/endpoint-defs-pr3`. The pre-push hook (CLI build + `pnpm regen` + `regen --check`) ran for more than 5 minutes, so the command went to the background. **Hiccup:** the PostToolUse `verify-push-sha.sh` hook fired before the push finished and reported "remote is BEHIND local". That was a false alarm from the timing. The push then completed with exit 0 (`e88ce40ee..21e56cee5`), and `git ls-remote origin refactor/endpoint-defs-pr3` returned `21e56cee5`.
6. CI run **37274190657** (`pull_request`) → success. Check run `CI Gate` on `21e56cee5` → **success** (job 111650599137). `gh pr checks 6060` listed no check other than pass or skipping, and `mergeStateStatus` was `CLEAN`. origin/main was re-fetched and was still `b50540242`.
7. `gh pr ready 6060` → marked ready.
8. `gh pr merge 6060 --squash --subject "refactor(guests): declare each guests endpoint once (#6060)" --delete-branch` → **MERGED `17b1edceb`** at 2026-10-05T06:59:56Z. The local `--delete-branch` step printed `fatal: 'main' is already used by worktree …` because the local branch switch failed, a known worktree quirk. The remote branch was deleted (`git ls-remote` returned nothing). `git diff 21e56cee5 17b1edceb` is empty, so the squash tree equals the CI-verified head.
9. The push to main triggered Deploy Services (**37275291928**), CI (**37275291970**), Release (37275291923), Post-Merge Reconciliation (37275291921), ADR check (37275291885) and Secret Scan (37275291896, success).
10. `gh workflow run deploy-static.yml --ref main` → Deploy Static Sites **37275324439** (`workflow_dispatch`, head `17b1edceb`).

11. **Push CI 37275291970** → success, `CI Gate` success on `17b1edceb`. Every job was success or skipped, including Build, Test (Node 22), Integrity, RLS Integration and Validate Migrations.
12. **Deploy Services 37275291928** → success. Job-level conclusions were checked, because the circuit breaker can produce a green run that deployed nothing:
    - Circuit Breaker Check: success
    - Wait for CI: success
    - Deploy Blocked: skipped
    - **Deploy API Services: success** (07:14:25Z → 07:21:47Z)
    - Post-Deploy Verification: success
    - Report Deploy Health: success

    The job log shows `Notice: Deployment created` and DO deployment `4df92d54-b106-40b6-8b8c-511a01a83370` reaching Phase **ACTIVE**, Progress **21/21** (created 07:14:38Z, updated 07:21:37Z). That is a real deployment, not just a 200 from the old containers (MEMORY: prod health 200 ≠ deploy succeeded).

13. **Deploy Static Sites 37275324439** → success:
    - Deploy Hospitality: success
    - Deploy Rialto Web: success
    - Deploy Marketing: success
    - Post-Deploy Verification: success
    - Report Deploy Health: success
    - Rollback Failed Deploys: skipped
14. Visual Regression (hospitality) is advisory and has been red on main. It did not run on PR #6060: no check by that name appears in `gh pr checks 6060`, and the only visual check, `Visual Tolerance Change Check`, passed. Recorded only.

## Post-release checks

The live probes resolve through 1.1.1.1, not the LAN resolver (MEMORY: LAN DNS
sinkhole), using `dig +short @1.1.1.1 api.mattbutlerengineering.com` + `curl --resolve`.

**Before the deploy** (2026-10-05T07:01:07Z, IP 172.66.0.96, old containers):

- `GET /api/v1/guests?venueId=x` (no auth) → `HTTP/2 401`, `content-type: application/json; charset=utf-8`, `x-ratelimit-limit: 100`, `x-ratelimit-remaining: 99`, `x-ratelimit-reset: 60`, body `{"type":"about:blank","title":"Unauthorized","status":401,"detail":"Missing or invalid authorization header"}`.
- `GET /api/v1/guests/lapsing?venueId=x` → `401`, `x-ratelimit-limit: 100`.
- `GET /api/v1/reservations/health` → `200`.
- OpenAPI: `/docs/json` → 200, but it is the users-api document ("MBE Users API", 7 paths). `/api/v1/reservations/docs/json`, `/api/v1/reservations/documentation/json`, `/documentation/json` and `/api/v1/docs/json` → 404. The reservations OpenAPI is not public, so the decision-2 enum line cannot be checked live.

**After the deploy** (2026-10-05T07:22:53Z, IP 162.159.140.98, DO deployment `4df92d54` ACTIVE):

- `GET /api/v1/guests?venueId=x` (no auth) → `HTTP/2 401`, `content-type: application/json; charset=utf-8`, `x-ratelimit-limit: 100`, `x-ratelimit-remaining: 99`, `x-ratelimit-reset: 60`. The body is **byte-identical** to the pre-deploy body (`cmp` passed): the ADR-002 problem shape `{"type":"about:blank","title":"Unauthorized","status":401,"detail":"Missing or invalid authorization header"}`. The migrated `registerEndpoint` route keeps the auth preHandler and the global rate limiter.
- `GET /api/v1/guests/lapsing?venueId=x` → `401`, `x-ratelimit-limit: 100`. Same as before the deploy.
- `GET /api/v1/reservations/health` → `200`.
- **Hospitality bundle** (`https://mattbutlerengineering.com/hospitality/` → 200): chunk `assets/dist-D1KC4Aw7.js` contains the shipped definition `getLapsing:U({method:\`GET\`,path:\`${G}/lapsing\`,query:kn,responses:{200:{description:\`Lapsing guests list\`,body:s({data:m(nn)}…`. It also contains `interpolatePath`'s `e.replace(/:([A-Za-z0-9_]+)/g,(e,n)=>encodeURIComponent(String(t?.[n])))`. Both prove the new client (decision 1 validation, path encoding) is what users load.
- **Not verified live:** the decision-2 OpenAPI enum line. The reservations OpenAPI is not public (see the pre-deploy check). Its proof is the committed `services/reservations/src/routes/__snapshots__/guests-openapi.test.ts.snap`, which `CI Gate` exercised on `17b1edceb`.
- **Not verified live:** an authenticated guests request. No credentials are available to this session (the Auth0 E2E gap recorded by earlier runs). Coverage is the CI suites: reservations 1767 tests including the unmodified `guests.test.ts`/`guests-dietary.test.ts`, and route-contract parity `[]`.

## Measured cost (item 4.1)

### Pilot: guests domain (measured)

Copied from breakdown.md § Notes → "Measured cost". Every cell cites its command.

| Measure                                       | Guests (pilot)                                                                                                                                                                                                        | How measured                                       |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Endpoints migrated                            | 11                                                                                                                                                                                                                    | client methods ↔ routes                            |
| Parity gaps found by the PR 2 guard           | 10 (body 4, query 4, response 2). All were missing client declarations, with no wire drift.                                                                                                                           | `KNOWN_PARITY_GAPS` length                         |
| Route file LOC                                | 597 → 327 (329 after #6055's 2-line callback merged in)                                                                                                                                                               | `wc -l services/reservations/src/routes/guests.ts` |
| Client file LOC                               | 126 → 119                                                                                                                                                                                                             | `wc -l packages/api-client/src/guests.ts`          |
| Inline `type: "object"` literals              | 15 → 0                                                                                                                                                                                                                | `grep -c` on the route file                        |
| Hand TS types replaced by `z.infer`/`z.input` | 4 (`LapsingGuest`, `CreateGuestRequest`, `UpdateGuestRequest`, `FindOrCreateGuestRequest`)                                                                                                                            | count                                              |
| New Zod schemas                               | 2 entities (`LapsingGuestSchema`, `WinBackResultSchema`), 1 extracted (`CommunicationPreferenceSchema`), 1 params (`GuestIdParamsSchema`)                                                                             | count                                              |
| Definitions file                              | 166 lines (`packages/types/src/endpoints/guests.ts`)                                                                                                                                                                  | `wc -l`                                            |
| OpenAPI snapshot deltas                       | 1 property / 6 lines (decision 2)                                                                                                                                                                                     | PR 3 snapshot diff                                 |
| Tests deleted / added                         | Deleted 17 (`api-client/src/guests.test.ts`). Added 3 (`guest-schemas.test.ts`), 4 (`endpoints/guests.test.ts`) and 3 (`api-client/src/guests-query.test.ts`, added in Review). 1 `client-inventory` case re-pointed. | per file                                           |
| Behaviour decisions surfaced                  | 3: decision 1 runtime validation; decision 2 enum doc line; URL encoding for non-URL-safe input                                                                                                                       | named in Pre-flight                                |
| Route-literal ratchet                         | −10 (`hardcodedRoutes` 852 → 842)                                                                                                                                                                                     | `node scripts/check-ai-antipatterns.mjs`           |
| Agent effort, PR 3 migration                  | ~32 min wall-clock for 3.1–3.7 including gates (04:57:54Z → 05:29:48Z). Not counted: Verify, Review, Ship and two CI cycles. Tokens could not be measured separately inside a shared session.                         | timestamps                                         |

**Per-endpoint pilot ratios** used for the estimates below:

- ≈0.9 parity gaps per endpoint (10/11)
- ≈15 definition lines per endpoint (166/11)
- ≈2.9 min migration wall-clock per endpoint (32/11)
- ≈18 route LOC removed per inline `type: "object"` literal (270/15)

The last ratio overstates domains whose inline objects are small. Read it as an upper bound.

**One-time cost already paid** (PR 1 + PR 2, not repeated per domain):
`defineEndpoint`, `toResponseJsonSchema`, `registerEndpoint`, `ApiClient.call`
and the schema-parity guard. **Per later domain**, the work has PR 3's shape:

1. Add the domain to `PARITY_DOMAINS` and measure its gaps.
2. Write its definitions.
3. Migrate its routes and facade.
4. Delete its shallow client test last.

### Remaining 12 domains (estimated)

Route-file size and inline-object counts were measured on origin/main
`b50540242` with `wc -l` and `grep -c 'type: "object"'`. The other estimate
columns are endpoints × the pilot ratios above. Only the main route file per
domain is listed; satellite files (e.g. `modify-reservation.ts`) carry 0–2
inline objects each.

| Domain         | Endpoints | Main route file (LOC / inline objects, measured) | Est. definition lines | Est. parity gaps | Est. migration wall-clock | Extra cost beyond the pilot shape                                                                                                                                           |
| -------------- | --------: | ------------------------------------------------ | --------------------: | ---------------: | ------------------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| venues         |        12 | `reservations/routes/venues.ts` 906 / 17         |                  ~180 |              ~11 |                   ~35 min | Largest route file. Also needs a prefix decision (see the note below).                                                                                                      |
| reservations   |        11 | `reservations/routes/reservations.ts` 760 / 9    |                  ~165 |              ~10 |                   ~32 min | **Machinery extension:** `ApiClient.call` sends no per-call headers (manage-token Bearer, `x-session-id`). PR 1 reviewer edge case.                                         |
| availability   |        10 | `reservations/routes/availability.ts` 235 / 7    |                  ~150 |               ~9 |                   ~29 min | None found.                                                                                                                                                                 |
| floor-plans    |         8 | `reservations/routes/floor-plans.ts` 450 / 8     |                  ~120 |               ~7 |                   ~23 min | None found. Has real drift history (`setActive` / bulk-positions 404s, 2026-08-30), so it has the highest proof value per endpoint.                                         |
| tables         |         7 | `reservations/routes/tables.ts` 474 / 8          |                  ~105 |               ~6 |                   ~20 min | None found.                                                                                                                                                                 |
| users          |         7 | `users/routes/users.ts` 446 / 12                 |                  ~105 |               ~6 |        ~20 min + adoption | **Second service:** `registerEndpoint` adoption plus parity coverage in `services/users`. This is the first real second adapter.                                            |
| waitlist       |         7 | `reservations/routes/waitlist.ts` 363 / 13       |                  ~105 |               ~6 |                   ~20 min | None found.                                                                                                                                                                 |
| deposits       |         5 | `reservations/routes/deposits.ts` 374 / 29       |                   ~75 |               ~5 |                   ~15 min | Densest inline schemas (29). Payment paths need the `stripe-flow-reviewer` specialist. Check for 207 and `200: problem()` shapes, which the machinery rejects or miscounts. |
| public-venue   |         4 | `reservations/routes/public-venues.ts` 62 / 2    |                   ~60 |               ~4 |                   ~12 min | Unauthenticated routes. Keep `config.rateLimit` semantics identical (gotchas § Fastify / rate limiting).                                                                    |
| agent-sessions |         4 | `agent/routes/sessions.ts` 269 / 7               |                   ~60 |               ~4 |        ~12 min + adoption | **Third service**, with a `/v1` prefix and no `/api`. Needs `registerEndpoint` adoption in `services/agent`.                                                                |
| briefing       |         1 | `reservations/routes/briefing.ts` 63 / 1         |                   ~15 |               ~1 |                    ~3 min | None found.                                                                                                                                                                 |
| health         |         1 | `reservations/routes/health.ts` 15 / 0           |                   ~15 |               ~1 |                    ~3 min | Probably not worth migrating: there are no inline schemas to remove.                                                                                                        |
| **Total**      |    **77** |                                                  |            **~1,155** |          **~70** |  **~3.7 h + 2 adoptions** |                                                                                                                                                                             |

**Prefix-duplication note (applies to every domain).** Each domain's prefix is
stated twice: in the definition (`GUESTS_PREFIX = "/api/v1/guests"` in
`packages/types/src/endpoints/guests.ts`) and in the plugin mount
(`fastify.register(guestRoutes, { prefix: "/api/v1/guests" })` in
`services/reservations/src/app.ts`). A mismatch is loud, not silent:
`registerEndpoint`'s `relativeUrl` throws at boot, and route-contract fails.
Still, every migrated domain adds one more duplicate. Before or during the
next domain run, decide whether `app.ts` mounts from the exported prefix
constant. That change touches the route-literal ratchet. The users and agent
services raise the same question for their own mounts, and agent's `/v1`
prefix has no `/api` segment.

## Backlog seeds

Appended to `docs/backlog.md` (from `maintenance:endpoint-definitions-pilot`):

1. **Migrate the next domain**, in cost-table order: floor-plans → tables → waitlist → availability → venues → deposits → briefing → public-venue, then reservations (needs per-call headers in `ApiClient.call`), users (second service), agent-sessions (third service, `/v1`), and finally health (probably skip). One domain per run.
2. Surface the lapsing widget's query error. Under decision 1, a lapsing payload that fails validation renders an empty widget with nothing on screen (`HomePage.tsx:41` ignores `error`).
3. Mount each domain plugin from its exported prefix constant, which removes the prefix duplication.
4. Move the ambient `*?raw` module declaration (`packages/types/src/endpoints/raw-imports.d.ts`) under a test-only tsconfig `include`.
5. Harden the "imports Zod only" test: its `from "…"` regex misses side-effect and dynamic imports.
6. Extend the machinery for later-domain edge cases: per-call headers in `ApiClient.call`, 207 counted as 2xx, and `200: problem()` rejected at compile time rather than only at boot.

## Outcome

**Shipped, with two harmless hiccups:**

1. The push-verify hook reported a false "BEHIND" because the push was still in its pre-push hook. `git ls-remote` then confirmed `21e56cee5`.
2. The local `--delete-branch` step failed on the worktree's `main` checkout. The remote branch was deleted.

#6060 is squash-merged as `17b1edceb`. The reservations API was redeployed (DO `4df92d54` ACTIVE 21/21) and hospitality was redeployed by dispatch. The guests routes answer exactly as before, with byte-identical 401 problem body and rate-limit headers. The deployed client bundle carries the declared-once definitions. Breakdown items 3.8 and 4.1 are checked.

Next stage: Operate.
