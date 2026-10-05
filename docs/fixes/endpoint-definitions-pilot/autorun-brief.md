# Autorun brief: endpoint-definitions-pilot

Collected 2026-10-04 from Matt (deepen review follow-up; three answered questions:
"do them all", sequencing, release authorization). This is not a pipeline artifact.

## Run

- **Scale:** maintenance run (condition brief — degraded, not broken), slug `endpoint-definitions-pilot`, in
  `docs/fixes/endpoint-definitions-pilot/`. Enters at Capture. Expected re-entry: architect.
- **Candidate:** #3 — Declare an endpoint once: path, method, request and response (one-domain pilot).
- **Worktree / branch:** `.claude/worktrees/endpoint-definitions-pilot`, branch `refactor/endpoint-definitions-pilot`, cut from
  `origin/main` @ `2653312ff`. Never use the main checkout.
- Origin: `/idea-to-prod:deepen` review taken at `fcd4be0a1` on 2026-10-04 (report in the OS temp dir, not the repo). Matt chose "do them all". Evidence below was verified against the code at that commit; re-verify on current origin/main before relying on line numbers.
- **Tracker:** none. No GitHub issue interaction.

## Condition (degraded, not broken)

One endpoint's shape is stated up to four times across the HTTP seam and only path +
method is checked:

- `packages/api-client`: 88 HTTP methods, 88 hand-written URLs (~62 inline, ~26 from
  file-local consts). E.g. `guests.ts:117` ↔ `routes/guests.ts:439` + `app.ts:248`.
- Request types declared 3×: TS interface (`packages/types/src/reservation.ts:77-91`),
  Zod (`schemas/reservation-requests.ts:64`), route generic. Only `ProblemDetails` and
  health use `z.infer`.
- 19 of 32 reservations route files hand-write inline JSON response schemas (134
  `type: "object"`); e.g. LapsingGuest's 8 fields re-typed at `routes/guests.ts:454-473`.
  The client passes no response schema (no runtime validation).
- Guard today: `tools/route-contract` (#5877) — path + method only, one-way, no bodies,
  no query names; `packages/api-client/src/contract.test.ts` is self-referential.
- Drift incidents: b8c552e39, f4eb21bef, 7e1a13150, 4fc15a65d, b3b8c07d0, b2a1d0c5f, b5367ad68.

## Desired shape

A Zod endpoint definition in `@mbe/types` (path, method, params/query/body, response)
that drives Fastify route registration schema, the api-client method, and TS types via
`z.infer`. PILOT on ONE domain — the guests endpoints (~11) — to price the migration;
other domains move later, one domain per run, newest features first.

## Scope

- In: the endpoint-definition shape; migrate the guests domain (routes + client + types);
  extend `tools/route-contract` to compare request bodies and response schemas for
  migrated endpoints (write this first — it fails today on inline schemas); measure and
  record the per-endpoint migration cost for the remaining domains in release.md.
- Must keep identical: Fastify JSON-schema validation behaviour, OpenAPI output
  (ADR-007 versioning, `/api/v1` prefix), ADR-002 RFC 7807 error envelope.
- Out: every non-guests domain; SSE (#2); venue auth (#4).
- User-facing surface: none.

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
