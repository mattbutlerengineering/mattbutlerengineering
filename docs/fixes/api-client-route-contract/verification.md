---
stage: verify
run: maintenance:api-client-route-contract
date: 2026-09-22
assumptions:
  - 'Success criterion 5 is graded as two halves. The local-gate half (`pnpm lint`, `pnpm typecheck`, `pnpm test`) is verified here; the "CI Gate green on the PR" half is marked **Ship''s to close** and left explicitly open, because no PR exists and Verify must not create one. Nothing in this artifact should be read as a claim about a CI run that has not happened. The split was made without live user input.'
  - "Root `pnpm test` went RED twice, both times on packages this run does not touch (`packages/rialto`, then `apps/rialto-web`), and both times on a wall-clock timeout under turbo's uncapped default fan-out. It is graded as an environmental condition already recorded in `ci.yml`'s own comments and `.claude/rules/gotchas.md`, **not** as a criterion-5 failure routing back to Implement — because the command CI actually runs (`pnpm turbo test:coverage --concurrency=2`, `ci.yml:541`) is green 52/52 cold, and the failing tests pass in isolation. That grading is a judgement made without live user input; the full evidence for both readings is in § Criterion 5 so a reviewer can disagree with it on the numbers rather than on the summary."
  - "Re-verification addendum (2026-09-28): the two R1 scratch edits were placed as a function-scope gate in `services/users/src/routes/health.ts` and a module-scope gate in `services/agent/src/routes/remediation.ts`. The instruction said only that the module-scope gate go in `a different service`. This placement satisfies both readings: it is different from reservations, where `events.ts:181` lives, and the two edits are in different services from each other. It also puts the module-scope shape in a service Implement never measured it in (Implement used `services/users/src/routes/users.ts` for both shapes). Chosen without live user input."
  - "Re-verification addendum (2026-09-28): the `origin/main` comparison baseline is `49c7d773d`, the commit merged into `1ff0b79dd`, not the newer tip `7ac892126`. A fetch from another checkout moved `refs/remotes/origin/main` to that tip mid-session, at 12:12:40 -0700. The two newer main commits (#5849, #5850) touch only `metrics/*.json[l]`, `.claude/improvement-loop/log.md` and two `apps/marketing/public/*.json` files, and `git merge-tree --write-tree HEAD 7ac892126` exits 0, so the branch still merges cleanly onto them. Both typecheck runs resolved `[origin/main]` to the new tip. The branch's merge-base with that tip is still `49c7d773d`, so the affected set is the same. Decided without live user input."
  - "Re-verification addendum (2026-09-28): the cold form of root `pnpm test` was run as `pnpm turbo run test --force`. pnpm itself rejects `pnpm test --force` (`ERROR  Unknown option: 'force'`), so that form never reaches turbo. Root `pnpm test` is `turbo run test` (`package.json:54`), so this is the same command with the cache disabled. Chosen without live user input."
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

---

## Re-verification addendum — 2026-09-28 (merged head `1ff0b79dd`)

Appended, not rewritten. Everything above this line is the 2026-09-22
verification of the pre-merge branch and stands as written. This addendum is
the re-verification that `autorun-brief.md` Round 3 requires and Round 4 moves
onto the merged head. It covers R1 and F2 as landed, plus the merge of
`origin/main` at `49c7d773d` (merge commit `2fec42b91`). Every result below
comes from a command run in this worktree today, at
`1ff0b79ddaeb9008efd0d8360fcc9adb8e2f2c16`. The Implement stage's reported
figures were treated as claims to reproduce, not as evidence.

**Setup, measured.** `pnpm install --frozen-lockfile` → `Lockfile is up to date,
resolution step is skipped`, exit 0. The guard's workspace deps and the CLI were
built with `pnpm turbo build --filter='@mbe/route-contract^...' --filter='@mbe/cli...'`
→ `23 successful, 23 total`, exit 0. All 23 were cache hits, so the freshness of
what they restored was checked directly rather than assumed:
`packages/api-client/dist/deposits.js` contains main's `getByReservation`, and
`dist/health.js:17` reads `const SYSTEM_HEALTH_PATH = "/health/system";`. This
check matters because vitest resolves `@mbe/api-client` through its `dist`
export. Every scratch edit below that touches `packages/api-client` is followed
by `pnpm --dir packages/api-client build`, and every revert by a rebuild.

### Verdict at a glance

| Brief criterion                              | 2026-09-22 (pre-merge) | 2026-09-28 (merged head)                   |
| -------------------------------------------- | ---------------------- | ------------------------------------------ |
| 1 — check exists and runs in CI on PRs       | PASS                   | **PASS**                                   |
| 2 — proven red on known-bad, green on revert | PASS                   | **PASS**                                   |
| 3 — coverage stated                          | PASS                   | **PASS**                                   |
| 4 — zero false positives on `main`           | PASS                   | **PASS**                                   |
| 5 — lint/typecheck/test green; CI Gate green | PARTIAL                | **PARTIAL** (and CI Gate not provable yet) |

