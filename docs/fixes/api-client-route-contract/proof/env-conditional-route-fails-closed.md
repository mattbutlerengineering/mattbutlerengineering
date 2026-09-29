# Proof: a NEW environment-conditional route fails the guard closed

Captured 2026-09-22 during Implement work item R1
(`docs/fixes/api-client-route-contract/breakdown.md` § Milestone 5), on branch
`fix/api-client-route-contract` at commit `3fe7a05db`. Every block below is real
command output.

R1's third condition is that the fix **fail closed**: if a _new_
environment-conditional route appears in any of the three services, something
goes red rather than the owner table quietly widening. Pinning today's known
set by hand does not satisfy that, so the set is **measured** — each service is
booted twice, once under `NODE_ENV="test"` and once under
`NODE_ENV="production"`, and the two route tables are diffed. This transcript
shows the measurement disagreeing with the recorded set, and then agreeing.

The scratch edit is deliberately in `services/users`, not in
`services/reservations` — the recorded entry lives in reservations, so seeding
the new one in a different service proves the detector is not scoped to the one
place the class is already known to occur.

## Step 1 — the scratch edit

```
$ git status --porcelain services/users/src/routes/users.ts
$ # (clean)
```

Then, inserted at the top of `userRoutes` in
`services/users/src/routes/users.ts`:

```ts
// SCRATCH EDIT (not committed) — a NEW environment-conditional route, the
// exact class R1 exists to fail closed on.
if (process.env.NODE_ENV !== "production") {
  fastify.get("/scratch-dev-only", async () => ({ ok: true }));
}
```

```
$ git --no-pager diff --stat services/users/src/routes/users.ts
 services/users/src/routes/users.ts | 6 ++++++
 1 file changed, 6 insertions(+)
```

## Step 2 — RED

```
$ pnpm --dir tools/route-contract exec vitest run src/fastify-owners.test.ts
 RUN  v5.0.1 /Users/mbutler/github/mattbutlerengineering/.claude/worktrees/api-client-route-contract/tools/route-contract
<claude-code-hint v="1" type="plugin" value="stripe@claude-plugins-official" />
 ❯ src/fastify-owners.test.ts (16 tests | 2 failed) 802ms
   ✓ countRegisteredRoutes (2)
     ✓ sums the methods on every route node 1ms
     ✓ counts nothing in a tree with no route nodes 0ms
   ✓ printedRouteEntries (2)
     ✓ reconstructs each node's full path from the tree it is printed in 1ms
     ✓ finds nothing in a tree with no route nodes 0ms
   ✓ overrideEnv (1)
     ✓ restores a key that was set, and removes one that was not 0ms
   ❯ bootFastifyOwners (11)
     ✓ boots all three services to ready() with no mocks 0ms
     ✓ matches by runtime path, not by pattern spelling 1ms
     ✓ reports no owner for a path nobody registers 0ms
     ✓ POST /api/v1/floor-plans/route-contract-placeholder/active is owned by [] 0ms
     ✓ POST /api/v1/floor-plans/route-contract-placeholder/activate is owned by ["reservations"] 0ms
     ✓ POST /api/v1/floor-plans/route-contract-placeholder/bulk-update-positions is owned by [] 0ms
     ✓ POST /api/v1/floor-plans/tables/positions is owned by ["reservations"] 0ms
     ✓ reports no owner for a route only a non-production boot registers 0ms
     ✓ still reports the owner of a sibling route under the same prefix 0ms
     × measures the environment-conditional set, and it is exactly the recorded one 11ms
     × counts the effective table — what both boots register — not the test boot's 1ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/fastify-owners.test.ts > bootFastifyOwners > measures the environment-conditional set, and it is exactly the recorded one
AssertionError: A service registers a route under one NODE_ENV and not another, and it is not the recorded set. Either the route should not be env-gated, or add it to ENV_CONDITIONAL_ROUTES in fastify-owners.ts with a reason. Do not widen it silently.: expected [ …(3) ] to deeply equal [ { owner: 'reservations', …(2) } ]
- Expected
+ Received
@@ -2,6 +2,16 @@
    {
      "entry": "POST /api/v1/events/test",
      "owner": "reservations",
      "registeredUnder": "test",
    },
+   {
+     "entry": "GET /api/v1/users/scratch-dev-only",
+     "owner": "users",
+     "registeredUnder": "test",
+   },
+   {
+     "entry": "HEAD /api/v1/users/scratch-dev-only",
+     "owner": "users",
+     "registeredUnder": "test",
+   },
  ]
 ❯ src/fastify-owners.test.ts:173:7
    171|         "recorded set. Either the route should not be env-gated, or ad…
    172|         "ENV_CONDITIONAL_ROUTES in fastify-owners.ts with a reason. Do…
    173|     ).toEqual(ENV_CONDITIONAL_ROUTES);
       |       ^
    174|   });
    175|
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯
 FAIL  src/fastify-owners.test.ts > bootFastifyOwners > counts the effective table — what both boots register — not the test boot's
AssertionError: expected 44 to be 46 // Object.is equality
- Expected
+ Received
- 46
+ 44
 ❯ src/fastify-owners.test.ts:183:40
    181|     expect(owners.routeCount("reservations")).toBe(owners.testBootRout…
    182|     for (const owner of ["users", "agent"] as const) {
    183|       expect(owners.routeCount(owner)).toBe(owners.testBootRouteCount(…
       |                                        ^
    184|     }
    185|   });
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯
 Test Files  1 failed (1)
      Tests  2 failed | 14 passed (16)
   Start at  21:36:58
   Duration  2.94s (transform 37%, import 34%, tests 28%)
JUNIT report written to /Users/mbutler/github/mattbutlerengineering/.claude/worktrees/api-client-route-contract/tools/route-contract/test-results/junit.xml
```

