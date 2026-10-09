# Autorun brief: floor-plan-cache-keys

Collected 2026-10-07 from Matt (three answered questions: new run vs resume, scope, release
authorization). This is not a pipeline artifact.

## Run

- **Scale:** maintenance run (defect brief — broken), slug `floor-plan-cache-keys`, in
  `docs/fixes/floor-plan-cache-keys/`. Enters at Capture. Re-entry depth is Capture's call
  (expected `implement`; a shared key module is small, but if Capture judges it
  design-touching, `architect` is fine — log the choice).
- **Worktree / branch:** `.claude/worktrees/floor-plan-cache-keys`, branch
  `fix/floor-plan-cache-keys`, cut from `origin/main` @ `563aa94d8`. Never use the main
  checkout — it is 5 weeks stale and holds unrelated uncommitted WIP (`TableDetailsForm`,
  `useUpdateTable`) that this run must not touch or absorb.
- **Origin:** `/idea-to-prod:deepen` review 2026-10-06, ranked #2 ("hospitality cache-key
  module"). Never filed as an issue.
- **Tracker:** none. No GitHub issue interaction (brief is silent → no tracker per protocol).
- **In-flight check (done by orchestrator 2026-10-07):** `gh pr list --state open` (28 PRs)
  — nothing touches floor-plan or query-key invalidation. Nothing matched.

## Defect (verified on origin/main @ 563aa94d8 by the orchestrator)

- `apps/hospitality/src/hooks/create-query-hook.ts:54` builds query keys as
  `[key, queryParams]`, so `useFloorPlan(id)` caches under `["floorPlan", { id }]`.
- Three mutations invalidate `["floorPlan", id]` (a bare string in position 1), which never
  prefix-matches the object key → the invalidation is a no-op:
  - `useActivateFloorPlan` — `useFloorPlans.ts:71`
  - `useBulkUpdatePositions` (drag-reposition save) — `useFloorPlans.ts:87`
  - `useAddTable` — `useFloorPlans.ts:97`
- `useDeleteTable` invalidates the whole `["floorPlan"]` family, so it works — a contrast case.
- Observed-vs-expected (inferred from code, not yet reproduced in a browser): after
  activating a plan, saving dragged positions, or adding a table, the floor-plan detail view
  keeps showing pre-mutation data until something else refetches it.
- **Suspected sibling (unverified):** `useGuests.ts:138` invalidates
  `[GUEST_SEGMENTS_QUERY_KEY, variables.venueId]` — check whether that query's params are an
  object too. Capture should determine and record whether it is in scope.
- **Reproduction:** none yet beyond code reading. First work item = a failing test that
  proves the invalidation misses (e.g. QueryClient with a seeded `["floorPlan", {id}]` entry,
  run the mutation's onSuccess, assert the entry is invalidated).

## Desired shape

One place owns each query family's key construction, and mutations build invalidation keys
through the same function the query uses — so the shape can't drift again. Keep it minimal:
no new abstraction beyond what the hooks in this area need. Sweep every hospitality
`invalidateQueries` call with a param-bearing key; fix those with the same mismatch.

## Scope

- In: hospitality hooks query-key/invalidation mismatch (floor plan, plus any confirmed
  sibling such as guest segments); regression tests; a guard against recurrence if cheap.
- Out: SSE query-key mapping redesign (`sse-query-keys.ts`) beyond what the fix requires;
  the uncommitted TableDetailsForm WIP; other deepen candidates.
- UX: no new user-facing surface — this restores intended refresh behavior. No `ux.md`
  expected (maintenance runs have no UX stage).

## Constraints

- Repo gotchas apply: TDD (failing test first); a fresh worktree needs
  `pnpm install --frozen-lockfile` and `pnpm build --filter @mbe/cli...` before committing;
  explicit-path staging, never `git add -A`; never pipe `git push`; no `status` shell var;
  prettier-format docs before any docs commit; run `pnpm typecheck` before pushing.
- Active ADRs bind (`docs/adr/`, status: active).
- Verify must run the real gates (`pnpm --dir apps/hospitality test`, typecheck, lint) and
  quote output.

## Release authorization (Matt, 2026-10-07)

May, without asking:

- open the PR, and squash-merge it once the `reviewer` subagent passes it, `CI Gate` is green
  on the final head, and no critical finding is unfixed. Use an explicit `--subject`.
- let CI deploy workflows run on merge (hospitality static deploy); dispatch the deploy
  through CI if a paths filter skips the changed package. No manual wrangler/doctl.

Must STOP and surface to Matt:

- any unfixed critical review finding;
- anything touching credentials, secrets, auth, payments, or Prisma migrations (none
  expected).
