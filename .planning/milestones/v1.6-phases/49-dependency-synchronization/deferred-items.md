# Deferred Items — Phase 49

## Pre-existing Issues (Out of Scope)

### 1. @mbe/types lint failure
- **File:** `packages/types/src/api.ts` lines 97-98
- **Error:** `@typescript-eslint/no-explicit-any` — two instances of explicit `any` type usage
- **Status:** Pre-existed before this phase; confirmed present on `main` before any changes
- **Resolution:** Separate PR fixing `any` types in `packages/types/src/api.ts`

### 2. @mbe/agent-service webhook test failures (7 tests)
- **File:** `services/agent/src/routes/webhooks.test.ts`
- **Errors:** Tests expecting 401/200 responses but receiving 404 (route not registered or mismatch)
- **Status:** Pre-existed before this phase; confirmed present on `main` before any changes
- **Resolution:** Separate investigation into webhook route registration in `@mbe/agent-service`
