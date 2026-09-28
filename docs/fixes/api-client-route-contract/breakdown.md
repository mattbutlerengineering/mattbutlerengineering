---
stage: decompose
run: maintenance:api-client-route-contract
date: 2026-09-22
assumptions:
  - 'Every mirrored tracker issue carries the `blocked` label. The orchestrator''s hard constraint was "no label the repo''s `/implement-queue` treats as a claim signal", and `ready` alone satisfies that literally — but `.github/workflows/scheduled-issue-completion.yml` runs every 12 hours and, in `promote` mode, *applies* `ready` to the best-specified open issues, whose filter drops only `ready`/`in-progress`/`has-pr`/`needs-review`/`blocked` (lines 93-101). A well-specified work item is the strongest promotion candidate in a 17-issue backlog, so omitting all labels would have handed these to the autonomous queue within 12 hours. `blocked` is the narrowest label that closes that path and is not itself a pickup signal (`/implement-queue` queries `--label ready`). It is semantically loose — these items are owned, not blocked — and it was chosen without live user input, so it is logged here rather than buried. Cheap to reverse: `gh issue edit <N> --remove-label blocked` once the run holds its PR.'
  - 'The scratch-edit proof required by the brief''s success criterion 2 is sequenced as an Implement work item (item 11) that *runs* the proof and captures the transcripts, rather than left for Verify to perform. The brief says only that the transcript is "quoted in `verification.md`" and never says who produces it. Sequencing it into Implement keeps it from becoming a checkbox nobody owns; Verify still owns quoting and judging it.'
---

# Breakdown: pinning `@mbe/api-client` URL literals to a route that answers them

Progress lives in the checkboxes below — Implement checks items off as their
acceptance criteria are met. Twelve items, four milestones. Each milestone
boundary is something you can run and watch behave.

Predecessor: `architecture.md` (seven decisions, all measured). This file
sequences them; it re-litigates none of them. Every file path and line
reference below was verified in this worktree before it was written down.

