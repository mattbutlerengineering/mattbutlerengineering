---
stage: decompose
run: feature:package-consolidation
date: 2026-10-18
assumptions:
  - "Work items are seeded one-to-one from issues #7098-#7106, as the autorun brief opts in; tracking issue #7107 is not an item. Each issue's own acceptance criteria are carried, then extended with the Architect's corrections."
  - "Milestones follow the approved plan: M1 is the independent group A, M2 and M3 are the serial chain, M4 is #7102 last. Chain order #7103 -> #7104 -> #7105 -> #7106 is kept even though only #7104 truly shares files with #7103; it is the issues' declared order."
  - "Group A items have no blocking edges, but the Owner merges one PR at a time because every PR changes pnpm-lock.yaml and runs CI cold (tracking issue #7107); no ordering within M1 is imposed."
  - "#7102's external gate (the other session's fix/localization-conditional-literals PR merging) is recorded as a Blocked by condition, not an item. The architecture notes that PR did not exist when it was written; Implement must re-check before starting."
  - "Test-first is marked on #7102 and #7105 (brief constraint). #7100 and #7101 also move or keep tests before deleting the old package, per their issues."
  - "Tracker mirror: issues already exist, so no export step ran. Item lines end with (tracker: #N)."
---

# Breakdown: Consolidate `packages/` from 20 to 14

Progress lives in the checkboxes below — Implement checks items off as their
acceptance criteria are met. One item = one PR off `origin/main`, in its own
worktree, starting with `pnpm install --frozen-lockfile`. Stage files by
explicit path. Every item changes `pnpm-lock.yaml`, so each CI run is cold (a
marginal-timeout failure in an unrelated suite is that, not the change); merge
one PR at a time and re-run `pnpm graph && pnpm generate:dep-graph` and
`pnpm regen` on each merge result.

Common acceptance criteria for every item (not repeated below): `pnpm install
--frozen-lockfile` succeeds after the lockfile update; `pnpm build --filter
@mbe/cli... && pnpm regen --check` is clean; `pnpm lint && pnpm typecheck &&
pnpm test` pass; the removed package's `llms.txt`/`llms-full.txt` entries are
gone from `scripts/regen-manifest.mjs`, its codecov path is gone from `ci.yml`
(~line 692, if present), and `infrastructure/worker/dep-graph.json` plus
`docs/architecture/dependency-graph.md` are regenerated.

