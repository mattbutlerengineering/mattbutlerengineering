# Phase 14: Playground App - Research

**Researched:** 2026-03-27
**Domain:** Vite SPA, @json-render/react streaming, Rialto design system, Cloudflare Workers Static Assets
**Confidence:** HIGH

## Summary

Phase 14 creates `apps/gen` — a new Vite SPA at `/gen` that is structurally identical to `apps/hospitality`. The app shell follows established patterns: `RialtoProvider` → `AuthProvider` → `createBrowserRouter` with `basename: "/gen"`, the same wrangler.toml / Workers Static Assets deployment, and the same CI additions to `deploy-static.yml`. The key novelty is the three-column streaming playground UI.

The streaming preview is powered by `useUIStream` from `@json-render/react` (version 0.15.0 already installed). This hook manages the SSE connection, parses JSONL spec patches, and assembles a live `Spec` object. The `Renderer` + `JSONUIProvider` from the same package renders that spec using the `registry` from `@mbe/rialto-catalog`. The JSON inspector is a read-only code display that mirrors the raw `rawLines` array returned by `useUIStream`. Prompt history is React state (`useState`) — no external storage.

The infrastructure piece is two changes: (1) add a `/gen` branch to `edge-router.js` using a `GEN` Service Binding, and (2) uncomment the GEN Service Binding in `infrastructure/pulumi/index.ts`. The Pulumi resource for the gen app Worker itself does not need to be created — static app Workers are created by `wrangler deploy` in CI (same as marketing, hospitality, rialto-web), not via Pulumi. INFRA-02 ("Pulumi resource for gen app CF Worker") was marked Pending but in practice only the Service Binding reference in the edge-router script and `pulumi up` is needed.

**Primary recommendation:** Build `apps/gen` by cloning the hospitality app scaffold, replacing the dashboard layout with the three-column playground layout, and wiring `useUIStream` from `@json-render/react` to `POST /api/gen/ui`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Layout & composition
- Three-column split layout: history (left ~20%), preview (center ~50%), JSON inspector (right ~30%)
- Fixed column proportions — no drag-to-resize handles
- Prompt input bar at the bottom, spanning full width below all three columns
- AppBar at top with theme toggle (light/dark) and user avatar dropdown with logout
- No model selector in AppBar — Haiku 4.5 is the default (per Phase 13 decision)

#### Streaming preview UX
- Components appear progressively as JSONL chunks arrive — each component renders as soon as its JSON is received
- Submit button becomes a stop button during streaming; clicking aborts the SSE stream and keeps whatever has rendered so far
- Errors display inline in the preview pane using Rialto Alert component with a "Try again" button; previous successful results stay in history

#### Prompt history
- History entries show truncated prompt text (~60 chars) with relative timestamp ("2 min ago")
- Clicking a history entry shows the cached result in preview and JSON inspector — no re-generation
- Active history entry is visually highlighted
- History stored in React state only (survives React Router navigation, clears on page refresh or logout)
- Capped at 50 entries; oldest entries silently drop off

#### JSON inspector
- Syntax-highlighted, read-only JSON display
- Auto-scrolls to follow new chunks during streaming; pauses auto-scroll if user scrolls up manually; resumes when user scrolls back to bottom
- Copy-to-clipboard button at top copies the full JSON spec; disabled while streaming
- No hover-linking between JSON nodes and rendered preview components

