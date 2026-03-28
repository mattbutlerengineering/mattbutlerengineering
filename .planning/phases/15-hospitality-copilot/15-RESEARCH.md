# Phase 15: Hospitality Copilot - Research

**Researched:** 2026-03-28
**Domain:** React component authoring (Rialto), generative UI streaming, slide-over panel UX
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Entry point & panel behavior**
- Sidebar nav item labeled "Copilot" in the existing DashboardLayout Sidebar — consistent with all other nav items (Home, Timeline, Reservations, etc.)
- Opens a slide-over panel from the right edge (~400px wide), overlaying the main content area without navigating away (satisfies COP-01)
- Panel has its own close button (X) in the header; clicking the sidebar item again also closes it (toggle behavior)
- Panel does not persist state when closed — reopening starts fresh (no hidden background process)
- Panel header shows "Gen Copilot" title with close button; no additional chrome

**Domain context injection**
- Hospitality app passes a `domainContext` prop to `<GenCopilot>` containing structured schema summaries as plain strings
- Schema summaries are hardcoded in the hospitality app (not fetched from API) — they describe reservation fields, floor plan structure, and guest data shapes in natural language
- The `domainContext` is prepended to the user's prompt as system context before sending to `/api/gen/ui` — the user never sees it but the AI uses it for field-accurate generation
- Example context shape: `{ schemas: [{ name: "Reservation", description: "...", fields: "id, guestName, tableId, partySize, date, time, status, notes" }] }`
- No page-aware context injection (doesn't change based on which hospitality page you're on) — same context everywhere