Order: M1 (any order) -> M2 (#7103 then #7104) -> M3 (#7105 then #7106) -> M4
(#7102, after the external gate).

## Milestone 1: Dead packages gone and test helpers co-located (group A, independent, any order)

Demonstrable: 4 fewer packages-or-names (mcp-server, supply-chain-scanner,
agent-test-utils removed; test-fixtures renamed), nothing else changed.

- [x] **Delete @mbe/mcp-server and the `mbe mcp` command** — remove `packages/mcp-server/`, `tools/cli/src/commands/mcp.ts` and its test, the `mcp` loader in `tools/cli/src/command-loaders.ts:23`, the CLAUDE.md CLI-table row, the `scripts/dep-graph-discovery.mjs:45` allowlist entry, and the false `mbe-infra` claims in `docs/security/threat-model.md:109` and `docs/ai-tooling-audit.md:51`. (tracker: #7098) — merged `a46734c53`
  - Files: as listed above, plus the common regen/lockfile/codecov files.
  - Accept: `git grep -n "mcp-server\|mbe-infra" -- ':!*.md' ':!*llms*' ':!CHANGELOG*'` returns nothing outside history docs; `node tools/cli/dist/index.js mcp` exits `unknown command`; `git grep -n "@mbe/mcp-server" -- ':!*llms*' ':!CHANGELOG*'` returns nothing.
  - Verify: `pnpm build --filter @mbe/cli... && node tools/cli/dist/index.js mcp; echo "exit=$?"`; `pnpm repo-audit`; `pnpm turbo typecheck test --filter=...[origin/main]`.
  - Blocked by: —
- [x] **Delete @mbe/supply-chain-scanner** — remove `packages/supply-chain-scanner/` (incl. `fixtures/`), the `scripts/dep-graph-discovery.mjs:46` allowlist entry and the `knip.jsonc:8` fixtures ignore. (tracker: #7099) — merged `e556c13be`
  - Accept: `git grep -n "supply-chain-scanner\|mbe-scan" -- ':!*llms*' ':!CHANGELOG*' ':!docs/features/**'` returns nothing.
  - Verify: `pnpm repo-audit`; `pnpm turbo typecheck test --filter=...[origin/main]`.
  - Blocked by: —
- [x] **Fold @mbe/agent-test-utils into @mbe/agent-core as a ./testing subpath** — move `createMockQueryStream`, `buildBugFixFixture`, `calculateCost` (and what they transitively need) plus their tests to `packages/agent-core/src/testing/`, add the `./testing` export (shape: `packages/observability/package.json`'s `./build-info`), repoint the 8 importers (5 agent-core tests, 3 services/agent tests), drop both devDependencies, delete the package and its dead modules. (tracker: #7100) — merged `e9ca789c6`
  - Test-first: the moved helper tests are in place and green at `@mbe/agent-core/testing` before `packages/agent-test-utils/` is deleted.
  - Accept: `git grep -n "@mbe/agent-test-utils" -- ':!*llms*' ':!CHANGELOG*'` returns nothing; `./testing` is not re-exported from agent-core's root `index.ts` (test helpers cannot reach the production bundle); the agent-core <-> agent-test-utils cycle is gone.
  - Verify: `pnpm --dir packages/agent-core test && pnpm --dir packages/agent-core typecheck`; `pnpm --dir services/agent exec vitest run src/routes/orchestrate.test.ts src/services/storage-event-mapper.test.ts`.
  - Blocked by: —
- [x] **Split @mbe/test-fixtures: inline factories into services, rename the rest to @mbe/ui-quality-capture** — inline the factory bodies the two shims re-export into `services/reservations/src/test/mocks.ts` and `services/users/src/test/fixtures.ts` (remove the "re-exports for backwards compatibility" header), rename `packages/test-fixtures/` to `packages/ui-quality-capture/` (`@mbe/ui-quality-capture`, capture helper only, factories and their tests deleted), repoint the 4 e2e imports (`apps/hospitality/e2e/ui-quality.capture.ts:17`, `apps/marketing/e2e/ui-quality.capture.ts:13`, `apps/marketing/e2e/visual.spec.ts:34`, `apps/rialto-web/e2e/ui-quality.capture.ts:13`), and rename/remove the dependency in the 5 consumer `package.json` files. (tracker: #7101) — merged `34a68fc82`
  - Accept: services/users and services/reservations suites pass with unchanged test counts; `git grep -n "@mbe/test-fixtures" -- ':!*llms*' ':!CHANGELOG*'` returns nothing; e2e files typecheck (`tsconfig.e2e.json` per app).
  - Verify: `pnpm --dir services/users test && pnpm --dir services/reservations test`; `pnpm --dir apps/marketing typecheck && pnpm --dir apps/rialto-web typecheck && pnpm --dir apps/hospitality typecheck`.
  - Blocked by: —

## Milestone 2: Reservations owns its jobs and notifications (serial)

Demonstrable: `@mbe/jobs` and `@mbe/notifications` no longer exist; reservations
builds and tests as before; `services/reservations` no longer imports
`@mbe/api-client`. ADR-019's in-process JobWorker is unchanged.

- [x] **Move @mbe/jobs into services/reservations and drop unused job types** — move `packages/jobs/src/*` and tests to `services/reservations/src/jobs/` (layout: follow `src/transitions/`), repoint every importer (`git grep -l @mbe/jobs services/reservations`), delete job types with zero uses (`PRE_ARRIVAL_BRIEFING`, `LAPSED_GUEST_SCAN` and their payload types), add `bullmq`/`ioredis` as direct dependencies if missing, remove the `packages/jobs` COPY/build lines from `services/reservations/Dockerfile` (lines 25, 46, 63, 76, 108, 125), update the comment at `packages/agent-core/src/worktree-reaper.ts:12`. The `createReservationJobWorker` double-wrap (`services/job-worker.ts:172-178`) is left alone unless trivially collapsible; note it in the PR. (tracker: #7103) — merged `22f91d1a8`
  - Accept: reservations suite passes with the same test count plus the moved jobs tests; `git grep -n "@mbe/jobs" -- ':!*llms*' ':!CHANGELOG*' ':!docs/**'` returns nothing; `docker build -f services/reservations/Dockerfile .` succeeds or `scripts/__tests__/dockerfile-pnpm-patches.test.mjs` passes.
  - Verify: `pnpm --dir services/reservations test && pnpm --dir services/reservations typecheck`; `pnpm --dir scripts exec vitest run __tests__/dockerfile-pnpm-patches.test.mjs`.
  - Blocked by: —
- [x] **Move @mbe/notifications into services/reservations; stop importing api-client for retry** — move `packages/notifications/src/*` and tests to `services/reservations/src/notifications/`, repoint importers (`app.ts:3`, `notifications.ts:6`, `transitions/adapters/dispatcher-messaging.ts:1`, `services/{job-worker,waitlist-notifier,win-back,notifier-runtime,post-visit-notifier}.ts`, `test/effects-harness.ts:38`), replace the `retry` import from `@mbe/api-client` (`twilio-sms-adapter.ts:1`) with a local equivalent (prefer local over a subpath), move the provider SDK dependencies directly into reservations, and remove the `packages/notifications` lines from the reservations Dockerfile (24, 45, 62, 75, 107, 124). (tracker: #7104) — merged `63ebdef3f`
  - Accept: reservations suite passes (count = before + moved notifications tests); `git grep -n "@mbe/notifications" -- ':!*llms*' ':!CHANGELOG*' ':!docs/**'` returns nothing; `services/reservations` has no runtime `@mbe/api-client` import and no such dependency (if retry was its only use); patches test passes.
  - Verify: `pnpm --dir services/reservations test && pnpm --dir services/reservations typecheck`; `pnpm --dir scripts exec vitest run __tests__/dockerfile-pnpm-patches.test.mjs`.
  - Blocked by: Move @mbe/jobs into services/reservations and drop unused job types (shares the reservations Dockerfile and `services/job-worker.ts`)

## Milestone 3: One JWKS module, observability folded into service-bootstrap (serial)

Demonstrable: the Auth0 JWKS rule exists once; `@mbe/observability` is gone;
`/health` and `/ready` behave exactly as before (ADR-009).

- [x] **Unify the duplicated Auth0 JWKS readiness check in one module** — create `packages/observability/src/auth0-jwks.ts` owning the dev-tenant constant (once), `buildJwksUrl` (moved from `readiness.ts`; `validate-startup-config.ts` keeps re-exporting it as public `@mbe/service-bootstrap` API), the unconfigured message, `resolveJwksUrl(explicit?)` (explicit, then `AUTH0_JWKS_URL`, then `buildJwksUrl(AUTH_AUTHORITY)`, then dev tenant; `null` when unconfigured in production; reads `process.env` per call) and `probeJwks(url, { timeoutMs, fetchFn })` (never throws; returns `ok`, `http`, `timeout` or `network` plus latency; clears its timer in `finally`). `health.ts` `checkAuth0` and `readiness.ts` `registerStandardChecks` become thin adapters that KEEP their own policy: `/health` no retry, `Auth0 JWKS returned <N>` and `Auth0 JWKS unreachable ...` messages, `fetchFn` thunk over `globalThis.fetch` resolved per call; `/ready` one retry after 50 ms, `JWKS returned <N>` and the raw error message, URL resolved once at registration. Type `StandardChecksOptions.prisma` as `Pick<PrismaLike, "$queryRaw">` via `import type` from `@mbe/database` and drop observability's own `PrismaLike` export. (tracker: #7105) — merged `d60a2b7f1`
  - Test-first: before any dedupe, add interface-level tests with `createServiceApp` and an injected fetch: `/ready` JWKS reachable -> ready, unreachable -> 503 not ready; `/health` Auth0 `ok` and `degraded` bodies (follow the tests beside `packages/service-bootstrap/src/readiness-routes.ts`). Run them RED/GREEN against the old code first, then keep them green, unedited, through the change.
  - Accept: `git grep -n "dev-ytbgmz5ls3wh4xdx" packages | wc -l` is 1; the new tests were written before the dedupe and are green after, without edits; `PrismaLike` is defined once; `/health` and `/ready` messages and retry behaviour are byte-identical to before; `pnpm typecheck` passes across all 3 services.
  - Verify: `pnpm --dir packages/service-bootstrap test && pnpm --dir packages/observability test`; `for s in agent users reservations; do pnpm --dir services/$s typecheck || break; done`.
  - Blocked by: Move @mbe/notifications into services/reservations; stop importing api-client for retry
- [x] **Fold @mbe/observability into @mbe/service-bootstrap** — move `packages/observability/src/*` (including `auth0-jwks.ts`, unchanged) to `packages/service-bootstrap/src/observability/`, repoint `create-service-app.ts:15`, `health-routes.ts:4`, `readiness-routes.ts:4-5`, `validate-startup-config.ts:15`, `start-service-server.ts:43` (keep the dynamic `import()` of telemetry: OTel must initialise first); move `build-info` and `redactSignal` into `@mbe/sentry` as internal modules (`packages/sentry/src/{config,react,node}.ts`) so sentry depends on nothing from service-bootstrap or observability (avoids a sentry <-> service-bootstrap cycle); delete the 0-caller exports (`getRequestId`, `logWithRequestId`); drop `@mbe/observability` from the 3 services' `package.json` and all `packages/observability` COPY/build lines from the 3 Dockerfiles; update `knip.jsonc:98-125` entries and comment. (tracker: #7106) — merged `47b422d4d`
  - Accept: `git grep -n "@mbe/observability" -- ':!*llms*' ':!CHANGELOG*' ':!docs/**'` returns nothing; the `/health` and `/ready` tests from the previous item pass unedited; all 3 services' suites pass and all 3 Docker builds pass (patches test); apps using `@mbe/sentry/react` typecheck and build.
  - Verify: `pnpm --dir packages/service-bootstrap test && pnpm --dir packages/sentry test`; `for s in agent users reservations; do pnpm --dir services/$s typecheck || break; done`; `pnpm --dir scripts exec vitest run __tests__/dockerfile-pnpm-patches.test.mjs`.
  - Blocked by: Unify the duplicated Auth0 JWKS readiness check in one module

## Milestone 4: Rialto no longer depends on a private package (last)

Demonstrable: `ChatPanel` is usable from a registry install of rialto; rialto
has zero `@mbe/*` imports.

- [x] **Cut rialto's dependency on @mbe/api-client: ChatPanel takes an injected stream adapter** — add a REQUIRED `stream: ChatStreamFn` prop to `ChatPanel` and `useChatStream` options; rialto defines and exports `ChatStreamRequest { url: string; body: unknown; headers?: Record<string,string>; signal?: AbortSignal }` and `ChatStreamFn = (request) => AsyncIterable<unknown>` itself (from `ChatPanel/index.ts` and the rialto root) and imports no api-client type, not even type-only (it would leak into the emitted `.d.ts`). `useChatStream` holds `stream` in a ref like `getAccessToken` (no `setState` inside an effect). Pass `streamNDJSON` from `@mbe/api-client/streaming` at BOTH callers: `apps/hospitality/src/pages/ChatPage.tsx` and `apps/hospitality/src/components/DashboardLayout.tsx:420` (the issue body names only the first). Remove: the `@mbe/api-client` devDependency, the vitest alias (`packages/rialto/vitest.config.ts:29-33`), the a11y fixture skip (`src/test/accessibility/component-fixtures.tsx:825`; render ChatPanel with an in-memory adapter), the `/^@mbe\/api-client/` entry in `scripts/lib-external.ts`. Switch `ChatPanel.stories.tsx`, `ChatPanel.test.tsx` and `useChatStream.test.ts` from `vi.mock("@mbe/api-client/streaming")` to an in-memory adapter passed as the prop. Update `packages/rialto/README.md:24-34` (ChatPanel now usable from npm; document the prop). Add `.changeset/<name>.md` with `@mattbutlerengineering/rialto: minor`. `apps/rialto-web` and `apps/gen` keep their api-client prebuild steps (still imported by themselves; out of scope). (tracker: #7102) — merged `02dc74217`
  - Test-first: add a ChatPanel/useChatStream test driving an in-memory stream adapter through the new prop interface (messages, elements, actions, tool status, denial, `AbortError` silent stop, other error sets `error` and enables `retry()`) before removing the import.
  - Accept: `git grep -n "@mbe/api-client" packages/rialto` returns nothing; `packages/rialto/scripts/lib-external.test.ts` is flipped from "finds at least one @mbe/* import" to asserting ZERO `@mbe/*` imports in lib source; `pnpm --dir packages/rialto build` succeeds with no `@mbe/*` in `rollupOptions.external` and `grep -R "@mbe/api-client" packages/rialto/dist | wc -l` is 0; `node scripts/check-changeset-tree.mjs` passes; the ChatPanel a11y fixture is no longer skipped and passes; both hospitality callers typecheck; the other session's message key at `useChatStream.ts:139` is preserved after rebase; the `rialto-prop-drift-detector` subagent reviews the PR.
  - Verify: `pnpm --dir packages/rialto build`; `pnpm --dir packages/rialto exec vitest run src/components/ChatPanel scripts/lib-external.test.ts`; `pnpm --dir apps/hospitality typecheck`.
  - Blocked by: external gate, not an item: the other session's `fix/localization-conditional-literals` PR (edits `ChatPanel/useChatStream.ts:139`) must be merged first; rebase onto it before starting. Also sequenced after Fold @mbe/observability into @mbe/service-bootstrap by the approved plan (ordering only, no file overlap).

## Design gaps found

none.

## Notes

- 2026-10-18 (backlog seed, NOT in scope): when `AUTH0_JWKS_URL` and `AUTH_AUTHORITY` are both set and differ, `/health` probes `AUTH0_JWKS_URL` while `/ready` probes `AUTH_AUTHORITY` (`readiness-routes.ts:74` pre-resolves the authority and passes it as `auth0Url`, which outranks the env var). #7105 preserves this on purpose; changing either side is a behaviour change. Seed it in `docs/backlog.md` at Review.
- 2026-10-18: #7102's issue body lists one ChatPanel caller; there are two (see its item). The Architect's corrections are appended to issues #7102 and #7105 as comments/body sections and are reflected above.
- 2026-10-18: the issues' `Depends on: none` for #7102 is superseded by the sequencing above.