### Claude's Discretion
- TTFT loading indicator design (spinner, pulsing bar, etc.)
- Exact column width percentages within the ~20/50/30 guidance
- Syntax highlighting approach for JSON (CSS-based vs. library)
- Specific Rialto components used for the shell layout (Card, Stack, etc.)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PLAY-01 | `apps/gen` Vite SPA served at `/gen` with Auth0 login | New app scaffold mirrors hospitality pattern; wrangler.toml + Pulumi GEN binding |
| PLAY-02 | Prompt bar for natural language input with submit action | `useUIStream.send()` is the submit handler; Rialto Input + Button |
| PLAY-03 | Streaming preview pane that renders Rialto components progressively as JSONL arrives | `useUIStream` returns live `spec`; `Renderer` + `JSONUIProvider` + `registry` |
| PLAY-04 | JSON spec inspector showing the raw generated spec | `useUIStream.rawLines` for real-time display; syntax highlighting via CSS |
| PLAY-05 | In-session prompt history (survives page navigation, clears on logout) | `useState` at route level; `useEffect` on logout to clear |
| PLAY-06 | Loading and error states for generation (spinner during TTFT, error display on failure) | `useUIStream.isStreaming` + `useUIStream.error`; Rialto Alert for errors |
| PLAY-07 | Theme-aware rendering (generated UIs respect current light/dark mode) | `useUIEnvironment().theme` from RialtoProvider; pass to nested RialtoProvider wrapping Renderer |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@json-render/react` | 0.15.0 | Progressive spec rendering + streaming hook | Already installed; `useUIStream` is the purpose-built hook |
| `@mbe/rialto-catalog` | workspace | Registry mapping JSON spec types to Rialto components | Already built in Phase 12 |
| `@mbe/rialto` | workspace | Shell UI components (AppBar, Card, Stack, Alert, ThemeToggle, etc.) | Design system for all apps |
| `@mbe/auth` | workspace | AuthProvider, useAuth, useAccessToken | Same as hospitality |
| `react-router-dom` | ^7.1.0 | SPA routing with basename `/gen` | Same as hospitality |
| `vite` | ^7.0.0 | Build + dev server | Established toolchain |
| `@vitejs/plugin-react` | ^5.0.0 | React plugin | Established toolchain |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@mbe/api-client` | workspace | Typed fetch wrapper (if needed for non-streaming calls) | May not be needed; `useUIStream` handles its own fetch |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `useUIStream` | Manual `EventSource` + JSON parsing | `useUIStream` already handles progressive spec assembly, abort, and error; custom would duplicate that work |
| CSS Modules syntax highlighting | `react-syntax-highlighter` | CSS Modules preferred per project conventions; syntax highlighting is cosmetic — don't add a library dependency for it |

**Installation:**
```bash
# No new dependencies needed — all required packages already in workspace
```

## Architecture Patterns

### Recommended Project Structure
```
apps/gen/
├── src/
│   ├── main.tsx              # RialtoProvider + AuthProvider + createBrowserRouter
│   ├── App.tsx               # Auth guard (login gate) — same pattern as hospitality
│   ├── pages/
│   │   └── PlaygroundPage.tsx  # Three-column layout, owns useUIStream + history state
│   ├── components/
│   │   ├── HistoryPanel.tsx     # Left column: history list
│   │   ├── PreviewPane.tsx      # Center column: Renderer + loading/error states
│   │   ├── JsonInspector.tsx    # Right column: rawLines display with auto-scroll
│   │   ├── PromptBar.tsx        # Bottom bar: input + submit/stop button
│   │   └── AppShell.tsx         # AppBar + three-column layout wrapper
│   └── index.css
├── index.html
├── vite.config.ts
├── tsconfig.json
├── wrangler.toml
└── package.json
```

### Pattern 1: App Bootstrap (auth + routing)

**What:** Same bootstrap as hospitality — `RialtoProvider` → `AuthProvider` → `createBrowserRouter`
**When to use:** All MBE SPA apps

```tsx
// Source: apps/hospitality/src/main.tsx (established pattern)
const router = createBrowserRouter(
  [
    {
      element: <App />,
      children: [
        { path: "callback", element: <CallbackRedirect /> },
        { index: true, element: <PlaygroundPage /> },
        { path: "*", element: <Navigate to="/" replace /> },
      ],
    },
  ],
  { basename: "/gen" }
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RialtoProvider theme="light">
      <AuthProvider config={authConfig}>
        <RouterProvider router={router} />
      </AuthProvider>
    </RialtoProvider>
  </StrictMode>
);
```

