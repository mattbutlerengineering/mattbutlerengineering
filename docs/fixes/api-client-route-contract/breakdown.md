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
- [ ] **Prove the guard goes red on the 2026-08-30 literal and green once reverted** — the scratch-edit proof, run and captured (tracker: #5694)
  - Accept: green transcript, then RED after scratch-editing `packages/api-client/src/floor-plans.ts:58` back to `/api/v1/floor-plans/${id}/active`, then green after `git checkout -- packages/api-client/src/floor-plans.ts` — all three captured verbatim from real command output and handed to Verify; `git status --porcelain` shows no residual modification to that file; the RED transcript names the method, path, producing client method and edge disposition, demonstrating item 7's failure-message contract on a real failure; coverage stated explicitly for the record (which client modules and which four owners are compared, and what is knowingly excluded and why — host reachability, payload shape, non-client callers, and whether the handler works).
  - Distinct from the Fastify adapter's committed table (item 3), which pins the same distinction permanently with no working-tree edit. Do not collapse them: the brief's success criterion 2 asks for the end-to-end behaviour, not an adapter-level one.
  - Blocked by: Finding A; Finding B
- [ ] **Absorb the cold-cache CI run the new lockfile entry forces** (tracker: #5695)
  - Accept: the PR's first full `Test (Node 22)` job is green; any `Test timed out in 5000ms` in a package this run did not touch is fixed by `testTimeout: 15000` in _that_ package's `vitest.config.ts` — the recorded pattern — and not by a blind `gh run rerun`; the "Enforce repo-wide coverage threshold" step still passes (it folds in every `*/coverage/coverage-final.json` found by `find`, automatically, so the new package joins the denominator whether or not anyone wires it up); `./tools/route-contract/coverage/coverage-final.json` added to `ci.yml`'s codecov `files:` list, matching every other test-bearing package; `CI Gate` green (it is the only required check — `Visual Regression` and `codecov/patch` are advisory).
  - Why this is an item and not a footnote: `pnpm-lock.yaml` is a turbo `globalDependencies` entry, so adding a workspace package invalidates the cache for **every** task on this PR's run. That cold ~40-task-concurrent load has twice tipped marginal default-5 s-timeout suites over and broken `main` (`ec35b2cf` / #3588, and the `buildApp()` cold-start class before it). The failure arrives on a package this run never touched, so it reads as unrelated flake and invites the blind rerun that does not fix it.
  - Blocked by: Prove the guard goes red on the 2026-08-30 literal and green once reverted

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
rather than opened and stubbed. Checked that this cannot change the answer the
guard gives: `NODE_ENV`'s only other uses in the three services' bootstrap are
CORS origins, the fail-closed production auth check, and those two hooks —
**no route registration reads it**, so the table booted here is the table
production registers. Reservations, users and agent all reach `ready()` with no
database, no mocks and no ioredis output.

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
