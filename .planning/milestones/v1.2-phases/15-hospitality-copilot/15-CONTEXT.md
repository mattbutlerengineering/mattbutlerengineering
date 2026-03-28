# Phase 15: Hospitality Copilot - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

A `<GenCopilot>` component in `@mbe/rialto` embedded in the hospitality app dashboard. Authenticated users open it, enter prompts with hospitality-domain context (reservation schema, floor plan structure, guest data shapes), and see generated Rialto UI rendered inline. Requirements: COP-01 through COP-04.

</domain>

<decisions>
## Implementation Decisions

### Entry point & panel behavior
- Sidebar nav item labeled "Copilot" in the existing DashboardLayout Sidebar — consistent with all other nav items (Home, Timeline, Reservations, etc.)
- Opens a slide-over panel from the right edge (~400px wide), overlaying the main content area without navigating away (satisfies COP-01)
- Panel has its own close button (X) in the header; clicking the sidebar item again also closes it (toggle behavior)
- Panel does not persist state when closed — reopening starts fresh (no hidden background process)
- Panel header shows "Gen Copilot" title with close button; no additional chrome

### Domain context injection
- Hospitality app passes a `domainContext` prop to `<GenCopilot>` containing structured schema summaries as plain strings
- Schema summaries are hardcoded in the hospitality app (not fetched from API) — they describe reservation fields, floor plan structure, and guest data shapes in natural language
- The `domainContext` is prepended to the user's prompt as system context before sending to `/api/gen/ui` — the user never sees it but the AI uses it for field-accurate generation
- Example context shape: `{ schemas: [{ name: "Reservation", description: "...", fields: "id, guestName, tableId, partySize, date, time, status, notes" }] }`
- No page-aware context injection (doesn't change based on which hospitality page you're on) — same context everywhere

### Component packaging strategy
- `<GenCopilot>` lives in `packages/rialto/src/components/GenCopilot/` and is exported from the `@mbe/rialto` barrel
- Self-contained: bundles its own streaming logic (adapted from apps/gen's useGenStream pattern), preview rendering (using `@mbe/rialto-catalog` registry + `@json-render/react` Renderer), and prompt input
- Consumer passes: `api` (endpoint URL string), `domainContext` (schema descriptions), and `getAccessToken` (async function returning Bearer token for auth)
- No dependency on `@mbe/auth` or `@mbe/api-client` — the `getAccessToken` prop keeps the component auth-agnostic
- Internal layout: prompt input at bottom, rendered preview above, minimal chrome — no JSON inspector, no history panel (those are playground features, not copilot features)

### Interaction model
- Single-shot prompts using `/api/gen/ui` endpoint (same as playground) — not conversational
- No prompt history in the panel — each prompt is independent. Users who want history/inspector use the full playground at /gen
- Submit → streaming preview → done. New prompt replaces previous result.
- Stop button during streaming (same pattern as playground — abort keeps partial result)

### Claude's Discretion
- Slide-over panel animation (slide, fade, or instant)
- Internal component decomposition within GenCopilot (sub-components vs monolith)
- Loading indicator style during TTFT
- How schema context is formatted in the prompt prepend

</decisions>

<specifics>
## Specific Ideas

- The copilot should feel like a lightweight assistant — quick to open, quick to use, quick to close
- It's an embedded tool, not a standalone app — minimal UI, no extra panels or chrome beyond prompt + preview
- The playground at /gen is the power-user tool; the copilot is the quick-access convenience

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/gen/src/hooks/useGenStream.ts` — streaming hook with Auth0 token injection, JSONL parsing, AbortController stop. Core logic to be adapted (not imported) into GenCopilot
- `apps/gen/src/components/PreviewPane.tsx` — JSONUIProvider + Renderer pattern. GenCopilot needs the same rendering but simpler (no error retry, no loading states beyond TTFT)
- `apps/gen/src/components/PromptBar.tsx` — submit/stop input pattern. Adapt for copilot's narrower panel width
- `@mbe/rialto-catalog/registry` — `defineRegistry()` maps ~25 Rialto components for `@json-render/react`
- `@mbe/rialto` Sidebar component — already used in DashboardLayout, adding a nav item is trivial
- `@mbe/rialto` Sheet/Drawer — check if a slide-over primitive exists; if not, build a simple one

### Established Patterns
- DashboardLayout uses Sidebar with `SidebarSection[]` nav items — adding "Copilot" follows existing pattern
- CSS Modules for component-level styling (no Tailwind)
- `@mbe/rialto` components use `var(--rialto-*)` design tokens — GenCopilot inherits theme automatically (satisfies COP-03 theme matching)

### Integration Points
- `POST /api/gen/ui` at `services/agent` — same endpoint used by playground
- Hospitality app already has `@mbe/auth` + `@mbe/api-client` — `getAccessToken` prop bridges auth without coupling
- DashboardLayout.tsx in `apps/hospitality/src/components/` — mount point for sidebar item + panel overlay

</code_context>

<deferred>
## Deferred Ideas

None — all decisions stay within phase scope

</deferred>

---

*Phase: 15-hospitality-copilot*
*Context gathered: 2026-03-28*
