# Proof: the guard's first run on `main`'s code is RED on exactly two pairs

Captured 2026-09-22 during Implement work item 7
(`docs/fixes/api-client-route-contract/breakdown.md`), on branch
`fix/api-client-route-contract`, base `origin/main` `0a80ea85b`.

**Nothing in `packages/api-client` had been changed when this ran**
(`git status --porcelain packages/api-client` printed nothing). Items 9 and 10
— the two one-line fixes — were deliberately sequenced _after_ this item so
that the pre-fix red could be observed and recorded. Landing them first would
have erased the strongest evidence this run has: a guard reproducing two real
production defects it was never told about, on its very first run, with no
scratch edit.

## Scale of the run

```
TOTAL PAIRS: 87
OWNED:       85
UNOWNED:     2
FASTIFY ROUTE COUNTS: {"reservations":176,"users":44,"agent":56}
EDGE TERMINAL PATHS:  5
DISPOSITIONS: {"forwarded-to-origin":83,"static-spa":4}
```

176 + 44 + 56 = **276** registered method+path entries, which is the number
`architecture.md` measured independently at the same commit. The four
`static-spa` pairs are the `/v1/sessions*` family: the apex serves the
marketing SPA for them because `originRoutes` is `["/api","/public"]`. They
still pass, because `services/agent` answers them on the direct origin host —
the deliberate, already-recorded `EDGE_EXEMPT_PREFIXES = ["/v1"]` condition in
`infrastructure/pulumi/ingress-coverage.test.ts:145`. Host reachability is not
what this guard checks; see § What this guard does not cover in
`architecture.md`.

## Verbatim transcript

```
$ git status --porcelain packages/api-client
$ pnpm --dir tools/route-contract exec vitest run src/route-contract.test.ts

 ❯ src/route-contract.test.ts (1 test | 1 failed) 415ms
   ❯ route contract (1)
     × has a route owner for every client pair 3ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/route-contract.test.ts > route contract > has a route owner for every client pair
AssertionError: expected '2 @mbe/api-client pair(s) have no rou…' to be '' // Object.is equality

- Expected
+ Received

+ 2 @mbe/api-client pair(s) have no route owner:
+
+   GET /api/v1/venues/groups/by-slug/route-contract-placeholder
+       produced by:  venueGroups.getBySlug
+       edge:         forwarded-to-origin
+       fastify:      no match in reservations, users, agent
+   GET /api/health/system
+       produced by:  health.system
+       edge:         forwarded-to-origin
+       fastify:      no match in reservations, users, agent
+
+ A client URL with no route to answer it is a 404 in production with every
+ other gate green. Fix the client literal, or register the route — do not
+ add an allowlist here.

 Test Files  1 failed (1)
      Tests  1 failed (1)
   Duration  2.40s (import 48%, transform 34%, tests 18%)
```

## What the two failures are

Both were measured statically at Capture and probed against production at the
Addendum interview round (2026-09-22 ~21:10Z, resolver cross-checked against
`1.1.1.1`). The guard found them independently, from the other direction, and
named both.

| pair                                      | finding | production                                                                                                                                                   |
| ----------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/health/system`                  | **A**   | 404 today. `apps/hospitality`'s `SystemHealthBadge` calls it on a 60 s poll; the edge answers `/health/system` (no `/api`) with a real payload. User-facing. |
| `GET /api/v1/venues/groups/by-slug/:slug` | **B**   | 404, unregistered. Latent — no application calls the _group_ `getBySlug`; every call site resolves to the _venue_ client.                                    |

The failure message carries all four things item 7 asked for on each: method,
path, producing client method, and edge disposition. `forwarded-to-origin` on
both is the diagnosis in one word — the edge hands the path to DO verbatim, and
nothing at DO registers it.

## The post-fix green

Recorded separately, after items 9 and 10 landed:
`guard-green-after-fixes.md`.
