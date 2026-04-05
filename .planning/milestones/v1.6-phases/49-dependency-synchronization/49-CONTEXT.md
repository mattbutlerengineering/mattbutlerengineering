# Phase 49: Dependency Synchronization - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Fix 17 dependency version mismatches across the monorepo using pnpm catalogs. Move all shared external dependencies (vitest, typescript, fastify, react, @types/node, @types/react, @types/react-dom, react-dom, react-router-dom, framer-motion, vite, @vitejs/plugin-react, @testing-library/react, @testing-library/jest-dom, jsdom, lucide-react, zod) to the pnpm catalog in `pnpm-workspace.yaml` so each package.json uses `catalog:` instead of hardcoded version ranges.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

Key constraints:
- Only `zod` currently uses `catalog:` — extend this pattern to all 17 mismatched deps
- Choose the latest version for each dep when consolidating (prefer the newest range)
- Run `pnpm install` after catalog changes to verify lockfile resolves
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test` to verify nothing breaks
- Update `mbe check-deps` to treat `catalog:` entries as consistent (it already skips `workspace:`)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `pnpm-workspace.yaml` already has a `catalog:` section with `zod: "^4.3.6"`
- `tools/cli/src/commands/check-deps.ts` — the audit tool that detects mismatches
- 6 packages already use `catalog:` for zod

### Established Patterns
- `workspace:*` for internal packages, `catalog:` for shared external deps
- Root `package.json` has some devDependencies that should also use catalog

### Integration Points
- `pnpm-workspace.yaml` catalog section
- Every `package.json` in the monorepo with mismatched deps
- `check-deps.ts` needs to handle `catalog:` as a valid consistent version

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP phase description.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