**Component packaging strategy**
- `<GenCopilot>` lives in `packages/rialto/src/components/GenCopilot/` and is exported from the `@mbe/rialto` barrel
- Self-contained: bundles its own streaming logic (adapted from apps/gen's useGenStream pattern), preview rendering (using `@mbe/rialto-catalog/registry` + `@json-render/react` Renderer), and prompt input
- Consumer passes: `api` (endpoint URL string), `domainContext` (schema descriptions), and `getAccessToken` (async function returning Bearer token for auth)
- No dependency on `@mbe/auth` or `@mbe/api-client` — the `getAccessToken` prop keeps the component auth-agnostic

**Internal layout**
- Prompt input at bottom, rendered preview above, minimal chrome — no JSON inspector, no history panel

**Interaction model**
- Single-shot prompts using `/api/gen/ui` endpoint — not conversational
- No prompt history in the panel — each prompt is independent
- Submit → streaming preview → done. New prompt replaces previous result.
- Stop button during streaming (abort keeps partial result)

### Claude's Discretion
- Slide-over panel animation (slide, fade, or instant) — Drawer component handles this with spring physics already
- Internal component decomposition within GenCopilot (sub-components vs monolith)
- Loading indicator style during TTFT
- How schema context is formatted in the prompt prepend

### Deferred Ideas (OUT OF SCOPE)
None — all decisions stay within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| COP-01 | `<GenCopilot>` component in `packages/rialto` with embedded generation panel | Drawer component exists in @mbe/rialto, exported at barrel. useGenStream pattern verified in apps/gen. Component can be self-contained. |
| COP-02 | Integration into hospitality app dashboard layout | DashboardLayout.tsx uses Sidebar with SidebarSection[] — adding a "Copilot" item follows existing pattern. Drawer renders fixed-position overlay; no layout restructuring needed. |
| COP-03 | Domain-aware prompt context (reservation schema, floor plan structure, guest data shapes) | gen-ui.ts accepts `prompt` string — domain context must be prepended client-side by GenCopilot before sending. Backend `context` field does not exist; client-side concatenation is the approach. |
| COP-04 | Generated UIs render inline within the hospitality app using Rialto components | JSONUIProvider + Renderer from @json-render/react with rialto-catalog registry works identically to PlaygroundApp. Hospitality app needs @json-render/react and @mbe/rialto-catalog added to its dependencies. |
</phase_requirements>

---

## Summary

Phase 15 builds a `<GenCopilot>` component inside `packages/rialto` and integrates it into `apps/hospitality`. The component is a self-contained slide-over panel: a Rialto `Drawer` (already exists, already exported) wrapping a streaming prompt UI and a JSON-spec renderer. The entire generative streaming stack is proven in Phase 14 (`apps/gen`) — this phase adapts it into a reusable library component.

The key architectural insight is that `@mbe/rialto` cannot import `@mbe/auth` or `@mbe/api-client` (those are app-level packages, not design system deps). The `getAccessToken: () => Promise<string | null>` prop pattern resolves this cleanly: the hospitality app passes a function that calls `useAuth().accessToken`, keeping `GenCopilot` decoupled. The streaming logic (adapted from `useGenStream`) uses this token inline during fetch.

Domain context injection is client-side only. The backend `gen-ui.ts` `GenUiBodySchema` only accepts `{ prompt, model }` — there is no `context` field. GenCopilot must serialize `domainContext` into a text prefix and concatenate it with the user's prompt before POSTing. This requires no backend changes.

**Primary recommendation:** Build `GenCopilot` as three focused sub-components — `useGenCopilotStream` hook (adapted useGenStream without @mbe/auth dependency), `CopilotPreview` (simplified PreviewPane without retry button), and `CopilotPromptBar` (adapted PromptBar for narrower panel) — composed in the top-level `GenCopilot.tsx`. Then add `@json-render/react` and `@mbe/rialto-catalog` to the rialto package dependencies and wire up the hospitality app integration.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@json-render/react` | workspace:* (already in apps/gen) | JSONUIProvider + Renderer for spec rendering | The established generative UI rendering primitive for this project |
| `@mbe/rialto-catalog` | workspace:* (already in apps/gen) | `registry` object mapping component types to Rialto components | Already maps ~25 Rialto components; required for Renderer |
| `framer-motion` | peer dep of @mbe/rialto | Drawer slide animation | Already a peer dep of rialto — no new install |
| `@mbe/rialto` Drawer | already in barrel | Slide-over panel primitive | Exists, exported, handles focus trap, escape key, spring animation, RTL |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@mbe/rialto` Skeleton | already in barrel | Loading shimmer during TTFT | While `isStreaming && !spec` |
| `@mbe/rialto` Alert | already in barrel | Error display | When `error !== null` |
| `@mbe/rialto` Button | already in barrel | Submit / Stop toggle | Identical to PromptBar pattern |
| CSS Modules | built into Vite | Component-level scoping | Project standard — no Tailwind |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Rialto Drawer | Custom slide-over div | Drawer already handles focus trap, escape key, RTL, spring animation, accessibility. Don't reinvent. |
| Client-side prompt prepend | Backend context field | Backend change is out of scope; client-side prepend is simpler and sufficient for this phase |
| Monolith GenCopilot.tsx | Sub-components | Monolith is simpler but violates the 200-400 line file guideline — sub-components stay small |

### New Dependencies to Install

`@mbe/rialto` currently has zero runtime dependencies (framer-motion, lucide-react, react, react-dom are all peer deps). To render generated specs, `rialto` must add `@json-render/react` and `@mbe/rialto-catalog` as dependencies.

```bash
# In packages/rialto/
pnpm add @json-render/react @mbe/rialto-catalog

# In apps/hospitality/ (for the getAccessToken bridge)
# No new deps needed — @mbe/auth and @mbe/rialto are already installed
```

**NOTE:** `@mbe/rialto-catalog` depends on `@json-render/react` already. Adding both to rialto's deps is required because GenCopilot directly imports from both.

---

## Architecture Patterns

### Recommended Project Structure
```
packages/rialto/src/components/GenCopilot/
├── GenCopilot.tsx              # Top-level component (open/close state, prop types)
├── GenCopilot.module.css       # Panel body layout (preview above, prompt below)
├── CopilotPreview.tsx          # Simplified PreviewPane (no retry, no inspector)
├── CopilotPreview.module.css   # Preview area styles
├── CopilotPromptBar.tsx        # Adapted PromptBar (narrower, no model selector)
├── CopilotPromptBar.module.css # Prompt bar styles
├── useGenCopilotStream.ts      # Adapted useGenStream (getAccessToken prop, not useAuth)
└── index.ts                    # export * from "./GenCopilot"
```

DashboardLayout changes:
```
apps/hospitality/src/components/
├── DashboardLayout.tsx          # Add "Copilot" sidebar item + GenCopilot mount
└── DashboardLayout.module.css   # No changes expected
```

### Pattern 1: Auth-Agnostic getAccessToken Prop

GenCopilot cannot import from `@mbe/auth` (app-level package). The consumer provides a `getAccessToken` async function.

```typescript
// In packages/rialto/src/components/GenCopilot/GenCopilot.tsx
export interface GenCopilotProps {
  /** URL of the generation endpoint, e.g. "https://api.example.com/api/gen/ui" */
  api: string;
  /** Hospitality domain context — prepended to user prompts as schema guidance */
  domainContext: DomainContext;
  /** Returns current Bearer token; called before each fetch */
  getAccessToken: () => string | null | Promise<string | null>;
}

export interface DomainContext {
  schemas: Array<{
    name: string;
    description: string;
    fields: string;
  }>;
}
```

In the hospitality app integration:
```tsx
// apps/hospitality/src/components/DashboardLayout.tsx
import { useAuth } from "@mbe/auth/react";
import { GenCopilot } from "@mbe/rialto";

// Inside DashboardLayout:
const { accessToken } = useAuth();

<GenCopilot
  api="/api/gen/ui"
  domainContext={HOSPITALITY_DOMAIN_CONTEXT}
  getAccessToken={() => accessToken}
/>
```

### Pattern 2: Client-Side Domain Context Injection

The backend accepts `{ prompt: string, model?: string }`. Domain context is prepended to the prompt string before POSTing:

```typescript
// In useGenCopilotStream.ts
function buildPromptWithContext(userPrompt: string, context: DomainContext): string {
  const schemaLines = context.schemas
    .map((s) => `## ${s.name}\n${s.description}\nFields: ${s.fields}`)
    .join("\n\n");
  return `Context:\n${schemaLines}\n\nUser request: ${userPrompt}`;
}
```

The user never sees this prepend — the input field only shows their raw prompt.

### Pattern 3: Drawer Toggle in Sidebar

The existing `buildNavSections` function in `DashboardLayout.tsx` creates sidebar items with `onClick` handlers. Adding Copilot toggle:

```typescript
// In DashboardLayout.tsx — add isOpen state
const [copilotOpen, setCopilotOpen] = useState(false);

