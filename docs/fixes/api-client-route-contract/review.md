---
stage: review
run: maintenance:api-client-route-contract
date: 2026-09-22
assumptions:
  - "One **major** finding (R1) is recorded and deferred rather than fixed. The review skill says majors are `fixed or explicitly deferred by the user`; this run has no live user, and the orchestrator's standing rule blocks a release only on an unfixed CRITICAL. R1 is a wrong invariant in a doc comment with no measured impact on any of the 86 current pairs, so it is routed to the release record and to `docs/backlog.md` instead of re-opening Implement. The deferral was decided without live user input."
  - "F1 (`verification.md`) is resolved as **do not apply** the recorded `testTimeout: 15000` fix in this run. The brief asked Review to weigh `fix it here` against its own out-of-scope line and did not dictate the answer. Evidence for the decision is in § F1; the decision itself was made without live user input."
  - "This review ran the full three-pass (correctness / design / security) rather than the lighter pass the protocol's Run-scale section allows a maintenance run, because the brief authorizes Ship to EXECUTE the release and this artifact is the last gate before production. The depth choice was made without live user input."
  - "Re-review addendum (2026-09-28): the pass is scoped to what changed since the 2026-09-22 review: the R1 and F2 commits (`6fbdbc281`, `ea17000db`), the baseline raise (`1ff0b79dd`), and the merge (`2fec42b91`). It is not a second full pass over the branch. The review skill scales a maintenance-run review to its blast radius and says not to re-verify what Verify covered, so the earlier sections stand for everything else. Decided without live user input."
  - "Re-review addendum (2026-09-28): every severity and disposition in the addendum was graded without live user input. None is critical or major, so the review skill lets each be deferred freely, and no deferral here needed the user."
  - "Re-review addendum (2026-09-28): the ratchet-baseline raise Implement took (`breakdown.md` assumption 3) is accepted, not reversed, and the narrowing Implement offered as its cheap reversal is **not** recommended. The brief is silent on ratchet handling, and the repo's own pre-push hook names `--update` as the sanctioned way to accept a counted increase (`.husky/pre-push:35`). Decided without live user input."
re-reviewed: 2026-09-28
re-reviewed-head: 85c0884e8
unfixed-critical: 0
unfixed-major: 0
---

# Review: pinning `@mbe/api-client` URL literals to a route that answers them

## Scope

`git diff origin/main...HEAD` at `fix/api-client-route-contract`, 17 commits
ahead of `origin/main` `0a80ea85b` — 41 files, +4645/−53. Three substantive
surfaces:

1. **The guard** — `tools/route-contract` (`@mbe/route-contract`), a new leaf
   workspace package: 8 source modules, 7 test files, 59 tests.
2. **Two production fixes** in `packages/api-client` — Finding A
   (`health.ts`, `/api/health/system` → `/health/system`) and Finding B
   (deleting `VenueGroupsClient.getBySlug`).
3. **Blast radius of the new package** — one `pnpm-lock.yaml` importer block,
   `infrastructure/worker/dep-graph.json`, `docs/architecture/dependency-graph.md`,
   the regenerated llms artifacts, and one line in `.github/workflows/ci.yml`.

Everything asserted below was measured in this worktree today. Predecessor
figures were treated as claims to reproduce. The working tree was clean on
arrival (apart from untracked `.claude/sessions/*.md` hook output) and is clean
now; nothing under review was edited.

### What I re-measured rather than inherited

| Check                                                  | Result                                                                                       |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `pnpm --dir tools/route-contract test`                 | `Test Files 7 passed (7)` / `Tests 59 passed (59)`, exit 0                                   |
| `pnpm turbo test:coverage --force --concurrency=2`     | `52 successful, 52 total`, `Cached: 0 cached, 52 total`, exit 0, 4m5s — the exact CI command |
| `pnpm turbo test:coverage --concurrency=2 --dry-run`   | 76 tasks; `@mbe/route-contract#test:coverage` present, `dir tools/route-contract`            |
| `node scripts/check-orphaned-tests.mjs`                | `PASS: Every test file lives under a workspace package that CI runs.`                        |
| `node scripts/regen.mjs --check`                       | `All generated artifacts are up to date.`                                                    |
| `node tools/cli/dist/index.js check-adr`               | `✅ No architectural violations detected.`                                                   |
| `node tools/cli/dist/index.js check-deps`              | `✅ All external dependencies are consistent across the monorepo.`                           |
| `pnpm --dir tools/route-contract typecheck` / `lint`   | both exit 0                                                                                  |
| `prettier --check` over every changed file             | clean (the 4 `llms*.txt` have no parser; `prettier --check .` skips them)                    |
| dep-graph regenerated (`graph` + `generate:dep-graph`) | zero further diff                                                                            |
| Production probe (DNS cross-checked via `1.1.1.1`)     | see § The two production fixes                                                               |

## Findings

Seven findings. **None is critical. None blocks the release.**

### Major: R1 — the guard's own invariant "no route registration reads `NODE_ENV`" is false, and the exception registers a route production does not have

`tools/route-contract/src/fastify-owners.ts:87` pins `process.env.NODE_ENV = "test"`
before booting the three apps, and the doc comment at `:78-84` justifies it with:

> Nothing in the three services' route _registration_ reads `NODE_ENV`
> (measured: its only other uses are CORS origins, the fail-closed auth check,
> and those hooks), so the table this returns is the table production registers.

`breakdown.md` § Notes repeats the claim. It is wrong.
`services/reservations/src/routes/events.ts:181` reads:

```ts
// GET /events/test - Test endpoint to trigger an event (development only)
if (process.env.NODE_ENV !== "production") {
  fastify.post<{ ... }>("/test", { ... });
}
```

`eventRoutes` is registered unconditionally at prefix `/api/v1/events`
(`services/reservations/src/app.ts:231`), so under the guard's pinned
`NODE_ENV="test"` the reservations table contains `POST /api/v1/events/test`,
which production does not register. I grepped the three services' non-test
sources for every other `process.env.NODE_ENV` use: the rest are config
validation (`app.ts:111`, `:119`, `public-reservations.ts:14`), notifier
runtime, and CORS/auth in `packages/service-bootstrap/src/create-service-app.ts`.
This is the only route-registration gate — but one is enough to falsify the
invariant the pin rests on.

- **Scenario:** a future `@mbe/api-client` method targeting any route
  registered behind a non-production env gate (today, exactly
  `POST /api/v1/events/test`) → the guard boots with `NODE_ENV="test"`,
  `findRoute` matches, the verdict reports owner `reservations`, CI Gate is
  green, and production answers 404. That is the 2026-08-30 defect class
  reproduced _through_ the guard built to end it, in the false-green direction.