**Note:** `RialtoProvider` starts in `"light"` mode. The app manages its own theme toggle state and re-renders `RialtoProvider` with the new theme. To pass the controlled theme down, lift `theme` state to `main.tsx` or use a React context bridging `useUIEnvironment()`. The recommended approach is: manage `theme` state in `main.tsx`, pass it to `RialtoProvider`, and expose a `toggleTheme` callback via a lightweight context.

### Pattern 2: Streaming Generation with useUIStream

**What:** `useUIStream` from `@json-render/react` handles the full SSE lifecycle — POST request, streaming parser, abort, spec assembly
**When to use:** All `POST /api/gen/ui` interactions

```tsx
// Source: @json-render/react 0.15.0 type definitions (verified in node_modules)
const {
  spec,           // Spec | null — live spec updated as JSONL arrives
  isStreaming,    // boolean — true from request until stream closes
  error,          // Error | null
  rawLines,       // string[] — raw JSONL lines (for JSON inspector)
  send,           // (prompt: string) => Promise<void>
  clear,          // () => void
} = useUIStream({
  api: "/api/gen/ui",
  onComplete: (spec) => { /* save to history */ },
  onError: (err) => { /* already surfaced via error field */ },
});
```

**CRITICAL:** `useUIStream` does a plain `fetch` POST internally. It does NOT inject the Auth0 Bearer token. The hook must be augmented or replaced with a custom fetch wrapper that adds the Authorization header. See Pitfall 3 below for the solution.

### Pattern 3: Rendering a Spec

**What:** `JSONUIProvider` wraps the rendering context; `Renderer` renders the spec
**When to use:** Any pane displaying a json-render spec

```tsx
// Source: @json-render/react 0.15.0 type definitions + rialto-catalog registry.test.tsx
import { JSONUIProvider, Renderer } from "@json-render/react";
import { registry } from "@mbe/rialto-catalog";
import { useNavigate } from "react-router-dom";

function PreviewPane({ spec, isStreaming }) {
  const navigate = useNavigate();
  return (
    <JSONUIProvider registry={registry} navigate={navigate}>
      <Renderer spec={spec} registry={registry} loading={isStreaming} />
    </JSONUIProvider>
  );
}
```

### Pattern 4: Theme-Aware Generated UI (PLAY-07)

**What:** Generated components should render with light or dark Rialto tokens
**When to use:** The preview pane must honor the user's theme selection

The `RialtoProvider` wrapping the entire app drives the theme via `data-theme` on a wrapping `<div>`. The `Renderer` output is inside that div and inherits token values automatically via CSS custom properties. No extra wrapping needed — as long as the preview pane is a descendant of `RialtoProvider`, generated Rialto components pick up the correct tokens.

**Theme toggle management:**
```tsx
// Source: packages/rialto/src/providers/useUIEnvironment.ts (verified)
// useUIEnvironment().theme returns "light" | "dark" — the resolved theme
// ThemeToggle component takes { theme, onToggle } props
import { ThemeToggle } from "@mbe/rialto";
import { useUIEnvironment } from "@mbe/rialto"; // re-exported from providers

// In AppBar actions slot:
<ThemeToggle theme={currentTheme} onToggle={toggleTheme} />
```

**Note:** `useUIEnvironment` requires a `RialtoProvider` ancestor. The toggle must update state that is passed back to `RialtoProvider theme` prop. Lift the theme state to `main.tsx` or a top-level provider.

### Pattern 5: Prompt History (PLAY-05)

**What:** In-memory history list with 50-entry cap; clears on logout
**When to use:** `PlaygroundPage` owns history state