| Re-opened item | Proof                                                                                 | Result    |
| -------------- | ------------------------------------------------------------------------------------- | --------- |
| R1             | function-scope gate RED→GREEN; module-scope gate RED→GREEN; `events/test` unmatchable | **holds** |
| F2             | floor lowered to 20 RED→GREEN                                                         | **holds** |

### 1. The inventory, re-derived on the merged tree

A temporary probe, `tools/route-contract/src/zz-reverify-probe.test.ts`, was
written, run twice, and deleted. `git status --porcelain` showed nothing else
afterwards. It calls the same `buildRouteContractReport()` and
`bootFastifyOwners()` the guard uses, and prints:

```
RV_TOTAL_PAIRS=87
RV_OWNED=87
RV_UNOWNED=0
RV_MULTI_OWNER_PAIRS=0
RV_SUBCLIENTS=15
RV_INVOCATIONS=97
RV_OWNER_HITS={"users":7,"reservations":75,"edge":1,"agent":4}
RV_DISPOSITIONS={"forwarded-to-origin":82,"edge-terminal":1,"static-spa":4}
RV_FASTIFY_EFFECTIVE={"reservations":179,"users":44,"agent":57}
RV_EDGE_TERMINAL=5
RV_EVENTS_PAIRS=[]
RV_DEPOSITS_PAIRS=[["POST","/api/v1/deposits",["deposits.create"],["reservations"]],["GET","/api/v1/deposits/route-contract-placeholder",["deposits.get"],["reservations"]],["GET","/api/v1/deposits",["deposits.getByReservation"],["reservations"]],["POST","/api/v1/deposits/route-contract-placeholder/capture",["deposits.capture","deposits.transition"],["reservations"]],["POST","/api/v1/deposits/route-contract-placeholder/refund",["deposits.refund","deposits.transition"],["reservations"]],["POST","/api/v1/deposits/route-contract-placeholder/forfeit",["deposits.forfeit","deposits.transition"],["reservations"]]]
RV_FASTIFY_TESTBOOT={"reservations":180,"users":44,"agent":57}
RV_ENV_CONDITIONAL=[{"owner":"reservations","entry":"POST /api/v1/events/test","registeredUnder":"test"}]
RV_OWNERS_OF_POST_EVENTS_TEST=[]
RV_EDGE_POST_EVENTS_TEST=forwarded-to-origin
RV_MARKNOSHOW=[["PATCH","/api/v1/reservations/route-contract-placeholder",["reservations.update","reservations.markNoShow","reservations.cancelWithReason"],["reservations"]]]
RV_MARKNOSHOW_INVOCATION=[{"clientMethod":"reservations.markNoShow","requestCount":1,"exempt":false},{"clientMethod":"deposits.getByReservation","requestCount":1,"exempt":false}]
```

**87 pairs, 87 owned, 0 unowned.** The per-owner split is reservations 75,
users 7, agent 4, edge 1, which sums to 87 with no pair claimed by two owners.
Every figure Implement reported in `breakdown.md` § Notes (2026-09-28 merge)
reproduces exactly:

- effective owner tables: reservations 179, users 44, agent 57, edge 5;
- the +1 pair is `deposits.getByReservation` → `GET /api/v1/deposits`, owned by
  `reservations`;
- `reservations.markNoShow` dedupes into the existing
  `PATCH /api/v1/reservations/:id` pair;
- both new methods issue exactly one request in their own invocation;
- `ENV_CONDITIONAL_ROUTES` is still exactly `POST /api/v1/events/test`.

The one figure Implement did not report is invocations: 97, up from 95
pre-merge, which is the two new main methods.

Baseline suite before any scratch edit:

```
$ pnpm --dir tools/route-contract test
 ✓ src/vacuity.test.ts (11 tests) 5ms
 ✓ src/edge-owner.test.ts (13 tests) 29ms
 ✓ src/client-driver-completeness.test.ts (10 tests) 27ms
 ✓ src/client-inventory.test.ts (9 tests) 33ms
 ✓ src/workspace-resolution.test.ts (3 tests) 2ms
 ✓ src/route-contract.test.ts (5 tests) 2510ms
 ✓ src/fastify-owners.test.ts (17 tests) 2744ms
 Test Files  7 passed (7)
      Tests  68 passed (68)
GUARD_EXIT=0
```

### 2. R1 fails closed, re-proved by scratch edits in services Implement did not use