- **Impact today: none, measured.** `@mbe/api-client` has no `/events` surface
  at all (`grep -n events packages/api-client/src/*.ts` → zero non-test hits;
  SSE is built by `apps/hospitality/src/hooks/useSSESync.tsx:330-331`, which
  owns its own URL and is a declared non-client caller). The 86/86 owner
  verdict I re-derived is unaffected.
- **Why not critical:** nothing shipped is wrong, no current pair depends on
  the hole, and the guard's verdict on all 86 real pairs stands. Why not minor:
  a load-bearing invariant stated as "measured" is false, and the class it
  opens is precisely the one the guard exists to close.
- **Decision: deferred.** The fix is a doc correction at `fastify-owners.ts:78-84`
  and `breakdown.md` § Notes, optionally plus an assertion that no client
  pair's only owner is an env-gated route. Ship should name it in
  `release.md`; Operate should seed it to `docs/backlog.md`.

### Minor: R2 — the edge classifier's default branch is fail-open, and "owner" is the default

`tools/route-contract/src/edge-owner.ts:148-154`:

```ts
const tag = response.headers.get(PROBE_HEADER);
const disposition: EdgeDisposition =
  tag === "origin" ? "forwarded-to-origin" : tag === "static" ? "static-spa" : "edge-terminal";
```

and `route-contract.ts:61` turns `edge-terminal` into an owner. So **any**
response the edge returns that did not come from one of the two tagged stubs is
read as "the edge answers this" — including responses the edge generates to say
the opposite.

- **Scenario:** a client literal under `/dashboard` (301 at
  `infrastructure/worker/edge-router.js:177-186`) or ending in `.map` (bare 404
  at `:263-265`) is reported owned though nothing answers it. The other
  self-generated responses — `rateLimitResponse()` (`:137`) and
  `brandedErrorPage()` (`:210`, `:237`, `:244`, `:305`, `:311`) — fall in the
  same branch; they are unreachable under this harness only because the KV stub
  returns `null` for every `get` (so the counter is 0 and the circuit is
  closed) and the origin stub always answers 200. They are unreachable by
  accident of the stub, not by design.
- **What does catch a wide version:** a _global_ over-classification is loud —
  `edge-owner.test.ts:14-31` would fail (the origin and SPA rows would
  classify `edge-terminal`), and `route-contract.test.ts:65-73` asserts
  `venues.getBySlug`'s owners are exactly `["reservations"]`, which would
  become `["reservations","edge"]`. A _single-path_ over-classification is not
  caught by anything.
- **Decision: deferred.** The safer shape is to accept `edge-terminal` only
  when the path is in `EDGE_TERMINAL_PATHS`, or to refuse to classify an
  untagged 3xx/4xx/5xx as ownership. Non-blocking: no current pair reaches the
  branch (dispositions re-derived as 81 forwarded / 4 static-spa / 1
  edge-terminal).

### Minor: R3 — the `edge` anti-vacuity signal is a literal, not a measurement

`route-contract.ts:74` populates the report with
`edgeTerminalPathCount: EDGE_TERMINAL_PATHS.length`, and `EDGE_TERMINAL_PATHS`
(`edge-owner.ts:66-72`) is a hardcoded five-element array. `vacuityInputFromReport`
feeds that into `ownerTableSizes.edge`, so the clause
`route owner table(s) are empty: edge` (`vacuity.ts:80-85`) **can never fire on
a real report** — unlike the three Fastify counts, which come from the booted
apps' own `printRoutes()` (`fastify-owners.ts:96`).

- **Scenario (the decayed contract):** `edge-owner.ts:56` calls `terminalPaths`
  "the anti-vacuity signal for this owner" and `vacuity.test.ts:63-74`
  exercises the `edge` clause against a synthetic input, so the pair reads as a
  measurement the report never makes. A reader auditing whether the edge owner
  can go vacuous will find a clause that looks live and is inert.
- **Mitigating fact, verified:** the property itself _is_ covered, just
  elsewhere — `edge-owner.test.ts:9-12` asserts all five paths really classify
  `edge-terminal` against the real router, so the list cannot drift into
  fiction. This is a structure/documentation finding, not a live hole.
- **Decision: deferred.**

### Minor: R4 — the roster-vs-exports anti-narrowing assertion depends on a naming convention

`client-inventory.ts:19-21` states the first of three defences: "a sub-client
wired into `index.ts` but not into the roster fails the suite." That holds only
for a class that is (a) exported from `index.ts` and (b) matches
`CLIENT_CLASS_NAME = /^[A-Z]\w*Client$/` (`client-inventory.ts:129`), because
`exportedClientClassNames()` filters `Object.entries(apiClientModule)` on
exactly that regex.

