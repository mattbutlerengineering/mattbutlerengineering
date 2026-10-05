# Autorun brief: sse-event-catalog

Collected 2026-10-04 from Matt (deepen review follow-up; three answered questions:
"do them all", sequencing, release authorization). This is not a pipeline artifact.

## Run

- **Scale:** maintenance run (condition brief — degraded, not broken), slug `sse-event-catalog`, in
  `docs/fixes/sse-event-catalog/`. Enters at Capture. Expected re-entry: implement (expected; Capture decides).
- **Candidate:** #2 — Collapse the SSE event vocabulary into one shared catalog.
- **Worktree / branch:** `.claude/worktrees/sse-event-catalog`, branch `refactor/sse-event-catalog`, cut from
  `origin/main` @ `2653312ff`. Never use the main checkout.
- Origin: `/idea-to-prod:deepen` review taken at `fcd4be0a1` on 2026-10-04 (report in the OS temp dir, not the repo). Matt chose "do them all". Evidence below was verified against the code at that commit; re-verify on current origin/main before relying on line numbers.
- **Tracker:** none. No GitHub issue interaction.

## Condition (degraded, not broken)

The SSE event-name vocabulary is declared on both sides of the seam and has drifted.

- Server union: `services/reservations/src/services/events.ts:11-21` (has `floor-plan:created`).
- Client union: `apps/hospitality/src/hooks/useSSESync.tsx:57-67`, a second list at
  `:103-114`, and the switch at `:295-299` (has `venue:updated`).
- `venue:updated`: zero emitters anywhere in `services/` or `infrastructure/`.
- `floor-plan:created`: emitted (into the dead singleton, see #1) but not handled client-side.
- Never emitted yet handled client-side: `reservation:updated`, `hold:created`, `hold:released`.
- `useSSESync.tsx:230-314` invalidates only RESERVATIONS/TABLES/VENUES query keys;
  `guest:lapsing` never invalidates `LAPSING_GUESTS_QUERY_KEY` (`useGuests.ts:109`).

## Desired shape

One catalog in `@mbe/types` mapping event name → payload type → query keys to
invalidate, imported by the server emitter and by `useSSESync`. Drift becomes a type
error; live refresh for a new feature is one catalog row.

## Scope

- In: the catalog; server and client consume it; a test that every server-emitted name
  is handled client-side (fails today); derived invalidation.
- Decide per drifted name (record in defect.md): delete `venue:updated` or add an
  emitter; handle `floor-plan:created` client-side. Default: delete names nothing emits,
  handle names the server emits.
- Out: fixing WHERE events are emitted (the dead singleton, never-called emitters) —
  that is #1's scope. Do not touch `services/reservations/src/services/events.ts`'s
  emitter wiring beyond importing the catalog types.
- User-facing surface: none beyond correct live refresh.

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

Must STOP and surface to Matt:

- anything touching credentials or secrets;
- any non-additive Prisma migration.
