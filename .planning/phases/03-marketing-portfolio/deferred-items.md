# Deferred Items — Phase 03 Marketing Portfolio

## Pre-existing ESLint Infrastructure Issue

**Found during:** 03-02 Task 1 (dependency cleanup)
**Issue:** `pnpm lint` fails across ALL apps with `Error: Cannot find module 'ajv/lib/refs/json-schema-draft-04.json'`. This is caused by an incompatibility between ESLint 10.0.2 and its ajv peer dependency in the monorepo node_modules.
**Scope:** Pre-existing, affects all apps (confirmed in rialto-web, marketing). Not caused by this task's changes.
**Fix needed:** Run `pnpm install` with ajv explicitly resolved, or downgrade/upgrade ESLint to a compatible version.
**Impact:** `pnpm lint` cannot be verified as passing, but typecheck and build both pass cleanly.
