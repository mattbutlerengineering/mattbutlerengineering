---
phase: 15-hospitality-copilot
plan: "01"
subsystem: GenCopilot
tags: [generative-ui, streaming, rialto, hospitality, copilot]
dependency_graph:
  requires:
    - packages/rialto/src/components/Drawer/Drawer.tsx
    - "@json-render/react (JSONUIProvider, Renderer, flatToTree)"
    - "@mbe/rialto-catalog (registry — provided by consumer, not imported by rialto)"
  provides:
    - "GenCopilot component exported from @mbe/rialto barrel"
    - "useGenCopilotStream auth-decoupled streaming hook"
    - "CopilotPreview sub-component with registry injection pattern"
    - "CopilotPromptBar sub-component with Enter-to-submit"
    - "HOSPITALITY_DOMAIN_CONTEXT with Reservation, FloorPlan, Guest schemas"
  affects:
    - apps/hospitality (DashboardLayout gains Copilot sidebar toggle)
    - packages/rialto (new @json-render/react dependency added)
tech_stack:
  added:
    - "@json-render/react — JSONUIProvider, Renderer, flatToTree, ComponentRegistry"
    - "@mbe/rialto-catalog — registry (in hospitality app as consumer)"
    - "@json-render/react — in packages/rialto (direct dep for streaming hook and preview)"
  patterns:
    - "Conditional mount pattern — copilotOpen && <GenCopilot> destroys state on close"
    - "Auth-decoupled hook — getAccessToken prop instead of useAuth() in library code"
    - "Domain context serialization — schemas prepended to prompt preamble"
    - "Relative imports inside rialto — avoids circular dep through barrel"
key_files:
  created:
    - packages/rialto/src/components/GenCopilot/GenCopilot.tsx
    - packages/rialto/src/components/GenCopilot/GenCopilot.module.css
    - packages/rialto/src/components/GenCopilot/useGenCopilotStream.ts
    - packages/rialto/src/components/GenCopilot/CopilotPreview.tsx
    - packages/rialto/src/components/GenCopilot/CopilotPreview.module.css
    - packages/rialto/src/components/GenCopilot/CopilotPromptBar.tsx
    - packages/rialto/src/components/GenCopilot/CopilotPromptBar.module.css
    - packages/rialto/src/components/GenCopilot/index.ts
    - apps/hospitality/src/constants/copilotContext.ts
  modified:
    - packages/rialto/src/components/index.ts (added GenCopilot export)
    - packages/rialto/package.json (added @json-render/react dependency)
    - apps/hospitality/package.json (added @json-render/react, @mbe/rialto-catalog)
    - apps/hospitality/src/components/DashboardLayout.tsx (Copilot sidebar + GenCopilot mount)
decisions:
  - "[15-01]: Relative imports used inside GenCopilot sub-components (Alert, Button, Skeleton) — importing from @mbe/rialto barrel would be circular since GenCopilot is itself inside the library"
  - "[15-01]: useGenCopilotStream accepts getAccessToken prop not useAuth() — @mbe/rialto must remain auth-provider-agnostic, cannot depend on @mbe/auth"
  - "[15-01]: GenCopilot has no open prop — Drawer always renders open={true}, consumer controls visibility via conditional mount ({copilotOpen && <GenCopilot>}) to guarantee fresh state on each open"
  - "[15-01]: ComponentRegistry from @json-render/react used as registry type — consumer passes registry from @mbe/rialto-catalog, no circular dep between rialto and rialto-catalog"
metrics:
  duration_minutes: 22
  tasks_completed: 2
  files_created: 9
  files_modified: 4
  completed_date: "2026-03-28"
---

# Phase 15 Plan 01: GenCopilot Component Summary

**One-liner:** Auth-decoupled GenCopilot slide-over panel in @mbe/rialto streaming JSONL via getAccessToken prop, rendering AI-generated specs with consumer-provided ComponentRegistry.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create GenCopilot component with streaming hook and sub-components | 0bb9ad7 | GenCopilot.tsx, useGenCopilotStream.ts, CopilotPreview.tsx, CopilotPromptBar.tsx + CSS modules + index.ts |
| 2 | Integrate GenCopilot into hospitality app dashboard | cdc2abe | DashboardLayout.tsx, copilotContext.ts, package.json |

## What Was Built

### GenCopilot Component (`packages/rialto/src/components/GenCopilot/`)

