# Proof: the guard goes red on the 2026-08-30 literal and green once reverted

Captured 2026-09-22 during Implement work item 11
(`docs/fixes/api-client-route-contract/breakdown.md`), on branch
`fix/api-client-route-contract` at commit `9327004f1`. Every block below is
real command output.

This is the **end-to-end** proof the brief's success criterion 2 asks for: the
originating production defect, reintroduced into the real client, caught by the
whole chain (driver → owners → join → failure message), then reverted. It is
deliberately distinct from `tools/route-contract/src/fastify-owners.test.ts`,
which pins the same distinction permanently at the adapter level with no
working-tree edit. Do not collapse them — one asks "does `findRoute` tell these
two paths apart", the other asks "does the guard fail".

**One mechanical prerequisite, stated because getting it wrong would make this
transcript a lie:** `@mbe/api-client`'s `exports` map resolves `default` to
`./dist/index.js`, so the driver runs the **built** client. Every step below
rebuilds `packages/api-client` before running the guard. In CI this is
automatic — turbo's `test` and `test:coverage` both declare
`dependsOn: ["^build"]`.

## Step 1 — green

```
$ git status --porcelain packages/api-client/src/floor-plans.ts
$ pnpm --dir packages/api-client build
$ pnpm --dir tools/route-contract test

 ✓ src/vacuity.test.ts (10 tests)
 ✓ src/edge-owner.test.ts (13 tests)
 ✓ src/client-driver-completeness.test.ts (10 tests)
 ✓ src/client-inventory.test.ts (9 tests)
 ✓ src/workspace-resolution.test.ts (3 tests)
 ✓ src/fastify-owners.test.ts (9 tests)
 ✓ src/route-contract.test.ts (5 tests)

 Test Files  7 passed (7)
      Tests  59 passed (59)
   Duration  2.32s
```

## Step 2 — reintroduce the 2026-08-30 literal, and the guard goes red

```
$ git diff --unified=1 packages/api-client/src/floor-plans.ts
diff --git a/packages/api-client/src/floor-plans.ts b/packages/api-client/src/floor-plans.ts
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

 Test Files  1 failed (1)
      Tests  1 failed | 4 passed (5)
```

The failure message carries all four things item 7's contract requires, on a
real failure rather than a constructed one: the **method** (`POST`), the
**path**, the **producing client method** — both of them, `floorPlans.setActive`
and its alias `floorPlans.activate`, which is more than the person debugging
would have found by grep — and the **edge disposition**
(`forwarded-to-origin`, i.e. the edge hands this to DO verbatim and nothing at
DO registers it, which is exactly the 404 production returned on 2026-08-30).

## Step 3 — revert, and the guard goes green again

```
$ git checkout -- packages/api-client/src/floor-plans.ts
$ git status --porcelain packages/api-client/src/floor-plans.ts
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

 Test Files  7 passed (7)
      Tests  59 passed (59)
   Duration  2.23s
```

`git status --porcelain` on that file printed nothing both before the edit and
after the revert — no residual modification.

## Coverage, stated explicitly

Success criterion 3 asks for this, and an unstated gap is how the next one
hides.

### What is compared

**Client side — all 15 sub-clients of `@mbe/api-client`, driven by running
them.** 86 distinct `method + path` pairs from 95 invocations. Per sub-client:

| sub-client     | pairs | sub-client    | pairs | sub-client      | pairs |
| -------------- | ----- | ------------- | ----- | --------------- | ----- |
| `users`        | 7     | `guests`      | 11    | `availability`  | 2     |
| `reservations` | 9     | `floorPlans`  | 8     | `holds`         | 8     |
| `venues`       | 7     | `publicVenue` | 4     | `briefing`      | 1     |
| `venueGroups`  | 5     | `waitlist`    | 7     | `deposits`      | 5     |
| `tables`       | 7     | `health`      | 1     | `agentSessions` | 4     |

`agentSessions` is included only because it is constructed separately —
`createApiClient` does not wire `AgentSessionClient` up (`index.ts:81-97`), so
a driver built from the factory alone silently misses all four `/v1/sessions`
paths.

**Owner side — four route owners**, enumerated by running them too:

| owner                                 | how                                      | size                               |
| ------------------------------------- | ---------------------------------------- | ---------------------------------- |
| `services/reservations`               | `buildApp()` → `ready()` → `findRoute()` | 176 registered method+path entries |
| `services/users`                      | same                                     | 44                                 |
| `services/agent`                      | same                                     | 56                                 |
| edge Worker (`infrastructure/worker`) | `edgeRouter.fetch()` with a stub env     | 5 paths it terminates              |

Which owner answers the 86 pairs: `reservations` 74, `users` 7, `agent` 4,
`edge` 1. Edge dispositions across the 86: `forwarded-to-origin` 81,
`static-spa` 4, `edge-terminal` 1.

### What is knowingly excluded, and why

- **Host reachability.** The guard proves an owner exists, not that the owner
  is reachable through the host a given caller points at. The four `static-spa`
  pairs above are the `/v1/sessions*` family: `services/agent` answers them, but
  the apex serves the marketing SPA for them because `originRoutes` is
  `["/api","/public"]`. That is deliberate and already recorded as
  `EDGE_EXEMPT_PREFIXES = ["/v1"]` in
  `infrastructure/pulumi/ingress-coverage.test.ts:145`. Making reachability a
  failure here would red `main` on day one for a condition this run has no
  defect against. The sibling guard on the next hop of the same chain owns it.
- **Payload shape.** Unchanged and out of scope. Flagged, not fixed:
  `packages/api-client/src/contract.test.ts` imports both of its "sides" from
  `@mbe/types/schemas` and imports no service, so its name over-claims what it
  checks.
- **Non-client callers.** Anything that builds its own URL is invisible here:
  `streamNDJSON` (recorded in the driver's own `KNOWN_BLIND_SPOTS` — it takes a
  caller-supplied `config.url`, `streaming.ts:35-36`), the apps' direct `fetch`
  calls, and E2E fixtures.
- **Whether the handler works.** `findRoute` proves a route matches. It says
  nothing about auth, the query, the response, or the status code.
- **The reverse direction.** A registered route with no client caller is not
  reported. ~276 registered entries against 86 client pairs; most of the
  difference is legitimately called by something else, and a reverse rule would
  need a ~190-entry allowlist.
