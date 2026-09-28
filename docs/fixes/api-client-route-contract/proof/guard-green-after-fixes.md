# Proof: the guard is green once Findings A and B are fixed

Captured 2026-09-22 during Implement work items 9 and 10
(`docs/fixes/api-client-route-contract/breakdown.md`), on branch
`fix/api-client-route-contract`. The pre-fix red is recorded separately in
`guard-red-on-main.md` and should be read first — the point of the sequencing
was that the red came from `main`'s own code, with nothing in
`packages/api-client` touched.

## Step 1 — Finding A: `/api/health/system` → `/health/system`

`packages/api-client/src/health.ts` (commit `dd3c49fb6`). Rebuilt
`packages/api-client` first, because `@mbe/api-client`'s `exports` map resolves
`default` to `./dist/index.js` and the driver runs the built client.

```
$ pnpm --dir tools/route-contract exec vitest run src/route-contract.test.ts

 FAIL  src/route-contract.test.ts > route contract > has a route owner for every client pair

+ 1 @mbe/api-client pair(s) have no route owner:
+
+   GET /api/v1/venues/groups/by-slug/route-contract-placeholder
+       produced by:  venueGroups.getBySlug
+       edge:         forwarded-to-origin
+       fastify:      no match in reservations, users, agent
```

Two unowned pairs became one. The `health.system` pair now resolves to owner
`["edge"]` with disposition `edge-terminal`.

## Step 2 — Finding B: delete the dead `VenueGroupsClient.getBySlug`

`packages/api-client/src/venues.ts`, its test block, and the `getBySlug()`
entry in `CLAUDE.md`'s `venueGroups` row. Zero application callers: all three
`getBySlug` call sites in `apps/hospitality` (`hooks/useVenues.ts:51`,
`pages/VenueOnboardingPage.tsx:52`, `pages/PublicBookingPage.tsx:51`) are the
**venue** client, and `venueGroups` appears nowhere under `apps/`.

The verdict went green — and the anti-vacuity floor immediately went red,
which is the behaviour item 8 was written for:

```
 FAIL  src/route-contract.test.ts > route contract > measured something — the verdict below cannot pass vacuously
AssertionError: expected [ Array(1) ] to deeply equal []

+ [
+   "the client inventory holds 86 pairs, below the measured floor of 87 — the driver has narrowed",
+ ]
```

This is worth recording rather than glossing: the floor is not decorative, and
it fired on a real change rather than only on the synthetic emptied inputs
`vacuity.test.ts` feeds it. The correct response to a surface that
legitimately shrank is to lower the floor **as a conscious edit with the reason
attached** — `MINIMUM_CLIENT_PAIRS` is now 86 and says why in its own doc
comment. It must never be a number recomputed from whatever the driver last
produced, which would make it unable to detect anything.

## Step 3 — green

```
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
   Duration  2.21s
```

86 client pairs, 86 owned, 0 unowned.

Both findings are pinned individually in `route-contract.test.ts`, so a
regression names the finding rather than just reporting an unowned path:

- `Finding A — HealthClient.system is answered by the edge, not forwarded to DO`
  (`path === "/health/system"`, `edgeDisposition === "edge-terminal"`,
  `owners === ["edge"]`)
- `Finding B — no client method reaches the unregistered venue-group by-slug path`
- `Finding B — the venue by-slug path the apps actually call is untouched`
  (`/api/v1/venues/by-slug/<ph>`, owned by `reservations`)

## Other gates at this point

```
$ pnpm --dir packages/api-client test       19 files, 310 tests passing
$ pnpm --dir packages/api-client typecheck  clean
$ pnpm --dir packages/api-client lint       clean
$ pnpm --dir apps/hospitality typecheck     clean  (the three venue getBySlug call sites still resolve)
$ pnpm --dir tools/route-contract typecheck clean
$ pnpm --dir tools/route-contract lint      clean
```