Every scratch edit below was made against a file `git status --porcelain`
reported clean, and was reverted with `git checkout -- <file>`. Each revert was
followed by a clean `git status --porcelain <file>` and a full-suite green run.
Fastify deprecation warnings and the reference boot's expected `[WARN]` /
`[ERROR]` stderr lines are elided from the blocks. Nothing else is.

#### 2a. Function-scope gate (the `events.ts:181` shape), in `services/users`

```
$ git --no-pager diff services/users/src/routes/health.ts
@@ -3,6 +3,10 @@ import { registerHealthRoutes, checkAuth0 } from "@mbe/service-bootstrap";
 export const healthRoutes: FastifyPluginAsync = async (fastify) => {
+  // SCRATCH EDIT (re-verify 2026-09-28, not committed): function-scope env gate.
+  if (process.env.NODE_ENV !== "production") {
+    fastify.post("/api/v1/users/scratch-reverify-fn", async () => ({ ok: true }));
+  }

$ pnpm --dir tools/route-contract test
 ❯ src/fastify-owners.test.ts (17 tests | 2 failed) 2548ms
     × measures the environment-conditional set, and it is exactly the recorded one 4ms
     × counts the effective table — what both boots register — not the test boot's 1ms
 FAIL  src/fastify-owners.test.ts > bootFastifyOwners > measures the environment-conditional set, and it is exactly the recorded one
AssertionError: A service registers a route under one NODE_ENV and not another, and it is not the recorded set. Either the route should not be env-gated, or add it to ENV_CONDITIONAL_ROUTES in fastify-owners.ts with a reason. Do not widen it silently.: expected [ …(2) ] to deeply equal [ { owner: 'reservations', …(2) } ]
+   {
+     "entry": "POST /api/v1/users/scratch-reverify-fn",
+     "owner": "users",
+     "registeredUnder": "test",
+   },
 FAIL  src/fastify-owners.test.ts > bootFastifyOwners > counts the effective table — what both boots register — not the test boot's
AssertionError: expected 44 to be 45 // Object.is equality
 Test Files  1 failed | 6 passed (7)
      Tests  2 failed | 66 passed (68)
R1A_RED_EXIT=1

$ git checkout -- services/users/src/routes/health.ts   # then: status clean
$ pnpm --dir tools/route-contract test
 Test Files  7 passed (7)
      Tests  68 passed (68)
R1A_GREEN_EXIT=0
```

**RED→GREEN.** The fail-closed assertion names the new route by method, full
path and owner, with no client pair targeting it. The `44 to be 45` line is the
effective table excluding the route: `answers()` never saw it as an owner.

#### 2b. Module-scope gate, in `services/agent`, a different service

```
$ git --no-pager diff services/agent/src/routes/remediation.ts
+// SCRATCH EDIT (re-verify 2026-09-28, not committed): env gate decided at MODULE scope.
+const SCRATCH_DEV = process.env.NODE_ENV !== "production";
+
 export const remediationRoutes: FastifyPluginAsync = async (fastify) => {
+  if (SCRATCH_DEV) {
+    fastify.post("/scratch-reverify-module", async () => ({ ok: true }));
+  }

$ pnpm --dir tools/route-contract test
 ❯ src/fastify-owners.test.ts (17 tests | 2 failed) 2518ms
     × measures the environment-conditional set, and it is exactly the recorded one 4ms
     × counts the effective table — what both boots register — not the test boot's 1ms
+   {
+     "entry": "POST /v1/webhooks/scratch-reverify-module",
+     "owner": "agent",
+     "registeredUnder": "test",
+   },
AssertionError: expected 57 to be 58 // Object.is equality
 Test Files  1 failed | 6 passed (7)
      Tests  2 failed | 66 passed (68)
R1B_RED_EXIT=1
```

**Control, with the module-scope edit still in place.** `vi.resetModules()` was
commented out of `importFresh` (`fastify-owners.ts:234`) to check that the RED
above comes from that mechanism and not from something incidental:

```
$ git --no-pager diff tools/route-contract/src/fastify-owners.ts
-  vi.resetModules();
+  // vi.resetModules(); // SCRATCH CONTROL (not committed)

$ pnpm --dir tools/route-contract test
 ❯ src/fastify-owners.test.ts (17 tests | 1 failed) 2470ms
     × re-evaluates module scope under the environment current at each call 6ms
     ✓ measures the environment-conditional set, and it is exactly the recorded one 0ms
     ✓ counts the effective table — what both boots register — not the test boot's 0ms
 FAIL  src/fastify-owners.test.ts > importFresh > re-evaluates module scope under the environment current at each call
AssertionError: expected 'production' to be 'test' // Object.is equality
      Tests  1 failed | 67 passed (68)
R1B_CONTROL_EXIT=1
```

