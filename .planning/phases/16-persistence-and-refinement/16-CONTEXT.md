# Phase 16: Persistence and Refinement - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Generated specs are stored in the database; users can replay past prompts, save favorites, share UIs via permalink, and refine a generated UI conversationally without starting over. Requirements: PERS-01 through PERS-05.

</domain>

<decisions>
## Implementation Decisions

### Storage model & API
- New Prisma model `StoredSpec` in `services/agent/prisma/schema.prisma` (same database as agent sessions)
- Fields: `id` (cuid), `userId` (string, from Auth0 sub claim), `prompt` (text), `spec` (JSON), `rawLines` (JSON array of JSONL strings for replay), `isFavorite` (boolean, default false), `createdAt`, `updatedAt`
- REST endpoints on the agent service: `POST /api/gen/specs` (save), `GET /api/gen/specs` (list user's specs), `GET /api/gen/specs/:id` (get one — public, no auth required for permalink), `PATCH /api/gen/specs/:id/favorite` (toggle favorite), `DELETE /api/gen/specs/:id`
- Auth-protected for write operations (save, favorite, delete); permalink GET is public (anyone with the UUID can view)
- No pagination initially — return all user specs sorted by `createdAt DESC` (cap at 100)

### Prompt history evolution (playground)
- Phase 14's in-memory history list becomes the entry point for persistence: completed generations auto-save to the database
- History panel entries now show a database-backed list instead of React state — survives page refresh and re-login
- "Replay" button on a history entry re-submits the same prompt as a new generation (not a cached result view — that's the existing click-to-view behavior)
- History entries gain a star/favorite toggle icon inline
- The React state history from Phase 14 is replaced entirely by API-backed history; the 50-entry cap moves to the API (100 entries)

### Favorites
- Star icon on each history entry toggles `isFavorite` via `PATCH /api/gen/specs/:id/favorite`
- Separate "Favorites" filter/tab in the history panel — shows only favorited specs
- Favorited specs are never auto-deleted by the cap; only unfavorited specs count toward the 100 limit

### Permalink sharing
- After a generation completes and is saved, a "Share" button appears in the preview pane header
- Clicking "Share" copies a URL to clipboard: `mattbutlerengineering.com/gen/s/:id`
- The `/gen/s/:id` route is a new page in the gen app that fetches the spec by ID (public GET) and renders it read-only in a full-width preview (no prompt bar, no history, no JSON inspector)
- Shared view shows the original prompt as a read-only header above the rendered spec
- No authentication required to view a shared spec

### Conversational refinement
- Uses the existing `/api/gen/chat` endpoint (Phase 13) which supports multi-turn conversation with spec context
- After a generation completes, a "Refine" button appears next to the prompt bar (or the prompt bar switches to refinement mode)
- In refinement mode: the prompt bar shows "Refine this UI..." placeholder, and submissions go to `/api/gen/chat` instead of `/api/gen/ui`
- The chat endpoint receives the current spec as context and applies a patch — the preview updates incrementally
- Exiting refinement mode (clicking "New" or clearing) returns to standalone `/api/gen/ui` mode
- Refinement history is not persisted separately — each refinement overwrites the stored spec with the latest version

### Claude's Discretion
- Exact Prisma migration naming
- API response envelope format (consistent with existing services)
- Transition animation between standalone and refinement modes
- Whether "Replay" creates a visually distinct entry or replaces in-place
- Loading states for API-backed history (skeleton, spinner, etc.)

</decisions>

<specifics>
## Specific Ideas

- The shift from in-memory to database-backed history should feel seamless — users shouldn't notice the architectural change, just that their history now survives refresh
- Permalink pages should be minimal and attractive — someone receiving a shared link sees a polished rendered UI, not a dev tool
- Refinement mode should feel like a natural conversation — "make it darker", "add a third column", "remove the header"

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `services/agent/prisma/schema.prisma` — existing Prisma setup with PostgreSQL, add StoredSpec model here
- `services/agent/src/routes/gen-ui.ts` and `gen-chat.ts` — streaming endpoints already built (Phase 13)
- `apps/gen/src/hooks/useGenStream.ts` — streaming hook, needs to be extended to auto-save on completion
- `apps/gen/src/components/HistoryPanel.tsx` — currently React-state-backed, needs migration to API calls
- `apps/gen/src/components/PreviewPane.tsx` — render target, add Share button
- `apps/gen/src/components/PromptBar.tsx` — needs refinement mode toggle
- `@mbe/api-client` — typed fetch with Auth0 token injection, use for spec API calls
- `@mbe/auth` — `useAuth()` provides `accessToken` for API calls

### Established Patterns
- Fastify route structure with schema validation (all services follow this)
- Prisma migrations via `npx prisma migrate dev --name <name>`
- CSS Modules for styling (no Tailwind)
- `@mbe/api-client` for frontend→backend typed requests

### Integration Points
- Agent service database (same PostgreSQL, separate from users service)
- `/api/gen/chat` endpoint for conversational refinement (already exists)
- `/api/gen/ui` endpoint for standalone generation (already exists)
- Edge router — no changes needed (all under `/api` which already routes to DO App Platform)
- Gen app router — needs `/s/:id` route for permalink pages

</code_context>

<deferred>
## Deferred Ideas

None — all decisions stay within phase scope

</deferred>

---

*Phase: 16-persistence-and-refinement*
*Context gathered: 2026-03-28*
