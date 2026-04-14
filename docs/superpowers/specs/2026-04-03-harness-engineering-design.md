# Harness Engineering Design

**Date:** 2026-04-03
**Status:** Implemented
**Goal:** Add computational controls to codify existing architectural boundaries and catch API schema drift, inspired by Martin Fowler's harness engineering framework.

## Context

The codebase has good structure (no boundary violations exist), but nothing enforces it. As the project grows — especially with AI agents making changes — we need automated guardrails.

The article's framework distinguishes feedforward controls (steer before action) from feedback controls (detect after action). We implemented both, plus a temporal shift (moving CI checks earlier).

## Decisions

| Area | Decision | Rationale |
|------|----------|-----------|
| Module boundaries | `no-restricted-imports` in existing ESLint configs | Zero new deps, leverages existing react.js/node.js split |
| Schema snapshots | Direct import + `toMatchSnapshot()` | Static `as const` objects don't need Fastify boot |
| Pre-commit typecheck | `turbo typecheck --filter='...[HEAD]'` | Scopes to changed packages, cache makes repeats fast |
| `@mbe/rialto-catalog` | Classified as shared, not frontend-only | Agent service imports it for AI code gen |

## What Was Implemented

### 1. Module Boundary Enforcement (Feedforward)

**Files:** `packages/config/eslint/react.js`, `packages/config/eslint/node.js`

Frontend apps cannot import:
- `@mbe/agent-core`, `@mbe/observability` (backend-only)
- `@mbe/auth/fastify`, `@mbe/sentry/node` (backend entrypoints)

Backend services cannot import:
- `@mattbutlerengineering/rialto`, `@mbe/api-client` (frontend-only)
- `@mbe/auth/react`, `@mbe/sentry/react` (frontend entrypoints)

Cross-app/service imports are already prevented by pnpm strict mode.

### 2. API Schema Snapshot Tests (Feedback)

**Files:** `services/{users,reservations,agent}/src/schemas/schemas.test.ts`

20 schemas snapshot-tested across 3 services. Any change produces a failing test with a clear diff. Developer runs `vitest -u` to accept intentional changes.

### 3. Pre-commit Typecheck (Temporal Shift)

**File:** `.husky/pre-commit`

Turbo-powered typecheck scoped to changed packages + dependents. Runs in ~12s with cache, catches type errors before they reach CI.

### 4. Circular Dependency Detection (Feedback)

**File:** `scripts/check-circular-deps.js`

Walks all workspace `package.json` files and detects `@mbe/*` dependency cycles. Zero external dependencies — pure graph traversal. Runs in CI build job and available as `pnpm check:circular-deps`.

### 5. Dependency Security Audit (Feedback)

**CI step** in build job. Runs `pnpm audit --audit-level=high` as a non-blocking warning. Surfaces known CVEs in dependencies without breaking builds on low-severity issues.

### 6. Destructive Migration Guard (Feedforward)

**File:** `scripts/check-destructive-migrations.js`

Scans new Prisma migration SQL files for `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, `DELETE FROM`. Runs in CI migrations job before applying migrations. Escape hatch: add `-- DESTRUCTIVE: <reason>` comment to the SQL file for intentional destructive changes.

### 7. Service Layer Enforcement (Feedforward)

**File:** `packages/config/eslint/node.js`

Route files cannot import `**/services/database` or `@prisma/client` directly — must go through the service layer (e.g., `userService`, `reservationService`). Health routes and test files are exempt since they need direct DB access for connectivity checks.

### 8. Generated Code Staleness Check (Temporal Shift)

**File:** `.husky/pre-commit`

Pre-commit hook regenerates `registry.json` and `generated-schemas.ts`, then checks for uncommitted diff. Takes ~4s total. Prevents the "CI fails 5 minutes later" loop when agents or developers forget to regenerate after source changes.

## Package Classification

| Category | Packages |
|----------|----------|
| Frontend-only | `@mattbutlerengineering/rialto`, `@mbe/api-client` |
| Backend-only | `@mbe/agent-core`, `@mbe/observability` |
| Shared (subpath) | `@mbe/auth`, `@mbe/sentry` |
| Shared/neutral | `@mbe/types`, `@mbe/config`, `@mbe/rialto-catalog` |
