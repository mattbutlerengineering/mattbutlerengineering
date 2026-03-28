---
phase: 14-playground-app
verified: 2026-03-28T16:30:00Z
status: passed
score: 15/15 must-haves verified
re_verification: null
gaps: []
human_verification:
  - test: "Submit a prompt and observe progressive rendering"
    expected: "Rialto components appear incrementally in PreviewPane as JSONL arrives; pulse bar shows during TTFT"
    why_human: "Requires live agent-api streaming endpoint at /api/gen/ui; cannot simulate JSONL stream programmatically"
  - test: "Click Stop during streaming"
    expected: "Streaming aborts; partial spec remains visible in PreviewPane and JsonInspector"
    why_human: "AbortController behavior requires real fetch in a browser"
  - test: "Toggle theme via AppShell ThemeToggle"
    expected: "App switches light/dark; generated Rialto component colors follow the new theme tokens"
    why_human: "RialtoProvider controlled theme propagation is a visual/runtime behavior"
  - test: "Prompt history panel behavior"
    expected: "Each completed generation appears in the left panel with truncated text and relative timestamp; clicking an entry shows its cached spec without re-generation"
    why_human: "State transitions and cached replay require manual interaction"
  - test: "Production serve at mattbutlerengineering.com/gen"
    expected: "Login page loads after pulumi up activates GEN Service Binding"
    why_human: "Requires user to complete Auth0 SPA app setup and run wrangler deploy + pulumi up (documented in 14-03-SUMMARY.md)"
---

# Phase 14: Playground App Verification Report