// In buildNavSections call (or directly in sections):
{
  id: "copilot",
  label: "Copilot",
  active: copilotOpen,
  onClick: () => setCopilotOpen((prev) => !prev),
}

// Render Drawer at the end of the body div:
<GenCopilot
  open={copilotOpen}
  onClose={() => setCopilotOpen(false)}
  api="..."
  domainContext={HOSPITALITY_DOMAIN_CONTEXT}
  getAccessToken={() => accessToken}
/>
```

**NOTE:** The current `buildNavSections` signature takes `navigate` and `currentPath` — it does not support `setCopilotOpen`. The simplest refactor is to add copilot item directly in the `sectionsWithSignOut` mapping or restructure `buildNavSections` to accept a third `extras` param.

### Pattern 4: useGenCopilotStream (auth-decoupled adaptation)

The existing `useGenStream` imports `useAuth` from `@mbe/auth/react` directly. GenCopilot cannot use that hook. The adaptation replaces the auth hook with a prop-based token:

```typescript
// useGenCopilotStream.ts — key difference from useGenStream
export interface UseGenCopilotStreamOptions {
  api: string;
  getAccessToken: () => string | null | Promise<string | null>;
  onComplete?: (spec: Spec) => void;
  onError?: (error: Error) => void;
}

// Inside send():
const token = await Promise.resolve(getAccessToken());
const response = await fetch(api, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify({ prompt: buildPromptWithContext(userPrompt, domainContext) }),
  signal: controller.signal,
});
```

### Anti-Patterns to Avoid
- **Importing @mbe/auth inside GenCopilot:** Creates a circular/invalid dep chain — rialto must not depend on app-level packages. Use the `getAccessToken` prop.
- **Adding `context` to GenUiBodySchema without a backend change:** The current backend only accepts `{ prompt, model }`. Sending extra fields is harmless (Zod strips unknown), but the backend WILL NOT forward context to the AI. Context must be in the `prompt` string.
- **Copying useGenStream file into rialto:** Don't import from apps/gen — duplicate the logic (3 key changes: no useAuth hook, accept getAccessToken param, accept domainContext param).
- **Locking body scroll via Drawer:** The existing `Drawer` component already does `document.body.style.overflow = "hidden"` when open. This is fine for full-viewport apps but might conflict with the hospitality app's internal scrolling. Test with the actual layout.
- **Using `buildNavSections` without refactoring:** The function currently closes over only `navigate` and `currentPath`. Adding copilot toggle requires either passing `setCopilotOpen` as a param or moving the copilot item outside the function. The latter is cleaner.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Slide-over panel | Custom fixed-position div with animations | Rialto `Drawer` (already in barrel) | Focus trap, escape key, RTL, spring animation, backdrop, accessibility all handled |
| JSON spec rendering | Custom component tree builder | `@json-render/react` `Renderer` + `JSONUIProvider` | Already proven in Phase 14 with the Rialto catalog registry |
| Streaming JSONL parsing | Custom SSE parser | Adapt `useGenStream` pattern | Buffer/split logic, AbortController stop, partial-spec accumulation — all established |
| CSS animation | Custom keyframes for panel entrance | Framer Motion `AnimatePresence` via Drawer | Already wired into Drawer via spring tokens |

---

## Common Pitfalls

### Pitfall 1: Body Scroll Lock Conflict
**What goes wrong:** Rialto `Drawer` sets `document.body.style.overflow = "hidden"` when open. The hospitality app's main content area uses `overflow-y: auto` on `.content`. When the Drawer opens, the body lock may not affect the inner scroll container, causing inconsistency.
**Why it happens:** CSS overflow on child elements is independent of body overflow.
**How to avoid:** The Drawer overlay covers the full viewport — visual overlap prevents interaction. The body lock is belt-and-suspenders. Likely non-issue in practice; verify with actual layout test.
**Warning signs:** Scrollable content behind the drawer can still scroll with mouse wheel after Drawer opens.

### Pitfall 2: rialto-catalog Registry Import in rialto Package
**What goes wrong:** `packages/rialto` adding `@mbe/rialto-catalog` as a dependency creates a potential circular dep: `rialto-catalog` imports from `@mbe/rialto`.
**Why it happens:** `registry.tsx` in rialto-catalog imports `Button, Card, Stack...` etc. from `@mbe/rialto`. If rialto now imports from `@mbe/rialto-catalog`, there's a circular dependency.
**How to avoid:** This IS a circular dependency. The correct resolution: GenCopilot accepts `registry` as a prop (or uses a default from @mbe/rialto-catalog imported by the consumer), OR the `registry` import stays at the app layer and is passed in.

**Revised approach (avoids circularity):** Add a `registry` prop to `GenCopilot` with a sensible default. Consumer passes `import { registry } from "@mbe/rialto-catalog"`. This means hospitality app needs `@mbe/rialto-catalog` as a dep, not `packages/rialto`.

```typescript
// GenCopilot accepts registry as a prop
import type { Registry } from "@json-render/react";