Exit code `1`. Note what the two failures are:

- **`measures the environment-conditional set`** — the fail-closed assertion.
  It names the new route by method and full path, in both its auto-registered
  `GET` and `HEAD` forms, and its message says what to do. Nothing about this
  needed a client pair to target the new route; the guard's own client
  inventory is untouched by the scratch edit.
- **`counts the effective table`** — the anti-vacuity signal moving with it,
  because `users`' effective table (what both boots register, 44) no longer
  equals its `test`-boot table (46).

The nine other `bootFastifyOwners` assertions stay green, including
`reports no owner for a route only a non-production boot registers` — the
scratch route is correctly excluded from the owner table as it is introduced,
which is R1's first condition holding for a route nobody recorded.

## Step 3 — green once reverted

```
$ git checkout -- services/users/src/routes/users.ts
$ git status --porcelain services/users/src/routes/users.ts
$ # (clean — no residual modification)
$ pnpm --dir tools/route-contract exec vitest run src/fastify-owners.test.ts
 RUN  v5.0.1 /Users/mbutler/github/mattbutlerengineering/.claude/worktrees/api-client-route-contract/tools/route-contract
<claude-code-hint v="1" type="plugin" value="stripe@claude-plugins-official" />
 ✓ src/fastify-owners.test.ts (16 tests) 839ms
 Test Files  1 passed (1)
      Tests  16 passed (16)
   Start at  21:37:16
   Duration  3.04s (transform 37%, import 34%, tests 29%)
JUNIT report written to /Users/mbutler/github/mattbutlerengineering/.claude/worktrees/api-client-route-contract/tools/route-contract/test-results/junit.xml
```

Exit code `0`.

## What this does and does not prove

**Proves:** the environment-conditional set is derived from a real double boot
of the real service apps, not from a list; a new gated route in a service that
had none fails the suite on its own; and reverting the gate returns it to
green.

**Does not prove:** that every possible environment-conditional registration is
caught. The measurement compares `NODE_ENV="test"` against
`NODE_ENV="production"`, so a registration gated on a _third_ value (say
`NODE_ENV === "staging"`) is invisible to it, as is one gated on a different
variable entirely. That is a narrower claim than "nothing is env-conditional",
and it is the claim the corrected doc comment in `fastify-owners.ts` now makes.

---

## Addendum — 2026-09-28, implement (completion pass): the gate at module scope

The completion pass re-audited R1 against its three conditions instead of
inheriting the checkbox, and found the fail-closed half did **not** hold for
one ordinary code shape. Everything above boots each service twice, but the
three services were imported **statically**, so their module scope was
evaluated exactly once — under vitest's ambient `NODE_ENV="test"` — and both
boots shared that evaluation. A gate decided at module scope is therefore
invisible to the two-boot diff.

Fastify's deprecation warnings and the reference boot's own `[WARN]` /
`[ERROR]` stderr lines (unset Stripe/Redis configuration) are elided from the
blocks below; nothing else is.

