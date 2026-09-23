---
stage: verify
run: maintenance:api-client-route-contract
date: 2026-09-22
assumptions:
  - 'Success criterion 5 is graded as two halves. The local-gate half (`pnpm lint`, `pnpm typecheck`, `pnpm test`) is verified here; the "CI Gate green on the PR" half is marked **Ship''s to close** and left explicitly open, because no PR exists and Verify must not create one. Nothing in this artifact should be read as a claim about a CI run that has not happened. The split was made without live user input.'
  - "Root `pnpm test` went RED twice, both times on packages this run does not touch (`packages/rialto`, then `apps/rialto-web`), and both times on a wall-clock timeout under turbo's uncapped default fan-out. It is graded as an environmental condition already recorded in `ci.yml`'s own comments and `.claude/rules/gotchas.md`, **not** as a criterion-5 failure routing back to Implement — because the command CI actually runs (`pnpm turbo test:coverage --concurrency=2`, `ci.yml:541`) is green 52/52 cold, and the failing tests pass in isolation. That grading is a judgement made without live user input; the full evidence for both readings is in § Criterion 5 so a reviewer can disagree with it on the numbers rather than on the summary."
---

# Verification: pinning `@mbe/api-client` URL literals to a route that answers them

## Summary

**Four of five brief criteria PASS; criterion 5 is PARTIAL on two independent
counts** — one of them deliberate (the `CI Gate` half is Ship's), one of them a
real finding (root `pnpm test` is red on untouched packages under uncapped
concurrency). The guard exists, runs in CI on pull requests under the only
required check, was proven red on the known-bad input and green on revert in a
reproduction run _independently of the stored transcript_, states its coverage,
and has zero false positives — after fixing the two real live mismatches it
found on its own first run, one of which is a user-facing production 404 that is
still 404ing right now.

Every number below was re-measured in this worktree at
`fix/api-client-route-contract` (13 commits ahead of `origin/main` `0a80ea85b`).
Implement's reported figures were treated as claims to reproduce, not as
evidence. Two reproduced exactly; one did not, and the discrepancy is reported
rather than reconciled.

| Brief criterion                              | Verdict     |
| -------------------------------------------- | ----------- |
| 1 — check exists and runs in CI on PRs       | **PASS**    |
| 2 — proven red on known-bad, green on revert | **PASS**    |
| 3 — coverage stated                          | **PASS**    |
| 4 — zero false positives on `main`           | **PASS**    |
| 5 — lint/typecheck/test green; CI Gate green | **PARTIAL** |

## Criteria & evidence

### Criterion 1 — a check exists that fails when a client URL literal has no registered route in the owning service, and it runs in CI on pull requests

Two halves, verified separately. The second half is the one this repo has a
documented history of getting wrong (a Playwright spec no workflow invoked; a
`check-*` script wired into nothing; two metrics collectors that produced zero
rows for months), so it was verified by reading the workflow and by asking
turbo, not by trusting `architecture.md`'s claim.

**The check exists.** `tools/route-contract` (`@mbe/route-contract`), 7 test
files / 59 tests. The failing assertion is `route-contract.test.ts:39`,
`expect(formatUnowned(unowned)).toBe("")` over the join of the client's emitted
pairs against four route owners. No allowlist, no skip — confirmed by reading
`route-contract.ts`'s `unownedVerdicts`, which filters on `owners.length === 0`
with no exception list.

**It runs in CI on pull requests.** The chain, each link measured:

- `ci.yml` carries a bare `pull_request: branches: [main]` trigger with **no**
  `paths:`/`paths-ignore:` filter (measured; `paths-ignore` exists only on the
  `push` trigger, and lists `*.png` / `.gitignore` / `LICENSE`).
- `ci.yml:541`, inside the `Test (Node ${{ matrix.node-version }})` job, runs
  `pnpm turbo test:coverage --concurrency=2`.
- `tools/route-contract/package.json` declares `"test:coverage": "vitest run --coverage"`.
- `pnpm-workspace.yaml` lists `tools/*`.
- `test` is in `ci-gate`'s `needs` (`ci.yml:979-999`).
- `CI Gate` is the only _required_ status check on `main` — re-measured today,
  not recalled:

  ```
  $ gh api repos/mattbutlerengineering/mattbutlerengineering/branches/main/protection/required_status_checks
  {"url":"…","strict":false,"contexts":["CI Gate"],"contexts_url":"…","checks":[{"context":"CI Gate","app_id":null}]}
  ```

The decisive link — that turbo actually resolves the package under that exact
command, rather than the package merely existing — was measured by asking turbo
for the task graph of the CI command itself:

```
$ pnpm turbo test:coverage --concurrency=2 --dry-run=json | (extract taskIds)
TOTAL TASKS IN GRAPH: 76
route-contract tasks: ["@mbe/route-contract#test:coverage"]
```

And `scripts/check-orphaned-tests.mjs` — the repo's own guard against exactly
this class — is green with no new allowlist entry:

```
$ node scripts/check-orphaned-tests.mjs
PASS: Every test file lives under a workspace package that CI runs.
```

The only `ci.yml` change on the branch is a one-line addition of
`./tools/route-contract/coverage/coverage-final.json` to the codecov `files:`
list. **No new workflow and no new job** — confirmed by
`git diff origin/main...HEAD -- .github/workflows/ci.yml`, which is that single
line. That matters: a new workflow is the thing that could silently never fire
on a `GITHUB_TOKEN`-authored PR. Riding an existing job inside `ci-gate`'s
`needs` has no such failure mode.

**Result: PASS.**

### Criterion 2 — the check is proven to fail on the known-bad input and to pass once reverted, with the transcript quoted

Re-run from scratch in this worktree rather than inherited from
`proof/scratch-edit-proof.md`. The working tree was clean before, and is clean
after.

**Step 1 — clean tree, guard green.**

```
$ git status --porcelain packages/api-client/src/floor-plans.ts
(no output)
$ sed -n '55,62p' packages/api-client/src/floor-plans.ts
  /** Activates this plan and deactivates the venue's others (`POST /:id/activate`). */
  async setActive(id: string): Promise<FloorPlan> {
    return this.client.postOne<FloorPlan>(
      `/api/v1/floor-plans/${id}/activate`,
      {},
      FloorPlanSchema
    );
  }
$ pnpm --dir tools/route-contract exec vitest run src/route-contract.test.ts
 ✓ src/route-contract.test.ts (5 tests) 398ms
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

**Step 2 — reintroduce the 2026-08-30 literal; the guard goes RED.**

`packages/api-client` is rebuilt before each run: `@mbe/api-client`'s `exports`
map resolves `default` to `./dist/index.js`, so the driver runs the **built**
client. Skipping the rebuild would make this transcript a lie. (In CI it is
automatic — turbo's `test` and `test:coverage` both declare `dependsOn: ["^build"]`.)

```
$ sed -i '' '58s|/activate|/active|' packages/api-client/src/floor-plans.ts
$ git diff --unified=1 packages/api-client/src/floor-plans.ts
diff --git a/packages/api-client/src/floor-plans.ts b/packages/api-client/src/floor-plans.ts
index c7a46051c..a4f79f526 100644
--- a/packages/api-client/src/floor-plans.ts
+++ b/packages/api-client/src/floor-plans.ts
@@ -57,3 +57,3 @@ export class FloorPlansClient {
     return this.client.postOne<FloorPlan>(
-      `/api/v1/floor-plans/${id}/activate`,
+      `/api/v1/floor-plans/${id}/active`,
       {},

$ pnpm --dir packages/api-client build
$ pnpm --dir tools/route-contract exec vitest run src/route-contract.test.ts

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/route-contract.test.ts > route contract > has a route owner for every client pair
AssertionError: expected '1 @mbe/api-client pair(s) have no rou…' to be '' // Object.is equality

- Expected
+ Received

+ 1 @mbe/api-client pair(s) have no route owner:
+
+   POST /api/v1/floor-plans/route-contract-placeholder/active
+       produced by:  floorPlans.setActive, floorPlans.activate
+       edge:         forwarded-to-origin
+       fastify:      no match in reservations, users, agent
+
+ A client URL with no route to answer it is a 404 in production with every
+ other gate green. Fix the client literal, or register the route — do not
+ add an allowlist here.

 ❯ src/route-contract.test.ts:39:36
     37|     const unowned = unownedVerdicts(report.verdicts);
     38|
     39|     expect(formatUnowned(unowned)).toBe("");
       |                                    ^

 Test Files  1 failed (1)
      Tests  1 failed | 4 passed (5)
```

This reproduces `proof/scratch-edit-proof.md`'s stored transcript **verbatim**,
including the two producing method names. The failure message carries all four
things `breakdown.md` item 7 contracted for, on a real failure rather than a
constructed one: method (`POST`), path, producing client method — both of them,
`floorPlans.setActive` and its alias `floorPlans.activate`, which is more than
grep would have found — and edge disposition (`forwarded-to-origin`, i.e. the
edge hands this to DO verbatim and nothing at DO registers it, which is exactly
the 404 production returned on 2026-08-30).

**Step 3 — revert; the guard goes green again, whole suite.**

```
$ git checkout -- packages/api-client/src/floor-plans.ts
$ git status --porcelain packages/api-client/src/floor-plans.ts
(no output)
$ sed -n '55,62p' packages/api-client/src/floor-plans.ts
  /** Activates this plan and deactivates the venue's others (`POST /:id/activate`). */
  async setActive(id: string): Promise<FloorPlan> {
    return this.client.postOne<FloorPlan>(
      `/api/v1/floor-plans/${id}/activate`,
      {},
      FloorPlanSchema
    );
  }
$ pnpm --dir packages/api-client build
$ pnpm --dir tools/route-contract test
 ✓ src/vacuity.test.ts (10 tests) 4ms
 ✓ src/edge-owner.test.ts (13 tests) 27ms
 ✓ src/client-driver-completeness.test.ts (10 tests) 20ms
 ✓ src/client-inventory.test.ts (9 tests) 27ms
 ✓ src/workspace-resolution.test.ts (3 tests) 2ms
 ✓ src/fastify-owners.test.ts (9 tests) 404ms
 ✓ src/route-contract.test.ts (5 tests) 411ms

 Test Files  7 passed (7)
      Tests  59 passed (59)
GUARD_EXIT=0
```

**Working tree restored.** After the reproduction,
`git status --porcelain`, filtered only for the untracked
`.claude/sessions/*.md` hook output that was present on arrival, prints nothing.
No scratch edit was left behind and none was committed.

**The second, free proof stands too, and is stronger.** The guard's _first_ run
on `main`'s own code was red on two pairs it was never told about — Findings A
and B — with nothing in `packages/api-client` modified. That transcript is in
`proof/guard-red-on-main.md`; I did not re-run it (it requires reverting two
landed commits) but I independently confirmed both of its production claims by
probe (§ Criterion 4) and both of its route-table numbers by re-derivation
(§ Independently re-derived scale). A guard that reproduces two real defects
nobody pointed it at is better evidence than a guard that fails on an input
chosen to make it fail.

**Result: PASS.**

### Criterion 3 — coverage is stated: which client modules and which services are compared, and what is knowingly excluded, with the reason

Stated in three places, and the statements agree with the measured behaviour.

**Where it is recorded:** `proof/scratch-edit-proof.md` § "Coverage, stated
explicitly" (the per-sub-client table and the exclusions),
`architecture.md` § "What this guard does not cover", and — the copy a future
reader is most likely to hit — in the source itself:
`client-inventory.ts`'s `KNOWN_BLIND_SPOTS`, `EXEMPT_METHODS`, and the module
doc comment's three-numbered "How it cannot silently narrow".

**Client side — 15 sub-clients, driven by running them.** Re-derived, not
copied (method below). 86 distinct `method + path` pairs from 95 invocations.
`agentSessions` is included only because `createApiClient` does **not** wire
`AgentSessionClient` up (`index.ts:81-97`), so a driver built from the factory
alone would silently miss all four `/v1/sessions` paths.

**Owner side — four route owners, enumerated by running them too:**

| owner                                 | how                                      | size, re-measured                  |
| ------------------------------------- | ---------------------------------------- | ---------------------------------- |
| `services/reservations`               | `buildApp()` → `ready()` → `findRoute()` | 176 registered method+path entries |
| `services/users`                      | same                                     | 44                                 |
| `services/agent`                      | same                                     | 56                                 |
| edge Worker (`infrastructure/worker`) | `edgeRouter.fetch()` with a stub env     | 5 paths it terminates              |

**The three stated blind spots were checked individually**, because a blind spot
recorded only in prose is how the next one hides:

1. **`streamNDJSON`** — recorded in `KNOWN_BLIND_SPOTS` with its reason, and the
   claim is _asserted_, not just written down. `client-inventory.test.ts:109-110`
   pins both the reason text and — the load-bearing half —
   `expect(inventory.pairs.some(p => p.producedBy.includes("streamNDJSON"))).toBe(false)`.
   So the guard cannot quietly start half-covering it while the doc still says
   it is excluded.
2. **`AgentSessionClient`'s absence from `createApiClient`** — recorded in the
   module doc comment and in `architecture.md`, and asserted by
   `client-inventory.test.ts:66` ("includes AgentSessionClient, which
   createApiClient does not wire up"). Re-derived: `agentSessions` contributes
   4 of the 86 pairs, so the compensation is real and not just declared.
3. **`EXEMPT_METHODS`** (3 entries: `holds.setSessionId`, `holds.getSessionId`,
   `holds.sessionHeaders`) — each carries a one-line reason, and
   `client-driver-completeness.test.ts` asserts three separate properties over
   the list: every entry has a reason longer than 10 characters, every entry
   names a method that **actually exists** on the roster (a stale exempt entry
   is a place for a real method to hide), and every entry **really issues
   nothing** (so a method cannot be exempted into silence while still sending
   requests). That is the strongest of the three: the exempt list cannot rot in
   either direction.

**Does the guard silently pass over anything it claims to cover?** Checked and
no. The claim is "every `method + path` the shared client can emit". Three
structural assertions make narrowing loud rather than silent, and each is
exercised rather than described:

- `rosterMethodNames()` is read off the **real prototypes**, so a method added
  to a sub-client and never driven fails `"leaves no method unaccounted for"`.
- The roster's class names are asserted against the real module's exports, so a
  sub-client wired into `index.ts` but not into the roster fails.
- Request counts are **per invocation**, never a deduplicated set — and the
  rejected set-growth oracle is _implemented in the test file and its output
  asserted_ (`"shows the set-growth oracle really would flag those three"`), so
  "count per invocation, not set growth" is a measurement rather than an
  opinion.

**The knowing exclusions**, each with its reason, all confirmed against the
code: host reachability (the 4 `static-spa` pairs are the `/v1/sessions*` family
— `services/agent` answers them, the apex serves the marketing SPA, deliberate
and already recorded as `EDGE_EXEMPT_PREFIXES = ["/v1"]` in
`infrastructure/pulumi/ingress-coverage.test.ts:145`); payload shape (unchanged
and out of scope); non-client callers (anything building its own URL); whether
the handler works (`findRoute` proves a route matches, nothing about auth, the
query, the response or the status); and the reverse direction (~276 registered
entries against 86 client pairs — a reverse rule would need a ~190-entry
allowlist, the escape hatch this design rejected, pointed backwards).

**Result: PASS.**

### Criterion 4 — zero false positives on `main` as it stands, or the real live mismatch is fixed in this run and named in the release record

Both branches of this criterion apply, in the order the criterion allows: the
guard **did** find live mismatches, both were fixed in this run, and the guard
is now clean with no allowlist added to make it so.

**Zero unowned pairs, re-derived independently of the stored transcripts.** A
temporary probe was added under `tools/route-contract/src/`, run once, and
deleted (working tree verified clean afterwards). It imports the same
`buildRouteContractReport()` the guard uses and prints the scale:

```
VERIFY_TOTAL_PAIRS=86
VERIFY_OWNED=86
VERIFY_UNOWNED=0
VERIFY_SUBCLIENTS=15
VERIFY_INVOCATIONS=95
VERIFY_FASTIFY_COUNTS={"reservations":176,"users":44,"agent":56}
VERIFY_EDGE_TERMINAL=5
VERIFY_OWNER_HITS={"users":7,"reservations":74,"edge":1,"agent":4}
VERIFY_DISPOSITIONS={"forwarded-to-origin":81,"edge-terminal":1,"static-spa":4}
```

86 pairs, 86 owned, 0 unowned — the central claim, confirmed. Every figure in
`proof/scratch-edit-proof.md`'s coverage statement reproduces exactly:
sub-clients 15, invocations 95, owner hits 74/7/4/1 (= 86), dispositions
81/4/1 (= 86), Fastify tables 176+44+56 = 276. "Zero false positives" is
therefore a measurement of the real surface, not of a narrowed one.

**Finding A is CONFIRMED LIVE in production right now, and is user-facing.**
Probed today, read-only. This LAN's resolver (`192.168.4.40`) sinkholes some
hosts and has invented a fake outage before, so DNS was cross-checked first and
the request pinned to the cross-checked address:

```
$ dig @1.1.1.1 +short mattbutlerengineering.com
104.21.25.32
172.67.222.73
$ dig +short mattbutlerengineering.com          # LAN resolver — same answer, no sinkhole
172.67.222.73
104.21.25.32

$ curl --resolve mattbutlerengineering.com:443:104.21.25.32 https://mattbutlerengineering.com/api/health/system
HTTP 404
{"message":"Route GET:/api/health/system not found","error":"Not Found","statusCode":404}

$ curl --resolve mattbutlerengineering.com:443:104.21.25.32 https://mattbutlerengineering.com/health/system
HTTP 200
{"status":"healthy","timestamp":"2026-09-22T22:49:26.796Z","requestId":"fd4a71ac-…","subsystems":{"services":{"status":"healthy"},"static_sites":{"status":"healthy"},"ci":{"status":"healthy"},"deploys":{"status":"healthy"}}}
```

**This 404 is expected, not a regression, and that distinction matters.** The
deployed code has not changed — this branch is unmerged and undeployed — so
production still runs the pre-fix client. The probe records the _pre-fix_ state
so the release has a before to point at. The discriminator is the **body**, not
the status: Fastify answers an _unregistered_ route with
`"Route <METHOD>:<path> not found"`, and a _registered_ route with the
application's own problem-details shape. Control, on the same host, same
minute:

```
$ curl … https://mattbutlerengineering.com/api/v1/venues/by-slug/x     # registered, no such venue
HTTP 404
{"type":"about:blank","title":"Not Found","status":404,"detail":"Venue not found"}
```

Different body shape, same status — so the 404 on `/api/health/system` is
"nothing is listening", not "listening and empty".

**The symptom is an absent badge, not an error** — verified in the code, not
assumed. `apps/hospitality/src/components/SystemHealthBadge.tsx` polls
`api.health.system()` every 60 s, and its `catch {}` block is empty with the
comment _"Silent failure — badge just shows stale data"_; `if (!isAdmin || !health) return null`.
So the admin dashboard has silently rendered no system-health badge, and
nothing anywhere went red. Absence rendering identically to fine, again. The
fix is now in the client: `packages/api-client/src/health.ts` defines
`const SYSTEM_HEALTH_PATH = "/health/system"`, with a doc comment recording
what it was, why it matched nothing, and the rate-limit consequence.

**Finding B is CONFIRMED unregistered, and latent.**

```
$ curl … https://mattbutlerengineering.com/api/v1/venues/groups/by-slug/x
HTTP 404
{"message":"Route GET:/api/v1/venues/groups/by-slug/x not found","error":"Not Found","statusCode":404}
```

Same "unregistered" body shape. Fixed by deletion rather than by registering a
route no consumer wants. Verified: zero references to
`VenueGroupsClient.getBySlug` remain in any code (the only survivors are prose
in this run's own artifacts and two explanatory comments in the guard);
`venueGroups` appears nowhere under `apps/` at all; and the **venue** client's
own `getBySlug` — which `apps/hospitality` calls from three places — is intact
and owned, pinned by `route-contract.test.ts`'s
`"Finding B — the venue by-slug path the apps actually call is untouched"`.

**Both findings must be named in the release record** (`release.md`), along with
the recorded consequence of Finding A's fix: the path moves rate-limit buckets
— `/health/system` is 10 req/60 s where `/api/` is 100
(`infrastructure/worker/rate-limiter.js:16-17`) — against a 60 s poll, i.e.
roughly ten admin tabs per source IP before shedding. Noted, not re-litigated;
it was accepted as a decision at Architect. One observation for Ship: the live
`/health/system` 200 carried **no** `x-ratelimit-*` response headers at all, so
the bucket's behaviour is not observable from the response the way
`/api/v1/venues`' is. That is not a defect found here, just a note that the
accepted consequence will be hard to monitor from the client side.

**Result: PASS.** The guard reports zero unowned pairs against a
fully-measured 86-pair surface, and it got there by fixing two real mismatches
rather than by excusing them.

### Criterion 5 — `pnpm lint`, `pnpm typecheck`, `pnpm test` green; CI Gate green on the PR

**PARTIAL.** Two halves are clean, one half is red under one of two run shapes,
and one half cannot be closed at this stage at all.

**`pnpm lint` — green.**

```
$ pnpm lint
 Tasks:    52 successful, 52 total
Cached:    0 cached, 52 total
  Time:    47.013s
LINT_EXIT=0
```

**`pnpm typecheck` — green.** Run explicitly, because nothing else runs it: no
git hook does (`.husky/pre-push` runs four things and typecheck is not among
them) and vitest does not typecheck.

```
$ pnpm typecheck
 Tasks:    52 successful, 52 total
Cached:    22 cached, 52 total
  Time:    27.404s
TYPECHECK_EXIT=0
```

**`pnpm test` — RED, twice, on packages this run does not touch.** This is the
one discrepancy with Implement's reported numbers, and it is reported rather
than reconciled.

Sample 1, `pnpm test` (`turbo run test`, turbo's uncapped default fan-out):

```
 Tasks:    51 successful, 54 total
Cached:    22 cached, 54 total
  Time:    2m48.893s
Failed:    @mattbutlerengineering/rialto#test
TEST_EXIT=1
```

```
 FAIL  src/components/Toast/Toast.test.tsx > ToastProvider > toast creation > shows toast when toast() is called
TestingLibraryElementError: Unable to find an element with the text: File saved!.
 ❯ src/components/Toast/Toast.test.tsx:59:13
     59|       await waitFor(() => expect(screen.getByText("File saved!")).toBe…
       |             ^
     60|         timeout: 3000,
```

Sample 2, `pnpm turbo run test --force` (same uncapped shape, cold cache) — red
again, but on a **different package**:

```
 Tasks:    49 successful, 54 total
Cached:    0 cached, 54 total
  Time:    3m5.102s
Failed:    @mbe/rialto-web#test
TEST2_EXIT=1
```

```
 ❯ src/data/page-registry.test.ts (58 tests | 3 failed) 46028ms
      × non-comingSoon entries resolve to an object with a default export 15136ms
      × every load() resolves without throwing 15085ms
      × every non-comingSoon entry resolves a truthy default export (not undefined) 15094ms
 FAIL  src/data/page-registry.test.ts > PageRegistry — load factories > …
Error: Test timed out in 15000ms.
```

**The command CI actually runs is green.** `ci.yml:541` is
`pnpm turbo test:coverage --concurrency=2`, and adding a workspace package
changes `pnpm-lock.yaml` — a turbo `globalDependencies` entry — so this PR's CI
run will execute every task cold. Both conditions reproduced together:

```
$ pnpm turbo test:coverage --force --concurrency=2
 Tasks:    52 successful, 52 total
Cached:    0 cached, 52 total
  Time:    3m13.441s
COV_EXIT=0
```

That reproduces Implement's reported "52 successful / 52 total, `Cached: 0
cached, 52 total`, exit 0" exactly. The guard's own leg inside it:

```
@mbe/route-contract:test:coverage:  Test Files  7 passed (7)
@mbe/route-contract:test:coverage:       Tests  59 passed (59)
@mbe/route-contract:test:coverage: All files          |   96.04 |    80.95 |    91.8 |   95.85 |
```

**Why this is graded environmental rather than a criterion failure** — four
independent reasons, each measured:

1. **This branch does not touch either package.**
   `git diff --name-only origin/main...HEAD -- packages/rialto` returns zero
   files; `apps/rialto-web` likewise appears nowhere in the branch diff.
2. **Both failures are wall-clock timeouts**, not assertion mismatches — a 3 s
   `waitFor` and three 15 s test timeouts.
3. **The failing test passes in isolation, 5× faster.** `Toast.test.tsx` alone:
   `14 passed (14)`, the failing case at **331 ms** against **3943 ms** under
   load; file total 721 ms against 10 271 ms.
4. **The victim varies between runs** — `packages/rialto` then
   `apps/rialto-web`. A deterministic breakage does not move.

And the second victim is named in `ci.yml`'s own comment: _"turbo's default
fan-out of 10 failed on apps/rialto-web page-registry.test.ts at 15000ms, a cap
of 2 passed all 50 tasks"_ (#5546). My two samples are a third and fourth
observation of a condition this repo already documented, reproduced on a branch
that cannot have caused it.

**It is still recorded as PARTIAL, not PASS.** The brief's wording is literal —
"`pnpm test` green" — and `pnpm test` was not green. Reading it as "the gates CI
runs" is a judgement, logged in `assumptions:`. The honest statement is: the
gate CI enforces is green; the root command as literally written is red for
reasons that predate this branch. A reviewer who wants the literal reading
should see § Failures, finding F1.

**`CI Gate` green on the PR — NOT VERIFIABLE AT THIS STAGE, and left open for
Ship.** No PR exists, and Verify must not create one. Nothing above should be
read as a claim about a CI run that has not happened. This half of criterion 5
is **Ship's to close**, and Ship should treat it as the first real observation
of the cold-cache run that `breakdown.md` item 12 anticipated: if a timeout
surfaces in a package this run never touched, the recorded fix is
`testTimeout: 15000` in **that** package's `vitest.config.ts` — never a blind
`gh run rerun`, which re-uses the same merge SHA and fails identically.

**Result: PARTIAL.**

## Independently re-derived scale, and where it agrees or disagrees with Implement

Implement's figures were treated as claims. Three were re-measured; two matched
to the digit, one did not.

| Claim (source)                                         | Implement reported                                                   | I measured                                | Agrees |
| ------------------------------------------------------ | -------------------------------------------------------------------- | ----------------------------------------- | ------ |
| Guard verdict on branch (`guard-green-after-fixes.md`) | 86 pairs / 86 owned / 0 unowned                                      | 86 / 86 / 0                               | yes    |
| Guard suite (`guard-green-after-fixes.md`)             | 7 files, 59 tests                                                    | 7 files, 59 tests, exit 0                 | yes    |
| Fastify route tables (`guard-red-on-main.md`)          | `{reservations:176, users:44, agent:56}`                             | identical                                 | yes    |
| Coverage table (`scratch-edit-proof.md`)               | 15 sub-clients, 95 invocations, owners 74/7/4/1, dispositions 81/4/1 | identical                                 | yes    |
| Scratch-edit RED message (`scratch-edit-proof.md`)     | as quoted                                                            | reproduced verbatim                       | yes    |
| Cold CI-shaped run (`breakdown.md` item 12 § Notes)    | 52/52, `Cached: 0 cached, 52 total`, exit 0                          | 52/52, `Cached: 0`, exit 0                | yes    |
| Root `pnpm test`                                       | _(not reported — Implement ran only the `--concurrency=2` form)_     | **exit 1**, twice, different victims      | **NO** |
| `pnpm regen --check`                                   | clean                                                                | `All generated artifacts are up to date.` | yes    |

**The one discrepancy is a gap in what Implement measured, not a contradiction
of it.** Implement reproduced the CI-shaped command (`test:coverage --force
--concurrency=2`) and reported it accurately. It never ran the root `pnpm test`
that the brief's criterion 5 names. Both statements are true at once; only one
of them is the criterion's literal wording. Recorded as finding F1.

## Judgements the brief asked for explicitly

### The anti-vacuity floor: was lowering 87 → 86 legitimate, or can the mechanism be defeated by routine edits?

**The lowering was legitimate. The mechanism is partly structural and partly
convention-guarded, and the convention-guarded part is weaker than the artifacts
imply.** Both halves matter.

**Why the lowering was legitimate.** The floor fired on the deletion of
`VenueGroupsClient.getBySlug` — a deliberate, reasoned removal of a dead client
method with zero application callers (Finding B). A client surface that
legitimately shrinks by one _should_ trip a floor set at the old size; the only
correct responses are "undo the deletion" or "lower the floor with the reason
attached". The second was taken, and the reason is attached in three places: the
constant's own doc comment (`vacuity.ts:29-37`, naming Finding B and the run
directory), `breakdown.md` § Notes, and `proof/guard-green-after-fixes.md`. The
doc comment also states the rule that keeps it honest — _"it must stay a
conscious edit with a reason attached, never a number recomputed from whatever
the driver last produced"_. That is the right rule, and it was followed here.

**Why "a floor that gets lowered whenever it fires is not a floor" does not
land as an objection to this design.** The floor is not the load-bearing
anti-narrowing clause; it is the fourth of five, and it is the only one that
_can_ be lowered. The other four are structural and cannot be satisfied by
editing a number:

- a roster sub-client contributing **zero** pairs fails, whatever the floor is;
- a non-exempt client method issuing **zero** requests in its own invocation
  fails — and the roster is read off the real prototypes, so this catches a
  method that exists but stopped being driven;
- any of the four owner tables coming back **empty** fails;
- the roster's class names are asserted against the module's real exports, so a
  sub-client that appears in `index.ts` and not in the roster fails.

So the two realistic silent-narrowing regressions — a driver that throws early,
or a sub-client that stops being constructed — are caught structurally, with or
without the floor. The floor's _unique_ coverage is a genuine shrink of the
client surface, which is exactly the case where lowering it is correct. On that
reading, the 87 → 86 edit is the mechanism working, not the mechanism being
defeated.

**The real weakness, measured, and it is not the one the question pointed at.**
**No test pins the absolute value of `MINIMUM_CLIENT_PAIRS`.** Every assertion
that touches it is _relative_ to it:

- `vacuity.test.ts:15` seeds its healthy fixture with `pairCount: MINIMUM_CLIENT_PAIRS`;
- `vacuity.test.ts:37` tests narrowing with `MINIMUM_CLIENT_PAIRS - 1`;
- `client-inventory.test.ts:37` asserts `pairs.length >= MINIMUM_CLIENT_PAIRS`.

Lowering the constant to, say, 20 leaves the entire 59-test suite green. (The
floor cannot go all the way to 1: at `MINIMUM = 1` the narrowing test's input
becomes `0`, which takes the higher-priority "inventory is empty" branch and
fails the message assertion — so there is an accidental lower bound around 2,
which is not a meaningful defence.) The floor's only real protection is that
lowering it is a visible source edit in a reviewed diff. That is a genuine
protection in this repo's workflow, and it is weaker than "an anti-vacuity
contract" sounds.

**Verdict: the floor is a legitimate tripwire that was legitimately reset, sitting
on top of four clauses that are genuinely structural.** Recorded as finding F2
for Review — not as a defect to fix in this run, since closing it properly
(deriving the floor from something independent of the driver, or requiring a
justification token alongside any change) is a design question and the brief
says to flag, not fix.

### Does the guard genuinely run in CI on pull requests?

**Yes — verified by reading the workflow and by asking turbo, not by trusting
the claim.** Full chain and outputs in § Criterion 1. The two facts that make it
more than a paper claim: `pnpm turbo test:coverage --concurrency=2 --dry-run`
lists `@mbe/route-contract#test:coverage` among its 76 tasks, and
`scripts/check-orphaned-tests.mjs` — the repo's own guard against tests that
exist but nothing invokes — passes with no new allowlist entry. Riding an
existing job inside `ci-gate`'s `needs`, rather than adding a workflow, also
sidesteps the `GITHUB_TOKEN` anti-recursion class entirely.

### Are the stated blind spots recorded where a future reader will find them?

**Yes, and better than "recorded" — two of the three are asserted.** Detail in
§ Criterion 3. `streamNDJSON` is pinned by a test that fails if it ever starts
contributing pairs; `AgentSessionClient`'s absence from the factory is pinned by
a test and compensated by 4 real pairs; the three-entry exempt list is pinned in
three directions (reason present, method exists, method really issues nothing).
The guard does not silently pass over anything it claims to cover.

## Work-item acceptance criteria (from `breakdown.md`)

All 12 items are checked. Those whose acceptance criteria are not already
covered by a brief criterion above, spot-verified independently:

| Item                                 | Check                                                                                                                                                                                                                       | Result              |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| 1 — scaffold `@mbe/route-contract`   | `check-orphaned-tests` PASS, no allowlist entry; `lint`/`typecheck` green                                                                                                                                                   | PASS                |
| 2 — regenerate invalidated artifacts | `route-contract` present in `dep-graph.json` (8 hits) and `docs/architecture/dependency-graph.md` (1 hit); **no** `llms.txt` under `tools/route-contract`; `pnpm regen --check` → `All generated artifacts are up to date.` | PASS                |
| 3 — Fastify adapter                  | `fastify-owners.test.ts` 9 tests green; the four-row 2026-08-30 table asserted with `findRoute`, no `hasRoute`/`printRoutes` parsing/`inject`                                                                               | PASS                |
| 4 — edge adapter                     | `edge-owner.test.ts` 13 tests green, incl. the which-spy-fired anti-trap (`originFetchCalls > 0` **and** `staticBindingCalls > 0` **and** disposition still `edge-terminal`) and a `globalThis.fetch` restoration test      | PASS                |
| 5/6 — driver + cannot-narrow         | 86 pairs / 95 invocations re-derived; exempt list pinned three ways; set-growth oracle implemented and its output asserted                                                                                                  | PASS                |
| 7/8 — guard assertion + anti-vacuity | red/green reproduced verbatim (§ Criterion 2); all 5 vacuity clauses exercised against emptied inputs; **absolute floor value unpinned** (F2)                                                                               | PASS with F2        |
| 9 — Finding A                        | `SYSTEM_HEALTH_PATH = "/health/system"`; zero `/api/health/system` in code (one survivor is a history-explaining doc comment); guard resolves the pair to `["edge"]` / `edge-terminal`                                      | PASS                |
| 10 — Finding B                       | zero code references to `VenueGroupsClient.getBySlug`; `venueGroups` absent under `apps/`; venue `getBySlug` intact and owned by `reservations`                                                                             | PASS                |
| 11 — scratch-edit proof              | re-run end to end; tree clean before and after                                                                                                                                                                              | PASS                |
| 12 — cold-cache CI run               | cold `--concurrency=2` run green 52/52; codecov `files:` carries `./tools/route-contract/coverage/coverage-final.json`. **The `CI Gate` half is Ship's** — item 12's own § Notes says so, correctly                         | PARTIAL (by design) |

Item 6's compile-time half (a fourth `DepositTransition` member fails
`typecheck`) was **not** re-run as a scratch edit — it is already durably pinned
by the `@ts-expect-error` directive in
`client-driver-completeness.test.ts`, which `tsc --noEmit` would reject as
unused if the exhaustiveness check ever stopped being a compile error. That
construction survives on every CI run, which is stronger than a one-off
transcript, and repo-wide `pnpm typecheck` is green.

## Failures

No criterion failed outright, and nothing routes back to Implement. Two findings
are recorded for **Review**; neither was fixed here, per the brief's
flag-don't-fix rule.

**F1 — root `pnpm test` is red on this branch, on packages the branch does not
touch, under turbo's uncapped default fan-out.** Two samples, two different
victims (`packages/rialto` `Toast.test.tsx`; `apps/rialto-web`
`page-registry.test.ts`), both wall-clock timeouts, both passing in isolation,
both predating this branch. The CI-shaped command (`--concurrency=2`) is green
52/52 cold. Evidence in § Criterion 5. For Review: decide whether the brief's
"`pnpm test` green" is satisfied by the capped form CI runs — and note that the
repo has now observed this condition at least four times without anyone raising
either package's `testTimeout`, which is the recorded fix pattern.

**F2 — the anti-vacuity floor's absolute value is unpinned.** Every assertion
touching `MINIMUM_CLIENT_PAIRS` is relative to it, so lowering the constant to
~20 leaves all 59 tests green. The floor's only real defence is diff review.
Analysis in § Judgements. Not a defect in this run's work — the 87 → 86 edit was
correct and well-documented — but the clause is weaker than the phrase
"anti-vacuity contract" suggests, and a reviewer should know that before
relying on it.

**Carried forward from Architect/Implement, reconfirmed here, for the release
record rather than for Review:**

- Finding A's fix moves the poll into a 10 req/60 s rate-limit bucket from a
  100 req/60 s one. Accepted at Architect; must be named in `release.md`.
  Observation added here: the live `/health/system` 200 carries no
  `x-ratelimit-*` headers, so the bucket is not observable from the response.
- `packages/api-client/src/contract.test.ts` still over-claims its name: it
  imports both "sides" from `@mbe/types/schemas` and imports no service, so it
  checks the payload-shape half only. Flagged at Capture and Architect,
  deliberately not fixed. Now that the path half exists in a separate package,
  the naming is more misleading than it was, not less.

## Not verified

Stated plainly, because a silent gap reads as "covered".

- **`CI Gate` green on the PR.** No PR exists and Verify must not create one.
  Ship's to close. See § Criterion 5.
- **Whether F1's two failures also reproduce on `origin/main`.** They almost
  certainly do — the branch touches neither package, and `ci.yml`'s own comment
  names one of the two — but I did not prove it. Proving it means running the
  suite from a `main` checkout, and the only `main` checkout available is the
  user's (448 commits behind and dirty, and off-limits). Creating a second
  worktree to settle a question already answered by the capped run was judged
  not worth the cost. The evidence offered instead is indirect: zero branch
  files in either package, timeouts rather than assertion failures, isolation
  passes, and a varying victim.
- **`proof/guard-red-on-main.md`'s transcript was not re-run.** It requires
  reverting the two landed fix commits. Its two substantive claims were
  confirmed by other means: both production 404s re-probed today, and all its
  route-table numbers re-derived (176/44/56, 5 edge-terminal paths).
- **Whether the guard's `findRoute` verdict matches what the deployed services
  register.** The guard boots the services _from this branch's source_. If
  production is running older code, a path could be owned here and unowned
  there. Out of scope by design — the guard is a pre-merge gate on the repo, not
  a production reachability probe — but worth stating, since the whole run is
  about a gap between what is checked and what production does.
- **Host reachability, payload shape, non-client callers, and whether handlers
  work.** Excluded by design; reasons in § Criterion 3.
- **The rate-limit consequence of Finding A was not load-tested.** Ten admin
  tabs per source IP is arithmetic from
  `infrastructure/worker/rate-limiter.js:16-17` and a 60 s poll, not a measured
  shedding threshold.
- **Coverage thresholds beyond the guard package.** The repo-wide threshold step
  was not run here; the guard's own leg reports 96.04% statements against its
  80% threshold, which is the part this run added.