A self-contained slide-over panel component built on top of Rialto's `Drawer`, providing:
- **Streaming generative UI** — JSONL stream from any configured API endpoint, assembled progressively via `flatToTree`
- **Auth-agnostic design** — `getAccessToken` prop accepts sync or async getter, no dependency on `@mbe/auth`
- **Domain context injection** — schemas serialized into prompt preamble before POST
- **Stop button** — `AbortController` aborts in-flight fetch, preserves partial spec, no error state set
- **Fresh state on reopen** — no `open` prop, consumer uses conditional mount pattern

**Sub-components:**
- `useGenCopilotStream` — Adapted from `apps/gen/src/hooks/useGenStream.ts`, removes `useAuth`, `rawLines`, `usage`, `clear`. Returns `{ spec, isStreaming, error, send, stop }`.
- `CopilotPreview` — `JSONUIProvider + Renderer` with consumer-provided `registry`. Shows Skeleton loading, Alert error, empty state, or rendered spec.
- `CopilotPromptBar` — Textarea + Generate/Stop toggle. Enter submits (Shift+Enter is newline). Input cleared after submit.

### Hospitality Dashboard Integration (`apps/hospitality/`)

- `HOSPITALITY_DOMAIN_CONTEXT` constant with three schemas: Reservation, FloorPlan, Guest
- `DashboardLayout` gains a "Tools" sidebar section with a "Copilot" toggle item
- `GenCopilot` conditionally mounted as sibling to main body — closing destroys the component tree, reopening creates fresh streaming state

## Decisions Made

1. **Relative imports inside rialto** — `CopilotPreview` imports `Alert` and `Skeleton` via relative paths (`../Alert/Alert.js`, `../Skeleton/Skeleton.js`) rather than from the `@mbe/rialto` barrel to avoid circular dependency.

2. **Auth-decoupled hook** — `useGenCopilotStream` accepts `getAccessToken: () => string | null | Promise<string | null>` so `@mbe/rialto` doesn't need to depend on `@mbe/auth`. Any auth provider works.

3. **No `open` prop on GenCopilot** — Drawer renders with `open={true}` always. Consumer controls visibility via `{copilotOpen && <GenCopilot>}`. This is the locked decision from the plan (fresh state on every open).

4. **`ComponentRegistry` type from `@json-render/react`** — Used as the `registry` prop type in both `GenCopilot` and `CopilotPreview`. Consumer passes `registry` from `@mbe/rialto-catalog`; `@mbe/rialto` has no dependency on `@mbe/rialto-catalog`.

## Deviations from Plan

None — plan executed exactly as written, with one implementation detail:

**Circular import prevention (not in plan but required for correctness):** Sub-components `CopilotPreview` and `CopilotPromptBar` use relative imports for Rialto components (`Alert`, `Skeleton`, `Button`) rather than importing from `@mbe/rialto` barrel. This prevents a circular module dependency since these files are themselves part of `@mbe/rialto`. This is an auto-fix (Rule 2 — correctness requirement).

## Pre-existing Issues (Out of Scope)

**`@mbe/rialto-catalog` CSS module type errors** — The catalog's `tsc` build fails on all rialto component CSS module imports due to tsconfig configuration. This is pre-existing (confirmed by checking before my changes), spans all 93 components, and is unrelated to GenCopilot. Logged to deferred-items.

## Self-Check: PASSED

Files created:
- FOUND: packages/rialto/src/components/GenCopilot/GenCopilot.tsx
- FOUND: packages/rialto/src/components/GenCopilot/useGenCopilotStream.ts
- FOUND: packages/rialto/src/components/GenCopilot/CopilotPreview.tsx
- FOUND: packages/rialto/src/components/GenCopilot/CopilotPromptBar.tsx
- FOUND: packages/rialto/src/components/GenCopilot/index.ts
- FOUND: apps/hospitality/src/constants/copilotContext.ts

Commits verified:
- FOUND: 0bb9ad7 (Task 1 — GenCopilot component)
- FOUND: cdc2abe (Task 2 — hospitality integration)

Key invariants:
- GenCopilot exported from @mbe/rialto barrel: YES (line 65 of components/index.ts)
- No open prop in GenCopilotProps: YES (Drawer hardcoded to open={true})
- No @mbe/rialto-catalog in packages/rialto/package.json: YES (grep returns 0)
- Conditional mount in DashboardLayout: YES ({copilotOpen && <GenCopilot>})
- pnpm typecheck passes (@mbe/rialto, @mbe/hospitality): PASSED
- pnpm lint passes (@mbe/rialto, @mbe/hospitality): PASSED
- pnpm test passes (@mbe/rialto — 191 tests): PASSED