### The scratch edit

```
$ git --no-pager diff services/users/src/routes/users.ts
diff --git a/services/users/src/routes/users.ts b/services/users/src/routes/users.ts
index 6e84e2fb4..7aac7730a 100644
--- a/services/users/src/routes/users.ts
+++ b/services/users/src/routes/users.ts
@@ -40,7 +40,13 @@ const requireUserOwnershipOrAdmin = requireOwnershipOrAdmin(
   resolveCurrentUserId
 );

+// SCRATCH EDIT (not committed) - a NEW env-conditional route gated at MODULE scope.
+const SCRATCH_DEV_ROUTES = process.env.NODE_ENV !== "production";
+
 export const userRoutes: FastifyPluginAsync = async (fastify) => {
+  if (SCRATCH_DEV_ROUTES) {
+    fastify.get("/scratch-dev-only", async () => ({ ok: true }));
+  }
   // List users
   fastify.get<{
     Querystring: { page?: string; limit?: string };
```

### Before the fix — GREEN, which is the defect

On the uncommitted R1 code exactly as the earlier pass left it:

```
$ pnpm --dir tools/route-contract exec vitest run src/fastify-owners.test.ts
 RUN  v5.0.1 /Users/mbutler/github/mattbutlerengineering/.claude/worktrees/api-client-route-contract/tools/route-contract
<claude-code-hint v="1" type="plugin" value="stripe@claude-plugins-official" />
 ✓ src/fastify-owners.test.ts (16 tests) 696ms
 Test Files  1 passed (1)
      Tests  16 passed (16)
   Start at  11:05:44
   Duration  2.89s (import 41%, transform 34%, tests 25%)
JUNIT report written to /Users/mbutler/github/mattbutlerengineering/.claude/worktrees/api-client-route-contract/tools/route-contract/test-results/junit.xml
exit=0
```

The new route sat in the owner table — any client pair aimed at
`GET /api/v1/users/scratch-dev-only` would have found owner `users` here and a
404 in production — and all 16 tests stayed green. R1 conditions 1 and 3 did
not hold for this shape.

### The fix

`fastify-owners.ts` now imports each service through `importFresh(load)`,
which calls `vi.resetModules()` before the dynamic import, so each boot
evaluates the services' module scope under its own `NODE_ENV`. The mechanism is
pinned by a committed test, `importFresh › re-evaluates module scope under the
environment current at each call`, against the fixture
`src/module-scope-env.fixture.ts` (a module whose only content is a
module-scope `NODE_ENV` read). With `importFresh` stubbed to a plain
`load()` that test failed for the right reason —
`expected 'production' to be 'test'`, the module cache returning the first
evaluation — and passed once `vi.resetModules()` was added.

Evaluating under `production` surfaced one more module-scope requirement the
single-evaluation boot never reached: `post-visit-notifier.ts:6` throws at
import without `UNSUBSCRIBE_TOKEN_SECRET`, so it joins `PRODUCTION_BOOT_ENV`.
The "opens nothing" measurement was re-taken under the new mechanism (socket
`connect`, `dns.lookup` and `fetch` instrumented across `bootFastifyOwners()`
and `close()`): zero attempts with `REDIS_URL` unset, and zero with it set to
`redis://route-contract.invalid:6379`.

### After the fix — RED on the same scratch edit

