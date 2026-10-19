---
stage: prd
run: feature:package-consolidation
date: 2026-10-18
ux: not-applicable
ux-reason: Internal monorepo refactor with no user-facing surface; the ChatPanel stream prop is a developer API, not a UX surface (autorun brief).
assumptions:
  - "The brief says `ux: not-required`; the protocol's vocabulary is `required | not-applicable`, so this PRD records `not-applicable` with the brief's rationale as `ux-reason:`."
  - "Actors, stories and success criteria are taken from the autorun brief and issues #7098–#7106 with no live interview (autorun PRD stage)."
  - "The 20 → 14 count is the deepen review's arithmetic: six packages leave (mcp-server, supply-chain-scanner, agent-test-utils, jobs, notifications, observability) and test-fixtures is renamed to ui-quality-capture, not removed. Re-measured: `ls packages | wc -l` = 20 at this branch's base."
---

# PRD: Consolidate `packages/` from 20 to 14

## Problem statement

`packages/` holds 20 workspace packages, and several cost upkeep without earning it. Two (`mcp-server`, `supply-chain-scanner`) have no callers, yet agent loops still spend budget fixing them (#6491, #6608). Five serve exactly one caller (`observability`, `jobs`, `notifications`, `agent-test-utils`, and the `test-fixtures` factories). Published `rialto` imports private `@mbe/api-client`, so `ChatPanel` cannot be used from npm and the edge is propped up by 3 guard scripts and 2 gotchas entries. The Auth0 JWKS readiness check exists twice. Each extra package adds llms regen, Docker `COPY` lines, turbo cache keys, knip ignores and dep-graph allowlist entries that the Owner and every agent session must maintain and read around.

## Solution

After the run, `packages/` holds 14 packages, and each one earns its place. The dead packages are gone. Single-caller code lives with its caller: test helpers in `@mbe/agent-core/testing`, factories in the services that use them, the jobs and notifications code in `services/reservations`, and observability in `@mbe/service-bootstrap`. The Playwright capture helper keeps a package of its own (`@mbe/ui-quality-capture`). `ChatPanel` receives its stream function from the caller, so rialto has no private dependency. The JWKS readiness check lives in one module. Runtime behaviour, the `/health` and `/ready` contracts (ADR-009) and the in-process JobWorker (ADR-019) are all unchanged.

## Actors

- **Owner** — Matt, who maintains the monorepo, merges the PRs and watches prod.
- **Agent session** — any Claude Code session or scheduled loop (implement-queue, mbe-feature-drain, audits) that navigates, builds or fixes code in the monorepo.
- **Rialto npm consumer** — a developer who installs `@mattbutlerengineering/rialto` from the registry.

## User stories

1. As an Owner, I want packages with no callers deleted, so that no agent budget or CI time goes to code nothing runs. (#7098, #7099)
2. As an agent session, I want single-caller code to live beside its caller, so that I find, change and test it in one place without cross-package regen, Docker and dep-graph upkeep. (#7100, #7101, #7103, #7104, #7106)
3. As a rialto npm consumer, I want `ChatPanel` to take its stream function as a prop, so that it resolves and works from the registry without a private package. (#7102)
4. As an Owner, I want the Auth0 JWKS readiness check defined once, so that a tenant change is a one-line edit that cannot leave the two copies disagreeing. (#7105)
5. As an Owner, I want every move to keep runtime behaviour and the deployed services unchanged, so that the consolidation carries no production risk I have to watch for.

## Success criteria

- [ ] `ls packages | wc -l` prints 14 once all nine work items have merged.
- [ ] Every acceptance criterion in issues #7098–#7106 holds on its PR.
- [ ] `git grep` finds no reference to `@mbe/mcp-server`, `@mbe/supply-chain-scanner`, `@mbe/agent-test-utils`, `@mbe/test-fixtures`, `@mbe/jobs`, `@mbe/notifications` or `@mbe/observability` outside CHANGELOG and llms files (and outside `docs/**` where an issue's own grep allows it).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass on `main` after the final merge.
- [ ] `pnpm regen --check` is clean on `main` after the final merge.
- [ ] The Docker builds for all 3 services (agent, users, reservations) pass, or `scripts/__tests__/dockerfile-pnpm-patches.test.mjs` passes where an issue names it as the stand-in.
- [ ] `CI Gate` is green on every work-item PR before merge.
- [ ] `git grep -n "@mbe/api-client" packages/rialto` returns nothing, and rialto's changeset for the new `ChatPanel` prop is `minor`. The public API only grows: no existing export or prop is removed or renamed.
- [ ] No behaviour change: the `/health` and `/ready` tests written first in #7105 pass unchanged through #7106, and each moved suite keeps its test count (before + moved tests).
- [ ] After the final merge, the `Deploy API Services` job (not just the workflow) of `Deploy Services` concludes success, `/api/v1/users/health` and the readiness endpoints answer healthy on all 3 services, and Sentry shows no new issues from agent-api, users-api or reservations-api since the first merge.

## Out of scope

- Splitting agent-core's review policy out of the package.
- Moving `rialto-plugin`.
- The endpoint-DSL decision, a generic `createDatabase`, the `@mbe/config/prettier` export and the `@mbe/auth` root barrel (all listed under "not in this batch" in #7107).
- Any runtime behaviour change, including any change to the ADR-009 or ADR-019 contracts.
- Publishing rialto by hand. The run adds a changeset, and the Release workflow publishes.
- The other session's localization work on `useChatStream.ts` and its PRs #7078, #7095 and #7096.

## Open questions

- Should `ChatPanel`'s stream prop be optional (with a default that keeps today's behaviour for in-tree callers) or required? "Additive only" argues for optional, but a default would need a stream implementation inside rialto. — Architect, against the brief's constraint that rialto's public API only grows.
- Where should the unified JWKS readiness module live before #7106 folds observability into service-bootstrap? — Architect (#7105, #7106).
- #7102 is sequenced after the other session's localization PR on `useChatStream.ts` merges. If that PR stalls, does #7102 wait or go last? — Owner, at Implement time.
