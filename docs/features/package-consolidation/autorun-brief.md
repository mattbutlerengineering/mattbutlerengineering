# Autorun brief — package-consolidation

Collected 2026-10-18 from the Owner (Matt), attended session.

## Feature

Consolidate `packages/`: delete the two packages nothing calls, move the packages that serve only one caller into that caller, and cut `rialto`'s dependency on a private package. All of this came from the 2026-10-18 `/idea-to-prod:deepen` review of `packages/` (taken at origin/main `949d8ecd7`). If the whole batch lands, `packages/` goes from 20 to 14.

- **Scale:** feature run
- **Slug:** `package-consolidation`
- **Tracker:** seed from the existing issues. Tracking issue #7107; work items #7098–#7106, one item per issue, keeping their order and dependencies. All nine are claimed for this run: `ready` was removed and `in-progress` added on 2026-10-18 so mbe-feature-drain and implement-queue skip them. If the run is abandoned, restore `ready`.

## Idea inputs

- **Problem, from the sufferer's view** (the Owner, plus the agents working in this repo): `packages/` holds 20 workspace packages, and several cost upkeep without returning anything.
  - Two have zero callers: `mcp-server` and `supply-chain-scanner`. The scanner still drew agent fix PRs #6491 and #6608 this week.
  - Five are used by exactly one caller: `observability` (only `service-bootstrap` and `sentry`), `jobs` and `notifications` (only `services/reservations`), `agent-test-utils` (8 test files, 3 helpers), and the `test-fixtures` factories (2 shims).
  - Published `rialto` imports private `@mbe/api-client`, which so far has cost 3 guard scripts and 2 gotchas entries, and `ChatPanel` cannot be used from npm.
  - The Auth0 JWKS readiness check exists twice (`service-bootstrap/src/health.ts:3` and `observability/src/readiness.ts:96`).
- **Who has it, and how they cope today:** the Owner, plus every agent session navigating the monorepo. Today they work around it with Dockerfile COPY lines, regen-manifest entries, knip ignores, dep-graph allowlist entries (some carrying false comments), and build-freshness guards.
- **Why now:** the review just measured it. The agent loops keep spending budget on dead packages. Each extra package adds llms regen, Docker build steps, and turbo cache keys.
- **Evidence:** measured, not anecdote. Call sites were counted in the deepen review against origin/main `949d8ecd7`, and the key claims were re-verified by grep: observability's importers, the duplicated JWKS URL, jobs having only reservations as a consumer, and the agent-core dead modules referenced only by their own tests. Details are in the bodies of issues #7098–#7106.
- **Rough shape of the solution:** as in the issues. Delete `mcp-server` and `supply-chain-scanner`. Fold `agent-test-utils` into `agent-core/testing`. Split `test-fixtures` into service-local factories plus `@mbe/ui-quality-capture`. Inject the stream function into `ChatPanel`. Move `jobs` and `notifications` into reservations. Unify the JWKS check. Fold `observability` into `service-bootstrap`.
- **Success statement:** `packages/` has 14 packages, every gate is green, prod services deploy healthy, and no behaviour changes.
- **Biggest unknowns, or ways this dies:**
  - Every PR touches `pnpm-lock.yaml`, so CI runs cold and is flaky.
  - The Dockerfile edits break service builds.
  - Hidden consumers (prose in `.claude/`, workflows) still reference the deleted packages.
  - Llms/dep-graph drift wedges the merge train.
  - The rialto `ChatPanel` change needs a minor changeset and must not break the public API.

## Scope

- **In scope:** issues #7098–#7106 exactly as written.
- **Out of scope:** the agent-core review-policy split, the rialto-plugin move, the endpoint-DSL decision, the `createDatabase` generic, the `@mbe/config/prettier` export, the `@mbe/auth` root barrel (all listed under "not in this batch" in #7107), and anything that changes runtime behaviour.
- **Success criteria:**
  - each issue's acceptance criteria hold;
  - `git grep` finds no references to the removed packages (outside CHANGELOG and llms);
  - `pnpm lint && pnpm typecheck && pnpm test` pass;
  - `pnpm regen --check` is clean;
  - all 3 service Docker builds pass;
  - CI Gate is green on every PR.
- **Constraints:**
  - TDD where behaviour is touched; #7102 and #7105 write their interface tests first.
  - Follow `.claude/rules/gotchas.md`.
  - Stage files by explicit path.
  - Each work item ships as its own PR off `origin/main`, in its own worktree, starting with `pnpm install --frozen-lockfile`.
  - The run's artifacts live on branch `feature/package-consolidation` in worktree `.claude/worktrees/package-consolidation`.
- **Already decided:**
  - ADR-009 (the /health vs /ready split) and ADR-019 (in-process JobWorker) are active, and this run moves code without changing either contract.
  - rialto's public API grows only additively.
- **User-facing surface:** none. The PRD's `ux:` is not-required. The `ChatPanel` prop is a developer API, not a UX surface.

## Coordination: another session is running

The other session, `mattbutlerengineering-69`, is running its own autorun.

- **It owns** `packages/rialto/src/components/ChatPanel/useChatStream.ts` (a line-139 i18n change on branch `fix/localization-conditional-literals`), plus other rialto locale files, `packages/config/eslint/local-rules.js`, and open PRs #7078, #7095 and #7096.
- **Agreed sequencing:**
  - #7102 (`ChatPanel`) waits until the other session's localization PR merges, then rebases onto it and keeps its message key.
  - Work #7098–#7101 and #7103–#7106 first.
  - Never touch, merge or rebase the other session's branches or PRs (#7078, #7095, #7096, or `fix/localization-conditional-literals`).
- Before editing any file outside this run's issue scope, check with that session via SendMessage.

## Release authorization

**Authorized:** merge each work-item PR once CI Gate is green (the required check) and the `reviewer` subagent passes, plus any diff-matched specialist the repo's queue profile names.

- Merge with `gh pr merge <N> --squash --subject "<subject> (#<N>)" --delete-branch` (see the gotchas bullet on PR-title subjects).
- One PR at a time. After each merge, re-check the next PR on the merge result.
- Deploys happen only through CI (services deploy on merge). Never run manual `doctl` or `wrangler`.
- The rialto npm publish happens only through the repo's Release workflow. This run adds a changeset and never runs `npm publish`.
- An unfixed critical review finding stops the run.
- Never merge the other session's PRs.

## Operate

- `wait: 3 days` after the last work-item merge.
- `minimum-signal:` a `Deploy Services` run on the final merge whose `Deploy API Services` job (not just the workflow) concluded success; `/api/v1/users/health` plus the readiness endpoints green on all 3 services; and a Sentry read showing no new issues from agent-api, users-api or reservations-api since the first merge.
- `users-observed:` is counted from signal the stage finds. This is an internal refactor, so 0 is expected and honest.