export interface GenCopilotProps {
  api: string;
  domainContext: DomainContext;
  getAccessToken: () => string | null | Promise<string | null>;
  /** Component registry for rendering generated specs. Defaults to Rialto catalog registry. */
  registry: Registry;
}
```

Then `packages/rialto` only needs `@json-render/react` (for types + Renderer), NOT `@mbe/rialto-catalog`. The hospitality app provides the registry.

**Alternative (cleaner DX):** Ship `@mbe/rialto-catalog` and `@mbe/rialto` as separate packages that the consumer installs. The `registry` prop has no default — consumer always passes it. This is the safest approach and what the CONTEXT.md implies ("consumer passes... `getAccessToken`").

### Pitfall 3: buildNavSections Copilot Item Active State
**What goes wrong:** `active: currentPath === "/copilot"` — but Copilot is not a route, it's a panel toggle. Using path-based active state will never highlight the item.
**Why it happens:** The existing pattern uses `currentPath` comparison. Copilot breaks this pattern.
**How to avoid:** Pass `copilotOpen` state into `buildNavSections` or set `active: copilotOpen` on the copilot item directly outside the function.

### Pitfall 4: `getAccessToken` Called with Stale Token
**What goes wrong:** Auth0 access tokens expire. If `getAccessToken` returns the cached `accessToken` from a stale `useAuth()` state, requests fail with 401 after token expiry.
**Why it happens:** `useAuth().accessToken` reflects the current token but doesn't proactively refresh.
**How to avoid:** This is acceptable for the copilot use case — the app already handles auth refresh globally. If the token is expired, the generation request will fail with a 401 and the error state will display. The user can re-authenticate. No special handling needed in GenCopilot itself.

### Pitfall 5: useGenCopilotStream `send` Dependency Array
**What goes wrong:** `useCallback`'s `[api, getAccessToken]` dep array triggers re-creation of `send` on every render if `getAccessToken` is an inline arrow function in the parent.
**Why it happens:** `() => accessToken` in JSX creates a new function reference each render.
**How to avoid:** The hospitality app should define `getAccessToken` with `useCallback` or pass a stable reference. Document this in GenCopilotProps JSDoc.

---

## Code Examples

### GenCopilot Component Skeleton

```typescript
// Source: adapted from apps/gen/src/hooks/useGenStream.ts + Drawer pattern
import { useState } from "react";
import { Drawer } from "../Drawer/index.js";
import { CopilotPreview } from "./CopilotPreview.js";
import { CopilotPromptBar } from "./CopilotPromptBar.js";
import { useGenCopilotStream } from "./useGenCopilotStream.js";
import type { Registry } from "@json-render/react";
import styles from "./GenCopilot.module.css";

