# Phase 49: Dependency Synchronization - Research

**Researched:** 2026-04-04
**Domain:** pnpm catalog, monorepo dependency management
**Confidence:** HIGH

## Summary

This phase is a pure infrastructure refactor: move 17 mismatched external dependencies into the pnpm workspace catalog so every package.json references `catalog:` instead of a hardcoded version range. The catalog feature is stable in pnpm 9 (project uses 9.15.4) and the pattern is already proven — `zod` uses it across 6 packages.

The work is mechanical: (1) add catalog entries to `pnpm-workspace.yaml`, (2) replace hardcoded versions in each package.json, (3) fix `check-deps.ts` to skip `catalog:` entries the same way it skips `workspace:` entries. A secondary bug was discovered: `check-deps.ts` does not exclude `.claude/worktrees/**` from its glob, so it reads stale worktree package.json files and produces false positives — this should be fixed in the same pass.

**Primary recommendation:** Add all 17 deps to the default pnpm catalog using the newest version range found across the monorepo, then replace hardcoded versions package-by-package and run `pnpm install` to verify lockfile resolution.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- None — discuss phase was skipped. All implementation choices are at Claude's discretion.

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key constraints:
- Only `zod` currently uses `catalog:` — extend this pattern to all 17 mismatched deps
- Choose the latest version for each dep when consolidating (prefer the newest range)
- Run `pnpm install` after catalog changes to verify lockfile resolves
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test` to verify nothing breaks
- Update `mbe check-deps` to treat `catalog:` entries as consistent (it already skips `workspace:`)

### Deferred Ideas (OUT OF SCOPE)
None — discuss phase skipped.
</user_constraints>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pnpm catalogs | built-in (pnpm 9+) | Centralized dep versions | Official pnpm feature, already in use for zod |

### The 17 Catalog Entries (with resolved canonical versions)

Each entry below lists: the **catalog version to use** (newest range found in the monorepo), the **versions currently present**, and **which packages need updating**.

| Dep | Catalog Version | Current Versions Present | Packages to Update |
|-----|----------------|--------------------------|-------------------|
| `vitest` | `^4.1.2` | `^4.1.2`, `^4.0.18`, `^4.0.0` | root, packages/api-client, packages/agent-core, packages/api-versioning, apps/hospitality, packages/rialto-catalog, packages/rialto, services/agent, services/reservations, services/users |
| `@vitest/coverage-v8` | `^4.1.2` | `^4.0.18` | packages/agent-core, packages/rialto-catalog, services/agent, services/reservations, services/users |
| `typescript` | `^5.9.3` | `^5.9.3`, `^5.7.3`, `^5.6.0` | infrastructure/pulumi, packages/api-versioning, packages/mcp-server, packages/rialto-plugin, services/reservations, services/users, tools/cli (all use older — update all to ^5.9.3) |
| `@types/node` | `^25.5.2` | `^25.3.0`, `^22.0.0`, `^22.10.7` | All packages using ^22.x — upgrade to ^25.5.2 (latest) |
| `fastify` | `^5.8.4` | `^5.8.4`, `^5.8.3`, `^5.0.0` | packages/api-versioning (^5.0.0), packages/auth, packages/observability, packages/sentry, services/agent, services/reservations, services/users |
| `zod` | `^4.3.6` | `catalog:`, `^4.3.6` | packages/api-client, packages/types (switch from hardcoded to `catalog:`) |
| `react` | `^19.2.4` | `^19.2.4`, `^19.0.0`, `^18.3.0 \|\| ^19.0.0` | apps/gen, apps/hospitality, apps/marketing, packages/auth, packages/rialto, packages/sentry |
| `react-dom` | `^19.2.4` | `^19.2.4`, `^19.0.0` | apps/gen, apps/hospitality, apps/marketing, packages/rialto |
| `@types/react` | `^19.2.14` | `^19.2.14`, `^19.0.0` | apps/gen, apps/hospitality, apps/marketing, packages/auth, packages/sentry |
| `@types/react-dom` | `^19.2.3` | `^19.2.3`, `^19.0.0` | apps/gen, apps/hospitality, apps/marketing |
| `@vitejs/plugin-react` | `^5.1.4` | `^5.1.4`, `^5.0.0` | apps/gen, apps/hospitality, apps/marketing, packages/rialto-catalog |
| `vite` | `^7.3.1` | `^7.3.1`, `^7.0.0` | apps/gen, apps/hospitality, apps/marketing |
| `react-router-dom` | `^7.13.0` | `^7.13.0`, `^7.1.0` | apps/gen, apps/hospitality, apps/marketing |
| `@testing-library/react` | `^16.3.2` | `^16.3.2`, `^16.3.0` | apps/hospitality |
| `@testing-library/jest-dom` | `^6.9.1` | `^6.9.1`, `^6.6.3` | apps/hospitality |
| `framer-motion` | `^12.36.0` | `^12.36.0`, `^12.34.0`, `^12.0.0` | apps/marketing, packages/rialto |
| `jsdom` | `^28.1.0` | `^28.1.0`, `^26.1.0` | apps/hospitality |
| `lucide-react` | `^0.575.0` | `>=0.400.0`, `^0.575.0` | packages/rialto (>=0.400.0 → ^0.575.0) |

**Note on `@types/node`:** The latest npm version is `^25.5.2`. The monorepo has packages using `^22.x` and one using `^25.3.0`. Upgrading all to `^25.5.2` is the right choice — this aligns with the "choose newest" convention. However, the planner should verify no package has a specific Node.js 22 constraint that would break with v25 types.

**Note on `jsdom`:** Jump from ^26.1.0 to ^28.1.0 is a major version bump. Functionally correct for vitest test environments but worth noting.

**Note on `lucide-react`:** `>=0.400.0` is a permissive range; `^0.575.0` is more precise. Switching to `^0.575.0` is safe and consistent.

**Note on `react` peer dep in auth/sentry:** Both use `^18.3.0 || ^19.0.0` as a peerDependency. The catalog should store `^19.2.4` for runtime deps. Peer dependencies that intentionally support React 18+ should either keep the range or switch to `catalog:` — because peerDependencies are intent declarations for consumers, not pinned installs. The planner should decide whether to use `catalog:` for peerDependencies or leave them as explicit ranges. The `packages/auth` and `packages/sentry` peer dep cases warrant special treatment.

### pnpm-workspace.yaml Final Shape

```yaml
packages:
  - "apps/*"
  - "services/*"
  - "packages/*"
  - "tools/*"
  - "infrastructure/pulumi"

