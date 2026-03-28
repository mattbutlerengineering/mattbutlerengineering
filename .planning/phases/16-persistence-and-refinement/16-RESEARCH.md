# Phase 16: Persistence and Refinement - Research

**Researched:** 2026-03-28
**Domain:** Prisma migrations, Fastify REST CRUD, React state-to-API migration, permalink routing, conversational refinement
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Storage model & API:**
- New Prisma model `StoredSpec` in `services/agent/prisma/schema.prisma` (same database as agent sessions)
- Fields: `id` (cuid), `userId` (string, from Auth0 sub claim), `prompt` (text), `spec` (JSON), `rawLines` (JSON array of JSONL strings for replay), `isFavorite` (boolean, default false), `createdAt`, `updatedAt`
- REST endpoints on the agent service: `POST /api/gen/specs` (save), `GET /api/gen/specs` (list user's specs), `GET /api/gen/specs/:id` (get one — public, no auth required for permalink), `PATCH /api/gen/specs/:id/favorite` (toggle favorite), `DELETE /api/gen/specs/:id`
- Auth-protected for write operations (save, favorite, delete); permalink GET is public (anyone with the UUID can view)
- No pagination initially — return all user specs sorted by `createdAt DESC` (cap at 100)

**Prompt history evolution (playground):**
- Phase 14's in-memory history list becomes the entry point for persistence: completed generations auto-save to the database
- History panel entries now show a database-backed list instead of React state — survives page refresh and re-login
- "Replay" button on a history entry re-submits the same prompt as a new generation (not a cached result view)
- History entries gain a star/favorite toggle icon inline
- The React state history from Phase 14 is replaced entirely by API-backed history; the 50-entry cap moves to the API (100 entries)

**Favorites:**
- Star icon on each history entry toggles `isFavorite` via `PATCH /api/gen/specs/:id/favorite`
- Separate "Favorites" filter/tab in the history panel — shows only favorited specs
- Favorited specs are never auto-deleted by the cap; only unfavorited specs count toward the 100 limit

**Permalink sharing:**
- After a generation completes and is saved, a "Share" button appears in the preview pane header
- Clicking "Share" copies a URL to clipboard: `mattbutlerengineering.com/gen/s/:id`
- The `/gen/s/:id` route is a new page in the gen app that fetches the spec by ID (public GET) and renders it read-only in a full-width preview (no prompt bar, no history, no JSON inspector)
- Shared view shows the original prompt as a read-only header above the rendered spec
- No authentication required to view a shared spec

**Conversational refinement:**
- Uses the existing `/api/gen/chat` endpoint (Phase 13) which supports multi-turn conversation with spec context
- After a generation completes, a "Refine" button appears next to the prompt bar (or the prompt bar switches to refinement mode)
- In refinement mode: prompt bar shows "Refine this UI..." placeholder, submissions go to `/api/gen/chat` instead of `/api/gen/ui`
- The chat endpoint receives the current spec as context and applies a patch — the preview updates incrementally
- Exiting refinement mode (clicking "New" or clearing) returns to standalone `/api/gen/ui` mode
- Refinement history is not persisted separately — each refinement overwrites the stored spec with the latest version

### Claude's Discretion
- Exact Prisma migration naming
- API response envelope format (consistent with existing services)
- Transition animation between standalone and refinement modes
- Whether "Replay" creates a visually distinct entry or replaces in-place
- Loading states for API-backed history (skeleton, spinner, etc.)

### Deferred Ideas (OUT OF SCOPE)
None — all decisions stay within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PERS-01 | Prisma model for stored specs (prompt, spec JSON, user ID, timestamps) | StoredSpec model schema defined in CONTEXT.md; follows existing Session model conventions in schema.prisma |
| PERS-02 | Prompt history replay — user can re-run previous prompts | API-backed HistoryPanel replaces React state; Replay calls `send(entry.prompt)` via existing useGenStream hook |
| PERS-03 | Favorites — user can save/unsave generated UIs | PATCH endpoint + isFavorite field; star icon inline on HistoryPanel items; Favorites filter tab |
| PERS-04 | Shareable permalink — UUID-based URL that loads a stored spec | Public GET endpoint; new `/gen/s/:id` React Router route; SharedSpecPage read-only renderer |
| PERS-05 | Inline/conversational refinement mode ("make the button larger" applies patches to existing spec) | Existing `/api/gen/chat` endpoint; PromptBar mode toggle; useGenStream already supports arbitrary api prop |
</phase_requirements>

---

## Summary

Phase 16 is a full-stack persistence layer for generated UI specs. The backend adds a single new `StoredSpec` Prisma model to the existing agent service database and five REST endpoints (save, list, get, favorite toggle, delete). The frontend migrates `PlaygroundPage`'s React-state history array into API-backed state, adds inline favorites, a permalink share action, and a conversational refinement mode that switches the prompt bar to target `/api/gen/chat`.

The phase involves no new external dependencies and no infrastructure changes. Every piece of the implementation builds on proven patterns already in the codebase: the `session.ts` service pattern for database operations, `ApiClient` for typed frontend requests, `useGenStream` for streaming (already parameterized by `api` prop), and React Router for the new `/gen/s/:id` shared-spec page. The only meaningfully new concern is auth bypass on the public permalink GET and the `onComplete` auto-save side effect in `useGenStream`.

**Primary recommendation:** Implement in three waves: (1) backend model + service + routes + tests, (2) frontend API client module + history panel migration + auto-save, (3) permalink page + share button + refinement mode toggle.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma | existing in workspace | ORM + migrations for StoredSpec | Already the project ORM; agent DB already uses it |
| Fastify | existing | REST endpoints on agent service | All services use Fastify; CRUD follows sessions.ts pattern |
| React Router DOM | existing in gen app | `/gen/s/:id` shared-spec route | Already powers gen app routing with basename `/gen` |
| `@mbe/api-client` | existing | Typed fetch calls from gen frontend | Already used by hospitality; follows `UsersClient` pattern |
| `@mbe/auth/react` | existing | `accessToken` for auth header injection | Used by `useGenStream`; same pattern for specs client |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@json-render/react` Renderer | existing | Read-only spec rendering in SharedSpecPage | Same component used in PreviewPane — no new dep |
| `@mbe/rialto` | existing | Loading skeleton/spinner in history panel | Badge, Stack, Text, Button — all already in gen app |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| REST CRUD on agent service | Separate gen-persistence service | Unnecessary; StoredSpec naturally lives alongside agent sessions; no new infra |
| New api-client module in `packages/api-client` | Direct fetch in gen app | api-client pattern matches rest of monorepo; keeps auth/error handling consistent |

**Installation:** No new packages needed.

---

## Architecture Patterns

### Backend: Service Layer Pattern (matches `session.ts`)

```
services/agent/
├── prisma/schema.prisma          ← add StoredSpec model
├── src/
│   ├── services/
│   │   └── stored-spec.ts        ← new: CRUD service (follows session.ts pattern)
│   └── routes/
│       └── gen-specs.ts          ← new: REST routes (follows gen-ui.ts / sessions.ts)
```

### Frontend: API-Backed History

```
apps/gen/src/
├── hooks/
│   ├── useGenStream.ts           ← extend: add onSave callback prop
│   └── useSpecsApi.ts            ← new: typed hook for specs CRUD (list, save, delete, favorite)
├── components/
│   ├── HistoryPanel.tsx          ← migrate: API-backed list, star icon, Replay button
│   └── PreviewPane.tsx           ← extend: Share button in header
├── pages/
│   ├── PlaygroundPage.tsx        ← migrate: remove useState history, wire useSpecsApi
│   └── SharedSpecPage.tsx        ← new: read-only permalink view
└── types.ts                      ← extend: StoredSpec type (mirrors API response)
```

### Pattern 1: StoredSpec Model (Prisma)

**What:** New model alongside `Session` in agent schema.
**When to use:** Adding to same PostgreSQL database that already hosts sessions.

```prisma
// Source: existing schema.prisma conventions
model StoredSpec {
  id         String   @id @default(cuid())
  userId     String   @map("user_id")
  prompt     String
  spec       Json
  rawLines   Json     @map("raw_lines")
  isFavorite Boolean  @default(false) @map("is_favorite")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  @@index([userId, createdAt])
  @@index([userId, isFavorite])
  @@map("stored_specs")
}
```

Key: `@@index([userId, createdAt])` is essential — the list query filters by `userId` and sorts by `createdAt DESC`.

### Pattern 2: Service Layer (`stored-spec.ts`)

**What:** Thin service wrapping `prisma.storedSpec.*` calls, following `session.ts` conventions.

```typescript
// Source: services/agent/src/services/session.ts pattern
import { prisma } from "./database.js";
import type { StoredSpec } from "../generated/prisma/index.js";

export const storedSpecService = {
  async list(userId: string): Promise<StoredSpec[]> {
    return prisma.storedSpec.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  },

  async getById(id: string): Promise<StoredSpec | null> {
    return prisma.storedSpec.findUnique({ where: { id } });
  },

  async create(data: {
    userId: string;
    prompt: string;
    spec: unknown;
    rawLines: string[];
  }): Promise<StoredSpec> {
    // Enforce 100-entry cap: after saving, delete oldest unfavorited entries over 100
    await this._enforceCapForUser(data.userId);
    return prisma.storedSpec.create({ data: { ...data, spec: data.spec as object } });
  },

  async toggleFavorite(id: string, userId: string): Promise<StoredSpec> {
    const existing = await prisma.storedSpec.findUniqueOrThrow({ where: { id } });
    // Ownership check before mutating
    if (existing.userId !== userId) throw new Error("Not found");
    return prisma.storedSpec.update({
      where: { id },
      data: { isFavorite: !existing.isFavorite },
    });
  },

  async delete(id: string, userId: string): Promise<void> {
    const existing = await prisma.storedSpec.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) throw new Error("Not found");
    await prisma.storedSpec.delete({ where: { id } });
  },

  async _enforceCapForUser(userId: string): Promise<void> {
    // Count only non-favorites
    const unfavoritedCount = await prisma.storedSpec.count({
      where: { userId, isFavorite: false },
    });
    if (unfavoritedCount >= 100) {
      // Delete the oldest unfavorited spec
      const oldest = await prisma.storedSpec.findFirst({
        where: { userId, isFavorite: false },
        orderBy: { createdAt: "asc" },
      });
      if (oldest) await prisma.storedSpec.delete({ where: { id: oldest.id } });
    }
  },
};
```

### Pattern 3: Route Registration (gen-specs.ts)

**What:** Fastify plugin with five routes — note the public GET for permalink.

```typescript
// Source: services/agent/src/routes/sessions.ts + gen-ui.ts patterns
export const genSpecsRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/gen/specs — save (auth required)
  fastify.post("/api/gen/specs", { preHandler: [requireAuth] }, async (req, reply) => { ... });

  // GET /api/gen/specs — list user's specs (auth required)
  fastify.get("/api/gen/specs", { preHandler: [requireAuth] }, async (req, reply) => { ... });

  // GET /api/gen/specs/:id — permalink (NO AUTH — public)
  fastify.get("/api/gen/specs/:id", async (req, reply) => { ... });

  // PATCH /api/gen/specs/:id/favorite — toggle (auth required)
  fastify.patch("/api/gen/specs/:id/favorite", { preHandler: [requireAuth] }, async (req, reply) => { ... });

  // DELETE /api/gen/specs/:id — delete (auth required)
  fastify.delete("/api/gen/specs/:id", { preHandler: [requireAuth] }, async (req, reply) => { ... });
};
```

Register in `app.ts` alongside existing gen routes:
```typescript
await fastify.register(genSpecsRoutes);
```

### Pattern 4: Frontend API Hook (`useSpecsApi.ts`)

**What:** Custom hook wrapping ApiClient calls with loading/error state.

```typescript
// Source: @mbe/api-client UsersClient pattern + useAuth hook
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@mbe/auth/react";
import type { StoredSpec } from "../types.js";

