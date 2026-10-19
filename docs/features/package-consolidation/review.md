---
stage: review
run: feature:package-consolidation
date: 2026-10-18
assumptions:
  - "Review is retrospective: all nine PRs were merged per-PR on green CI plus a per-PR `reviewer` verdict, as the autorun brief authorised. This pass did not gate any merge."
  - "Reviewed read-only against origin/main (fetched) and the nine squash commits via git show; nothing was checked out or built. Behavioural claims rest on diffs and file reads, not on a local test run (Verify already ran the gates)."
  - "Severity scale is critical / high / medium / low, as the caller asked; the skill's major corresponds to high. 'Unfixed critical findings block release' is applied to critical and high."
  - "No domain pass was selected for payments or migrations (no stripe/webhook/prisma-migration paths in the diffs). The dependencies pass was run lightly: the diffs only move or remove workspace edges and add OTel deps to service-bootstrap that the deleted observability package already carried."
  - "docs/standards.json was not consulted for findings (no factory/pipeline/eval paths in the diff); no finding cites a standard."
  - "ADR pass done by reading the ADRs the diffs cite (ADR-009, ADR-019, ADR-025, ADR-028) against the moves; no violation found. Which ADRs are live was not re-derived with adr_status.py."
---

# Review: Consolidate packages/ from 20 to 14

## Scope

Retrospective whole-change pass over the nine squash commits on origin/main:
#7111 `a46734c53` (mcp-server delete), #7112 `e9ca789c6` (agent-test-utils into
agent-core), #7109 `e556c13be` (supply-chain-scanner delete), #7113
`34a68fc82` (test-fixtures renamed ui-quality-capture), #7115 `02dc74217`
(ChatPanel stream adapter), #7116 `22f91d1a8` (jobs into reservations),
#7119 `63ebdef3f` (notifications into reservations), #7120 `d60a2b7f1` (JWKS
unify), #7122 `47b422d4d` (observability into service-bootstrap).

Honest status: every PR merged before this review existed, on CI Gate plus a
per-PR `reviewer` verdict (8/10 to 9/10). This pass could not block any merge;
it grades what is now on main. Verification (`verification.md`) was present, so
the soft gate did not fire. Spot checks were made on origin/main for stale text
and dead lines, not only on the diffs.

## Findings

### Medium: `ChatPanel` `stream` is a required prop, released as a rialto minor

- Scenario: `packages/rialto/src/components/ChatPanel/ChatPanel.tsx:30` and
  `useChatStream.ts` make `stream: ChatStreamFn` required; release PR #7114
  versions it as 0.8.0 (rialto is 0.7.1, pre-1.0). A registry consumer on 0.7.x
  who upgrades with a caret range of `^0.7` is not moved (0.x minors are not
  caret-compatible), so no silent break. Anyone who bumps deliberately gets a
  compile error, not a runtime one. A JS or `any`-typed caller that omits it
  gets `streamRef.current is not a function`, which `useChatStream`'s `try`
  turns into the generic stream error, so there is no crash but a misleading
  message. The in-repo consumers (2 call sites in hospitality, plus rialto's
  own a11y fixture, stories and tests) were all updated. Verification marks the
  PRD test (no export or prop removed or renamed) as passing, which is true; the
  PRD's test is narrower than "type-compatible".
- Recommendation: keep it required. Pre-1.0 minor is the conventional place for
  a type-level break, the break is compile-time and fixed by one prop, and the
  alternative (optional with a clear thrown error) keeps a prop that can never
  work without a value. Do not flip it. Cheap hardening if wanted: say "breaking
  at the type level" in the changeset text so the 0.8.0 changelog reads as a
  break, and note that registry consumers must write their own NDJSON adapter,
  since `streamNDJSON` lives in private `@mbe/api-client` (the README says this;
  the changeset line "pass `streamNDJSON`" does not). Architecture records
  optional-with-error as the fallback; it is not needed.
- Standard: none
- Decision: deferred (accepted as designed). Changeset wording tweak is an
  optional follow-up on the release PR #7114, not a blocker.

### Medium: reservations Dockerfile still copies and builds `@mbe/api-client`

- Scenario: `services/reservations/Dockerfile` lines 18, 36, 50, 60, 89, 103
  still copy and run `pnpm --filter @mbe/api-client build`, but
  `services/reservations/package.json` no longer lists api-client and nothing in
  `services/reservations/src` imports it (one comment mentions "api-client" in
  `routes/public-holds.ts:221`). The only consumer was `@mbe/notifications`,
  deleted in #7119. Effect: a wasted build step and a larger image layer on every
  deploy, and a stale edge that will confuse the next person reading the file.
  `services/users/Dockerfile` also has 6 api-client lines while users'
  package.json has none; unlike reservations that may predate this run, so it was
  not attributed to it.
- Recommendation: delete the six lines from the reservations Dockerfile in a
  small follow-up (the existing `dockerfile-pnpm-patches` style test shows
  Dockerfile edits are guarded). Check users the same way in the same PR.
