# Autorun brief: venue-scoped-routes

Collected 2026-10-04 from Matt (deepen review follow-up; three answered questions:
"do them all", sequencing, release authorization). This is not a pipeline artifact.

## Run

- **Scale:** maintenance run (condition brief — degraded, not broken), slug `venue-scoped-routes`, in
  `docs/fixes/venue-scoped-routes/`. Enters at Capture. Expected re-entry: architect.
- **Candidate:** #4 — Declare a route's venue scope once: authorize and set RLS context together.
- **Worktree / branch:** `.claude/worktrees/venue-scoped-routes`, branch `refactor/venue-scoped-routes`, cut from
  `origin/main` @ `2653312ff`. Never use the main checkout.
- Origin: `/idea-to-prod:deepen` review taken at `fcd4be0a1` on 2026-10-04 (report in the OS temp dir, not the repo). Matt chose "do them all". Evidence below was verified against the code at that commit; re-verify on current origin/main before relying on line numbers.
- **Tracker:** none. No GitHub issue interaction.

## Condition (degraded, not broken)

Venue authorization and RLS venue context are separate modules that resolve the same
venue twice, so every route restates both (counts in `services/reservations/src/routes`,
non-test, at fcd4be0a1):

- `fastify.venueMembershipLookup` passed by hand: 43 sites. `loadInVenueContext(...)`: 29. `runWithVenueContext(...)`: 22. Bespoke `VenueIdResolver`s: 8. Ad-hoc inline venue
  checks: 7 (e.g. `reservations.ts:86-95` `isVenueMember` duplicates `requireVenueAccess`).
- The authz resolver does not set RLS context (`venue-access.ts:66-68`), so entity routes
  resolve twice.
- Routes taking a venueId with no membership check: `availability.ts:78-85,164-171`,
  `holds.ts:102-108` (`requireAuth` only), `reservations.ts:364-372` (`optionalAuth`),
  `events.ts:181-205` (dev-only). Each must be decided (intended or defect) before the
  refactor — a security decision; record it.
- 130 `createProblemDetails` calls in routes, 98 with hand-typed literal titles; 7
  hand-built problem objects bypass the helper.
- Net already exists: the RLS route sweep (67 staff + 18 public fixtures) with two-way
  completeness via `printRoutes` (`rls-route-sweep.integration.test.ts:427-454`) — but
  CI-only (needs DATABASE_URL).
- Precedent: `services/agent/src/routes/gen-route-factory.ts:34-60`.
- The `.claude/skills/new-service-route/SKILL.md` scaffold teaches a non-existent API
  (object-form `createProblemDetails`, `fastify.sseBroadcaster`, `{success,data}`
  envelope, no venue scope / RLS sweep).

## Desired shape

A route declares its venue scope once (e.g. `venueScope: fromQuery | fromBody |
fromEntity("guest")`); one module performs ADR-020 membership (keep per-request DB
membership — ADR-020 is active and binding; only WHERE it is declared moves), sets the
ADR-026 RLS context, hands the loaded entity to the handler, and returns the standard
403/404 envelope. Must be the natural home for the demo identity's confinement
(`feature:live-demo-venue`, R-S1/R-S2) — design so a future `demo` restriction is one
hook, but do not build demo logic here.

## Scope

- In: the venue-scope module; migrating the 42 venue routes and 7 inline checks;
  deciding the unchecked-venueId routes; a local (non-DB) way to run the route sweep's
  completeness check; rewriting `/new-service-route` to teach the real shape.
- Out: RLS FORCE enforcement (#5369); users/agent services beyond noting; the demo
  `demo` role; side effects (#1).
- START CONDITION: do not begin Implement until #1 reservation-transition-effects has
  merged (shared route files); Capture/Architect may run earlier.

## Constraints

- Repo gotchas apply: TDD; `set -o pipefail` in workflows; no `status` shell var;
  explicit-path staging; never pipe `git push`; prettier-format docs; a fresh worktree
  needs `pnpm install --frozen-lockfile` and `pnpm build --filter @mbe/cli...`.
- Deepening test ordering is mandatory: write the new tests at the intended interface
  FIRST against today's code; deepen; delete the old shallow-module tests LAST in the
  same change, stating in the diff which coverage moved where.
- Behaviour changes uncovered by the new tests (entry points that diverge today) are
  product decisions: record each in the artifact; take a skill default only where one
  exists, otherwise stop and surface.
- Active ADRs bind (`docs/adr/`, status: active). ADR-004 and ADR-006 are superseded.
- Sequencing (Matt, 2026-10-04): #2 sse-event-catalog and #1 reservation-transition-effects
  run first in parallel; #4 venue-scoped-routes starts after #1 merges; #3
  endpoint-definitions-pilot runs alongside. `feature:live-demo-venue` stays paused until
  #1 and #4 land, then resumes at Architect. Rebase on origin/main before each PR.

## Release authorization (Matt, 2026-10-04)

May, without asking:

- open PRs, and squash-merge each once the `reviewer` passes it, `CI Gate` is green on
  the final head, and no critical is unfixed. Use an explicit `--subject`;
- let CI deploy workflows run on merge; dispatch a deploy workflow through CI if a
  paths filter skips a changed package.
- additionally for this run: STOP before merging any PR — it is authorization code
  (ADR-020). Mark it ready, post the reviewer verdict, and surface to Matt for the merge.

Must STOP and surface to Matt:

- anything touching credentials or secrets;
- any non-additive Prisma migration.