export function useSpecsApi() {
  const { accessToken } = useAuth();
  const [specs, setSpecs] = useState<StoredSpec[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const authFetch = useCallback(async <T>(path: string, options?: RequestInit): Promise<T> => {
    const res = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(options?.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(res.statusText);
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }, [accessToken]);

  const fetchSpecs = useCallback(async () => { ... }, [authFetch]);
  const saveSpec = useCallback(async (data) => { ... }, [authFetch]);
  const toggleFavorite = useCallback(async (id: string) => { ... }, [authFetch, setSpecs]);
  const deleteSpec = useCallback(async (id: string) => { ... }, [authFetch, setSpecs]);

  useEffect(() => { void fetchSpecs(); }, [fetchSpecs]);

  return { specs, isLoading, fetchSpecs, saveSpec, toggleFavorite, deleteSpec };
}
```

### Pattern 5: Auto-Save in `useGenStream`

**What:** Add `onSave` callback prop to useGenStream; PlaygroundPage calls `specsApi.saveSpec` inside it.

```typescript
// Extend existing UseGenStreamOptions (Source: apps/gen/src/hooks/useGenStream.ts)
export interface UseGenStreamOptions {
  api: string;
  onComplete?: (spec: Spec, rawLines: string[]) => void; // extend to pass rawLines
  onError?: (error: Error) => void;
}
```

The current `onComplete` already fires at the right time. PlaygroundPage can pass `rawLinesRef.current` in the callback (already tracked via `rawLinesRef`).

### Pattern 6: Refinement Mode Toggle

**What:** PromptBar gains a `mode` prop (`"generate" | "refine"`); PlaygroundPage manages the conversation array.

```typescript
// PromptBar extension — new props
export interface PromptBarProps {
  onSubmit: (prompt: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled: boolean;
  mode?: "generate" | "refine";          // NEW
  onExitRefinement?: () => void;         // NEW — "New" button
}
```

PlaygroundPage accumulates chat messages for `/api/gen/chat` calls:

```typescript
// PlaygroundPage refinement state
const [mode, setMode] = useState<"generate" | "refine">("generate");
const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);

// When mode is "refine", submit goes to /api/gen/chat with messages array
// The spec JSON is injected as the first assistant turn: "Here is the current spec: <json>"
```

### Pattern 7: SharedSpecPage (Permalink)

**What:** New React Router route at `s/:id` under the `App` element.

```typescript
// main.tsx route addition
{ path: "s/:id", element: <SharedSpecPage /> }
```

```typescript
// SharedSpecPage.tsx — fetches public GET, renders read-only
import { useParams } from "react-router-dom";

export function SharedSpecPage() {
  const { id } = useParams<{ id: string }>();
  // fetch /api/gen/specs/:id (no auth header needed — public)
  // render: prompt header + <Renderer spec={spec} registry={registry} loading={false} />
}
```

### Anti-Patterns to Avoid

- **Do not re-use React-state HistoryEntry type for API responses:** The API returns snake_case from Prisma, map to camelCase in the service layer before sending — consistent with how `session.ts` maps `mapPrismaSession`.
- **Do not call the cap enforcement inside the route handler:** Put it in the service layer (`storedSpecService._enforceCapForUser`) so it can be tested in isolation.
- **Do not require auth on the permalink GET endpoint:** The whole value of the permalink is that anyone can open it. Attaching `preHandler: [requireAuth]` to that route defeats the feature.
- **Do not send the entire `spec` JSON back inside the streaming response:** The streaming endpoints (`/api/gen/ui`, `/api/gen/chat`) stay unchanged; the save is a separate POST after streaming completes.
- **Do not inline `accessToken` dependency into `useSpecsApi` state:** The token is passed via closure in `authFetch`; avoid storing it in useState to prevent stale-token issues.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 100-entry cap enforcement | Custom React-side truncation | `storedSpecService._enforceCapForUser` (server-side) | Client can't be trusted to enforce caps; server must own data integrity |
| Auth header injection in API calls | Manual `fetch` with headers in each component | `useAuth().accessToken` + centralized `authFetch` helper in `useSpecsApi` | Prevents auth drift across five different API calls |
| JSON spec storage serialization | Custom serializer | Prisma `Json` field type — pass spec object directly | Prisma handles `JSON` column type; no manual `JSON.stringify` needed in service layer |
| Clipboard copy for share URL | `document.execCommand('copy')` | `navigator.clipboard.writeText(url)` | Modern async API; graceful fallback to `window.prompt` for non-HTTPS contexts |
| Ownership check | Route-level SQL WHERE + userId | Service layer check in `storedSpecService.delete` and `toggleFavorite` | Single place to enforce; prevents IDOR if route logic changes |

---

## Common Pitfalls

### Pitfall 1: Generated Prisma Client Not Regenerated After Migration

**What goes wrong:** After adding `StoredSpec` to `schema.prisma` and running `prisma migrate dev`, the TypeScript types for `prisma.storedSpec` don't exist until the client is regenerated.
**Why it happens:** Prisma generates client into `src/generated/prisma/` — not auto-generated on schema edit, only on `migrate dev` or explicit `prisma generate`.
**How to avoid:** Run `npx prisma migrate dev --name add_stored_spec` from `services/agent/` — this both creates the migration AND regenerates the client. Do not run `migrate dev` without `--name`.
**Warning signs:** TypeScript error `Property 'storedSpec' does not exist on type 'PrismaClient'`.

### Pitfall 2: Auth Guard on Public Permalink Route

**What goes wrong:** The `requireAuth` preHandler is accidentally added to `GET /api/gen/specs/:id`, making shared links return 401.
**Why it happens:** Copy-paste from other routes that all use `preHandler: [requireAuth]`.
**How to avoid:** The public GET is the only route in `gen-specs.ts` with no `preHandler`. Add a comment: `// PUBLIC — no auth required for permalink viewing`.

### Pitfall 3: useEffect Infinite Loop on History Fetch

**What goes wrong:** `useSpecsApi` fetches specs in a `useEffect` that lists `accessToken` as a dependency; each access token refresh triggers a re-fetch.
**Why it happens:** Auth0 tokens rotate; listing `accessToken` as a dep causes perpetual re-fetching.
**How to avoid:** Wrap `authFetch` in `useCallback` with `[accessToken]` dep, then the `fetchSpecs` callback depends on `authFetch`. This way `fetchSpecs` only changes when the token genuinely changes — which should only happen on first load or re-login, not on every render.

### Pitfall 4: `onComplete` rawLines Stale Closure

**What goes wrong:** The `rawLinesRef` pattern in `PlaygroundPage` was introduced specifically because `onComplete` is memoized in `useGenStream`. Adding `rawLines` to the `onComplete` callback signature risks a stale closure if not threaded correctly.
**Why it happens:** `useGenStream.send` is memoized with `[api, accessToken]` deps — it doesn't see updated `rawLines` state via closure.
**How to avoid:** The existing `rawLinesRef.current = rawLines` useEffect pattern already solves this. When extending `onComplete` to pass `rawLines` as argument, pass `rawLinesRef.current` from inside the `send` function (which has access to the locally accumulated `accumulatedElements` / `rawLines` within the stream loop). This is the cleanest approach — pass the locally collected lines, not the React state.

### Pitfall 5: Refinement Mode Chat Context Injection

**What goes wrong:** `/api/gen/chat` receives messages but no spec context, so the model patches nothing meaningful.
**Why it happens:** The existing `gen-chat.ts` route takes a `messages` array but doesn't receive the current spec unless the client sends it.
**How to avoid:** When entering refinement mode, prepend a synthetic assistant message to the chat messages array: `"Here is the current spec: <JSON.stringify(currentSpec)>"`. This injects the spec context without modifying the backend. The CONTEXT.md states "the chat endpoint receives the current spec as context" — this is the client-side mechanism.

### Pitfall 6: 100-Entry Cap Race Condition

**What goes wrong:** Two simultaneous generations for the same user both call `_enforceCapForUser` before either has saved, resulting in both bypassing the cap.
**Why it happens:** Check-then-act on count is not atomic.
**How to avoid:** For this phase this is acceptable — low-traffic user tool, not a billing-critical boundary. The cap is a UX cap, not a strict limit. Document this as a known limitation. If strictness is needed later, a database-level constraint or transaction wrapping the count+save would solve it.

---

## Code Examples

### Prisma Migration Command

```bash
# Source: .claude/skills/prisma-migrations/SKILL.md + CLAUDE.md
cd /path/to/services/agent
npx prisma migrate dev --name add_stored_spec
```

This creates `prisma/migrations/<timestamp>_add_stored_spec/migration.sql` and regenerates the client into `src/generated/prisma/`.

### API Response Shape (consistent with existing services)

```typescript
// Source: services/agent/src/routes/sessions.ts response pattern
// GET /api/gen/specs — returns array wrapped in { data }
{ data: StoredSpec[] }

// POST /api/gen/specs — returns created spec
{ data: StoredSpec }

// PATCH /api/gen/specs/:id/favorite — returns updated spec
{ data: StoredSpec }

// GET /api/gen/specs/:id — same shape, no auth required
{ data: StoredSpec }

// DELETE — 204 No Content (no body)
```

### React Router Route Addition

```typescript
// Source: apps/gen/src/main.tsx — existing router structure
const router = createBrowserRouter(
  [
    {
      element: <App />,
      children: [
        { path: "callback", element: <CallbackRedirect /> },
        { index: true, element: <PlaygroundPage /> },
        { path: "s/:id", element: <SharedSpecPage /> },  // NEW — no auth guard
        { path: "*", element: <Navigate to="/" replace /> },
      ],
    },
  ],
  { basename: "/gen" }
);
```

Note: `SharedSpecPage` is a child of `App`, which gates auth via `isAuthenticated` check. Since the shared view must be public, `App.tsx` must be modified to skip the auth gate for the `s/:id` path, or `SharedSpecPage` must be moved outside the `App` element wrapper. The cleanest approach: check `window.location.pathname.includes('/s/')` in `App.tsx` and bypass the auth gate, matching the existing `isCallback` pattern.

### HistoryPanel Extension (favorites + replay)

```typescript
// Extended props from existing HistoryPanel.tsx
export interface HistoryPanelProps {
  entries: StoredSpec[];
  activeId: string | null;
  filter: "all" | "favorites";          // NEW
  isLoading: boolean;                    // NEW
  onSelect: (id: string) => void;
  onReplay: (id: string) => void;       // NEW — re-submits prompt
  onToggleFavorite: (id: string) => void; // NEW
  onFilterChange: (f: "all" | "favorites") => void; // NEW
}
```

### Share Button Clipboard Copy

```typescript
// Source: MDN Clipboard API (HIGH confidence — standard browser API)
async function handleShare(specId: string) {
  const url = `${window.location.origin}/gen/s/${specId}`;
  try {
    await navigator.clipboard.writeText(url);
    // Show brief toast/success indicator
  } catch {
    // Fallback for non-HTTPS dev environments
    window.prompt("Copy this link:", url);
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| In-memory React state for history (Phase 14) | Database-backed history via REST API | Phase 16 | History survives page refresh and re-login |
| 50-entry cap in React state | 100-entry server-side cap with favorites exclusion | Phase 16 | More durable, favorites never lost |
| No sharing | UUID-based public permalink | Phase 16 | Shared UIs load without auth |

---

## Open Questions

1. **App.tsx auth gate for SharedSpecPage**
   - What we know: `App.tsx` currently redirects unauthenticated users to `<LoginPrompt>` for all routes
   - What's unclear: The exact mechanism to bypass auth for `/gen/s/:id` without restructuring the router
   - Recommendation: Check `window.location.pathname` for `/s/` prefix inside `App.tsx` (matches the existing `isCallback` pattern) and render `<Outlet />` directly. Alternatively, move the auth-gate logic into `PlaygroundPage` only, leaving `App` as a pure layout — cleaner but larger diff.

2. **Optimistic favorite toggle vs. server-confirmed**
   - What we know: PATCH response returns the updated spec; network round-trip is visible
   - What's unclear: Whether to optimistically flip the star before the PATCH resolves
   - Recommendation: Use optimistic update (flip star immediately, revert on error) — the round-trip latency would cause noticeable flicker on the star icon otherwise. Pattern: `setSpecs(prev => prev.map(s => s.id === id ? { ...s, isFavorite: !s.isFavorite } : s))` before await.

---

## Validation Architecture

> `workflow.nyquist_validation` is not set to true in `.planning/config.json` — section skipped.

---

## Sources

### Primary (HIGH confidence)
- Codebase direct read: `services/agent/prisma/schema.prisma` — existing model conventions (cuid, map, index patterns)
- Codebase direct read: `services/agent/src/services/session.ts` — service layer pattern for Prisma operations
- Codebase direct read: `services/agent/src/routes/gen-ui.ts`, `gen-chat.ts` — Fastify route conventions, requireAuth usage
- Codebase direct read: `services/agent/src/app.ts` — route registration pattern
- Codebase direct read: `apps/gen/src/hooks/useGenStream.ts` — streaming hook, rawLinesRef pattern, onComplete signature
- Codebase direct read: `apps/gen/src/pages/PlaygroundPage.tsx` — existing state management, history handling
- Codebase direct read: `apps/gen/src/main.tsx` — React Router createBrowserRouter, basename `/gen`, route structure
- Codebase direct read: `packages/api-client/src/client.ts`, `users.ts` — ApiClient pattern, typed method per domain
- Codebase direct read: `.claude/skills/prisma-migrations/SKILL.md` — migration workflow, naming conventions

### Secondary (MEDIUM confidence)
- MDN Web API: `navigator.clipboard.writeText` — standard browser Clipboard API for share URL copy
- Prisma docs (via skill): `prisma migrate dev --name` creates migration + regenerates client atomically

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use; no new dependencies
- Architecture: HIGH — all patterns directly derived from existing codebase (session.ts, gen-ui.ts, useGenStream, ApiClient)
- Pitfalls: HIGH — identified from code reading: rawLinesRef stale closure already solved in Phase 14; auth gate on public route is a known copy-paste risk; Prisma client regeneration is documented in skill
- Open questions: MEDIUM — both questions have clear recommended resolutions; implementation choice will be confirmed during planning

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable stack, no fast-moving dependencies)