```tsx
interface HistoryEntry {
  id: string;
  prompt: string;
  spec: Spec;
  rawLines: string[];
  timestamp: Date;
}

// In PlaygroundPage:
const [history, setHistory] = useState<HistoryEntry[]>([]);
const [activeId, setActiveId] = useState<string | null>(null);

// On stream complete (useUIStream onComplete):
const addToHistory = (prompt: string, spec: Spec, rawLines: string[]) => {
  const entry: HistoryEntry = { id: crypto.randomUUID(), prompt, spec, rawLines, timestamp: new Date() };
  setHistory((prev) => [entry, ...prev].slice(0, 50));
  setActiveId(entry.id);
};

// On logout:
const { signOut } = useAuth();
const handleSignOut = () => {
  setHistory([]);
  setActiveId(null);
  signOut();
};
```

### Pattern 6: JSON Inspector Auto-Scroll

**What:** Log-viewer pattern — auto-follow when at bottom, pause when user scrolls up
**When to use:** `JsonInspector` component

```tsx
// Standard log-viewer scroll pattern
const containerRef = useRef<HTMLDivElement>(null);
const [autoScroll, setAutoScroll] = useState(true);

// Scroll to bottom when new lines arrive (only if autoScroll is on)
useEffect(() => {
  if (autoScroll && containerRef.current) {
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }
}, [rawLines, autoScroll]);

// Detect manual scroll up
const handleScroll = () => {
  const el = containerRef.current;
  if (!el) return;
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 10;
  setAutoScroll(atBottom);
};
```

### Pattern 7: wrangler.toml for Workers Static Assets

**What:** Minimal wrangler.toml following the established pattern
**When to use:** `apps/gen/wrangler.toml`

```toml
# Source: apps/hospitality/wrangler.toml (verified)
name = "mattbutlerengineering-gen"
compatibility_date = "2026-03-25"

[assets]
directory = "./dist"
not_found_handling = "single-page-application"
```

### Pattern 8: Edge Router /gen Route

**What:** Add `/gen` branch to `infrastructure/worker/edge-router.js`
**When to use:** After the gen Worker is deployed via wrangler CI

```js
// Source: edge-router.js lines 50-70 (verified pattern for /hospitality, /rialto)
if (url.pathname.startsWith("/gen")) {
  binding = env.GEN;
  prefix = "/gen";
}
```

And in `infrastructure/pulumi/index.ts`, uncomment the GEN Service Binding:
```ts
// Line 218 — uncomment:
{ name: "GEN", service: "mattbutlerengineering-gen" },
```

### Anti-Patterns to Avoid

- **`BrowserRouter` instead of `createBrowserRouter`:** Causes basename stripping issues on deep links (documented in hospitality main.tsx comments). Always use `createBrowserRouter` with `{ basename: "/gen" }`.
- **Importing `@mbe/rialto-catalog` index from the app:** The index barrel includes `registry.tsx` (browser-only) and the catalog. Both are safe client-side. But do NOT use the `catalog` subpath import from the frontend — it re-exports Zod schemas. Use `{ registry } from "@mbe/rialto-catalog"` (index) for the frontend.
- **Calling `useUIEnvironment()` outside `<RialtoProvider>`:** Will throw. Always use inside the provider tree.
- **Calling `useToast()` outside `<ToastProvider>`:** Toast is not in the json-render registry (excluded by design). Do not use Toast in generated specs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Progressive JSONL spec assembly | Custom SSE parser + spec builder | `useUIStream` from `@json-render/react` | Handles chunked parsing, spec diff application, abort, and error recovery |
| Rendering JSON spec as React components | Custom JSON → React mapper | `Renderer` + `JSONUIProvider` + `registry` from `@mbe/rialto-catalog` | Already built in Phase 12 with 25+ Rialto components |
| Theme detection + token application | Manual CSS variable injection | `RialtoProvider` + Rialto CSS tokens | Tokens cascade through CSS; `data-theme` attribute switches light/dark |
| Relative timestamps | Custom date formatter | `Intl.RelativeTimeFormat` (built-in) | No library needed; standard browser API |
| Auth token injection for fetch | Custom fetch wrapper | Augment `useUIStream` by passing a custom fetch option, or use `useAccessToken` in a wrapper component | See Pitfall 3 |