Tracker mirror is **on** for this run (ADR-0026, one-way out): issues
[#5684](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/5684)–[#5695](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/5695).
The checkboxes here are the state; the issues are the mirror, and each closes at
its item boundary. No existing open issue covered any item — the whole open
backlog (17 issues) was searched and read; nothing overlapped, so nothing was
folded in as an import.

## Milestone 1: The owner half — four route tables behind one boolean

**Demonstrable at the boundary:** you can ask all four route owners "does anyone
answer `METHOD PATH`?", and the 2026-08-30 floor-plan pair already answers
correctly — the pre-fix literals find no owner, the current ones find
`reservations`. The run's whole premise is provable here, before a single client
pair exists.

- [x] **Scaffold `@mbe/route-contract`** — new leaf workspace package at `tools/route-contract`, with `package.json` / `tsconfig.json` / `eslint.config.js` / `vitest.config.ts` and the five guard devDependencies (tracker: #5684)
  - Accept: `pnpm --dir tools/route-contract test` passes a smoke test that imports all five workspace devDeps and asserts each resolves; `lint` and `typecheck` pass; `pnpm turbo test:coverage --filter @mbe/route-contract` resolves the package — that is the entire CI wiring, because `ci.yml`'s `Test (Node 22)` job runs `pnpm turbo test:coverage --concurrency=2` (`ci.yml:541`) and `test` is in `ci-gate`'s `needs`; root `vitest.config.ts`'s `tools/*/vitest.config.ts` glob picks it up; `node scripts/check-orphaned-tests.mjs` stays green with no new allowlist entry.
  - Two measured traps this item must absorb: (1) `@mbe/config/eslint/node` bans importing `@mbe/api-client` outright (`packages/config/eslint/node.js:28-31`), so use the `base` preset like `packages/supply-chain-scanner/eslint.config.js` or disable the rule the way `tools/cli/eslint.config.js` does; (2) settle the import specifier for the four booted packages here — see § Notes.
  - Blocked by: —
- [x] **Regenerate the artifacts a new workspace package invalidates** — `pnpm-lock.yaml`, `infrastructure/worker/dep-graph.json`, `docs/architecture/dependency-graph.md` (tracker: #5685)
  - Accept: `@mbe/route-contract` appears as a node in `dep-graph.json` (beside the existing `@mbe/mutation-testing` entry at `tools/mutation-testing`) and in `docs/architecture/dependency-graph.md` with its five edges; re-running `pnpm graph && pnpm generate:dep-graph` yields no further diff; `pnpm regen --check` clean after `pnpm build --filter @mbe/cli...`; **no** `llms.txt`/`llms-full.txt` under `tools/route-contract` and **no** new `FAMILIES` entry in `scripts/regen-manifest.mjs` (the llms family is manifest-driven and `tools/mutation-testing` carries none — adding the files without a manifest entry is what reddens CI, so add neither); only those three paths staged, never `git add -A`.
  - Blocked by: Scaffold `@mbe/route-contract`
- [x] **Fastify route-owner adapter** — `buildApp({ logger: false })` → `await app.ready()` → `app.findRoute({ method, url })` across `services/reservations`, `services/users`, `services/agent` (tracker: #5686)
  - Accept: returns a boolean per owner; a committed test pins the architecture's measured four-row table with the opaque placeholder substituted for `:id` — `POST …/floor-plans/<ph>/active` → no owner, `POST …/floor-plans/<ph>/activate` → `["reservations"]`, `POST …/floor-plans/<ph>/bulk-update-positions` → no owner, `POST …/floor-plans/tables/positions` → `["reservations"]`; all three apps reach `ready()` with no `DATABASE_URL` and no ioredis retry noise (mock `ioredis` as `packages/jobs/src/worker.test.ts:20-28` does, against `services/reservations/src/app.ts:280-291`).
  - `findRoute` does runtime path matching, not pattern-spelling comparison — that is the load-bearing measurement. Do not substitute `hasRoute`, `printRoutes()` parsing, or `app.inject()`.
  - This test is a **permanent** adapter-level pin on the 2026-08-30 defect with no working-tree edit. It is not the end-to-end proof; that is item 11.
  - Blocked by: Scaffold `@mbe/route-contract`
- [x] **Edge-worker route-owner adapter** — `edgeRouter.fetch(new Request("https://host" + path), stubEnv)`, classified by the **returned** response (tracker: #5687)
  - Accept: returns `edge-terminal` / `forwarded-to-origin` / `static-spa`; the architecture's measured probes classify correctly (`/health/system` → `edge-terminal`; an `/api/…` and a `/public/…` path → `forwarded-to-origin`; an SPA path → `static-spa`; all five edge-terminal health paths → `edge-terminal`); and a test asserts the anti-trap explicitly — `/health/system` still classifies `edge-terminal` **while** both the origin-fetch stub and a static-binding stub were invoked, proving the which-spy-fired oracle is not in use (that oracle misclassifies it, because `handleHealthSystem` legitimately fans out through both, `infrastructure/worker/edge-router.js:147-149`).
  - Needs a `globalThis.HTMLRewriter` stub (copy `infrastructure/worker/edge-router.test.js`'s). `edge-router.js:24` imports `routes-config.json` with no import attribute, so bare Node refuses it — this is why vitest is forced, not preferred.
  - Blocked by: Scaffold `@mbe/route-contract`

## Milestone 2: The client half — 87 pairs produced by running the real client

**Demonstrable at the boundary:** the driver emits ≥87 `{ method, path, producedBy }`
records from the real `@mbe/api-client`, and cannot silently narrow — a new
sub-client, a method that stops issuing a request, or a fourth deposit
transition each break something.

- [x] **Recording transport that drives the real client** — `createApiClient({ baseUrl: "" })` + `new AgentSessionClient({ baseUrl: "" })`, `globalThis.fetch` replaced by a 204-returning recorder, every method invoked with placeholder arguments (tracker: #5688)
  - Accept: yields ≥87 `{ method, path, producedBy }` records; the roster is explicit and asserted against `packages/api-client/src/index.ts`'s exports, so a sub-client wired into `index.ts` but absent from the roster fails the suite (the one way this enumeration can silently narrow); `reservations.list`, `reservations.me` and `venues.list` arrive query-stripped via `split("?")[0]`; the placeholder is a single opaque segment containing no `/`, `?` or `#`.
  - `AgentSessionClient` is **not** in the factory (`index.ts:81-97` omits it; `agent-sessions.ts:38-41`) — it must be constructed separately or it is missed.
  - Record the blind spot rather than implying it: `streamNDJSON(config)` takes a caller-supplied `config.url` (`packages/api-client/src/streaming.ts:35-36`) and holds no literal, so it is not covered.
  - Blocked by: Scaffold `@mbe/route-contract`
- [x] **Make the client driver unable to silently narrow** — per-invocation request counting, a named non-HTTP exempt list, and an exhaustive `deposits.transition` map (tracker: #5689)
  - Accept: a test fails if any non-exempt roster method issues zero requests _in its own invocation_; the three aliases that re-emit an earlier path do **not** trip it (`floorPlans.get`, `floorPlans.activate`, `reservations.cancelWithReason` — `floor-plans.ts:39-41`, `:65-67`, `reservations.ts:145-157`, which a naive set-growth check flags as false positives); all three deposit transition paths appear in the inventory; adding a fourth `DepositTransition` member without a map entry fails `pnpm --dir tools/route-contract typecheck`, demonstrated rather than asserted in prose (vitest does not typecheck); the exempt list (`holds.setSessionId`, `holds.getSessionId`, `holds.sessionHeaders`) is a named constant with a one-line reason per entry.
  - Blocked by: Recording transport that drives the real client

## Milestone 3: The guard — the join, and the anti-vacuity contract that makes it a gate

**Demonstrable at the boundary:** `pnpm --dir tools/route-contract test` is **RED
on `main` as it stands**, failing on exactly Findings A and B and passing the
other 85 pairs. The guard's very first run reproduces two real defects it was
never told about — the architecture's _free_ proof, needing no scratch edit.

- [x] **The guard assertion and its failure message** — join the 87 client pairs against the four owners, one-directional client → owner, fail on any pair with zero owners (tracker: #5690)
  - Accept: run against `main` before items 9 and 10 land, the suite is RED on exactly `GET /api/health/system` and `GET /api/v1/venues/groups/by-slug/:slug` and green on the other 85 — capture that transcript for Verify; the failure text names, per unowned pair, the method, the path, the producing client method, and the edge disposition; no allowlist and no skip; nothing in `packages/api-client` changes in this item.
  - One-directional is a decision, not an omission: ~276 registered method+path entries against 87 client pairs, and a reverse rule would need a ~190-entry allowlist — the escape hatch this design rejected, pointed backwards.
  - Blocked by: Fastify route-owner adapter; Edge-worker route-owner adapter; Make the client driver unable to silently narrow
- [x] **Anti-vacuity and exhaustiveness assertions** — the part that decides whether this is a gate or a decoration (tracker: #5691)
  - Accept: the suite fails when the client inventory is empty, when any roster sub-client contributed zero pairs, when any non-exempt client method issued zero requests, or when any of the four owner tables is empty — each exercised by its own negative test with a deliberately emptied input, not asserted in prose; plus a lower-bound assertion on inventory size so a driver that drops most of the roster fails rather than passing on a handful of pairs.
  - Modelled on `infrastructure/pulumi/ingress-coverage.test.ts:164` ("reads real values from every source, so nothing below can pass vacuously"). This repo has recorded the same class repeatedly — a Playwright spec no workflow invoked, a `check-*` script wired into nothing, two metrics collectors that ran daily and produced zero rows for months.
  - Blocked by: The guard assertion and its failure message

## Milestone 4: Green — the two live mismatches, the proof, and a cold CI run

**Demonstrable at the boundary:** the guard is green on `main`, a production 404
a real admin dashboard hits today is fixed, and the proof transcripts Verify
needs exist.

- [x] **Finding A — point the system-health client at `/health/system`** — `packages/api-client/src/health.ts:13`, its doc comment at `:18`, and the test at `health.test.ts:119`/`:125` (tracker: #5692)
  - Accept: `packages/api-client` `test` and `typecheck` green; the guard's `HealthClient.system` pair resolves to owner `edge` with disposition `edge-terminal`; no `/api/health/system` reference remains in repo **code** (two prose references in `docs/features/hospitality-service-ux/` stay — they are correct historical records, as are this run's own artifacts).
  - Must be named in the release record: the path moves rate-limit buckets — `/health/system` is 10 req/60 s (`infrastructure/worker/rate-limiter.js:16`) where `/api/` is 100 (`:17`), against `SystemHealthBadge`'s 60 s poll (`SystemHealthBadge.tsx:8`). Roughly ten admin tabs per source IP before shedding; accepted at today's admin population, recorded so it is a decision and not a surprise.
  - Carry into Review: this survived because `SystemHealthBadge.tsx:54-57` swallows the error and `:67` returns `null` — the production symptom is an **absent badge**, not an error.
  - Blocked by: The guard assertion and its failure message _(the pre-fix RED on this pair is the free proof — observe and capture it before the fix lands)_
- [x] **Finding B — delete the dead `VenueGroupsClient.getBySlug`** — `packages/api-client/src/venues.ts:121-129`, its test block at `venues.test.ts:323-332`, and the `getBySlug()` entry in the `venueGroups` row of `packages/api-client/CLAUDE.md:55` (tracker: #5693)
  - Accept: zero repo references to `VenueGroupsClient.getBySlug` remain; the three `apps/hospitality` call sites (`hooks/useVenues.ts:51`, `pages/VenueOnboardingPage.tsx:52`, `pages/PublicBookingPage.tsx:51`) still resolve to the **venue** client and `apps/hospitality` typechecks; `packages/api-client/llms.txt` and `llms-full.txt` regenerated and committed (`llms-full.txt:1602` currently embeds the deleted method body) via `pnpm build --filter @mbe/cli... && pnpm regen`, then `pnpm regen --check` clean, staging the two llms paths explicitly.
  - Keep the `venueGroups` row itself; the `venues` row at `CLAUDE.md:54` legitimately keeps its own `getBySlug()`.
  - Blocked by: The guard assertion and its failure message _(same reason)_
- [x] **Prove the guard goes red on the 2026-08-30 literal and green once reverted** — the scratch-edit proof, run and captured (tracker: #5694)
  - Accept: green transcript, then RED after scratch-editing `packages/api-client/src/floor-plans.ts:58` back to `/api/v1/floor-plans/${id}/active`, then green after `git checkout -- packages/api-client/src/floor-plans.ts` — all three captured verbatim from real command output and handed to Verify; `git status --porcelain` shows no residual modification to that file; the RED transcript names the method, path, producing client method and edge disposition, demonstrating item 7's failure-message contract on a real failure; coverage stated explicitly for the record (which client modules and which four owners are compared, and what is knowingly excluded and why — host reachability, payload shape, non-client callers, and whether the handler works).
  - Distinct from the Fastify adapter's committed table (item 3), which pins the same distinction permanently with no working-tree edit. Do not collapse them: the brief's success criterion 2 asks for the end-to-end behaviour, not an adapter-level one.
  - Blocked by: Finding A; Finding B
- [x] **Absorb the cold-cache CI run the new lockfile entry forces** (tracker: #5695)
  - Accept: the PR's first full `Test (Node 22)` job is green; any `Test timed out in 5000ms` in a package this run did not touch is fixed by `testTimeout: 15000` in _that_ package's `vitest.config.ts` — the recorded pattern — and not by a blind `gh run rerun`; the "Enforce repo-wide coverage threshold" step still passes (it folds in every `*/coverage/coverage-final.json` found by `find`, automatically, so the new package joins the denominator whether or not anyone wires it up); `./tools/route-contract/coverage/coverage-final.json` added to `ci.yml`'s codecov `files:` list, matching every other test-bearing package; `CI Gate` green (it is the only required check — `Visual Regression` and `codecov/patch` are advisory).
  - Why this is an item and not a footnote: `pnpm-lock.yaml` is a turbo `globalDependencies` entry, so adding a workspace package invalidates the cache for **every** task on this PR's run. That cold ~40-task-concurrent load has twice tipped marginal default-5 s-timeout suites over and broken `main` (`ec35b2cf` / #3588, and the `buildApp()` cold-start class before it). The failure arrives on a package this run never touched, so it reads as unrelated flake and invites the blind rerun that does not fix it.
  - Blocked by: Prove the guard goes red on the 2026-08-30 literal and green once reverted

## Milestone 5: The review round — two findings re-opened by live-user direction

**Demonstrable at the boundary:** the guard's owner table is the table
production registers, not the table `NODE_ENV="test"` registers; a _new_
environment-conditional route in any of the three services turns the suite red
on its own, with no client pair having to target it; and the anti-vacuity floor
can no longer be lowered to nothing while every test stays green.

Added 2026-09-22 **after** Decompose, by live-user direction recorded in
`autorun-brief.md` § "Addendum — interview round 3". Per the protocol's
tracker-mirror section these two items carry **no** `(tracker: #N)` reference
and file no issue — the mirror is one-way out and syncs at Decompose, which had
already closed. The run's twelve mirrored issues stay closed.

- [x] **R1 — the owner table must be production's table, and a new environment-conditional route must go red**
  - Accept: `bootFastifyOwners()` no longer rests on the false invariant "nothing in the three services' route registration reads `NODE_ENV`"; `answers()` reports an owner only for a route that is registered under **both** `NODE_ENV="test"` and `NODE_ENV="production"`, so `POST /api/v1/events/test` (`services/reservations/src/routes/events.ts:181`, under the unconditional `/api/v1/events` prefix at `app.ts:231`) is not in the table a client pair can match; the environment-conditional set is **measured** by a differential boot, not hand-listed, and asserted equal to a recorded constant so a new one fails the suite on its own; the doc comment at `fastify-owners.ts:78-84` and the matching claim in this file's § Notes state what is actually true; the whole join still re-derives **86 pairs / 86 owned / 0 unowned**; a captured transcript under `proof/` shows the new assertion RED when an environment-conditional route is introduced and green when it is not.
  - `NODE_ENV="production"` must **not** become the guard's normal boot mode — `services/reservations/src/app.ts:266` gates the lapsed-guest monitor and the Redis-backed job worker on `!== "test"`. The production boot is a second, deliberately never-`ready()`-ed reference app; `onReady` is what starts those, and it never fires.
  - Blocked by: —
- [x] **F2 — pin the anti-vacuity floor's absolute value**
  - Accept: `MINIMUM_CLIENT_PAIRS` is asserted against an absolute lower bound, not only relatively, so lowering it to ~20 fails a test instead of leaving all tests green; the legitimate 87→86 lowering already in the branch stays.
  - Blocked by: —

## Design gaps found

None. The architecture answered every question decomposition asked of it, and
the `defect.md` open questions it inherited are all closed in its § Decisions.

One **measured correction** to a predecessor fact surfaced while sequencing. It
changes no decision — it only changes what item 1 must verify — so it is
recorded in § Notes rather than routed back to Architect.

## Notes

**2026-09-22, decompose — module resolution is not quite what `architecture.md`
says, and item 1 owns settling it.** The architecture states that under vitest
"workspace deps resolve to **source**, which removes the `dist` prerequisites
`defect.md` measured under `tsx`". Measured, that is incomplete in two ways:

- `packages/api-client/package.json`'s `exports["."]` resolves `default` to
  `./dist/index.js`, not to source. Only `types` points at `src`.
- `services/reservations`, `services/users`, `services/agent` and
  `infrastructure/worker` declare **no** `exports` and **no** `main` at all, so
  `import … from "@mbe/reservations-service"` does not resolve by bare package
  name. A package with no `exports` map does permit arbitrary deep subpath
  imports, which is how `apps/rialto-web/e2e/csp.spec.ts:11` already imports
  `@mbe/edge-worker/csp.js` — the working precedent for this shape.

Nothing here reopens a decision: the architecture's choice to declare the five
as **devDependencies** gives turbo real `^build` graph edges, and the
`test:coverage` task declares `dependsOn: ["^build"]`, so the service dists
exist by the time the suite runs. Item 1 simply settles the exact specifier
once, with a smoke test, instead of leaving four later items to rediscover it
separately.

**2026-09-22, decompose — milestone 3's exit condition is a RED suite, on
purpose.** Items 9 and 10 are blocked by item 7 for an evidentiary reason, not a
mechanical one: Findings A and B are the architecture's free proof, and the
pre-fix red has to be _observed and captured_ before the fixes erase it. An
Implement agent that lands the two one-line fixes first would leave the run with
only the scratch-edit proof and would have silently thrown away the stronger
evidence — a guard reproducing two real defects it was not told about. Do not
reorder milestone 4 ahead of milestone 3.

**2026-09-22, decompose — tracker mirror and the autonomous queue.** Twelve
issues, #5684–#5695, each opening with the owner line and each labelled
`blocked`. See this artifact's `assumptions:` for why `blocked` specifically.
GitHub's `auto-label.yml` (which fires on `opened` _and_ `edited`) added
`feature` to five of them from their `feat(` title prefix; `feature` was removed
by hand, since it appears in CLAUDE.md's issue-state label family. The
descriptive `area:*` labels it also added were left — no workflow queries them.
Nothing further should edit these issue **bodies**, or `auto-label` re-runs and
re-adds `feature`.

**2026-09-22, implement (item 3) — the ioredis noise is closed by `NODE_ENV`,
not by a mock, and the mock the item proposed is not available here.**
Item 3's acceptance says to silence the reservations job worker by mocking
`ioredis` the way `packages/jobs/src/worker.test.ts:20-28` does. Measured:
`ioredis` is **unresolvable** from `tools/route-contract`
(`require.resolve("ioredis")` → `MODULE_NOT_FOUND`; the package's
`node_modules` holds only `@mbe`, `@types`, `@vitest`, `typescript`, `vitest`),
so a `vi.mock("ioredis", …)` here has nothing to bind to, and making it
resolvable would mean adding a real npm devDependency the architecture did not
budget for. It is also unnecessary: the worker is constructed inside
`if (process.env.NODE_ENV !== "test")` (`services/reservations/src/app.ts:266`),
which also gates the lapsed-guest monitor — so pinning `NODE_ENV = "test"` in
`bootFastifyOwners()` means the ioredis connection is never opened at all,
rather than opened and stubbed. Reservations, users and agent all reach `ready()` with no
database, no mocks and no ioredis output.

**This note originally ended with a false claim, corrected below on 2026-09-22
(R1).** It read: "Checked that this cannot change the answer the guard gives:
`NODE_ENV`'s only other uses in the three services' bootstrap are CORS origins,
the fail-closed production auth check, and those two hooks — **no route
registration reads it**, so the table booted here is the table production
registers." The grep behind that sentence missed
`services/reservations/src/routes/events.ts:181`, which registers `POST /test`
only when `NODE_ENV !== "production"`, under the unconditional `/api/v1/events`
prefix (`app.ts:231`). Pinning `NODE_ENV="test"` therefore DID change the answer
the guard gives, for that one route.

**2026-09-22, implement (item 3) — the "no `DATABASE_URL`" half of that
criterion is recorded, not asserted on `process.env`.** The apps do boot with
none (that is what `beforeAll` demonstrates, and CI's `Test (Node 22)` job sets
no `DATABASE_URL` — the three jobs that do are integration, RLS and
migrate-dryrun). Asserting `process.env.DATABASE_URL === ""` would hand a
developer who exports it a red that says nothing about the code, so the fact
lives in the test's doc comment instead.

**2026-09-22, implement (item 2) — `dep-graph.json` carries six edges, not the
five the item predicted.** The five guard devDeps plus `@mbe/config`. The
Mermaid `.md` shows five of the six and no `edge-worker` arrow, because
`scripts/generate-dep-graph.js`'s `MERMAID_DIRS` deliberately excludes
`infrastructure/*` — `apps/rialto-web`, which also devDepends on
`@mbe/edge-worker`, renders the same way. Generator behaviour, not drift.

**2026-09-22, implement (item 10) — the anti-vacuity floor fired on a real
change, and lowering it is the correct response.** Deleting the dead
`VenueGroupsClient.getBySlug` took the client surface from 87 pairs to 86, and
`MINIMUM_CLIENT_PAIRS` (item 8) immediately went red with
`"the client inventory holds 86 pairs, below the measured floor of 87 — the
driver has narrowed"` — on the very change that was supposed to shrink it. That
is the floor working: it forces a surface reduction to be acknowledged instead
of absorbed. The constant is now 86 and carries the reason in its own doc
comment. It stays a conscious edit; a floor recomputed from whatever the driver
last produced could never detect anything. Recorded because it is the only time
in this run an anti-vacuity clause fired on real input rather than on the
synthetic emptied inputs `vacuity.test.ts` feeds it, which makes it evidence
that the clause is not decorative.

**2026-09-22, implement (item 12) — the cold-cache run was reproduced locally
and was clean; the `CI Gate` half of the criterion is not Implement's to
observe.** Item 12 asks for two things. The first is real work and is done: the
codecov `files:` list in `ci.yml` now carries
`./tools/route-contract/coverage/coverage-final.json`, and the cold, fully
parallel run the new lockfile entry forces was reproduced here as
`pnpm turbo test:coverage --force --concurrency=2` — the same task and
concurrency cap CI uses, with `--force` standing in for the
`globalDependencies` cache-bust. Result: **52 successful / 52 total, `Cached: 0
cached, 52 total`, exit 0, 3m17s.** No `Test timed out in 5000ms` anywhere, so
there was nothing to absorb and no package outside this run needed a
`testTimeout: 15000`. The repo-wide coverage step was run by hand with `ci.yml`'s
own `find`-and-fold snippet: **85% (24014/28105 statements) against a 60%
threshold**, with `./tools/route-contract/coverage/coverage-final.json` present
in the fold.

The second — "the PR's first full `Test (Node 22)` job is green" and "`CI Gate`
green" — is an observation on a pull request that does not exist yet and must
not: Implement is explicitly forbidden to push or open one, and Ship owns that.
It is recorded here as the one part of this item's acceptance that Implement
could not close, so that nobody reads the checkbox as a claim about a CI run
that never happened. If that first run does surface a timeout in an untouched
package, the recorded fix is `testTimeout: 15000` in **that** package's
`vitest.config.ts` — never a blind `gh run rerun`, which re-uses the same merge
SHA and fails identically.

**2026-09-22, implement (item R1) — what is actually true about `NODE_ENV` and
the owner table.** The corrected statement, measured rather than grepped:

- Route registration in these three services **can** read `NODE_ENV`, and one
  place does — `services/reservations/src/routes/events.ts:181`. So a single
  boot under any one value produces a table that is that value's table, not
  production's.
- `bootFastifyOwners()` therefore boots each service **twice** and intersects:
  once under `NODE_ENV="test"` (`ready()`-ed, exactly as before — this is what
  keeps `app.ts:266`'s lapsed-guest monitor and Redis job worker unwired) and
  once under `NODE_ENV="production"` with placeholder secrets and deliberately
  **no** `ready()`. `answers()` says yes only when both routers match.
- The production boot opens nothing. Measured with `net.Socket.prototype.connect`,
  `dns.lookup` and `globalThis.fetch` instrumented: `buildApp()` **and**
  `close()` together produced zero attempts on all three services, with
  `REDIS_URL` set to a bogus value and with it unset. `close()` on a
  never-`ready()`-ed Fastify instance does not fire `onReady`, which is what
  would have started the monitor and the worker. `printRoutes`/`findRoute`
  answer identically before and after `ready()` (byte-identical trees), because
  `buildApp` awaits every `register` call itself.
- Four env vars are required to reach registration under `production`, each
  because a boot throws without it: `SENTRY_DSN`
  (`validate-startup-config.ts:61`), `AUTH_AUTHORITY` + `AUTH_AUDIENCE`
  (`create-service-app.ts:247`), and `MANAGE_TOKEN_SECRET` (reservations,
  `app.ts:119`). They are applied around the production boot only and restored
  immediately, overriding any ambient values so a developer's real `SENTRY_DSN`
  is never initialised.
- The difference the two boots find is **recorded and asserted**
  (`ENV_CONDITIONAL_ROUTES`), so a new environment-conditional route in any of
  the three services fails `fastify-owners.test.ts` on its own — no client pair
  has to target it. Proof transcript:
  `proof/env-conditional-route-fails-closed.md`.
- Scope of the claim, stated so it is not over-read: this compares `test`
  against `production`. A registration gated on some third `NODE_ENV` value, or
  on a different variable, is outside what the diff can see.

The effective `reservations` table is 175 entries where the `test` boot alone
registers 176; `users` (44) and `agent` (56) are unchanged. The join still
re-derives **86 pairs / 86 owned / 0 unowned**.

**2026-09-22, implement (item F2) — the anti-vacuity floor now has an absolute
pin.** `MINIMUM_CLIENT_PAIRS` was only ever asserted relatively
(`vacuity.test.ts:15`/`:37`, `client-inventory.test.ts:37` all reference the
constant itself), so lowering it to ~20 left all tests green and its only
defence was diff review — which is exactly the "a change that makes the suite
GREENER is the direction nobody investigates" failure `vacuity.ts`'s own header
warns about. It is now pinned against an absolute lower bound in
`vacuity.test.ts`. The 87→86 lowering already in this branch was legitimate
(Finding B deleted one real client pair) and stays.

**2026-09-28, implement (completion pass) — R1 was checked one condition
early: its fail-closed half did not hold for a gate decided at module scope.**
Re-audited against the brief's three R1 conditions rather than inherited. The
two-boot diff above booted each service twice, but the services were imported
**statically**, so their module scope was evaluated once, under vitest's
ambient `NODE_ENV="test"`, and both boots shared that evaluation. Measured with
a scratch edit to `services/users/src/routes/users.ts`
(`const SCRATCH_DEV_ROUTES = process.env.NODE_ENV !== "production"` at module
scope, the route registered inside the plugin when it is true): all 16
`fastify-owners.test.ts` tests stayed **green** and the route sat in the owner
table. So conditions 1 and 3 did not hold for that shape, and the § Notes scope
statement above ("a third `NODE_ENV` value, or a different variable") was
incomplete in exactly the way the brief warned against.

Fixed test-first. `fastify-owners.ts` now imports each service through a new
`importFresh(load)`, which calls `vi.resetModules()` before the dynamic import,
so each boot evaluates module scope under its own `NODE_ENV`. The mechanism is
pinned by a committed test against `src/module-scope-env.fixture.ts`; with
`importFresh` stubbed to a plain `load()` it failed with
`expected 'production' to be 'test'` (the module cache returning the first
evaluation), and passed once the reset was added. The same scratch edit then
turned the suite **red** on the recorded-set assertion, naming
`GET`/`HEAD /api/v1/users/scratch-dev-only`, and green again once reverted.
Transcript: the 2026-09-28 addendum to
`proof/env-conditional-route-fails-closed.md`.

Two consequences, both measured:

- Evaluating under `production` reached one module-scope requirement the old
  boot never did: `services/reservations/src/services/post-visit-notifier.ts:6`
  throws at import without `UNSUBSCRIBE_TOKEN_SECRET`. It joins
  `PRODUCTION_BOOT_ENV` as a fifth placeholder, for the same reason as the
  other four.
- "The production boot opens nothing" was re-measured under the new mechanism
  rather than inherited: zero socket, DNS or `fetch` attempts across
  `bootFastifyOwners()` and `close()`, with `REDIS_URL` unset and with it set
  to `redis://route-contract.invalid:6379`.

The recorded set is unchanged (`POST /api/v1/events/test` only), so no existing
module-scope gate was hiding in the three services. The join still re-derives
**86 pairs / 86 owned / 0 unowned** (reservations 74, users 7, agent 4, edge 1;
effective tables reservations 175, users 44, agent 56, edge 5). Still outside
what the diff can see, now stated in `bootFastifyOwners`'s doc comment: a gate
on a third `NODE_ENV` value, a gate on a different variable, and a gate inside
a package under `node_modules`, which `vi.resetModules()` leaves shared.

F2 needed no change. Re-verified here: `MINIMUM_CLIENT_PAIRS` lowered to 20
fails `MINIMUM_CLIENT_PAIRS › is pinned to an absolute floor`
(`expected 20 to be greater than or equal to 80`), and restoring it to 86
returns the suite to green.
