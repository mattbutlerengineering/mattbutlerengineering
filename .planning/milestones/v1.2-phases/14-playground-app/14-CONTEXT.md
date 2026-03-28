# Phase 14: Playground App - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

A standalone Vite SPA at `/gen` where authenticated users type natural language prompts and watch Rialto components render progressively as the AI streams a JSON spec. The app shows a raw JSON inspector, remembers prompts within the session, and respects the current light/dark theme. Requirements: PLAY-01 through PLAY-07.

</domain>

<decisions>
## Implementation Decisions

### Layout & composition
- Three-column split layout: history (left ~20%), preview (center ~50%), JSON inspector (right ~30%)
- Fixed column proportions — no drag-to-resize handles
- Prompt input bar at the bottom, spanning full width below all three columns
- AppBar at top with theme toggle (light/dark) and user avatar dropdown with logout
- No model selector in AppBar — Haiku 4.5 is the default (per Phase 13 decision)

### Streaming preview UX
- Components appear progressively as JSONL chunks arrive — each component renders as soon as its JSON is received
- Submit button becomes a stop button during streaming; clicking aborts the SSE stream and keeps whatever has rendered so far
- Errors display inline in the preview pane using Rialto Alert component with a "Try again" button; previous successful results stay in history

### Prompt history
- History entries show truncated prompt text (~60 chars) with relative timestamp ("2 min ago")
- Clicking a history entry shows the cached result in preview and JSON inspector — no re-generation
- Active history entry is visually highlighted
- History stored in React state only (survives React Router navigation, clears on page refresh or logout)
- Capped at 50 entries; oldest entries silently drop off

### JSON inspector
- Syntax-highlighted, read-only JSON display
- Auto-scrolls to follow new chunks during streaming; pauses auto-scroll if user scrolls up manually; resumes when user scrolls back to bottom
- Copy-to-clipboard button at top copies the full JSON spec; disabled while streaming
- No hover-linking between JSON nodes and rendered preview components

### Claude's Discretion
- TTFT loading indicator design (spinner, pulsing bar, etc.)
- Exact column width percentages within the ~20/50/30 guidance
- Syntax highlighting approach for JSON (CSS-based vs. library)
- Specific Rialto components used for the shell layout (Card, Stack, etc.)

</decisions>

<specifics>
## Specific Ideas

- Three-column layout should feel like a development tool — everything visible at once, no toggling needed
- Progressive rendering should feel like watching the AI "build" the UI in real time
- Auto-scroll in JSON inspector should use the log-viewer pattern: auto-follow unless user scrolls up

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `@mbe/rialto` AppBar, Card, Stack, Alert, Button, Input, Badge, Text — all available for shell UI
- `@mbe/rialto-catalog/registry` — `defineRegistry()` maps ~25 Rialto components for `@json-render/react`
- `@mbe/auth` — AuthProvider, useAuth hook, Auth0 login/logout (same pattern as hospitality app)
- `@mbe/api-client` — typed fetch with Auth0 token injection for API calls

### Established Patterns
- Vite SPA with `base: "/<name>/"` path prefix (marketing, hospitality, rialto-web all follow this)
- `RialtoProvider` wrapping `BrowserRouter` in `main.tsx` with localStorage-persisted theme
- `@` alias to `./src` in Vite resolve config
- CSS Modules for app-level styling (no Tailwind)

### Integration Points
- SSE endpoints at `services/agent`: `POST /api/gen/ui` (standalone) and `POST /api/gen/chat` (conversational)
- Edge router needs `/gen*` route with GEN Service Binding (Pulumi resource from Phase 13, GEN binding commented — will activate when Worker deploys)
- Dev server proxy: `/api` → `http://localhost:3003` for local development
- Auth0 configuration: same domain/audience as hospitality app

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 14-playground-app*
*Context gathered: 2026-03-27*