**Phase Goal:** A standalone Vite SPA at /gen lets authenticated users type natural language prompts and watch Rialto components render progressively as the AI streams a JSON spec; the app shows the raw spec, remembers prompts within the session, and respects the current theme
**Verified:** 2026-03-28T16:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | apps/gen builds as a Vite SPA at /gen with Auth0 login gating | VERIFIED | `vite.config.ts` base="/gen/", `App.tsx` has full auth gate (isLoading/error/!isAuthenticated branches), `package.json` name=@mbe/gen |
| 2 | Authenticated users reach the three-column playground layout | VERIFIED | `main.tsx` wires App > Outlet > PlaygroundPage; PlaygroundPage renders AppShell > CSS Grid layout with HistoryPanel, PreviewPane, JsonInspector |
| 3 | User can type a prompt and submit it to generate UI | VERIFIED | `PromptBar.tsx` has textarea with Enter-submit and Generate button; calls `onSubmit(prompt)` → `PlaygroundPage.handleSubmit` → `useGenStream.send()` |
| 4 | Rialto components appear progressively in PreviewPane as JSONL arrives | VERIFIED | `PreviewPane.tsx` wraps `Renderer` in `JSONUIProvider` with rialto-catalog `registry`; `useGenStream` calls `flatToTree()` after each parsed JSONL line and `setSpec` progressively |
| 5 | Submit button becomes a Stop button during streaming; clicking it aborts and keeps partial results | VERIFIED | `PromptBar.tsx` conditionally renders Stop (secondary variant, data-stop) when `isStreaming`; `stop()` calls `abortControllerRef.current?.abort()` and AbortError is caught silently preserving partial spec |
| 6 | JSON inspector shows raw spec updating in real time with auto-scroll that pauses on manual scroll-up | VERIFIED | `JsonInspector.tsx` uses `useRef<boolean>(true)` autoScrollRef, `onScroll` updates it via bottom-proximity check, `useEffect` on `rawLines.length` scrolls to bottom when enabled |
| 7 | Prompt history shows entries with truncated text and relative timestamps | VERIFIED | `HistoryPanel.tsx` slices prompt to 60 chars with ellipsis, calls `relativeTime(entry.timestamp)`; `relative-time.ts` uses `Intl.RelativeTimeFormat` |
| 8 | Clicking a history entry shows cached result without re-generation | VERIFIED | `PlaygroundPage.tsx` sets `activeId` on history select; `displaySpec = activeEntry?.spec ?? spec` and `displayRawLines = activeEntry?.rawLines ?? rawLines` when not streaming |
| 9 | Errors display inline with Try Again | VERIFIED | `PreviewPane.tsx` renders Rialto `Alert variant="error"` plus "Try again" Button calling `onRetry` |
| 10 | Generated UIs render with the current light/dark theme tokens | VERIFIED | `ThemeContext.tsx` provides `{theme, toggleTheme}` with localStorage persistence; `main.tsx` ThemedApp bridge passes `theme` to `RialtoProvider theme={theme}`; `AppShell.tsx` calls `useTheme()` to wire ThemeToggle |
| 11 | History clears on logout (PLAY-05) | VERIFIED | `PlaygroundPage.handleSignOut` calls `setHistory([])`, `setActiveId(null)` before `signOut()` |
| 12 | CI deploys gen app on push to apps/gen/** | VERIFIED | `deploy-static.yml` has `deploy-gen` job; push path filter includes `apps/gen/**`; wrangler deploy with `AUTH0_GEN_CLIENT_ID` secret |
| 13 | Edge router routes /gen* to GEN Service Binding | VERIFIED | `edge-router.js` line 63-65: `else if (url.pathname.startsWith("/gen")) { binding = env.GEN; prefix = "/gen"; }` |
| 14 | GEN Service Binding is active (uncommented) in Pulumi | VERIFIED | `infrastructure/pulumi/index.ts` line 217: `{ name: "GEN", service: "mattbutlerengineering-gen" }` (no comment prefix) |
| 15 | useGenStream injects Auth0 Bearer token | VERIFIED | `useGenStream.ts` line 87: `Authorization: \`Bearer ${accessToken}\`` — only set when accessToken is non-null |

**Score:** 15/15 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/gen/package.json` | Package manifest @mbe/gen with workspace deps | VERIFIED | name="@mbe/gen"; deps: @json-render/react, @mbe/auth, @mbe/rialto, @mbe/rialto-catalog |
| `apps/gen/vite.config.ts` | base="/gen/", port 3005, /api proxy to :3003 | VERIFIED | All three confirmed |
| `apps/gen/wrangler.toml` | name=mattbutlerengineering-gen, SPA not_found_handling | VERIFIED | Exact match |
| `apps/gen/src/main.tsx` | StrictMode > ThemeProvider > ThemedApp > RialtoProvider > AuthProvider > RouterProvider, basename="/gen" | VERIFIED | Full provider tree present; createBrowserRouter with basename="/gen" |
| `apps/gen/src/App.tsx` | Auth gate with login prompt; exports App, CallbackRedirect | VERIFIED | All auth states handled; both exports present |
| `apps/gen/src/hooks/useGenStream.ts` | Streaming hook with Auth0 injection, stop(), flatToTree JSONL parsing | VERIFIED | 199 lines; full implementation |
| `apps/gen/src/contexts/ThemeContext.tsx` | ThemeProvider + useTheme with localStorage key mbe-gen-theme | VERIFIED | localStorage key correct; toggleTheme updates both state and storage |
| `apps/gen/src/types.ts` | HistoryEntry interface | VERIFIED | Exact shape as specified |
| `apps/gen/src/pages/PlaygroundPage.tsx` | Main page owning useGenStream, history state, active entry state | VERIFIED | 114 lines; all state and handlers present |
| `apps/gen/src/components/AppShell.tsx` | AppBar with ThemeToggle, Avatar, logout | VERIFIED | All three present; useTheme() wired |
| `apps/gen/src/components/HistoryPanel.tsx` | Scrollable history with truncation and relative time | VERIFIED | 60-char truncation, relativeTime() calls |
| `apps/gen/src/components/PreviewPane.tsx` | JSONUIProvider + Renderer with TTFT pulse, error, empty states | VERIFIED | All four states: pulse, error+retry, empty, renderer |
| `apps/gen/src/components/JsonInspector.tsx` | Syntax-highlighted JSONL viewer with auto-scroll and copy | VERIFIED | React-based highlightJson(), autoScrollRef pattern, copy button |
| `apps/gen/src/components/PromptBar.tsx` | Textarea with Enter-submit, Generate/Stop toggle | VERIFIED | Enter-submit (non-Shift), Generate/Stop conditional render |
| `apps/gen/src/utils/relative-time.ts` | Intl.RelativeTimeFormat relative time helper | VERIFIED | Exact implementation as specified |
| `.github/workflows/deploy-static.yml` | deploy-gen job with build env vars and wrangler deploy | VERIFIED | Job present at line 148; AUTH0_GEN_CLIENT_ID wired |
| `infrastructure/worker/edge-router.js` | /gen route using env.GEN Service Binding | VERIFIED | else-if branch at line 63; JSDoc updated |
| `infrastructure/pulumi/index.ts` | Uncommented GEN Service Binding | VERIFIED | Line 217, no comment prefix |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `useGenStream.ts` | `@mbe/auth/react` | `useAuth().accessToken` for Bearer header | WIRED | `const { accessToken } = useAuth()` at line 47; used in fetch headers |
| `main.tsx` | `@mbe/auth/react` | `AuthProvider` wrapping RouterProvider | WIRED | `AuthProvider` present in ThemedApp component |
| `main.tsx` | `ThemeContext.tsx` | `ThemeProvider` wrapping app tree | WIRED | `ThemeProvider` is outermost (after StrictMode) |
| `PlaygroundPage.tsx` | `useGenStream.ts` | `useGenStream({ api: '/api/gen/ui', onComplete })` | WIRED | Line 29; api="/api/gen/ui", onComplete adds to history |
| `PreviewPane.tsx` | `@mbe/rialto-catalog` | `registry` import for JSONUIProvider + Renderer | WIRED | `import { registry } from "@mbe/rialto-catalog"` at line 3 |
| `AppShell.tsx` | `ThemeContext.tsx` | `useTheme()` for ThemeToggle | WIRED | `const { theme, toggleTheme } = useTheme()` at line 17 |
| `edge-router.js` | `pulumi/index.ts` | GEN Service Binding name must match | WIRED | Both use "GEN" as binding name, "mattbutlerengineering-gen" as service |
| `deploy-static.yml` | `apps/gen/wrangler.toml` | `wrangler deploy --config apps/gen/wrangler.toml` | WIRED | Line 175: exact path reference |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| PLAY-01 | 14-01, 14-03 | apps/gen Vite SPA served at /gen with Auth0 login | SATISFIED | App.tsx auth gate; vite.config base="/gen/"; wrangler.toml + edge-router /gen route |
| PLAY-02 | 14-02 | Prompt bar for natural language input with submit action | SATISFIED | PromptBar.tsx with textarea, Enter-submit, and Generate button wired to useGenStream.send() |
| PLAY-03 | 14-02, 14-03 | Streaming preview pane that renders Rialto components progressively as JSONL arrives | SATISFIED | PreviewPane + useGenStream flatToTree-per-line + JSONUIProvider with rialto-catalog registry |
| PLAY-04 | 14-02 | JSON spec inspector showing the raw generated spec | SATISFIED | JsonInspector.tsx with syntax highlighting, auto-scroll, copy button |
| PLAY-05 | 14-02 | In-session prompt history (survives page navigation, clears on logout) | SATISFIED | useState history in PlaygroundPage; handleSignOut clears history before signOut() |
| PLAY-06 | 14-01, 14-02 | Loading and error states for generation (spinner during TTFT, error display on failure) | SATISFIED | TTFT pulse animation in PreviewPane.module.css; Alert+retry in PreviewPane.tsx; error state in useGenStream |
| PLAY-07 | 14-02 | Theme-aware rendering (generated UIs respect current light/dark mode) | SATISFIED | ThemeProvider > ThemedApp > RialtoProvider controlled theme; ThemeToggle in AppShell |

All 7 requirements satisfied. No orphaned requirements found.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `PreviewPane.tsx` | 17 | Comment uses word "placeholder" (doc comment, not code) | Info | None — describes the TTFT loading state UI element, not a code stub |
| `PromptBar.tsx` | 42 | `placeholder=` HTML attribute | Info | None — legitimate textarea placeholder text |

No blockers. No stubs. No empty implementations. No TODO/FIXME comments in implementation code.

---

## Deviations from Plan (All Auto-Fixed)

The following deviations were resolved during execution and do not affect goal achievement:

1. **Rialto Button has no "danger" variant** — Stop button uses `variant="secondary"` with CSS `[data-stop]` override. Visual intent preserved.
2. **handlers from rialto-catalog is a factory function** — Omitted from JSONUIProvider. Playground is display-only; no action dispatch needed.
3. **FlatElement not exported from @json-render/react** — Derived via `Parameters<typeof flatToTree>[0][number]`. Type-safe, no phantom dependency.
4. **rawLinesRef ref-during-render lint error** — Moved to `useEffect(() => { rawLinesRef.current = rawLines; })`. Functionally equivalent.

---

## Human Verification Required

### 1. Progressive Streaming Render

**Test:** Run `pnpm dev --filter=@mbe/gen`, sign in, type "Show a user profile card", click Generate
**Expected:** Pulse bar shows immediately; then Rialto components appear incrementally as JSONL arrives; JsonInspector shows each line in real time with auto-scroll
**Why human:** Requires live agent-api at localhost:3003 streaming /api/gen/ui; cannot simulate live ReadableStream in static analysis

### 2. Stop During Streaming

**Test:** Click Generate on a complex prompt; click Stop within 2 seconds
**Expected:** Streaming aborts; PreviewPane shows whatever was rendered so far (partial spec preserved); no error alert appears; Stop button returns to Generate
**Why human:** AbortController behavior and partial spec preservation requires real browser fetch execution

### 3. Theme Toggle and Generated UI

**Test:** Click the ThemeToggle in AppShell; then generate a UI
**Expected:** App shell switches light/dark immediately; the generated Rialto components in PreviewPane use the new theme's color tokens
**Why human:** RialtoProvider controlled theme propagation is a visual runtime behavior

### 4. History Review Mode

**Test:** Generate two different prompts; click the first entry in HistoryPanel while not streaming
**Expected:** PreviewPane shows the cached spec from the first generation; JsonInspector shows the cached rawLines; no new network request fires
**Why human:** Display mode switching (live vs cached) and absence of network requests requires manual observation

### 5. Production Deploy (Operational — User Action Required)

**Test:** Complete the checklist from 14-03-SUMMARY.md:
1. Create Auth0 SPA application "mattbutlerengineering-gen" with callback URL https://mattbutlerengineering.com/gen/callback
2. Add `AUTH0_GEN_CLIENT_ID` GitHub secret
3. Run `npx wrangler@3 deploy --config apps/gen/wrangler.toml` (creates the Worker)
4. Run `cd infrastructure/pulumi && pulumi up` (activates GEN Service Binding)
5. Open https://mattbutlerengineering.com/gen

**Expected:** Login page loads; after sign-in, full three-column playground is available
**Why human:** Requires external service configuration (Auth0) and infrastructure ops (wrangler, pulumi) that cannot be verified statically

---

## Summary

Phase 14 goal is fully achieved in code. All 15 observable truths are verified against the actual codebase — not just the SUMMARY claims.

The complete delivery:
- **Plan 01:** `apps/gen` scaffold with auth gate, ThemeProvider, and `useGenStream` custom hook with Auth0 Bearer injection, AbortController stop, and flatToTree progressive JSONL parsing
- **Plan 02:** Three-column playground layout (HistoryPanel | PreviewPane | JsonInspector), AppShell with ThemeToggle, PromptBar with Generate/Stop toggle, full state wiring in PlaygroundPage with 50-entry capped history and display mode switching
- **Plan 03:** CI deploy-gen job, edge-router /gen route, Pulumi GEN binding uncommented

Production serve requires 5 user actions (Auth0 app creation, GitHub secret, wrangler deploy, pulumi up) documented in 14-03-SUMMARY.md. These are operational prerequisites, not implementation gaps.

---

_Verified: 2026-03-28T16:30:00Z_
_Verifier: Claude (gsd-verifier)_