Without the reset, the env-conditional assertion goes **green** with the
module-scope route sitting in the table. That reproduces the defect the
2026-09-28 completion pass found. The only red is the committed `importFresh`
pin, so deleting the mechanism cannot go unnoticed. Both files were then
restored:

```
$ git checkout -- tools/route-contract/src/fastify-owners.ts services/agent/src/routes/remediation.ts   # then: status clean
$ pnpm --dir tools/route-contract test
 Test Files  7 passed (7)
      Tests  68 passed (68)
R1B_GREEN_EXIT=0
```

**RED→GREEN**, and the RED is causally the `importFresh` reset.

#### 2c. `POST /api/v1/events/test` cannot be matched by a client pair, end to end

§ 1 already shows `ownersOf("POST", "/api/v1/events/test")` → `[]`, and the
`test` boot does register it (`RV_ENV_CONDITIONAL`). No client pair targets
`/events` today (`RV_EVENTS_PAIRS=[]`). To show the exclusion holds through the
whole join rather than only at the adapter, a scratch client method aimed at it
was added and the client rebuilt:

```
$ git --no-pager diff packages/api-client/src/health.ts
+  // SCRATCH EDIT (re-verify 2026-09-28, not committed): a client pair aimed at the env-gated route.
+  triggerTestEvent(): Promise<unknown> {
+    return this.client.post<unknown>("/api/v1/events/test", {});
+  }
$ pnpm --dir packages/api-client build            # API_CLIENT_BUILD_EXIT=0
$ pnpm --dir tools/route-contract test
 ❯ src/route-contract.test.ts (5 tests | 1 failed) 2369ms
     × has a route owner for every client pair 2ms
+ 1 @mbe/api-client pair(s) have no route owner:
+
+   POST /api/v1/events/test
+       produced by:  health.triggerTestEvent
+       edge:         forwarded-to-origin
+       fastify:      no match in reservations, users, agent
 Test Files  1 failed | 6 passed (7)
      Tests  1 failed | 67 passed (68)
EVT_RED_EXIT=1

$ git checkout -- packages/api-client/src/health.ts   # then: status clean
$ pnpm --dir packages/api-client build            # API_CLIENT_REBUILD_EXIT=0; dist no longer contains the path
$ pnpm --dir tools/route-contract test
 Test Files  7 passed (7)
      Tests  68 passed (68)
EVT_GREEN_EXIT=0
```

The route the `test` boot registers is reported as `no match in reservations`.
Before R1 this exact pair would have been green here and a 404 in production.

#### 2d. The production-only direction, which no committed test exercises

`bootFastifyOwners`'s doc comment says a production-only route "would be a
_false red_ … caught by the `ENV_CONDITIONAL_ROUTES` assertion". The committed
suite never executes it. `pnpm --dir tools/route-contract test:coverage` (§ 5)
reports `fastify-owners.ts | 96.38 | 83.33 | 92.59 | 97.36 | 336-337`, and lines
336-337 are that branch plus the per-owner sort comparator. So it was measured
here, in `services/reservations`, the third service:

```
+  // SCRATCH EDIT (re-verify 2026-09-28, not committed): a PRODUCTION-only route.
+  if (process.env.NODE_ENV === "production") {
+    fastify.post("/scratch-reverify-prod-only", async () => ({ ok: true }));
+  }
$ pnpm --dir tools/route-contract test
     × measures the environment-conditional set, and it is exactly the recorded one 4ms
+   {
+     "entry": "POST /api/v1/waitlist/scratch-reverify-prod-only",
+     "owner": "reservations",
+     "registeredUnder": "production",
+   },
      Tests  1 failed | 67 passed (68)
PRODONLY_RED_EXIT=1
$ git checkout -- services/reservations/src/routes/waitlist.ts   # then: status clean
      Tests  68 passed (68)
PRODONLY_GREEN_EXIT=0
```

**RED→GREEN.** The claim is true today, and this run also exercised the
per-owner sort, with two reservations entries in the expected order. Nothing
committed pins it, though: see finding N3.

### 3. F2: the absolute floor, re-proved

```
$ git --no-pager diff tools/route-contract/src/vacuity.ts
-export const MINIMUM_CLIENT_PAIRS = 86;
+export const MINIMUM_CLIENT_PAIRS = 20;
$ pnpm --dir tools/route-contract test
 ❯ src/vacuity.test.ts (11 tests | 1 failed) 7ms
     × is pinned to an absolute floor, not only to itself 3ms
 FAIL  src/vacuity.test.ts > MINIMUM_CLIENT_PAIRS > is pinned to an absolute floor, not only to itself
AssertionError: expected 20 to be greater than or equal to 80
 Test Files  1 failed | 6 passed (7)
      Tests  1 failed | 67 passed (68)
F2_RED_EXIT=1
```