export interface DomainContext {
  schemas: Array<{ name: string; description: string; fields: string }>;
}

export interface GenCopilotProps {
  open: boolean;
  onClose: () => void;
  api: string;
  domainContext: DomainContext;
  getAccessToken: () => string | null | Promise<string | null>;
  registry: Registry;
}

export function GenCopilot({ open, onClose, api, domainContext, getAccessToken, registry }: GenCopilotProps) {
  const { spec, isStreaming, error, send, stop } = useGenCopilotStream({
    api,
    domainContext,
    getAccessToken,
  });

  return (
    <Drawer open={open} onClose={onClose} title="Gen Copilot" side="right">
      <div className={styles.body}>
        <CopilotPreview spec={spec} isStreaming={isStreaming} error={error} registry={registry} />
        <CopilotPromptBar onSubmit={send} onStop={stop} isStreaming={isStreaming} />
      </div>
    </Drawer>
  );
}
```

### Hardcoded Domain Context in Hospitality App

```typescript
// apps/hospitality/src/constants/copilotContext.ts
import type { DomainContext } from "@mbe/rialto";

export const HOSPITALITY_DOMAIN_CONTEXT: DomainContext = {
  schemas: [
    {
      name: "Reservation",
      description: "A dining reservation linked to a table and guest.",
      fields: "id, guestName, tableId, partySize, date, time, status (pending|confirmed|cancelled|seated|completed), notes",
    },
    {
      name: "FloorPlan",
      description: "A restaurant floor layout with named zones and table positions.",
      fields: "id, name, tables (id, label, x, y, width, height, capacity, shape, zoneId), zones (id, name, color)",
    },
    {
      name: "Guest",
      description: "A guest profile with visit history and preferences.",
      fields: "id, name, email, phone, visitCount, lastVisit, preferences, notes",
    },
  ],
};
```

### Prompt Context Serialization

```typescript
// In useGenCopilotStream.ts
function buildPromptWithContext(userPrompt: string, context: DomainContext): string {
  const schemaText = context.schemas
    .map((s) => `### ${s.name}\n${s.description}\nAvailable fields: ${s.fields}`)
    .join("\n\n");
  return `You are generating UI for a hospitality management app. Use these data schemas:\n\n${schemaText}\n\nUser request: ${userPrompt}`;
}
```

### DashboardLayout Integration

```tsx
// apps/hospitality/src/components/DashboardLayout.tsx
import { useState, useCallback } from "react";
import { useAuth } from "@mbe/auth/react";
import { GenCopilot } from "@mbe/rialto";
import { registry } from "@mbe/rialto-catalog";
import { HOSPITALITY_DOMAIN_CONTEXT } from "../constants/copilotContext.js";

