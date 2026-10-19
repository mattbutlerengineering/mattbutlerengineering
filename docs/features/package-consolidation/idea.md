---
stage: idea
run: feature:package-consolidation
date: 2026-10-18
origin: "/idea-to-prod:deepen review of packages/ at origin/main 949d8ecd7; tracking #7107, work items #7098–#7106"
assumptions: []
---

# Idea: Consolidate `packages/` from 20 to 14

## Problem

`packages/` holds 20 workspace packages, and several of them cost upkeep without returning anything:

- **Two have zero callers.** `mcp-server` and `supply-chain-scanner` are imported by nothing, yet the scanner still drew agent fix PRs #6491 and #6608 this week.
- **Five serve exactly one caller.** `observability` is used only by `service-bootstrap` and `sentry`. `jobs` and `notifications` are used only by `services/reservations`. `agent-test-utils` covers 8 test files with 3 helpers. The `test-fixtures` factories are reached only through 2 shims.
- **Published `rialto` imports private `@mbe/api-client`.** That edge has so far cost 3 guard scripts and 2 gotchas entries, and `ChatPanel` cannot be used from npm.
- **The Auth0 JWKS readiness check exists twice**, in `service-bootstrap/src/health.ts:3` and `observability/src/readiness.ts:96`.

From the sufferer's side, every package is another thing to regenerate, build, cache, allowlist and explain, whether it earns its place or not.

## Who has it

The Owner (Matt) and every agent session that works in the monorepo. Today they work around the extra packages with:

- Dockerfile `COPY` lines;
- `regen-manifest` entries;
- knip ignores;
- dep-graph allowlist entries, some of which carry false comments;
- build-freshness guards.

## Why now

The 2026-10-18 deepen review has just measured the problem. The agent loops keep spending budget on dead packages (#6491 and #6608 this week), and each extra package adds llms regen, Docker build steps and turbo cache keys to every run.

## Evidence

The evidence is measured, not anecdotal. Call sites were counted in the deepen review against origin/main `949d8ecd7`. The key claims were re-verified by grep:

- the importers of `observability`;
- the duplicated JWKS URL;
- `jobs` having only reservations as a consumer;
- the agent-core dead modules, which only their own tests reference.

Per-package detail is in the bodies of issues #7098–#7106.

## Solution hunch

Work through issues #7098–#7106 as written:

- delete `mcp-server` and `supply-chain-scanner`;
- fold `agent-test-utils` into `agent-core/testing`;
- split `test-fixtures` into service-local factories plus `@mbe/ui-quality-capture`;
- inject the stream function into `ChatPanel`, so rialto stops importing `@mbe/api-client`;
- move `jobs` and `notifications` into reservations;
- unify the JWKS check;
- fold `observability` into `service-bootstrap`.

Code moves without changing any contract. ADR-009 (the /health vs /ready split) and ADR-019 (the in-process JobWorker) stay as they are, and rialto's public API only grows, additively.

## Success in one sentence

`packages/` has 14 packages, every gate is green, prod services deploy healthy, and no behaviour changes.

## Unknowns & risks

- **Cold, flaky CI.** Every PR touches `pnpm-lock.yaml`, a turbo global dependency, so CI runs cold and marginal-timeout suites may flake.
- **Broken service builds.** The Dockerfile edits could break service builds, and DigitalOcean reports every build failure as "resource exhaustion".
- **Hidden consumers.** Prose in `.claude/`, workflows or scripts may still reference the deleted packages.
- **Generated-artifact drift.** Llms or dep-graph drift could wedge the merge train.
- **The `ChatPanel` change.** It needs a minor changeset and must not break the public API. It also collides with another session's in-flight localization change to `useChatStream.ts`, so #7102 waits for that PR to merge and then rebases onto it.
- **Work already in flight.** The check ran on 2026-10-18. The 3 open PRs (#7078, #7095, #7096) belong to another session, and none of them does this work, so nothing matches.