The boundary was measured as well, so that the remaining window is a number
rather than an inference. At `MINIMUM_CLIENT_PAIRS = 80` the suite is
`Tests  68 passed (68)`, `F2_AT_80_EXIT=0`. After `git checkout --`, the file
reads `export const MINIMUM_CLIENT_PAIRS = 86;` again and the suite is
`Tests  68 passed (68)`, `F2_GREEN_EXIT=0`.

**RED→GREEN.** F2 as Round 3 specified it
(`toBeGreaterThanOrEqual(80)`) holds. The measured residual is that the floor
can still be lowered from 86 to 80 with everything green. That is a 6-pair
window under the constant and 7 under the live count of 87. `vacuity.test.ts`'s
own comment says the gap is deliberate ("must not track the live count"). It
is recorded here so Review adjudicates it on the number.

### 4. The core guard on the merged tree: the other 2026-08-30 literal

The 2026-09-22 proof reintroduced `/active`. This one reintroduces the second
half of the original defect, so both halves have now been shown going red end
to end:

```
$ git --no-pager diff --unified=1 packages/api-client/src/floor-plans.ts
@@ -79,3 +79,3 @@ export class FloorPlansClient {
     return this.client.postOne<Table[]>(
-      "/api/v1/floor-plans/tables/positions",
+      `/api/v1/floor-plans/${floorPlanId}/bulk-update-positions`,
       body,
$ pnpm --dir packages/api-client build            # API_CLIENT_BUILD_EXIT=0
$ pnpm --dir tools/route-contract test
 ❯ src/route-contract.test.ts (5 tests | 1 failed) 2321ms
     × has a route owner for every client pair 2ms
 FAIL  src/route-contract.test.ts > route contract > has a route owner for every client pair
AssertionError: expected '1 @mbe/api-client pair(s) have no rou…' to be '' // Object.is equality
+ 1 @mbe/api-client pair(s) have no route owner:
+
+   POST /api/v1/floor-plans/route-contract-placeholder/bulk-update-positions
+       produced by:  floorPlans.bulkUpdatePositions
+       edge:         forwarded-to-origin
+       fastify:      no match in reservations, users, agent
+
+ A client URL with no route to answer it is a 404 in production with every
+ other gate green. Fix the client literal, or register the route — do not
+ add an allowlist here.
 Test Files  1 failed | 6 passed (7)
      Tests  1 failed | 67 passed (68)
FP_RED_EXIT=1

$ git checkout -- packages/api-client/src/floor-plans.ts   # then: status clean; line 80 reads "/api/v1/floor-plans/tables/positions",
$ pnpm --dir packages/api-client build            # API_CLIENT_REBUILD_EXIT=0
$ pnpm --dir tools/route-contract test
 Test Files  7 passed (7)
      Tests  68 passed (68)
FP_GREEN_EXIT=0
```

**RED→GREEN.** The anti-vacuity floor did not fire, correctly: the pair count
stayed 87, because one owned pair was swapped for one unowned pair.

### 5. The real gates, re-run on the merged tree

Several of these were cache hits on the first attempt. Cache hits replay an
earlier run's result, which here means Implement's, so each such gate was
re-run with the cache disabled. The `Cached: 0` figure in each result is the
evidence that it actually executed.

| Gate                                                              | Result (quoted)                                                                                                                                                                          |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                  | `Lockfile is up to date, resolution step is skipped`; `INSTALL_EXIT=0`                                                                                                                   |
| `pnpm regen --check`                                              | `All generated artifacts are up to date.`; `REGEN_CHECK_EXIT=0`                                                                                                                          |
| `pnpm turbo typecheck --filter='...[origin/main]'`                | first run `36 successful, 36 total` / `Cached: 36 cached` (a replay); re-run with `--force`: `36 successful, 36 total` / `Cached: 0 cached, 36 total`, 1m24.7s, `TYPECHECK_FORCE_EXIT=0` |
| `pnpm turbo run typecheck --force` (all of root `pnpm typecheck`) | `52 successful, 52 total` / `Cached: 0 cached, 52 total`, 59.3s, exit 0                                                                                                                  |
| `pnpm turbo run lint --force` (all of root `pnpm lint`)           | `52 successful, 52 total` / `Cached: 0 cached, 52 total`, 2m7.2s, exit 0                                                                                                                 |
| `pnpm --dir tools/route-contract test:coverage`                   | `Test Files 7 passed (7)` / `Tests 68 passed (68)`; `All files \| 95.72 \| 80.76 \| 91.02 \| 95.94` against thresholds 80/70/80/80; `RC_COVERAGE_EXIT=0`                                 |
| `pnpm --dir tools/route-contract lint`                            | `eslint src/`, no output; `RC_LINT_EXIT=0`                                                                                                                                               |
| `pnpm --dir packages/api-client test`                             | `Test Files 19 passed (19)` / `Tests 315 passed (315)`; `API_CLIENT_TEST_EXIT=0`                                                                                                         |
| `node scripts/check-ai-antipatterns.mjs`                          | all 8 `OK`, incl. `emptyCatch: 78 (baseline: 78)`, `hardcodedRoutes: 847 (baseline: 847)`; `All patterns within baseline.`; exit 0                                                       |
| `node scripts/check-orphaned-tests.mjs`                           | `PASS: Every test file lives under a workspace package that CI runs.`; exit 0                                                                                                            |
| CI-shaped run: `pnpm turbo test:coverage --force --concurrency=2` | `52 successful, 52 total` / `Cached: 0 cached, 52 total`, 3m41.3s, `CI_SHAPED_EXIT=0`; guard leg `Tests 68 passed (68)`                                                                  |
| `ci.yml`'s repo-wide coverage fold, replayed over those reports   | `Repo-wide coverage: 84% (24877/29368 statements, threshold: 60%) reports=29 route-contract-folded=yes`; exit 0                                                                          |