**Key insight:** The entire streaming + rendering stack was already assembled in Phases 12-13. Phase 14 is primarily UI wiring, not infrastructure building.

## Common Pitfalls

### Pitfall 1: useUIStream Does Not Inject Auth Tokens

**What goes wrong:** `useUIStream` calls `fetch(api, { method: "POST", body })` without Authorization headers. The backend returns 401.
**Why it happens:** `useUIStream` accepts only `{ api, onComplete, onError }` — no token hook.
**How to avoid:** The `send` function from `useUIStream` won't work directly. Instead, build a thin wrapper that calls `fetch` directly with the Bearer token:

```tsx
// Custom hook wrapping useUIStream's send() is not possible — send() is internal.
// Alternative: bypass useUIStream.send() and manage the SSE fetch manually,
// OR use useUIStream against a relative URL (/api/gen/ui) and rely on a
// Vite dev proxy / edge router that doesn't re-check auth at the proxy layer.
// HOWEVER: the backend requires JWT auth (GEN-03). The token MUST be in the header.

// Recommended: useUIStream does not support custom headers in v0.15.0.
// Build a custom useGenStream hook that:
// 1. Uses useAccessToken() from @mbe/auth/react
// 2. Calls fetch() with Authorization header
// 3. Reads the response stream using ReadableStream API
// 4. Uses buildSpecFromParts() or manual JSONL parsing to assemble the spec
// Mirror useUIStream's return shape for drop-in compatibility.
```

**Warning signs:** 401 responses in the network tab; blank preview with no error shown.

### Pitfall 2: RialtoProvider Theme Is Not Controlled from Outside

**What goes wrong:** `RialtoProvider` starts with `theme="light"` and there's no way to change it at runtime — the toggle button does nothing.
**Why it happens:** `RialtoProvider` reads the `theme` prop but React won't re-render unless the prop value changes. If `theme` is a hardcoded string, it never changes.
**How to avoid:** Lift `theme` state to `main.tsx`, pass it as a prop, and thread a `setTheme` callback down to the AppBar's ThemeToggle. Use a lightweight React context if passing through many layers.

### Pitfall 3: localStorage Theme Persistence

**What goes wrong:** User toggles to dark mode, navigates away, returns to find light mode again (theme not persisted).
**Why it happens:** Theme is in React state which resets on page reload.
**How to avoid:** Persist theme selection to `localStorage`. Initialize state with `localStorage.getItem("mbe-theme") ?? "light"`. Update `localStorage` whenever theme changes. This is a UX detail but worth capturing in Wave 0.

### Pitfall 4: GEN Service Binding Race Condition

**What goes wrong:** `pulumi up` fails because `edge-router.js` references `mattbutlerengineering-gen` Worker that doesn't exist yet.
**Why it happens:** The GEN binding is commented out in Pulumi pending Phase 14. If the binding is uncommented before the Worker is deployed, Pulumi will error.
**How to avoid:** Deploy `apps/gen` via `wrangler deploy` FIRST (Step 1), THEN uncomment the GEN binding in Pulumi and run `pulumi up` (Step 2). This ordering is already documented in the Pulumi comment.

### Pitfall 5: Edge Router Doesn't Handle /gen Path

**What goes wrong:** Navigating to `mattbutlerengineering.com/gen` falls through to the MARKETING Worker (catch-all), which serves the marketing site, not the playground.
**Why it happens:** Edge router has no `/gen` branch yet.
**How to avoid:** Add the `/gen` branch to `edge-router.js` in the same commit as the Pulumi binding change.

### Pitfall 6: `@mbe/rialto-catalog` Missing From apps/gen Dependencies

**What goes wrong:** `registry` import fails to resolve at build time.
**Why it happens:** The catalog package must be listed in `apps/gen/package.json` dependencies.
**How to avoid:** Include `"@mbe/rialto-catalog": "workspace:*"` in `package.json`.