- Standard: none
- Decision: deferred — not release-blocking (extra build, no wrong behaviour);
  follow-up F1.

### Medium: the `/health` vs `/ready` JWKS precedence seed was never written to `docs/backlog.md`

- Scenario: architecture.md and breakdown.md both say "seed it in
  `docs/backlog.md` at Review". `git grep -i jwks origin/main -- docs/backlog.md`
  returns nothing, so the known inconsistency exists only in run artifacts. When
  both `AUTH0_JWKS_URL` and `AUTH_AUTHORITY` are set and differ, `/health`
  probes `AUTH0_JWKS_URL` while `/ready` probes `AUTH_AUTHORITY`
  (`readiness-routes.ts` pre-resolves the authority and passes it as `auth0Url`,
  which outranks the env var). Preservation is correct and pinned by
  `auth0-jwks-checks.test.ts` (16 tests); the unfiled seed is the gap. The
  pinning test would fail loudly if anyone changed either side, so the risk is
  forgetting, not drift.
- Recommendation: add the seed with the table from architecture.md:167 (this
  review may not edit outside the run directory). Do not unify the precedence in
  this run; it is a behaviour change.
- Standard: none
- Decision: deferred — follow-up F2.

### Low: garbled and now-wrong comments in `packages/sentry/src/node.ts` and `node.test.ts`

- Scenario: #7122's global find-and-replace produced "`@mbe/service-bootstrap's
telemetry's FastifyOtelInstrumentation`" and "`@mbe/service-bootstrap's
telemetry registers @fastify/otel's…`" (`node.ts:72`, `:112`, `node.test.ts:160`,
  `:174`, `:461`). Separately `node.ts:102` still says the redaction policy "is
  owned by @mbe/service-bootstrap's telemetry", but #7122 moved `redact.ts` into
  `@mbe/sentry` itself, so that sentence is false. Comment-only; the code is
  correct. This is the reviewer's recorded unfixed 8/10 note.
- Recommendation: reword to "service-bootstrap's FastifyOtelInstrumentation" and
  say the policy is `./redact.ts`.
- Standard: none
- Decision: deferred — follow-up F3.

### Low: other stale text left by the moves

- Scenario (each is wording only, no behaviour):
  - `knip.jsonc:54-56`: "`@mbe/api-client`: rialto's ChatPanel imports it" is
    false after #7115. The ignore itself is still justified for the turbo
    prebuild chain, so only the stated reason is wrong. `knip.jsonc:4` comment
    still mentions "scanner fixtures are test data" after the scanner was
    deleted (the reviewer's recorded unfixed note on #7109).
  - `packages/api-client/src/streaming.ts:6` says it is "used by … useChatStream
    (packages/rialto)". Rialto now takes it by injection, apps pass it in.
  - `apps/rialto-web/src/pages/examples/CommandPaletteExamplePage.test.tsx:51`
    explains the local copy by "ChatPanel -> @mbe/api-client", which no longer
    holds. The copy may now be removable; that is a separate check, not asserted.
  - `.claude/rules/gotchas.md` (origin/main, line ~170) was already corrected by
    mbe-prune #7118 ("`ChatPanel` used to import…"); no ChatPanel/api-client
    gotcha remains stale. Checked, clean.
  - `breakdown.md` still shows the #7106 observability item unchecked (`- [ ]`)
    although it is merged; bookkeeping only (fixed in this run directory by the
    caller if wanted).
- Recommendation: one docs/comments PR covering knip.jsonc, streaming.ts and the
  rialto-web test comment.
- Standard: none
- Decision: deferred — follow-up F3 (same PR).

### Low: `services/reservations/src/notifications.ts` sits beside a `notifications/` directory

- Scenario: after #7119 there is both `src/notifications.ts` (the adapter
  factory file; it imports `./notifications/index.js`) and `src/notifications/`.
  Imports are explicit (`./notifications/index.js`, `./notifications.js`) so
  resolution is not ambiguous today, but a path like `./notifications` under a
  bundler-resolution setting would pick the file first and a reader cannot tell
  which is meant. Design decay, not a bug.
- Recommendation: leave for now; if touched again, fold the factory file into
  `notifications/` (e.g. `notifications/factory.ts`). Hand to `deepen` in one
  line; not refactored here (surgical-changes rule).
- Standard: none
- Decision: deferred — follow-up F4.

### Low: local copy of api-client's `retry.ts` (intentional duplication)

- Scenario: #7119 adds `services/reservations/src/notifications/retry.ts`, a
  61-line copy of `@mbe/api-client`'s `retry.ts`, with its own 109-line test,
  so reservations drops its only api-client edge. It is a copy, not an import, so
  a bug fixed in one will not reach the other. The duplication is deliberate and
  was recorded in the architecture; the alternative was keeping a frontend HTTP
  client in the reservations image (see the Dockerfile finding, which shows the
  cost of that edge). No `lean:` marker names a trigger, which the lean pass
  would want.
