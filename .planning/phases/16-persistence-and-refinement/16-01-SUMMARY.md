---
phase: 16-persistence-and-refinement
plan: "01"
subsystem: agent-service
tags: [prisma, rest-api, persistence, specs, fastify]
dependency_graph:
  requires: []
  provides: [stored-spec-api, stored-spec-service, stored-spec-migration]
  affects: [services/agent]
tech_stack:
  added: []
  patterns: [repository-pattern, ownership-check, cap-eviction]
key_files:
  created:
    - services/agent/prisma/migrations/20260328171806_add_stored_spec/migration.sql
    - services/agent/src/services/stored-spec.ts
    - services/agent/src/routes/gen-specs.ts
    - services/agent/src/routes/gen-specs.test.ts
  modified:
    - services/agent/prisma/schema.prisma
    - services/agent/src/app.ts
    - services/agent/src/generated/prisma/ (regenerated)
decisions:
  - "[16-01]: StoredSpec _enforceCapForUser evicts oldest unfavorited spec when count reaches 100 — keeps favorites safe while bounding storage per user"
  - "[16-01]: GET /api/gen/specs/:id has no preHandler (public) for permalink sharing — owners and non-owners can both view by ID"
  - "[16-01]: mapStoredSpec helper converts Prisma dates to ISO strings at service boundary — consistent with mapPrismaSession pattern"
metrics:
  duration: "3 min"
  completed: "2026-03-28"
  tasks_completed: 2
  files_changed: 8
---

# Phase 16 Plan 01: StoredSpec Persistence API Summary

StoredSpec Prisma model + migration + service layer + five REST endpoints + 12 integration tests for persisting generated UI specs.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | StoredSpec Prisma model and migration | b24c505 | schema.prisma, migrations/20260328171806_add_stored_spec/, generated/prisma/ |
| 2 | Service layer, REST routes, and integration tests | bc453a1 | stored-spec.ts, gen-specs.ts, gen-specs.test.ts, app.ts |

## What Was Built

**StoredSpec model** (`services/agent/prisma/schema.prisma`): Fields — cuid id, userId, prompt, spec (Json), rawLines (Json), isFavorite (default false), createdAt, updatedAt. Composite indexes on `(userId, createdAt)` and `(userId, isFavorite)`. Mapped to `stored_specs` table.

**storedSpecService** (`services/agent/src/services/stored-spec.ts`):
- `list(userId)`: findMany by userId, ordered by createdAt DESC, take 100
- `getById(id)`: findUnique — returns null if not found
- `create(data)`: calls `_enforceCapForUser` first, then creates record
- `toggleFavorite(id, userId)`: ownership check, flips isFavorite
- `delete(id, userId)`: ownership check, deletes record
- `_enforceCapForUser(userId)`: if unfavorited count >= 100, evicts oldest unfavorited

**genSpecsRoutes** (`services/agent/src/routes/gen-specs.ts`): Five endpoints:
1. `POST /api/gen/specs` — requireAuth, creates spec, returns 201
2. `GET /api/gen/specs` — requireAuth, returns user's specs sorted by createdAt DESC
3. `GET /api/gen/specs/:id` — PUBLIC (no auth), returns spec or 404
4. `PATCH /api/gen/specs/:id/favorite` — requireAuth, toggles isFavorite, ownership-checked
5. `DELETE /api/gen/specs/:id` — requireAuth, deletes spec, ownership-checked

**Registered** in `app.ts` after genChatRoutes.

## Verification Results

- `npx prisma migrate status` — no pending migrations, database up to date
- `npx vitest run src/routes/gen-specs.test.ts` — 12/12 tests passed
- `pnpm typecheck` — no type errors
- `pnpm build` — succeeds

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: services/agent/src/services/stored-spec.ts
- FOUND: services/agent/src/routes/gen-specs.ts
- FOUND: services/agent/src/routes/gen-specs.test.ts
- FOUND: services/agent/prisma/migrations/20260328171806_add_stored_spec/migration.sql
- FOUND: commit b24c505 (StoredSpec Prisma model and migration)
- FOUND: commit bc453a1 (service layer, REST routes, and integration tests)
