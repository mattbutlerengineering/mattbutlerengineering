# Proof: the anti-vacuity floor's absolute value is now pinned (F2)

Captured 2026-09-22 during Implement work item F2
(`docs/fixes/api-client-route-contract/breakdown.md` § Milestone 5), on branch
`fix/api-client-route-contract` at commit `3fe7a05db`. Every block below is real
command output.

`verification.md`'s F2 and `review.md` both observed that
`MINIMUM_CLIENT_PAIRS` was asserted only **relatively** — `vacuity.test.ts:15`
seeds the healthy fixture with the constant, `:37` subtracts one from it, and
`client-inventory.test.ts:37` compares the live inventory to it — so lowering
the constant lowers every assertion with it. This transcript shows that
happening, and then not happening.

## Step 1 — the defect, before the fix

`tools/route-contract/src/vacuity.ts` edited: `MINIMUM_CLIENT_PAIRS = 86` →
`20`. Nothing else changed.

```
$ grep -n '^export const MINIMUM_CLIENT_PAIRS' tools/route-contract/src/vacuity.ts
38:export const MINIMUM_CLIENT_PAIRS = 20;
$ pnpm --dir tools/route-contract test
 ✓ src/vacuity.test.ts (10 tests) 5ms
 ✓ src/edge-owner.test.ts (13 tests) 44ms
 ✓ src/client-driver-completeness.test.ts (10 tests) 39ms
 ✓ src/client-inventory.test.ts (9 tests) 44ms
 ✓ src/workspace-resolution.test.ts (3 tests) 3ms
 ✓ src/fastify-owners.test.ts (16 tests) 1144ms
 ✓ src/route-contract.test.ts (5 tests) 1165ms
 Test Files  7 passed (7)
      Tests  66 passed (66)
```

Exit code `0`. The floor was cut by 66 pairs — three quarters of the measured
client surface — and the guard reported nothing. A driver regression that
dropped the roster to a handful of pairs would have passed the same way, which
is the whole failure mode `vacuity.ts` exists to prevent.

## Step 2 — RED with the assertion added, floor still at 20

```
$ pnpm --dir tools/route-contract exec vitest run src/vacuity.test.ts
 ❯ src/vacuity.test.ts (11 tests | 1 failed) 8ms
   ❯ MINIMUM_CLIENT_PAIRS (1)
     × is pinned to an absolute floor, not only to itself 3ms
   ✓ vacuityFailures (10)
     ✓ passes a healthy input 0ms
     ✓ fails when the client inventory is empty 1ms
     ✓ fails when the inventory has narrowed below the measured floor 0ms
     ✓ fails when a roster sub-client contributed zero pairs 0ms
     ✓ fails when a non-exempt client method issued no request 0ms
     ✓ fails when the reservations owner table is empty 0ms
     ✓ fails when the users owner table is empty 0ms
     ✓ fails when the agent owner table is empty 0ms
     ✓ fails when the edge owner table is empty 0ms
     ✓ reports every independent failure at once 0ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/vacuity.test.ts > MINIMUM_CLIENT_PAIRS > is pinned to an absolute floor, not only to itself
AssertionError: expected 20 to be greater than or equal to 80
 ❯ src/vacuity.test.ts:38:34
     36|   // reason the floor's doc comment already demands.
     37|   it("is pinned to an absolute floor, not only to itself", () => {
     38|     expect(MINIMUM_CLIENT_PAIRS).toBeGreaterThanOrEqual(80);
       |                                  ^
     39|   });
     40| });
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed (1)
      Tests  1 failed | 10 passed (11)
   Start at  21:39:00
   Duration  161ms (transform 54%, import 25%, tests 16%, worker 6%)
```

Exit code `1`.

## Step 3 — green with the floor restored to its real value

```
$ grep -n '^export const MINIMUM_CLIENT_PAIRS' tools/route-contract/src/vacuity.ts
43:export const MINIMUM_CLIENT_PAIRS = 86;
$ pnpm --dir tools/route-contract test
 ✓ src/vacuity.test.ts (11 tests) 10ms
 ✓ src/edge-owner.test.ts (13 tests) 59ms
 ✓ src/client-driver-completeness.test.ts (10 tests) 40ms
 ✓ src/client-inventory.test.ts (9 tests) 48ms
 ✓ src/workspace-resolution.test.ts (3 tests) 3ms
 ✓ src/route-contract.test.ts (5 tests) 1124ms
 ✓ src/fastify-owners.test.ts (16 tests) 1139ms
 Test Files  7 passed (7)
      Tests  67 passed (67)
```

Exit code `0`. 67 tests across 7 files — the 66 that existed after R1, plus
this one.

## Why 80 and not 86

Tying the floor to the live count would break the design's own rule that
adding a client method must never break the suite: the driver's surface grows
whenever `@mbe/api-client` does, and an equality would turn every such addition
into a red. 80 sits a little under today's 86 so ordinary growth and the
occasional legitimate one-pair shrink (Finding B was exactly that) pass
untouched, while the three-quarters cut in step 1 does not.

The pair of assertions is what carries the contract, not either one alone:

- `vacuity.test.ts` — `MINIMUM_CLIENT_PAIRS >= 80` (the floor is high).
- `client-inventory.test.ts:37` — `inventory.pairs.length >= MINIMUM_CLIENT_PAIRS`
  (the surface is above the floor).

Lowering past 80 now takes a second, deliberate edit to a number whose own
comment demands a reason.