- Recommendation: keep. Add a one-line comment at the top of the copy naming its
  origin and "re-sync if api-client's retry.ts changes", so the duplication is
  discoverable. Not a defect.
- Standard: none
- Decision: deferred — follow-up F4 (comment only).

### Low: `useChatStream` accepts `domainContext` but never uses it (pre-existing)

- Scenario: `UseChatStreamOptions.domainContext` is declared (`useChatStream.ts:58`)
  and passed by `ChatPanel`, but the hook destructures only `{ api, stream,
getAccessToken }`. So the prop reads as meaningful and does nothing. This
  predates the run (the original destructure was `{ api, getAccessToken }`); the
  run only added `stream` beside it and did not make it worse.
- Recommendation: leave; flag for whoever next edits ChatPanel. Either wire it to
  the request body or remove it from the hook options and the required prop
  surface (the latter is itself a rialto break, so it needs a changeset).
- Standard: none
- Decision: deferred — out of scope, pre-existing (follow-up F5).

### Informational: behaviour changes beyond pure moves (item e) — all inside the plan

- Scenario / assessment, by commit:
  - #7111 removes the `mbe mcp` CLI command and `@mbe/mcp-server`; in
    breakdown.md and idea.md. `.mcp.json` has no reference.
  - #7116 drops job types `PRE_ARRIVAL_BRIEFING` and `LAPSED_GUEST_SCAN` and their
    payload types. Planned (breakdown.md:65) and unused per the commit; an
    already-queued Redis job of those names would raise `UnknownJobTypeError` and
    fail loudly, which is the documented behaviour. `JobType` now has 4 members.
  - #7122 drops `getRequestId`/`logWithRequestId` (no callers on origin/main per
    `git grep`) and keeps `createRequestIdMiddleware` unchanged.
  - #7120 `probeJwks` clears its timer in a `finally`; the old inline code skipped
    `clearTimeout` when `fetch` threw. This is a harmless leak fix and the only
    behaviour delta in the JWKS unification; messages and the `/health` vs
    `/ready` retry policy are preserved.
  - #7112 restores the no-type-escape guard (#6502) in its new location.
    No change was found that the PRD's no-behaviour-change criterion forbids.
- Recommendation: none.
- Standard: none
- Decision: n/a (informational)

## Passes with no findings

- Security: clean. The new ESLint restriction in `packages/config/eslint/react.js`
  blocks `@mbe/service-bootstrap` in frontend apps, which matters because that
  package now carries the OTel SDK and Fastify; it also blocks `@mbe/sentry/node`
  and `@mbe/auth/fastify` already. No secrets in the diffs. Dockerfile changes
  only remove lines (the dead-lines finding is the leftover, not an addition). The
  JWKS dev-tenant fallback stays refused in production (#4195), pinned by tests.
  No new boundary input handling was introduced.
- Correctness: no bug found with a failure scenario. The JWKS refactor, jobs
  move and notifications move are import repoints plus tests that were moved
  intact; verification shows full suite green on re-run.
- ADR compliance: ADR-019 (delivery stays in-process in reservations, honoured
  by #7116/#7119), ADR-009 (JWKS policies per endpoint, honoured by #7120/#7122).
  No violation and no ADR owed (architecture records that no decision met the ADR
  bar; the required-`stream` choice is reversible by relaxing to optional).
- Complexity (lean): no cut-list hits beyond the intentional retry copy. The
  module count went down by six.
- Domain passes: payments (no stripe/webhook paths), migrations (no schema or
  SQL), dependencies (workspace edges only removed or moved; OTel packages moved
  from observability to service-bootstrap with the same ranges): none selected,
  or ran clean.

## Verdict

Ready to ship. There are no unfixed critical or high findings. Three mediums and
a handful of lows remain, all recorded below as follow-ups; none changes runtime
behaviour on main. Note again that this verdict is retrospective, since the
changes were already merged and their CI Gates were green.

## Follow-ups (deferrals)

- F1: delete the dead `@mbe/api-client` lines from `services/reservations/Dockerfile`
  (and check `services/users/Dockerfile`).
- F2: add the `/health` vs `/ready` JWKS precedence seed to `docs/backlog.md`.
- F3: one docs/comments PR: sentry `node.ts`/`node.test.ts` garbled comments,
  `knip.jsonc:4` and `:54`, `packages/api-client/src/streaming.ts:6`, rialto-web
  `CommandPaletteExamplePage.test.tsx:51`.
- F4: optional: origin comment on the duplicated `retry.ts`; fold
  `reservations/src/notifications.ts` into `notifications/` when next touched.
- F5: `useChatStream` unused `domainContext` (pre-existing); decide wire-or-remove
  with a changeset.
- Optional: say "breaking at the type level" in the rialto changeset for the 0.8.0
  release PR #7114.