catalog:
  zod: "^4.3.6"
  vitest: "^4.1.2"
  "@vitest/coverage-v8": "^4.1.2"
  typescript: "^5.9.3"
  "@types/node": "^25.5.2"
  fastify: "^5.8.4"
  react: "^19.2.4"
  react-dom: "^19.2.4"
  "@types/react": "^19.2.14"
  "@types/react-dom": "^19.2.3"
  "@vitejs/plugin-react": "^5.1.4"
  vite: "^7.3.1"
  react-router-dom: "^7.13.0"
  "@testing-library/react": "^16.3.2"
  "@testing-library/jest-dom": "^6.9.1"
  framer-motion: "^12.36.0"
  jsdom: "^28.1.0"
  lucide-react: "^0.575.0"
```

---

## Architecture Patterns

### Pattern 1: pnpm Default Catalog

**What:** A `catalog:` section in `pnpm-workspace.yaml` defines version constants. Individual package.json files reference them with the `catalog:` protocol.

**When to use:** For any shared external dependency used by 2+ workspace packages.

**Syntax (pnpm-workspace.yaml):**
```yaml
catalog:
  react: "^19.2.4"
  typescript: "^5.9.3"
```

**Syntax (package.json):**
```json
{
  "dependencies": {
    "react": "catalog:"
  },
  "devDependencies": {
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

**Publish behavior:** When you run `pnpm publish`, pnpm expands `catalog:` back to the resolved version range. Consumers of published packages see normal semver ranges — no catalog leakage.

**Source:** pnpm official docs at https://pnpm.io/catalogs (HIGH confidence)

### Pattern 2: Skip `catalog:` in Version Consistency Audits

The existing `check-deps.ts` already skips `workspace:` references (line 49):
```typescript
if (version.startsWith("workspace:")) continue;
```

The identical fix for `catalog:`:
```typescript
if (version.startsWith("workspace:") || version.startsWith("catalog:")) continue;
```

Without this fix, `catalog:` entries appear as a distinct "version" and will always be flagged as a mismatch against any hardcoded version of the same dep.

### Pattern 3: Exclude .claude/worktrees from Glob

The existing glob pattern does not exclude `.claude/worktrees/**`. Those directories contain complete copies of the repo at past states and will produce false positive version mismatches. Fix:

```typescript
const packageFiles = await glob("**/package.json", {
  cwd: root,
  ignore: [
    "**/node_modules/**",
    "**/dist/**",
    "**/generated/**",
    "**/.claude/worktrees/**",  // exclude git worktrees
  ],
});
```

This is a bug that pre-exists this phase but is visible when running `mbe check-deps` — worth fixing in the same PR.

### Anti-Patterns to Avoid

- **Partial migration:** Leaving some packages on hardcoded versions for the same dep defeats the purpose. All instances of a dep must switch to `catalog:` in one pass.
- **Using catalog: for peerDependencies that intentionally support multiple major versions:** A peerDep of `"react": "^18.3.0 || ^19.0.0"` expresses intentional compatibility. Replacing it with `catalog:` (which resolves to `^19.2.4`) would narrow the declared compatibility and could break users of the library on React 18. Leave these as explicit ranges or create a named catalog.
- **Upgrading major versions without testing:** jsdom ^26 → ^28 and @types/node ^22 → ^25 are significant jumps. The verification step (pnpm typecheck + pnpm test) is mandatory after changes.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Centralized dep versions | Manual version sync in root package.json resolutions | pnpm catalog | Official feature, publish-safe, IDE-aware |
| Detecting version mismatches | Custom script | `mbe check-deps` (already exists) | Already implemented, just needs the catalog: fix |

---

## Common Pitfalls

### Pitfall 1: Forgetting `@vitest/coverage-v8`

**What goes wrong:** The phase description lists 17 deps but doesn't explicitly call out `@vitest/coverage-v8`. This package is versioned separately from `vitest` and also has mismatches (^4.0.18 in 5 packages, while latest is ^4.1.2). It should be added to the catalog.

**How to avoid:** Include `@vitest/coverage-v8` in the catalog alongside `vitest`.

### Pitfall 2: peerDependencies with OR ranges

**What goes wrong:** `packages/auth` and `packages/sentry` declare `"react": "^18.3.0 || ^19.0.0"` as a peerDependency. Replacing with `catalog:` would resolve to `^19.2.4`, dropping the React 18 compatibility declaration. If a consumer uses React 18, pnpm would warn about unsatisfied peer deps.

**How to avoid:** Do not use `catalog:` for peer dependencies that intentionally declare broad version ranges. Keep `"react": "^18.3.0 || ^19.0.0"` in peerDependencies of auth and sentry unchanged (or update to `^19.0.0` if React 18 is no longer supported).

**Warning signs:** A peerDependency value containing `||` or a range starting below the catalog version.

### Pitfall 3: check-deps exits 1 with false positives from worktrees

**What goes wrong:** `.claude/worktrees/` contains multiple complete repo copies. Running `mbe check-deps` after the catalog migration would still exit 1 because the worktrees have the old hardcoded versions. This makes the success metric impossible to achieve without the glob fix.

**How to avoid:** Add `"**/.claude/worktrees/**"` to the ignore list in check-deps.ts as part of this phase.

### Pitfall 4: `typescript: ^5.6.0` in rialto-plugin

**What goes wrong:** `packages/rialto-plugin` uses TypeScript ^5.6.0, which is older than the catalog's ^5.9.3. This package appears in neither the phase description's explicit list nor the check-deps mismatch output because ^5.6.0 is a unique version (no other package uses exactly it), but it is inconsistent with the rest of the monorepo.

**How to avoid:** Also update `packages/rialto-plugin` to `catalog:` for typescript. The planner should include it.

### Pitfall 5: lucide-react range semantics

**What goes wrong:** `packages/rialto` uses `>=0.400.0` (permissive). Switching to `^0.575.0` pins to a minor-compatible range. Both will install `^0.575.0` today, but the semantic is different. This is a safe change — the catalog approach is explicit by design.

**How to avoid:** Confirm the team doesn't rely on the permissive `>=` range for a reason, then switch to `^0.575.0` in the catalog.

---

## Code Examples

### check-deps.ts: Full Fixed Skip Logic

```typescript
// Source: existing check-deps.ts line 49, with catalog: addition
for (const [name, version] of Object.entries(allDeps as Record<string, string>)) {
  if (version.startsWith("workspace:") || version.startsWith("catalog:")) continue;
  // ... rest of loop
}
```

### check-deps.ts: Fixed Glob Ignore

```typescript
// Source: existing check-deps.ts lines 31-34
const packageFiles = await glob("**/package.json", {
  cwd: root,
  ignore: [
    "**/node_modules/**",
    "**/dist/**",
    "**/generated/**",
    "**/.claude/worktrees/**",
  ],
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded version ranges per package | `catalog:` protocol in pnpm-workspace.yaml | pnpm 9.0 (2024) | Single source of truth, `pnpm update --recursive` updates catalog entries |
| `resolutions` in root package.json (Yarn) | pnpm catalog | n/a (pnpm-specific) | Cleaner, publish-safe |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| pnpm | Catalog resolution, `pnpm install` | Yes | 9.15.4 | — |
| Node.js | Running check-deps | Yes | v20.19.5 | — |

pnpm catalogs require pnpm 9+. Project is on 9.15.4 — no issues.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (various versions, unified to ^4.1.2 by this phase) |
| Config file | per-package vitest.config.ts |
| Quick run command | `pnpm --filter <package> test` |
| Full suite command | `pnpm test` (from root) |

### Phase Verification Steps

This phase has no new behavior — it is a refactor with a clear success criterion: `mbe check-deps` exits 0. The validation sequence after all catalog changes:

1. `pnpm install` — verifies lockfile resolves with all catalog versions
2. `pnpm typecheck` — catches any type breakage from version upgrades (especially @types/node ^25, jsdom ^28)
3. `pnpm test` — catches any runtime breakage from version upgrades
4. `pnpm lint` — catches any lint rule changes from eslint plugin upgrades
5. `mbe check-deps` — confirms the audit tool exits 0

### Wave 0 Gaps

None — no test files need to be created for this infrastructure refactor. Verification is through the existing test suite passing after the changes.

---

## Open Questions

1. **peerDependencies for react in `packages/auth` and `packages/sentry`**
   - What we know: Both declare `"react": "^18.3.0 || ^19.0.0"` as peerDep
   - What's unclear: Is React 18 compatibility still intentionally maintained?
   - Recommendation: Leave as explicit `^19.0.0` (drop 18 compat) or keep OR range unchanged. Do not use `catalog:` for these peerDeps.

2. **`packages/rialto-plugin` typescript ^5.6.0 not in original 17-dep list**
   - What we know: It uses an older TypeScript version that differs from the monorepo standard
   - What's unclear: Why it was on ^5.6.0 (may have been pinned intentionally)
   - Recommendation: Include it in the catalog migration pass — it is a clear inconsistency even if not flagged by the original audit.

---

## Sources

### Primary (HIGH confidence)
- pnpm official docs (https://pnpm.io/catalogs) — catalog syntax, protocol behavior, publish semantics
- Direct codebase inspection — actual version strings from all 23 package.json files, check-deps.ts implementation
- `npm view <package> version` — latest published versions for all 17 deps (run 2026-04-04)

### Secondary (MEDIUM confidence)
- pnpm 9 changelog — catalog feature availability since pnpm 9.0

---

## Metadata

**Confidence breakdown:**
- Standard stack (catalog syntax): HIGH — official docs verified
- Current dep versions: HIGH — directly read from package.json files
- Latest npm versions: HIGH — verified via npm registry at time of research
- Pitfalls: HIGH — discovered via direct code inspection (worktrees bug, peerDep edge case, rialto-plugin omission)

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (npm versions will drift; re-check before executing if >2 weeks old)