- **Scenario:** a future sub-client named `PaymentsApi` (or reachable only
  through `createApiClient`'s returned object, with its class unexported) is
  added to the factory and not to `ROSTER`. `exportedClientClassNames()` never
  sees it, `uncovered` stays `[]`, every one of its paths goes undriven, the
  pair count stays at or above the floor, and the whole suite is green while
  the client's surface grew unchecked.
- **Today it works:** all 15 sub-clients satisfy both conditions (verified
  against `packages/api-client/src/index.ts:1-43` and `:81-97`).
- **Decision: deferred.** The structural close is cheap — assert the roster
  against `Object.keys(createApiClient({ baseUrl: "" }))` (the factory's own
  returned shape) instead of against exported class names, which removes the
  convention dependency entirely.

### Minor: R5 — `verification.md`'s F1 recommends a remedy that is already applied, and that cannot apply to one of the two victims

F1 closes with: "the repo has now observed this condition at least four times
without anyone raising either package's `testTimeout`, which is the recorded
fix pattern." Both halves are false, measured:

- `packages/rialto/vitest.config.ts:53` already sets `testTimeout: 15000`, and
  `:65` already sets `hookTimeout: 30000` (with a comment naming six prior
  nightly failures). Its failing case is
  `await waitFor(..., { timeout: 3000 })` written **inside the test body**
  (`packages/rialto/src/components/Toast/Toast.test.tsx:59-61`) — a limit
  `testTimeout` does not govern at all. Raising `testTimeout` cannot fix it.
- `apps/rialto-web/vitest.config.ts:69` already sets `testTimeout: 15000`, and
  the failure Verify quoted is literally `Test timed out in 15000ms` — the
  recorded fix is in place and did not prevent it.

- **Scenario (the decayed contract):** Ship reads F1, applies the recorded
  pattern to two untouched packages, and ships a no-op diff that cannot be
  verified against the shape CI actually runs — while believing a known
  condition has been closed.
- **Decision: deferred, and recorded here as a correction.** `verification.md`
  is not rewritten: predecessor artifacts stand as written, and this artifact
  is where the correction belongs. Ship must not act on F1's suggested remedy.

### Nit: R6 — `bootFastifyOwners` mutates `process.env.NODE_ENV` globally and never restores it

`fastify-owners.ts:87`. Harmless in practice — vitest already sets
`NODE_ENV=test`, and pinning it is what lets `getManageTokenConfig` /
`getStripeConfig` warn instead of throw (`services/reservations/src/app.ts:110-121`)
— but it is a process-global mutation in a package that is otherwise pure, and
it is what R1 hangs off. Decision: deferred.

### Nit: R7 — `packages/api-client/src/contract.test.ts` still over-claims its name (pre-existing, carried)

Flagged at Capture, Architect and Verify: it imports both "sides" from
`@mbe/types/schemas`, imports no service, and therefore checks the payload-shape
half only. Now that the path half lives in a separate package, the name is more
misleading than before, not less. Explicitly out of scope per the brief
("Broad cleanup of adjacent code. Flag, do not fix"). Decision: deferred —
carry to `release.md` and seed to `docs/backlog.md`.

## The two findings Verify left open

### F1 — root `pnpm test` red on untouched packages

**I agree with Verify's environmental grading, and this run should _not_ apply
the recorded fix.** Four reasons, the last one new:

1. The brief's out-of-scope line is explicit: "Broad cleanup of adjacent code.
   Flag, do not fix."
2. Neither package appears in the branch diff
   (`git diff --name-only origin/main...HEAD -- packages/rialto apps/rialto-web`
   → empty).
3. The command CI runs is green. I reproduced it cold myself, independently of
   Implement and Verify: `pnpm turbo test:coverage --force --concurrency=2` →
   `52 successful, 52 total`, `Cached: 0 cached, 52 total`, exit 0. That is now
   three independent green runs of the CI-shaped command against one red
   uncapped command.
4. **The recorded fix is already applied to both victims and is inapplicable to
   one** — see R5. "Nobody has applied `testTimeout: 15000`" is false; it has
   been applied to both, and the rialto failure is governed by an in-test
   `waitFor` timeout that `testTimeout` does not reach.

I also agree with keeping criterion 5 at **PARTIAL** rather than promoting it.
The brief's wording is literal and `pnpm test` was not green; calling that PASS
would be exactly the kind of quiet reinterpretation this run exists to prevent.
The honest statement — the gate CI enforces is green, the root command as
literally written is red for reasons that predate this branch — is the one
Verify made, and it survives review.

### F2 — the anti-vacuity floor's absolute value is unpinned

**Confirmed by reading all three call sites, graded minor, not fixed here.**
`vacuity.test.ts:15` seeds its healthy fixture at `MINIMUM_CLIENT_PAIRS`,
`:37` tests narrowing at `MINIMUM_CLIENT_PAIRS - 1`, and
`client-inventory.test.ts:37` asserts `pairs.length >= MINIMUM_CLIENT_PAIRS`.
Every one is relative; lowering the constant to ~20 leaves all 59 tests green.

**Is that acceptable for a guard whose purpose is to not silently narrow?
Narrowly, yes — and the phrase "anti-vacuity contract" over-promises.**

The floor is the only one of five clauses that can be satisfied by editing a
number. The other four are structural and I verified each is exercised against
a real (not synthetic) input:

- a roster sub-client contributing zero pairs fails
  (`client-inventory.test.ts:95-101`, run over the live inventory);
- a non-exempt method issuing zero requests in its own invocation fails
  (`client-driver-completeness.test.ts:57-64`), with the roster read off the
  real prototypes (`client-inventory.ts:148-151`);
- a Fastify owner table coming back empty fails, from the booted app's own
  `printRoutes()`;
- the roster's class names are asserted against the module's real exports
  (`client-inventory.test.ts:84-93`) — subject to R4.

So the accidental narrowing shapes are caught with or without the floor. The
one shape where the floor is the _sole_ detector is a path-normalization
regression that collapses distinct pairs while every method still issues a
request — and hiding that still requires a human to lower a documented constant
in a reviewed diff. That is a real protection in this repo's workflow, and it
is weaker than the name suggests, which is exactly how Verify put it.

The cheap close, for the backlog rather than for this run: assert an absolute
lower bound on the constant itself (e.g.
`expect(MINIMUM_CLIENT_PAIRS).toBeGreaterThanOrEqual(80)`), which pins the
number without deriving it from the driver it is supposed to police.

Separately: **lowering 87 → 86 in this run was correct.** The floor fired on a
deliberate one-pair surface reduction (Finding B) and was reset with the reason
attached in three places, including the constant's own doc comment
(`vacuity.ts:29-37`). That is the mechanism working.

## Can the guard be made vacuously green?

**Not by accident. Only by a deliberate, visible source edit — and three narrow
future changes would slip past it.**

Every accidental path I could construct fails closed, and each is exercised
rather than described:

| Attack                                        | Outcome                                                                                                    |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Driver produces no pairs                      | RED — `pairCount === 0` clause, plus `formatUnowned` would have nothing to compare                         |
| Driver narrows below the measured surface     | RED — floor clause (subject to F2)                                                                         |
| A sub-client stops being constructed / driven | RED — per-sub-client zero-pairs clause **and** `leaves no method unaccounted for`                          |
| A client method stops issuing a request       | RED — per-invocation counting; the three legitimate aliases are pinned as non-false-positives              |
| A method throws before its request            | RED — the `catch {}` at `client-inventory.ts:246-249` swallows the throw but `requestCount` stays 0        |
| A Fastify app registers nothing               | RED — `routeCount` is parsed from the booted app's `printRoutes()`                                         |
| `buildApp` / `driveClient` throws             | RED — no try/catch wraps the boot or the drive; `beforeAll` fails the suite                                |
| `findRoute` starts matching everything        | RED — `fastify-owners.test.ts:74-76` asserts a nonexistent path has no owner, against the real app         |
| The edge starts answering everything itself   | RED — `edge-owner.test.ts:14-31` and `route-contract.test.ts:65-73` (owners would gain `"edge"`)           |
| The whole package stops running in CI         | RED — `check-orphaned-tests.mjs` fails; and I confirmed the task in turbo's graph for the exact CI command |

The residual holes are **R1** (a route production does not register), **R2**
(one path the edge answers with an untagged response), **R4** (a sub-client that
breaks the naming convention) and **F2** (a deliberately lowered constant). All
four need a specific future change; none is reachable on this diff.

## The client inventory is honest

Re-derived by running the suite, not copied: **86 distinct pairs from 95
invocations across 15 sub-clients**, and the per-sub-client table in
`proof/scratch-edit-proof.md` sums to exactly 86 — i.e. no pair is
double-counted across sub-clients. Owner hits 74/7/4/1 and dispositions
81/4/1 both total 86.

- `AgentSessionClient` **is** handled: `createApiClient` genuinely omits it
  (`packages/api-client/src/index.ts:81-97` — I read the factory's return
  object; it has 14 entries and no `agentSessions`), and the driver constructs
  it separately (`client-inventory.ts:155`, `:182`). Its four `/v1/sessions`
  paths are asserted by name (`client-inventory.test.ts:66-81`), so a driver
  built from the factory alone would fail rather than silently miss them.
  Worth recording for the release: those four are the run's `static-spa` pairs
  — owned by `services/agent` but served the marketing SPA at the apex — and
  **no production consumer of `AgentSessionClient` exists** (repo-wide grep:
  the only constructions are the guard itself and the client's own unit test),
  so the documented host-reachability exclusion has nothing live behind it
  today.
- `streamNDJSON` is excluded _and asserted excluded_
  (`client-inventory.test.ts:109-110` pins both the reason text and that it
  contributes no pair).
- The three exempt methods are pinned in three directions — reason present,
  method exists on the real roster, method really issues nothing
  (`client-driver-completeness.test.ts:98-120`). Verify's "two of three blind
  spots are asserted" is if anything understated: all three are.
- Path hygiene is asserted, not assumed: `malformedPaths`
  (`client-inventory.ts:312-323`) rejects `undefined` / `null` /
  `[object Object]` / `NaN` / empty segments, which is the failure mode of a
  placeholder that did not land where intended and still issued a request.

## The two production fixes

Both correct and complete. Probed today, read-only, with DNS cross-checked
first because this LAN's resolver has invented an outage before:

```
$ dig @1.1.1.1 +short mattbutlerengineering.com   → 172.67.222.73, 104.21.25.32
$ dig +short mattbutlerengineering.com            → same two, no sinkhole

$ curl --resolve mattbutlerengineering.com:443:172.67.222.73 …/api/health/system
HTTP 404  {"message":"Route GET:/api/health/system not found","error":"Not Found","statusCode":404}

$ curl … /health/system
HTTP 200  {"status":"healthy","timestamp":"2026-09-23T01:36:59.540Z","requestId":"9bc7e1ee-…",
           "subsystems":{"services":{"status":"healthy"},"static_sites":{"status":"healthy"},
           "ci":{"status":"healthy"},"deploys":{"status":"healthy"}}}

$ curl … /api/v1/venues/groups/by-slug/x
HTTP 404  {"message":"Route GET:/api/v1/venues/groups/by-slug/x not found",…}
```

**Finding A is complete, including the part nobody had checked: the caller's
base URL.** The fix only works if the request reaches the edge, and the edge is
only in the path at the apex. `apps/hospitality/src/hooks/useApiClient.ts:12`
sets `baseUrl: import.meta.env.VITE_API_URL ?? ""`, and
`.github/workflows/deploy-static.yml:183` builds the shipped bundle with
`VITE_API_URL: https://mattbutlerengineering.com`. So the live request is
`https://mattbutlerengineering.com/health/system` — the apex, the edge, the 200
above. Had that variable pointed at `api.mattbutlerengineering.com`, this fix
would have swapped one 404 for another; it does not.

The response also parses. The live body is exactly the "coarse" shape
(`checks` and `migrations` omitted) that
`packages/types/src/schemas/health-system.test.ts:133-134` pins as valid
against `systemHealthSchema` (`health-system.ts:106-111`), which is the schema
`HealthClient.system()` validates with (`health.ts:42`). So the fix swaps a 404
for data, not for an `ApiValidationError`.

**Finding B orphaned nothing.** Zero repo references to
`VenueGroupsClient.getBySlug` survive (the only hits are this run's own prose
and two explanatory comments in the guard); `venueGroups` appears nowhere under
`apps/`; `VenueGroupSchema` is still imported and used four other times in
`venues.ts` (`:24`, `:116`, `:124`, `:131`), so the deletion left no unused
import; `packages/api-client/CLAUDE.md:55` dropped the method from the
`venueGroups` row and kept the `venues` row's own `getBySlug()`; and the llms
artifacts were regenerated (`packages/api-client/llms-full.txt` lost the method
body, `llms.txt` lost the signature). `route-contract.test.ts:65-73` pins that
the **venue** by-slug path the three `apps/hospitality` call sites use is
intact and owned by `reservations`.

One recorded consequence, unchanged and correctly carried: Finding A's path
moves rate-limit buckets — 10 req/60 s at `/health/system` against 100 at
`/api/` (`infrastructure/worker/rate-limiter.js:16-17`) — versus
`SystemHealthBadge`'s 60 s poll. Accepted at Architect; must appear in
`release.md`. Verify's added note stands: the live 200 carries no
`x-ratelimit-*` headers, so the bucket is not observable from the response.

## Blast radius of the new workspace package

Checked as artifacts, not as file existence:

- **`pnpm-lock.yaml`** — one new `tools/route-contract:` importer block, six
  `workspace:*` links plus four `catalog:` entries. **No new external
  dependency**, so no new CVE surface and no `pnpm audit` exposure. It is a
  turbo `globalDependencies` entry, so this PR's CI run executes every task
  cold — which is exactly the run I reproduced green above.
- **`infrastructure/worker/dep-graph.json`** — node added, plus all **six**
  devDependency edges (the five guard deps and `@mbe/config`).
- **`docs/architecture/dependency-graph.md`** — node added under
  `Developer Tools`, with **five** arrows and no `edge-worker` arrow. I
  verified the stated reason rather than accepting it:
  `scripts/generate-dep-graph.js:20` sets
  `MERMAID_DIRS = ["apps","services","packages","tools","scripts"]` and `:84`
  filters nodes to those, so `infrastructure/*` is excluded by design — and
  `apps/rialto-web`, which also devDepends on `@mbe/edge-worker`, renders the
  same way (`dependency-graph.md:72-76`, no `rialto_web --> edge_worker`).
  Generator behaviour, not drift.
- **Determinism** — re-running both generators produced **zero** further diff,
  and `node scripts/regen.mjs --check` reports `All generated artifacts are up
to date.` No `llms.txt` was added under `tools/route-contract` and no
  `FAMILIES` entry was needed, matching `tools/mutation-testing`.
- **`ci.yml`** — a single line: `./tools/route-contract/coverage/coverage-final.json`
  added to the codecov `files:` list. No new workflow and no new job, which is
  what keeps this clear of the `GITHUB_TOKEN` anti-recursion class entirely.

## Does it genuinely run in CI on pull requests?

**Yes — verified independently of `verification.md`'s chain.**

- `ci.yml`'s `pull_request: branches: [main]` trigger carries no
  `paths:`/`paths-ignore:` filter (`paths-ignore` exists only on `push`).
- `detect-changes` sets `has_code=true` for this PR (it diffs excluding `*.md`,
  `docs/`, `*.png`; this branch changes `tools/**`, `packages/api-client/**`,
  `.github/workflows/ci.yml`, `pnpm-lock.yaml`), so `prepare` and the whole
  chain run.
- `test` (`ci.yml:465-468`) needs `[lint, typecheck, architecture-audit]` and
  runs `pnpm turbo test:coverage --concurrency=2` at `:541`.
- `test` is a member of `ci-gate`'s `needs` list (`ci.yml:976-999`), and
  `CI Gate` is the only required check on `main`.
- The decisive link, measured by asking turbo rather than by reading
  `package.json`: the dry-run of the **exact CI command** lists
  `@mbe/route-contract#test:coverage` among its 76 tasks, with
  `dependencies: [@mbe/agent-service#build, @mbe/api-client#build, @mbe/config#build,
@mbe/edge-worker#build, @mbe/reservations-service#build, @mbe/users-service#build]`
  — which also settles the one real staleness risk, since the driver runs the
  **built** client (`packages/api-client`'s `exports["."]` resolves `default`
  to `./dist/index.js`) and `^build` makes that dist fresh in CI.
- `node scripts/check-orphaned-tests.mjs` — the repo's own guard against this
  exact class — passes with no new allowlist entry.

## Security

Clean. Specifically checked, because the guard boots three real services and a
Worker:

- **No secret in any new file.** Scanned `tools/route-contract/src/` for
  `sk_live`/`pk_live`/`AKIA`/`ASIA`/PEM headers/JWT-shaped strings/assigned
  literals ≥16 chars — zero hits. The only value the harness supplies is a
  public hostname (`edge-owner.ts:121`, `API_ORIGIN`) and empty KV stubs
  (`:114-118`).
- **No credential is needed and none is faked into working.** The services log
  `MANAGE_TOKEN_SECRET is not set` / `STRIPE_SECRET_KEY is not set` during the
  run — correct: the harness boots with genuinely absent secrets and the
  services' own fail-closed logic warns in test and throws only in production.
  Nothing in the diff weakens that logic; the `NODE_ENV` pin is what keeps the
  boot in the warn branch (and is R1's root).
- **No network and no database.** Both `globalThis.fetch` swaps are installed
  and restored in `finally` (`client-inventory.ts:206-257`,
  `edge-owner.ts:135-159`), with restoration asserted for the edge
  (`edge-owner.test.ts:47-51`). No telemetry/OTLP exporter is started by any
  `buildApp` (grepped). `findRoute` never enters a handler and Prisma connects
  lazily — proven by all three apps reaching `ready()` with no `DATABASE_URL`.
  Honest limit: the Fastify boots run with the real `fetch` restored, so
  absence of egress during boot is observed, not proven.
- **No injection surface added.** The guard writes nothing, reads no user
  input, and builds no query. `AUDIT_TOKEN` is deliberately absent from the
  stub env, so `isAuditRequest` (`edge-router.js:49-53`) returns false and no
  bypass is exercised.

## Passes with no findings

- **Correctness of the two production fixes** — both re-probed live, both
  complete, deletion left no orphan.
- **Design** — the implementation matches `architecture.md`'s contracts:
  `findRoute` (not `hasRoute`/`printRoutes` parsing/`inject`), classification
  by the returned response (not by which spy fired, and asserted as such),
  one-directional client → owner with no allowlist and no skip, driver outside
  `packages/api-client` so its `size-limit` budgets are untouched. All five
  Implement deviations recorded in `breakdown.md` § Notes are real and
  measured; I re-verified the two that carry a factual claim (the
  six-vs-five dep-graph edges, and the `NODE_ENV`-instead-of-`ioredis-mock`
  choice — whose _mechanism_ is right and whose _justification_ is R1).
- **Protocol compliance** — `re-entry: architect` in `defect.md` is honoured
  (architecture + breakdown + all 12 checkboxes checked + verification), the
  backlog seed is claimed in place with `(claimed: maintenance:api-client-route-contract)`
  and its origin marker untouched, and every artifact carries conforming
  frontmatter.
- **Repo gates beyond the ones Verify ran** — `check-adr`, `check-deps` and
  `prettier --check` over the changed files are all green, so the
  `Architecture Audit` and `Build` legs of `CI Gate` have nothing to object to.

## Verdict

**Ready to ship. No critical finding. Nothing blocks the release.**

The guard is a gate, not a decoration: it runs under the only required check on
every pull request, it goes red on the known-bad input and on two real defects
it was never told about, it states its coverage honestly, and its five
anti-vacuity clauses close every accidental narrowing path I could construct.
Both production fixes are correct, complete and live-verified, and the new
package's blast radius is fully regenerated and deterministic.

Ship should carry four things into `release.md`:

1. Both findings by name, with Finding A's rate-limit-bucket consequence
   (10 req/60 s against a 60 s poll) recorded as an accepted decision.
2. **R1**, as a known gap with no current impact — the `NODE_ENV` pin admits
   one dev-only route into the guard's table.
3. **R5** — do **not** act on `verification.md`'s F1 remedy; it is already
   applied and cannot fix the case it names.
4. Criterion 5's open half — `CI Gate` green on the PR is still Ship's to
   observe, and the first run will be cold across every task because of the
   lockfile entry. If a timeout surfaces in an untouched package, R5 says the
   recorded pattern is not the answer; read the actual failure first.

Operate should seed R2, R3, R4, F2's absolute-floor pin, and R7 to
`docs/backlog.md`.

## Re-review addendum — 2026-09-28 (head `85c0884e8`)

Appended, not rewritten. Everything above this line is the 2026-09-22 review
of the pre-merge branch. It stands as written except where this addendum says
it is superseded. `autorun-brief.md` Round 3 overrode that review's deferral of
R1 and F2 with a live-user instruction to fix both, and Round 4 added the merge
of `origin/main`. This addendum re-adjudicates R1 and F2, grades Verify's N1–N6,
and reviews what the merge introduced.

### Scope

Read as code, not as reports:

- `6fbdbc281` (R1): `tools/route-contract/src/fastify-owners.ts`, its test, and
  `module-scope-env.fixture.ts`.
- `ea17000db` (F2): `vacuity.ts` and `vacuity.test.ts`.
- `1ff0b79dd`: the baseline raise in `metrics/ai-antipattern-baselines.json`.
- `2fec42b91`: the merge. I recomputed a clean merge of its two parents and
  diffed the result against the committed tree.

`ee6f2a834` (llms regen), `ab73e5f7e` and `85c0884e8` (docs) were checked for
scope only. Per the review skill's maintenance-run rule, I did not re-run the
gates Verify already ran uncached on `1ff0b79dd`. `85c0884e8` adds only
`verification.md` on top of that commit.

### Measured for this addendum

| Check                                                                       | Result                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --dir tools/route-contract test` on `85c0884e8`                       | `Test Files 7 passed (7)` / `Tests 68 passed (68)`, `Duration 3.07s`, exit 0, 4 s wall. The client `dist` was checked first: `deposits.js` has `getByReservation`, `health.js:17` is `/health/system`, and no `packages/api-client/src/*.ts` is newer than `dist/index.js` |
| `node scripts/check-ai-antipatterns.mjs` on `85c0884e8`                     | all 8 `OK`; `emptyCatch: 78 (baseline: 78)`, `hardcodedRoutes: 847 (baseline: 847)`; exit 0                                                                                                                                                                                |
| Same, on HEAD merged with today's `origin/main` `7ac892126`                 | `git merge-tree --write-tree HEAD 7ac892126` → `d34513808`, exit 0. That tree was exported with `git archive` and scanned: identical counts, `All patterns within baseline.`, exit 0                                                                                       |
| Ratchet attribution, via the script's own exported `scanAll()`              | `tools/route-contract` at HEAD: `hardcodedRoutes 24`, `emptyCatch 1`. `packages/api-client`: `hardcodedRoutes` 84 at merge base `0a80ea85b` → 82 at HEAD; `emptyCatch` 3 → 3                                                                                               |
| Clean merge of `2fec42b91`'s parents (`ee6f2a834`, `49c7d773d`), recomputed | `git merge-tree --write-tree` → exit 1, exactly one conflict (`docs/backlog.md`). `git diff <recomputed> 2fec42b91 --stat` → `docs/backlog.md \| 5 -----` and nothing else                                                                                                 |
| Conflict markers left at HEAD                                               | `git grep '^<<<<<<< \|^>>>>>>> ' HEAD` → none                                                                                                                                                                                                                              |

### R1 — fixed. The review's one major is closed.

All three Round-3 conditions hold in the code.

1. **The owner table is production's table.**
   - `answers()` is true only when both routers match: the `test` boot and the
     never-`ready()`-ed production reference boot (`fastify-owners.ts:321-323`).
   - `routeCount` counts the same intersection (`:317-318`), so the
     anti-vacuity signal describes the table the verdict actually consults.
   - `fastify-owners.test.ts:175` pins `POST /api/v1/events/test` to no owner.
     `:179` pins its sibling `/api/v1/events/stream` to `reservations`, so a
     fix that dropped the whole prefix would fail.
   - Verify § 2c shows the exclusion holding through the whole join.
2. **The false invariant is corrected, not softened.**
   - The doc comment (`fastify-owners.ts:238-290`) now says the old invariant
     "was false" and names the route.
   - It states three limits: a third `NODE_ENV` value, a different variable,
     and a gate inside `node_modules`.
   - `breakdown.md` § Notes keeps the original sentence only as a quotation
     inside a labelled correction. Its 2026-09-28 note also corrects that
     note's own incomplete scope statement.
3. **It fails closed on a new env-gated route, with no client pair needed.**
   - The measured difference is asserted _equal_ to `ENV_CONDITIONAL_ROUTES`
     (`fastify-owners.test.ts:187-198`). So adding a gated route goes red, and
     so does removing the recorded one.
   - The measurement covers both directions (`fastify-owners.ts:325-338`).
   - A function-scope gate is caught by the two-boot diff.
   - A module-scope gate is caught because `importFresh()` calls
     `vi.resetModules()` first, so each boot evaluates service modules under
     its own `NODE_ENV` (`:233-236`). That mechanism has its own pin against a
     fixture (`fastify-owners.test.ts:113`).
   - Verify re-proved all three shapes RED→GREEN in services Implement had not
     used. It also ran a control showing that deleting `vi.resetModules()`
     turns only the `importFresh` pin red.

**Is anything in the stated blind spot today? No.** I grepped `process.env.`
across `services/{reservations,users,agent}/src/{routes,app.ts}`. Every read of
anything other than `NODE_ENV` happens at config or handler time: `STRIPE_*`,
`MANAGE_TOKEN_SECRET`, `API_BASE_URL`, `GITHUB_TOKEN`, `PORT`, `AGENT_API_URL`.
All 28 function-level `await fastify.register(…)` calls in reservations'
`buildApp` are unconditional. Main's merged changes to these trees add no
registration gate either. `RLS_CONTEXT_MODE` is read at query time. The only
new `NODE_ENV` text is a comment in `rls-route-sweep.fixtures.ts:87` naming the
same `events/test` route.

**New risks the fix could have introduced, each checked:**

- **Does `vi.resetModules()` leak into other tests? No.**
  - _Across files:_ this package runs vitest 5.0.1. Its defaults set
    `isolate: true` (`dist/chunks/defaults.D2ip7f-X.js:52`), which its own
    source describes as "spawns a fresh worker per test file"
    (`dist/chunks/index.DzobfTyw.js:19034`). This package's config sets no
    `pool` and no `isolate` (`tools/route-contract/vitest.config.ts`).
  - _Within a file:_ only two files boot the services.
    `route-contract.ts:48-49` drives the client _before_ calling
    `bootFastifyOwners()`, and nothing imports dynamically afterwards. In
    `fastify-owners.test.ts`, the later tests use static bindings, and the one
    test that resets again (`:113`) does so on purpose.
  - _Module-scope side effects of evaluating the three service graphs twice:_
    none is reachable. Sentry is initialised in `start-service-server.ts:44-48`
    and the agent liveness monitor starts in `services/agent/src/index.ts:13`.
    `buildApp` reaches neither. The lapsed-guest monitor and the job worker sit
    behind `onReady`, which the reference boot never fires.
  - _Mocks:_ the package mocks nothing (`vi.mock` / `vi.doMock` → no hits), so
    the fact that `resetModules` keeps the mock registry has nothing to act on.
- **Are the production placeholder secrets restored on throw? Yes.**
  - `overrideEnv` is applied before a `try` whose `finally` restores the
    environment (`fastify-owners.ts:295-304`).
  - It restores keys that were set and deletes keys that were not (`:201-214`).
    Both branches have their own test (`fastify-owners.test.ts:95`).
  - Apps built before a throw are not `close()`d. That has no failure
    scenario: nothing listens, the suite has already failed, and the worker
    exits with the file. Not a finding.
- **R6, the global `NODE_ENV` mutation: not worsened, and no longer
  load-bearing.**
  - The permanent pin is the same statement, moved from `:87` to `:306`.
  - The new transient `production` window is `try`/`finally`-scoped and sits
    inside `beforeAll`. Neither booting file runs a concurrent test, and the
    window never leaves that file's worker.
  - What changed is that correctness no longer depends on the pinned value,
    because `answers()` intersects the two boots. R6 was "what R1 hangs off";
    it no longer is.
  - One side effect is new. Externalised packages are first loaded during the
    production boot, so they stay cached with `production` for the rest of that
    file. The framework packages the apps boot through do not read `NODE_ENV`
    at all: `fastify`, `@fastify/rate-limit` and `@fastify/cors` contain 0
    files mentioning it. And because the reference boot runs first, any such
    gate would give both boots production's answer, which is the safe
    direction.
  - **R6 regraded: nit, accept.**

### F2 — fixed

- `vacuity.test.ts:37-39` asserts `MINIMUM_CLIENT_PAIRS >= 80`, exactly the
  assertion Round 3 named.
- The constant stays 86 (`vacuity.ts:43`), and its doc comment now records why
  the absolute pin exists.
- Verify § 3 measured 20 → RED (`expected 20 to be greater than or equal to 80`)
  and 80 → green. That residual 80–86 window is N4 below.

### The ratchet-baseline raise — accepted, and the proposed narrowing is not recommended

**The raise is this branch's own; I reproduced the attribution per
directory.** `tools/route-contract` contributes `hardcodedRoutes 24` and
`emptyCatch 1`, and `packages/api-client` drops from 84 to 82. That is +22 and
+1, matching `1ff0b79dd`'s `825 → 847` and `77 → 78` on top of main. The 24 are
the literal paths the guard compares against the routers. Routing them through
either side's constants would make the guard compare a thing to itself. The
repo's own pre-push hook names `--update` as the way to accept a counted
increase (`.husky/pre-push:35`).

**The catch at `client-inventory.ts:246-249` is genuinely safe today.** It
swallows two cases:

- A throw _after_ the request (count ≥ 1) is the expected case, because the 204
  recorder returns no body.
- A throw _before_ any request (count 0) records `requestCount: 0`. That fails
  `client-driver-completeness.test.ts:58-64` and the `silentClientMethods`
  clause (`vacuity.ts:79-81`), which names every such method at once.

The catch leans on one assumption: each method issues one request, so a throw
after the first request cannot hide a second path. That holds today. An awk
pass over `packages/api-client/src/*.ts`, split at two-space-indented method
heads, found 89 segments with exactly one `this.client.*` call and none with
two or more. The five delegations (`floor-plans.ts:40`, `:66`;
`deposits.ts:59`, `:66`, `:73`) each target a single-call method.

**Implement's narrowing (`if (current.count === 0) throw error;`) is not
strictly better.**

- It closes nothing new: the count-0 case is already red.
- It trades an aggregated diagnosis that names every silent method for an abort
  on the first raw exception, in the `beforeAll` of three suites.
- As written, it ignores `exempt`, so an exempt method that threw would red the
  suite. `holds.sessionHeaders` is exempt _and_ documented to throw when there
  is no session id (`packages/api-client/src/availability.ts:206-209`). It stays
  quiet only because the roster's `prepare` sets an id before every invocation
  (`client-inventory.ts:174`, `:242`).

Its only gain would be the exception text for a silent method. **No finding.**
If that diagnostic is ever wanted, record the error on the `Invocation` and
print it in the vacuity message rather than rethrowing.

### N1–N6, from `verification.md` § Findings for Review to adjudicate

| ID                                                                                         | Severity                                | Disposition                                                                                                                        | Reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1 — root `pnpm test` is red on `origin/main` alone; `rialto-catalog` has no `testTimeout` | minor (pre-existing, not this branch's) | **accept** for this run (Round 3: no `testTimeout` here); **defer** the `rialto-catalog` timeout to `docs/backlog.md`, via Operate | The victims are packages the branch does not touch, and the same `users` `ready.test.ts` fails on both trees. It is the uncapped command, not the one CI runs                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| N2 — the branch adds tasks to the uncapped root `pnpm test`                                | nit                                     | **accept**                                                                                                                         | CI runs one Node 22 leg of `pnpm turbo test:coverage --concurrency=2` (`ci.yml:552`), so the guard is one extra task in a two-lane queue. It ran 3.07 s under vitest here (4 s wall), beside a reservations suite of ~190 s (`verification.md` § 6). B2's reservations timeouts appeared only under turbo's default fan-out. The CI-shaped command has been green cold three separate times (§ Scope table above; `breakdown.md` item-12 note; `verification.md` § 5). Not a plausible material contributor to CI flakiness. If CI's `Test` job times out in an untouched package anyway, read the failure before acting on it (R5) |
| N3 — the production-only direction of the env diff is unpinned                             | minor                                   | **defer**, via Operate                                                                                                             | The behaviour is correct today (Verify § 2d). A refactor that dropped the `registeredUnder: "production"` branch (`fastify-owners.ts:334-336`) would leave everything green. The intersection in `answers()` would still prevent a false green, so what is lost is the diagnosis, not the protection. Cheap close: extract the diff as a pure function over two entry lists and unit-test both directions                                                                                                                                                                                                                           |
| N4 — the F2 floor can still go from 86 to 80 with everything green                         | no-finding                              | **accept**                                                                                                                         | By design: `vacuity.test.ts:21-36` says the floor "must not track the live count". Lowering it still takes a reviewed edit carrying the reason the constant's doc comment demands                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| N5 — zero slack on `hardcodedRoutes` and `emptyCatch`                                      | minor (process risk, not a code defect) | **accept, with a Ship action** (below)                                                                                             | Measured green on the merge with today's `origin/main` (`d34513808`). CI's `ai-antipattern-ratchet` job is in `ci-gate`'s `needs` (`ci.yml:817`, `:1030`), so the PR's merge ref gets checked. The gap is `main` moving between the PR's last CI run and the squash merge, since `main` is not `strict`                                                                                                                                                                                                                                                                                                                             |
| N6 — `origin/main` moved to `7ac892126`                                                    | no-finding                              | **accept**                                                                                                                         | The two new commits touch metrics and marketing JSON and `log.md` only (`git diff --stat 49c7d773d 7ac892126`): neither the baseline file nor any source. The merge is clean, and the ratchet is green on it                                                                                                                                                                                                                                                                                                                                                                                                                        |

### New findings from this pass

#### Minor: R8 — a new production-required env var reds the guard with the service's own error, and nothing in that error points at the fix

The reference boot has to supply every variable a `production` boot throws
without, and it lists them by hand (`PRODUCTION_BOOT_ENV`,
`fastify-owners.ts:185-192`).

- **Scenario:** a PR adds
  `if (NODE_ENV === "production" && !process.env.NEW_SECRET) throw …` to any of
  the three services. `@mbe/route-contract`'s `beforeAll` then fails with that
  service's message, and `CI Gate` goes red on a PR that never touched the
  guard. The error text names no file in `tools/route-contract`. The fix is one
  placeholder in `PRODUCTION_BOOT_ENV`, and it is found only by reading the
  stack down to `bootFastifyOwners`.
- **Already happened once:** this run itself discovered
  `UNSUBSCRIBE_TOKEN_SECRET` (`post-visit-notifier.ts:6`) exactly this way
  (`breakdown.md`, 2026-09-28 note).
- **Why minor, not major:** it fails in the safe direction, and the stack does
  lead to the fix.
- **Decision: deferred**, via Operate. Cheap close: catch around each
  reference-boot build and rethrow with the owner's name plus "if this is a new
  production-required variable, add a placeholder to `PRODUCTION_BOOT_ENV` in
  `tools/route-contract/src/fastify-owners.ts`".

#### Nit: R9 — the merge left five line citations in the guard's own comments pointing at the wrong lines

Main's edits shifted `services/reservations/src/app.ts` and
`packages/service-bootstrap/src/create-service-app.ts`:

- `app.ts:231` (the `eventRoutes` prefix) is now `:246`. It is cited at
  `fastify-owners.ts:103`, `:247` and `fastify-owners.test.ts:172`.
- `app.ts:266` (the `NODE_ENV !== "test"` gate) is now `:281`. It is cited at
  `fastify-owners.ts:254`.
- `create-service-app.ts:247` (the fail-closed auth throw) is now `:270`. It is
  cited at `fastify-owners.ts:171`.

Every _claim_ is still true; only the pointers moved.

- **Scenario:** a reader checking the reference boot's safety argument follows
  `app.ts:266` and lands on the `publicWaitlistRoutes` registration, not on the
  gate.
- **Decision: deferred**, via Operate. Prefer citing symbols (`eventRoutes`,
  the `onReady` gate) over line numbers, because every later merge from main
  will shift them again.

### The merge commit `2fec42b91`

It differs from a clean merge **only** in the conflict hunk it declares.

- The resolution drops the "every local git hook is silently inert" seed,
  which main deleted after fixing it.
- It keeps this run's seed line byte-identical to main's copy, plus the
  `(claimed: maintenance:api-client-route-contract)` marker. The protocol says
  a claim is appended in place and the origin marker is never rewritten, and
  both hold.

Everything else the merge brought that touches the guard's behaviour was
measured:

- **Two new client methods:** `deposits.getByReservation` and
  `reservations.markNoShow`. Both are owned (`verification.md` § 1, 87/87).
- **Service edits:** none adds an env-gated registration (see R1 above).
- **A dependency bump:** `eslint` and `prettier` only
  (`packages/config/package.json` in `49c7d773d`), so the semantics of
  `vi.resetModules()` are unchanged.

### Earlier findings, status on `85c0884e8`

- **R1** — fixed (above).
- **F2** — fixed (above).
- **R2, R3, R4, R7** — unchanged. Neither `6fbdbc281` nor `ea17000db` touches
  `edge-owner.ts`, `route-contract.ts` or `client-inventory.ts`, and neither
  does the merge. They stay deferred minors and nits, for Operate to seed.
- **R5** — stands, and Round 3 reinforces it: do not apply `testTimeout` in
  this run.
- **R6** — regraded to accept (above).

### Updated verdict

**Ready to ship. Unfixed critical: 0. Unfixed major: 0.**

- The review's one major, R1, is fixed and re-proved on the merged head.
- F2 is fixed.
- The merge changed nothing about the guard's behaviour beyond the two client
  pairs it now correctly owns.
- No new finding is above minor, so nothing needs a live user to defer it and
  nothing routes back to Implement.

This supersedes the list for Ship in the 2026-09-22 § Verdict. `release.md`
should carry:

1. **Findings A and B by name**, with Finding A's rate-limit-bucket consequence
   recorded as an accepted decision. Unchanged from before.
2. **R1 and F2 as fixed in this run** (`6fbdbc281`, `ea17000db`), not as known
   gaps. Also record R1's one stated limit: its diff cannot see a gate on a
   third `NODE_ENV` value, on a different variable, or inside `node_modules`.
   Nothing sits in that gap today.
3. **R5**: do not act on F1's `testTimeout` remedy.
4. **The ratchet-baseline raise** (`1ff0b79dd`), and why it was accepted.

**What Ship must do before merging:**

- **Re-run `node scripts/check-ai-antipatterns.mjs` on the final merge result**
  if `origin/main` has moved past `7ac892126` (N5). Exporting
  `git merge-tree --write-tree HEAD origin/main` works, as done above.
  - If `metrics/ai-antipattern-baselines.json` conflicts, **do not pick a
    side**. Regenerate it with `--update` on the merged tree, and confirm each
    delta is attributable before committing.
- **Treat `CI Gate` green on the PR head as not yet observed**, since that is
  criterion 5's open half. The branch's new lockfile importer makes the first
  run cold across every task.

Operate should seed N1 (the `rialto-catalog` `testTimeout`), N3, R8 and R9 to
`docs/backlog.md`, alongside the earlier R2, R3, R4 and R7 seeds.