export function DashboardLayout() {
  const [copilotOpen, setCopilotOpen] = useState(false);
  const { accessToken } = useAuth();
  const getAccessToken = useCallback(() => accessToken, [accessToken]);

  // In sections builder — add copilot item to first section or as new section:
  // { id: "copilot", label: "Copilot", active: copilotOpen, onClick: () => setCopilotOpen(p => !p) }

  return (
    <div className={styles.root}>
      {/* ... existing layout ... */}
      <GenCopilot
        open={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        api="/api/gen/ui"
        domainContext={HOSPITALITY_DOMAIN_CONTEXT}
        getAccessToken={getAccessToken}
        registry={registry}
      />
    </div>
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct `useAuth()` in streaming hook | `getAccessToken` prop for auth-agnostic hooks | Phase 15 design decision | GenCopilot can be used in any Rialto-themed app without @mbe/auth |
| Single-file component | Sub-components (Preview, PromptBar, hook) | Phase 15 coding standards | Files stay under 200-400 lines; matches project file organization guideline |
| Registry in rialto package | Registry passed as prop from consumer | Phase 15 circular dep resolution | Avoids rialto → rialto-catalog → rialto circular dependency |

---

## Open Questions

1. **Circular dependency: rialto → rialto-catalog → rialto**
   - What we know: `rialto-catalog/registry.tsx` imports from `@mbe/rialto`. If `@mbe/rialto` imports from `@mbe/rialto-catalog`, pnpm will detect a circular dep.
   - What's unclear: Whether pnpm workspace circular deps cause build failures or are silently tolerated in this monorepo config.
   - Recommendation: Avoid the circular dep entirely by passing `registry` as a prop to `GenCopilot`. The hospitality app imports from `@mbe/rialto-catalog` directly. This is cleaner and more flexible.

2. **Drawer body scroll lock vs hospitality app inner scrolling**
   - What we know: Drawer locks `document.body.style.overflow`. Hospitality `.content` div has `overflow-y: auto`.
   - What's unclear: Whether this causes a visible UX issue (background content scrolls while drawer is open).
   - Recommendation: Test manually. If background content scrolls, add `pointer-events: none` to `.content` when copilot is open, or accept it (copilot overlay makes the content inaccessible anyway).

3. **Backend `context` field — do we need it?**
   - What we know: `gen-ui.ts` only accepts `{ prompt, model }`. Domain context must be in the prompt string.
   - What's unclear: Whether future phases (PERS-05 conversational refinement) will need the backend to understand context separately.
   - Recommendation: Keep all context in the prompt string for Phase 15. No backend changes needed. Future phases can add a `context` field to `GenUiBodySchema` when needed.

---

## Validation Architecture

> `workflow.nyquist_validation` is not set in `.planning/config.json` — skipping this section.

---

## Sources

### Primary (HIGH confidence)
- Direct code read: `apps/gen/src/hooks/useGenStream.ts` — streaming hook source of truth for adaptation
- Direct code read: `apps/gen/src/components/PreviewPane.tsx` — JSONUIProvider + Renderer pattern
- Direct code read: `apps/gen/src/components/PromptBar.tsx` — submit/stop input pattern
- Direct code read: `packages/rialto/src/components/Drawer/Drawer.tsx` — full Drawer API, confirmed exported in barrel
- Direct code read: `packages/rialto/src/components/index.ts` — barrel exports, confirmed Drawer is exported
- Direct code read: `packages/rialto/src/lib-entry.ts` — confirmed `export * from "./components"`
- Direct code read: `packages/rialto/package.json` — zero runtime deps (all peers), must add @json-render/react
- Direct code read: `packages/rialto-catalog/src/registry.tsx` — confirmed imports from @mbe/rialto (circular dep risk)
- Direct code read: `packages/rialto-catalog/package.json` — deps: @json-render/core, @json-render/react, @mbe/rialto, zod
- Direct code read: `apps/hospitality/src/components/DashboardLayout.tsx` — confirmed SidebarSection pattern, Outlet structure
- Direct code read: `services/agent/src/routes/gen-ui.ts` — confirmed no `context` field in GenUiBodySchema
- Direct code read: `packages/auth/src/react/hooks.ts` — confirmed `useAuth().accessToken` returns `string | null`

### Secondary (MEDIUM confidence)
- Inferred from project patterns: CSS Modules + `var(--rialto-*)` tokens are mandatory (no Tailwind, no hardcoded values)
- Inferred from CLAUDE.md: `pnpm add` to add new deps; run `pnpm lint && pnpm typecheck && pnpm test` before commit

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libs exist in the repo and were directly verified
- Architecture: HIGH — patterns traced from working Phase 14 code
- Circular dep risk: HIGH — confirmed by reading rialto-catalog/package.json
- Backend context field: HIGH — confirmed absent by reading gen-ui.ts GenUiBodySchema
- Pitfalls: MEDIUM — scroll lock conflict is theoretical; test to confirm

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable internal code, no external API changes)