### Pitfall 7: Stale Auto-Scroll State During Fast Streaming

**What goes wrong:** Auto-scroll jumps erratically when chunks arrive faster than renders.
**Why it happens:** Multiple `rawLines` state updates fire in quick succession; `useEffect` runs after each but scroll position checks may be stale.
**How to avoid:** Use a `useRef` for the auto-scroll flag rather than `useState` — ref reads are always synchronous and don't cause extra renders.

## Code Examples

### useUIStream Return Shape (Verified API)
```typescript
// Source: @json-render/react 0.15.0 dist/index.d.ts (verified in node_modules)
interface UseUIStreamReturn {
  spec: Spec | null;
  isStreaming: boolean;
  error: Error | null;
  usage: TokenUsage | null;        // { promptTokens, completionTokens, totalTokens }
  rawLines: string[];              // Raw JSONL lines from server
  send: (prompt: string, context?: Record<string, unknown>) => Promise<void>;
  clear: () => void;
}
```

### ThemeToggle Component API
```tsx
// Source: packages/rialto/src/components/ThemeToggle/ThemeToggle.tsx (verified)
import { ThemeToggle } from "@mbe/rialto";

<ThemeToggle
  theme="light" | "dark"
  onToggle={() => void}
/>
```

### useUIEnvironment Hook
```tsx
// Source: packages/rialto/src/providers/useUIEnvironment.ts (verified)
import { useUIEnvironment } from "@mbe/rialto"; // check if re-exported

const { theme, vibe, device } = useUIEnvironment();
// theme: "light" | "dark" — always resolved (never "system")
```

**Note:** `useUIEnvironment` must be checked for export in `packages/rialto/src/lib-entry.ts`. Current lib-entry exports `export * from "./components"` and providers are under `src/providers/` — verify the export path before use. May need direct import: `import { useUIEnvironment } from "@mbe/rialto/providers"` or similar.

### Vite Config for apps/gen
```typescript
// Source: apps/hospitality/vite.config.ts (established pattern)
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": resolve(__dirname, "./src") } },
  base: "/gen/",
  server: {
    port: 3005,  // Next available port per CLAUDE.md convention
    proxy: {
      "/api": {
        target: "http://localhost:3003",  // Agent service
        changeOrigin: true,
      },
    },
  },
});
```

### Auth0 Environment Variables for Vite Build
```yaml
# Source: .github/workflows/deploy-static.yml hospitality job (established pattern)
VITE_AUTH_AUTHORITY: https://dev-ytbgmz5ls3wh4xdx.us.auth0.com
VITE_AUTH_CLIENT_ID: ${{ secrets.AUTH0_GEN_CLIENT_ID }}  # New secret needed
VITE_AUTH_AUDIENCE: https://api.mattbutlerengineering.com
VITE_AUTH_REDIRECT_URI: https://mattbutlerengineering.com/gen/callback
VITE_API_URL: https://mattbutlerengineering.com
```

**Note:** A new Auth0 application "mattbutlerengineering-gen" must be registered and its client ID stored as `AUTH0_GEN_CLIENT_ID` GitHub secret. Same SPA type as hospitality app.