`pnpm turbo typecheck --filter='...[origin/main]'` resolved `origin/main` to
`7ac892126`, not `49c7d773d`. See this artifact's `assumptions:`: the
merge-base is unchanged, so the affected set is too. The repo-wide
typecheck and lint rows make the question moot, because they cover every
package.

**The ratchet baseline raise, checked against `main` itself.** In a throwaway
worktree at `49c7d773d` (§ 6), the same script reported
`emptyCatch: 77 (baseline: 77)` and `hardcodedRoutes: 825 (baseline: 825)`.
`git diff origin/main...HEAD -- metrics/ai-antipattern-baselines.json` is
exactly `77 → 78` and `825 → 847`, plus `generatedAt`. So the whole increase
is this branch's own, as `breakdown.md`'s assumption says. Review still owns
whether raising it was right. Note too that the merged tree sits at **zero
slack** on both counters (847/847, 78/78). See finding N5.

### 6. Criterion 5's PARTIAL (F1), re-measured

**Root `pnpm test` is still RED on the merged tree, and it is RED on
`origin/main` alone as well, on every sample taken.** The failing package
differs from run to run. Every failure is a wall-clock timeout in a package
this branch does not touch, and every failing test passes in isolation.

`origin/main` was measured in a separate throwaway worktree at
`49c7d773d`, the commit merged into this branch:
`git worktree add --detach …/scratchpad/verify-main-wt 49c7d773d` →
`pnpm install --frozen-lockfile` (`Lockfile is up to date`). It was removed
afterwards (`git worktree remove --force` → `REMOVE_EXIT=0`, path gone,
`git worktree list | grep -c verify-main-wt` → `0`).

| Sample | Tree                      | Command                       | Result (turbo summary, quoted)                                                            | Timed-out test(s)                                                                                                                                                                                                                            |
| ------ | ------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1     | merged `1ff0b79dd`        | `pnpm test` (literal)         | `45 successful, 54 total` · `Cached: 22 cached` · `Failed: @mbe/users-service#test`       | `services/users` `src/routes/ready.test.ts > GET /ready > returns 200 with ready: true when all checks pass` — `Hook timed out in 30000ms` (ran 31362 ms)                                                                                    |
| B2     | merged `1ff0b79dd`        | `pnpm turbo run test --force` | `52 successful, 54 total` · `Cached: 0 cached` · `Failed: @mbe/reservations-service#test` | `services/reservations` — 4 files, each `Hook timed out in 15000ms`: `floor-plans.test.ts`, `guests.test.ts`, `holds.test.ts`, `reservations.test.ts` (`4 failed \| 1687 passed \| 150 skipped`)                                             |
| M1     | `origin/main` `49c7d773d` | `pnpm turbo run test --force` | `41 successful, 50 total` · `Cached: 0 cached` · `Failed: @mbe/rialto-catalog#test`       | `packages/rialto-catalog` `src/__tests__/registry.test.tsx > renders a Button via registry and Renderer` — `Test timed out in 5000ms`                                                                                                        |
| M2     | `origin/main` `49c7d773d` | `pnpm turbo run test --force` | `40 successful, 50 total` · `Cached: 0 cached` · `Failed: @mbe/rialto-catalog#test`       | `rialto-catalog` `registry-full.test.tsx > Toggle > renders unchecked toggle` and `registry.test.tsx` (both `5000ms`); **and** `services/users` `ready.test.ts`, the same test as B1 (`Hook timed out in 30000ms`, `1 failed \| 138 passed`) |

Isolation, each run alone:

- `services/users` `ready.test.ts` → `4 passed (4)`, the failing case at
  **748 ms** against 31 362 ms under load. The whole `services/users` package
  → `139 passed (139)`.
- The four `services/reservations` files together → `154 passed (154)` in
  18.2 s.