```
$ pnpm --dir tools/route-contract exec vitest run src/fastify-owners.test.ts
 RUN  v5.0.1 /Users/mbutler/github/mattbutlerengineering/.claude/worktrees/api-client-route-contract/tools/route-contract
<claude-code-hint v="1" type="plugin" value="stripe@claude-plugins-official" />
 ❯ src/fastify-owners.test.ts (17 tests | 2 failed) 2426ms
   ✓ countRegisteredRoutes (2)
     ✓ sums the methods on every route node 1ms
     ✓ counts nothing in a tree with no route nodes 0ms
   ✓ printedRouteEntries (2)
     ✓ reconstructs each node's full path from the tree it is printed in 1ms
     ✓ finds nothing in a tree with no route nodes 0ms
   ✓ overrideEnv (1)
     ✓ restores a key that was set, and removes one that was not 0ms
   ✓ importFresh (1)
     ✓ re-evaluates module scope under the environment current at each call 4ms
   ❯ bootFastifyOwners (11)
     ✓ boots all three services to ready() with no mocks 0ms
     ✓ matches by runtime path, not by pattern spelling 1ms
     ✓ reports no owner for a path nobody registers 0ms
     ✓ POST /api/v1/floor-plans/route-contract-placeholder/active is owned by [] 0ms
     ✓ POST /api/v1/floor-plans/route-contract-placeholder/activate is owned by ["reservations"] 0ms
     ✓ POST /api/v1/floor-plans/route-contract-placeholder/bulk-update-positions is owned by [] 0ms
     ✓ POST /api/v1/floor-plans/tables/positions is owned by ["reservations"] 0ms
     ✓ reports no owner for a route only a non-production boot registers 0ms
     ✓ still reports the owner of a sibling route under the same prefix 0ms
     × measures the environment-conditional set, and it is exactly the recorded one 11ms
     × counts the effective table — what both boots register — not the test boot's 1ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/fastify-owners.test.ts > bootFastifyOwners > measures the environment-conditional set, and it is exactly the recorded one
AssertionError: A service registers a route under one NODE_ENV and not another, and it is not the recorded set. Either the route should not be env-gated, or add it to ENV_CONDITIONAL_ROUTES in fastify-owners.ts with a reason. Do not widen it silently.: expected [ …(3) ] to deeply equal [ { owner: 'reservations', …(2) } ]
- Expected
+ Received
@@ -2,6 +2,16 @@
    {
      "entry": "POST /api/v1/events/test",
      "owner": "reservations",
      "registeredUnder": "test",
    },
+   {
+     "entry": "GET /api/v1/users/scratch-dev-only",
+     "owner": "users",
+     "registeredUnder": "test",
+   },
+   {
+     "entry": "HEAD /api/v1/users/scratch-dev-only",
+     "owner": "users",
+     "registeredUnder": "test",
+   },
  ]
 ❯ src/fastify-owners.test.ts:197:7
    195|         "recorded set. Either the route should not be env-gated, or ad…
    196|         "ENV_CONDITIONAL_ROUTES in fastify-owners.ts with a reason. Do…
    197|     ).toEqual(ENV_CONDITIONAL_ROUTES);
       |       ^
    198|   });
    199|
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯
 FAIL  src/fastify-owners.test.ts > bootFastifyOwners > counts the effective table — what both boots register — not the test boot's
AssertionError: expected 44 to be 46 // Object.is equality
- Expected
+ Received
- 46
+ 44
 ❯ src/fastify-owners.test.ts:207:40
    205|     expect(owners.routeCount("reservations")).toBe(owners.testBootRout…
    206|     for (const owner of ["users", "agent"] as const) {
    207|       expect(owners.routeCount(owner)).toBe(owners.testBootRouteCount(…
       |                                        ^
    208|     }
    209|   });
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯
 Test Files  1 failed (1)
      Tests  2 failed | 15 passed (17)
   Start at  11:07:45
   Duration  2.56s (tests 98%, transform 1%)
JUNIT report written to /Users/mbutler/github/mattbutlerengineering/.claude/worktrees/api-client-route-contract/tools/route-contract/test-results/junit.xml
exit=1
```

### Reverted — GREEN

```
$ git checkout -- services/users/src/routes/users.ts
$ git status --porcelain services/users/src/routes/users.ts
$ # (clean — no residual modification)
$ pnpm --dir tools/route-contract exec vitest run src/fastify-owners.test.ts
 RUN  v5.0.1 /Users/mbutler/github/mattbutlerengineering/.claude/worktrees/api-client-route-contract/tools/route-contract
<claude-code-hint v="1" type="plugin" value="stripe@claude-plugins-official" />
 ✓ src/fastify-owners.test.ts (17 tests) 2421ms
 Test Files  1 passed (1)
      Tests  17 passed (17)
   Start at  11:07:48
   Duration  2.55s (tests 98%, transform 1%)
JUNIT report written to /Users/mbutler/github/mattbutlerengineering/.claude/worktrees/api-client-route-contract/tools/route-contract/test-results/junit.xml
exit=0
```

### The narrower claim, restated

Now covered: a `test`-vs-`production` gate decided inside a plugin **or** at
the module scope of any workspace module a service reaches. Still not covered,
and said so in `bootFastifyOwners`'s doc comment: a gate on a third `NODE_ENV`
value, a gate on a different variable, and a gate inside a package under
`node_modules`, which `vi.resetModules()` leaves shared.