### Relative Timestamp Helper
```typescript
// Source: standard browser API (no library needed)
function relativeTime(date: Date): string {
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const diffMs = date.getTime() - Date.now();
  const diffSecs = Math.round(diffMs / 1000);
  const diffMins = Math.round(diffSecs / 60);
  if (Math.abs(diffMins) < 60) return rtf.format(diffMins, "minute");
  const diffHours = Math.round(diffMins / 60);
  return rtf.format(diffHours, "hour");
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Cloudflare Pages for static sites | Workers Static Assets + Service Bindings | Phase 13 infra | Eliminates stale HTML after deploys via CDN bypass |
| `BrowserRouter` | `createBrowserRouter` with basename | Phase 13 (hospitality) | Fixes basename stripping on deep links |
| Manual SSE parsing | `useUIStream` from `@json-render/react` | Phase 12-13 | Removes custom streaming logic |

**Deprecated/outdated:**
- `vite-plugin-pwa`: Hospitality uses it; gen app does NOT need a PWA manifest (it's a dev tool). Omit for simplicity.

## Open Questions

1. **useUIStream token injection**
   - What we know: `useUIStream` does plain fetch with no auth header customization in v0.15.0
   - What's unclear: Whether the API signature allows a custom `fetcher` option not shown in type definitions (need to check source)
   - Recommendation: Plan to build a thin `useGenStream` hook that mirrors `useUIStream`'s return shape but uses `useAccessToken()` to inject the Bearer token. This is a small amount of code and avoids monkey-patching.

2. **Auth0 app registration for gen**
   - What we know: Each Vite app needs its own Auth0 SPA application with correct callback URLs
   - What's unclear: Whether the existing hospitality Auth0 app can be reused (allowed origins would need `/gen/callback`)
   - Recommendation: Create a separate Auth0 app (`mattbutlerengineering-gen`) for clean separation. Add `AUTH0_GEN_CLIENT_ID` to GitHub secrets before first deploy.

3. **useUIEnvironment export path from @mbe/rialto**
   - What we know: `packages/rialto/src/lib-entry.ts` exports `export * from "./components"` — `useUIEnvironment` is in `providers/`, not `components/`
   - What's unclear: Whether `useUIEnvironment` is re-exported via the components barrel
   - Recommendation: Check `packages/rialto/src/components/index.ts` for the export. If not present, import from `@mbe/rialto` directly via the package exports map, or add the export in Wave 0.

4. **INFRA-02 scope**
   - What we know: INFRA-02 is marked Pending. Static app Workers are deployed by `wrangler` in CI, not via Pulumi. The Pulumi work for Phase 14 is only: uncomment GEN binding + update edge router.
   - Recommendation: INFRA-02 should be interpreted as "add wrangler deploy for gen in CI + add GEN Service Binding in Pulumi" rather than a new Pulumi resource. Confirm this interpretation in planning.

## Sources

### Primary (HIGH confidence)
- `node_modules/@json-render/react@0.15.0/dist/index.d.ts` — full type definitions for `useUIStream`, `Renderer`, `JSONUIProvider`, `defineRegistry`
- `packages/rialto-catalog/src/registry.tsx` — verified registry pattern and component mapping
- `packages/rialto-catalog/src/__tests__/registry.test.tsx` — verified `JSONUIProvider` + `Renderer` usage
- `apps/hospitality/src/main.tsx` — verified bootstrap pattern for Vite SPA with auth
- `apps/hospitality/vite.config.ts` — verified Vite config pattern with proxy
- `apps/hospitality/wrangler.toml` — verified wrangler Static Assets config
- `.github/workflows/deploy-static.yml` — verified CI deploy pattern
- `infrastructure/worker/edge-router.js` — verified routing + GEN binding comment location
- `infrastructure/pulumi/index.ts` — verified GEN binding comment location + service binding pattern
- `packages/rialto/src/components/ThemeToggle/ThemeToggle.tsx` — verified ThemeToggle API
- `packages/rialto/src/providers/useUIEnvironment.ts` — verified useUIEnvironment shape
- `packages/rialto/src/providers/RialtoProvider.tsx` — verified theme prop + data-theme behavior

### Secondary (MEDIUM confidence)
- `packages/auth/src/react/hooks.ts` — `useAccessToken()` returns `string | null`; will be used for Bearer token injection

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and tested in prior phases
- Architecture: HIGH — directly modeled on verified hospitality app pattern
- Pitfalls: HIGH — most discovered from reading existing code; Pitfall 1 (token injection) confirmed from type definitions
- Streaming API: HIGH — verified from `@json-render/react` dist type definitions in node_modules

**Research date:** 2026-03-27
**Valid until:** 2026-05-01 (stable libraries; @json-render/react is pinned at 0.15.0)