- On main, `packages/rialto-catalog` `registry.test.tsx` → `10 passed (10)` in
  1.38 s.

The branch touches none of these packages:
`git diff --name-only 49c7d773d...HEAD -- <pkg> | wc -l` is `0` for
`services/users`, `services/reservations`, `packages/rialto-catalog`,
`packages/rialto`, `apps/rialto-web` and `apps/hospitality`. The only
`packages/` change is `packages/api-client` (7 files).

**What this settles, and what it does not:**

- **The condition reproduces on `origin/main` alone, 2 of 2 samples.** The
  2026-09-22 § Not verified left this open ("They almost certainly do … but I
  did not prove it"). It is now proved. The `users-service` `ready.test.ts`
  timeout is the same test failing on both trees (B1 and M2), which is the
  most direct evidence that it predates the branch.
- **Not every victim was seen on both trees.** `rialto-catalog` failed on main
  2/2 and passed on the merged tree both times it completed
  (`129 passed (129)` in B1 and B2). `reservations-service` failed on the
  merged tree once (B2), but **never completed on main**: turbo aborted both
  main runs after `rialto-catalog` failed, before reservations' ~190 s suite
  finished. So "does the reservations timeout reproduce on main" is **not
  measured either way**, and this addendum does not claim it does.
- The 2026-09-22 victims (`packages/rialto` `Toast.test.tsx`, `apps/rialto-web`
  `page-registry.test.ts`) both passed in B2 (`2358 passed (2358)`,
  `770 passed (770)`). The failing set moves between runs, which is what a
  load-dependent timeout does and a deterministic breakage does not.
- **The branch adds load to this exact shape.** Its root `pnpm test` graph
  executes 54 tasks where main's executes 50, which is measured. A dry-run on
  the merged tree lists `@mbe/route-contract#test` among them, and that task
  boots all three services twice. It also lists the
  `@mbe/{reservations,users,agent}-service#build` tasks its devDependencies
  pull in. That these are the +4 is inferred, because main's graph was not
  dry-run before its worktree was removed. Whether the extra load contributed
  to B2's reservations timeouts is **unmeasured**. See finding N2.
- `packages/rialto-catalog` sets **no** `testTimeout`
  (`grep testTimeout packages/rialto-catalog/vitest.config.*` → nothing), so it
  runs on vitest's 5 s default. That differs from the two 2026-09-22 victims,
  which R5 correctly showed already carry `testTimeout: 15000`. Round 3's
  live-user instruction stands (do not apply `testTimeout` in this run), so
  this is recorded for the backlog, not acted on.

**The CI-shaped command is green on the merged tree, cold:**
`52 successful, 52 total`, `Cached: 0 cached, 52 total`, exit 0 (§ 5).
Criterion 5 therefore stays **PARTIAL**, on the same two counts as before.
First, root `pnpm test` as literally written is red, now shown to be red on
`main` too. Second, the `CI Gate` half cannot be observed until Ship pushes.

### 7. Criteria 1–5, re-statused on the merged head

**1 — the check exists and runs in CI on pull requests: PASS.** Re-measured on
the merged tree rather than inherited:

- `ci.yml` has `pull_request: branches: [main]`, with no `paths` filter on
  that trigger.
- `ci.yml:552` (it was `:541` before main's `ci.yml` changes merged) runs
  `run: pnpm turbo test:coverage --concurrency=2` inside `test:`.
- `test` is in `ci-gate`'s `needs` (`ci.yml:1014-1034`).
- `pnpm turbo test:coverage --concurrency=2 --dry-run=json` →
  `TOTAL TASKS IN GRAPH: 76`, `route-contract tasks: ["@mbe/route-contract#test:coverage"]`.
- `ci.yml:566`'s codecov `files:` still carries
  `./tools/route-contract/coverage/coverage-final.json`.
- The branch's whole `.github/workflows/` diff is
  `ci.yml | 2 +-` (the one-line codecov change).
- `gh api …/branches/main/protection/required_status_checks` →
  `{"contexts":["CI Gate"],"strict":false}`.
- `check-orphaned-tests` → `PASS`.

**2 — proven to fail on the known-bad input and pass once reverted: PASS.**
§ 4 on the merged tree, using the `bulk-update-positions` half of the
2026-08-30 pair: RED `POST /api/v1/floor-plans/route-contract-placeholder/bulk-update-positions … fastify: no match in reservations, users, agent`,
then GREEN `Tests 68 passed (68)` after revert. R1 (§ 2) and F2 (§ 3) were
re-proved RED→GREEN on the merged tree as well.

**3 — coverage is stated: PASS.** The statement's shape is unchanged. The
numbers move with the merge: 15 sub-clients, 97 invocations and 87 pairs
against four owners (effective tables reservations 179, users 44, agent 57;
edge 5 terminal paths). The recorded blind spots (`KNOWN_BLIND_SPOTS`,
`EXEMPT_METHODS`) are unchanged and still asserted by the green
`client-inventory` / `client-driver-completeness` suites. R1 adds one stated
limit, now in `bootFastifyOwners`'s doc comment (`fastify-owners.ts:286-289`):
the env diff cannot see a gate on a third `NODE_ENV` value, a gate on a
different variable, or a gate inside a package under `node_modules`. None of
the three was probed here, and all three stay excluded by statement.

**4 — zero false positives: PASS.** 87 pairs / 87 owned / 0 unowned on the
merged tree (§ 1), with no allowlist. Main's new client surface
(`deposits.getByReservation`, `reservations.markNoShow`) is owned by
`reservations` with no guard edit. Findings A and B stay fixed and pinned
(`route-contract.test.ts` green). Production was **not** re-probed today: the
branch is unmerged and undeployed, so a probe could only re-show the pre-fix
404 recorded on 2026-09-22.

**5 — `pnpm lint`, `pnpm typecheck`, `pnpm test` green; CI Gate green on the PR:
PARTIAL.**

- lint: green, `52 successful, 52 total`, uncached.
- typecheck: green, `52 successful, 52 total`, uncached.
- root `pnpm test`: **red** (§ 6), on packages the branch does not touch, and
  red on `origin/main` alone.
- The CI-shaped command CI runs is green, cold.
- **`CI Gate` green on the PR is not provable before push.** No PR exists and
  Verify must not create one. Nothing here asserts it. It is Ship's to observe.

### Findings for Review to adjudicate

None blocks. None is critical. Nothing routes back to Implement.

- **N1 — F1 now reproduces on `origin/main` alone** (2/2 samples, § 6). The
  `services/users` `ready.test.ts` hook timeout fails on both trees. This
  retires the 2026-09-22 "not verified" gap and strengthens the environmental
  grading. The newly observed victim `packages/rialto-catalog` has **no**
  `testTimeout` (unlike the two R5 examined), so R5's "already applied" does
  not extend to it. That is for the backlog under Round 3's standing
  instruction, not for this run.
- **N2 — the branch adds work to the uncapped root `pnpm test` shape**: 54
  executed tasks against 50 on main (measured), including a task that boots
  three services twice (dry-run). Whether that load contributed to B2's
  `reservations-service` timeouts is unmeasured, and reservations never
  completed on main to compare against. It does not affect the capped command
  CI runs (green cold).
- **N3 — the production-only direction of the env diff is unpinned.**
  `fastify-owners.ts:336-337` (the `registeredUnder: "production"` branch and
  the per-owner sort comparator) is never executed by the committed suite.
  § 2d shows the behaviour is correct today, by scratch edit only. The doc
  comment's "caught by the `ENV_CONDITIONAL_ROUTES` assertion" is true but
  would not go red if it stopped being true. Minor.
- **N4 — the F2 window is 80–86**, measured green at 80 (§ 3). This is by
  design and satisfies Round 3's letter (`≥ 80`). Recorded so the residual is a
  number.
- **N5 — the antipattern ratchet has zero slack** on `hardcodedRoutes`
  (847/847) and `emptyCatch` (78/78). Any main commit that adds one hardcoded
  `/api/…` string or one empty catch before this PR merges will red the
  ratchet on the merge result, though both are individually green. The two
  commits main has gained since (`7ac892126`, metrics/marketing JSON only) add
  neither. Ship should re-run `node scripts/check-ai-antipatterns.mjs` on the
  merge result if `main` moves again before merge.
- **N6 — `origin/main` moved to `7ac892126`** (+2 commits, metrics-only)
  during this stage. `git merge-tree --write-tree HEAD 7ac892126` → exit 0, a
  clean merge. Not merged here: this addendum measures `1ff0b79dd` as
  instructed.

### Not verified in this addendum

- **`CI Gate` on the PR.** There is no PR yet. It is Ship's to observe.
- **Whether `reservations-service`'s B2 timeouts reproduce on `origin/main`.**
  Neither main sample reached the end of that suite (§ 6).
- **The three stated blind spots of the env diff** (a third `NODE_ENV` value, a
  different variable, a gate in `node_modules`). Excluded by statement, not
  probed.
- **Production.** Not re-probed. The 2026-09-22 probes stand as the pre-fix
  record.

### Tree state at hand-off

After every scratch edit was reverted and the probe deleted,
`git status --porcelain`, excluding the untracked `.claude/sessions/*.md`
Stop-hook archives present on arrival, printed nothing
(`NONSESSION_DIRT_LINES=0`), and `HEAD` was still `1ff0b79dd`. This addendum is
the only change committed by this stage.
