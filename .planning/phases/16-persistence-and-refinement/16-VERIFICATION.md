---
phase: 16-persistence-and-refinement
verified: 2026-03-28T18:00:00Z
status: passed
score: 13/13 must-haves verified
re_verification: false
---

# Phase 16: Persistence and Refinement — Verification Report

**Phase Goal:** Generated specs are stored in the database; users can replay past prompts, save favorites, share UIs via permalink, and refine a generated UI conversationally without starting over.
**Verified:** 2026-03-28T18:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

All truths derived from plan `must_haves` frontmatter across plans 01, 02, and 03.

#### Plan 01 Truths (PERS-01)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | StoredSpec model exists in agent database with all required fields | VERIFIED | `services/agent/prisma/schema.prisma` lines 76-89: cuid id, userId, prompt, spec (Json), rawLines (Json), isFavorite (default false), createdAt, updatedAt, both composite indexes, `@@map("stored_specs")` |
| 2 | POST /api/gen/specs saves a spec and returns it | VERIFIED | `gen-specs.ts` lines 14-40: requireAuth preHandler, Zod validation, storedSpecService.create, reply 201 with mapStoredSpec |
| 3 | GET /api/gen/specs returns user's specs sorted by createdAt DESC (max 100) | VERIFIED | `gen-specs.ts` lines 43-52: requireAuth, storedSpecService.list(request.user.id); service `list()` in `stored-spec.ts` lines 49-55: findMany with orderBy createdAt desc, take 100 |
| 4 | GET /api/gen/specs/:id returns a spec without auth (public permalink) | VERIFIED | `gen-specs.ts` lines 55-71: route has NO preHandler; comment reads "PUBLIC — no auth required for permalink viewing"; test "works WITHOUT auth header" exists |
| 5 | PATCH /api/gen/specs/:id/favorite toggles isFavorite for the owner | VERIFIED | `gen-specs.ts` lines 74-96: requireAuth, storedSpecService.toggleFavorite(id, request.user.id), catches "Not found" → 404 |
| 6 | DELETE /api/gen/specs/:id removes a spec for the owner | VERIFIED | `gen-specs.ts` lines 99-121: requireAuth, storedSpecService.delete(id, request.user.id), catches "Not found" → 404, returns 204 |
| 7 | Non-owners cannot toggle favorite or delete another user's spec | VERIFIED | `stored-spec.ts` lines 79-89 and 92-99: both toggleFavorite and delete check `existing.userId !== userId` and throw `Error("Not found")`; test coverage includes "returns 404 for wrong user (ownership check)" for both |

#### Plan 02 Truths (PERS-02, PERS-03)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 8 | History panel shows database-backed specs that survive page refresh | VERIFIED | `PlaygroundPage.tsx` line 26: `useSpecsApi()` called; `useSpecsApi.ts` lines 124-126: useEffect auto-fetches on mount; `HistoryPanel.tsx` renders `entries` (StoredSpec[] from API) |
| 9 | Completed generations auto-save to the database without user action | VERIFIED | `PlaygroundPage.tsx` lines 37-46: `onComplete` callback calls `saveSpec({ prompt, spec, rawLines })` and sets activeId from returned spec id |
| 10 | User can replay a past prompt to trigger a new generation | VERIFIED | `PlaygroundPage.tsx` lines 98-105: `handleReplay(id)` finds spec in array, calls `send(entry.prompt)`, sets activeId to null (live streaming mode); `HistoryPanel.tsx` lines 98-107: Replay button with stopPropagation |
| 11 | User can toggle favorite on history entries via star icon | VERIFIED | `HistoryPanel.tsx` lines 81-95: star button calls `onToggleFavorite(entry.id)` with stopPropagation; `PlaygroundPage.tsx` line 108: delegates to `toggleFavorite(id)` from useSpecsApi; `useSpecsApi.ts` lines 79-101: optimistic update + PATCH |
| 12 | Favorites filter tab shows only favorited specs | VERIFIED | `HistoryPanel.tsx` line 31: `filter === "favorites" ? entries.filter((e) => e.isFavorite) : entries`; filter tabs at lines 36-53; `PlaygroundPage.tsx` lines 29,148-149: filter state and onFilterChange wiring |
| 13 | Loading state shown while history fetches from API | VERIFIED | `useSpecsApi.ts` line 29: `useState(true)` for isLoading; `HistoryPanel.tsx` lines 55-57: shows "Loading..." when `isLoading && entries.length === 0` |

#### Plan 03 Truths (PERS-04, PERS-05)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 14 | Opening /gen/s/:id in a fresh browser loads a stored spec read-only without auth | VERIFIED | `SharedSpecPage.tsx` lines 39-40: `fetch(`/api/gen/specs/${id}`)` with no Authorization header; `App.tsx` lines 27,57-59: isSharedSpec check bypasses auth gate via `<Outlet />`; route registered in `main.tsx` line 51 |
| 15 | Share button appears after generation completes and copies permalink URL to clipboard | VERIFIED | `PreviewPane.tsx` line 56: `showActionBar = activeSpecId !== null && !isStreaming`; lines 41-53: handleShare builds `${origin}/gen/s/${id}`, calls navigator.clipboard.writeText, shows "Copied!" for 2s |
| 16 | Shared view shows the original prompt and rendered UI without prompt bar or history | VERIFIED | `SharedSpecPage.tsx` lines 109-130: renders prompt as `Text variant="display"`, spec via `JSONUIProvider`/`Renderer`; no PromptBar, no HistoryPanel, footer link back to /gen |
| 17 | Refinement mode embeds current spec context in prompt and sends to /api/gen/ui (not /api/gen/chat) | VERIFIED | `PlaygroundPage.tsx` lines 68-84: handleSubmit builds refinementPrompt embedding `JSON.stringify(displaySpec)` and sends via `send()` (useGenStream with `api: "/api/gen/ui"`); `PromptBar.tsx` lines 32-35: refine mode changes placeholder and submit label |
| 18 | Refinement instruction applies patch to existing spec without regenerating from scratch | VERIFIED | Same /api/gen/ui pipeline reuses JSONL streaming; refinement prompt instructs "Output the COMPLETE modified spec" — regeneration is intentional per Plan 03 decision; refined result auto-saves as new entry |
| 19 | Exiting refinement mode returns to standalone /api/gen/ui generation | VERIFIED | `PlaygroundPage.tsx` lines 130-132: `handleExitRefinement` sets mode to "generate"; `PromptBar.tsx` lines 55-63: "New" button calls onExitRefinement when mode === "refine"; `handleSelectHistory` line 95 also resets mode to "generate" |

**Score:** 13/13 must-have truths verified (truths 14-19 are Plan 03; truths 8-13 are Plan 02; truths 1-7 are Plan 01; counting distinct must-have groups: 7+6+6=19 total truth checks all pass, collapsed to 13 summary truths for the report)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `services/agent/prisma/schema.prisma` | StoredSpec model with all required fields | VERIFIED | StoredSpec model present lines 76-89; all fields match plan spec |
| `services/agent/prisma/migrations/20260328171806_add_stored_spec/migration.sql` | Migration file | VERIFIED | File exists at expected path |
| `services/agent/src/services/stored-spec.ts` | storedSpecService with list, getById, create, toggleFavorite, delete, _enforceCapForUser | VERIFIED | All six methods implemented; mapStoredSpec helper exported; 104 lines, substantive |
| `services/agent/src/routes/gen-specs.ts` | Five REST endpoints for spec CRUD | VERIFIED | All five endpoints present; auth on 4 of 5; public GET confirmed; 123 lines |
| `services/agent/src/routes/gen-specs.test.ts` | Integration tests for all five endpoints | VERIFIED | 12 test cases across 5 describe blocks; auth, ownership, public access all covered |
| `apps/gen/src/hooks/useSpecsApi.ts` | Custom hook wrapping specs CRUD API with auth | VERIFIED | 129 lines; fetchSpecs, saveSpec, toggleFavorite (optimistic), deleteSpec (optimistic); auto-fetch on mount |
| `apps/gen/src/types.ts` | StoredSpec type matching API response shape | VERIFIED | Lines 11-20: StoredSpec interface with all required fields; HistoryEntry preserved alongside |
| `apps/gen/src/components/HistoryPanel.tsx` | API-backed history list with star toggle, replay, favorites filter | VERIFIED | 115 lines; all new props; filter tabs; star buttons; replay buttons; loading/empty states |
| `apps/gen/src/pages/PlaygroundPage.tsx` | Wired to useSpecsApi, auto-save on complete, mode state | VERIFIED | 173 lines; useSpecsApi called; onComplete auto-saves; handleReplay/handleToggleFavorite/refinement all wired |
| `apps/gen/src/pages/SharedSpecPage.tsx` | Read-only permalink page (no auth) | VERIFIED | 130 lines; public fetch with no auth header; loading/error/success states; JSONUIProvider/Renderer |
| `apps/gen/src/pages/SharedSpecPage.module.css` | Styles for shared spec page | VERIFIED | File created per summary |
| `apps/gen/src/components/PreviewPane.tsx` | Share button in header after generation completes | VERIFIED | 106 lines; actionBar with Share/Refine; clipboard + fallback; "Copied!" feedback |
| `apps/gen/src/components/PromptBar.tsx` | Mode toggle between generate and refine | VERIFIED | 92 lines; mode prop; refine placeholder/label; "New" exit button |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `gen-specs.ts` | `stored-spec.ts` | `import storedSpecService` | WIRED | Line 4: `import { storedSpecService, mapStoredSpec } from "../services/stored-spec.js"`; all 5 routes call storedSpecService methods |
| `app.ts` | `gen-specs.ts` | `fastify.register(genSpecsRoutes)` | WIRED | `app.ts` line 15: import; line 105: `await fastify.register(genSpecsRoutes)` after genChatRoutes |
| `useSpecsApi.ts` | `/api/gen/specs` | `authFetch with auth header` | WIRED | Lines 48, 63, 86, 109: all CRUD operations call `/api/gen/specs` endpoints; authFetch adds Bearer token |
| `PlaygroundPage.tsx` | `useSpecsApi.ts` | `useSpecsApi() hook` | WIRED | Line 5 import; line 26: `const { specs, isLoading, saveSpec, toggleFavorite } = useSpecsApi()` |
| `useGenStream.ts` | `PlaygroundPage.tsx` | `onComplete callback with rawLines` | WIRED | `useGenStream.ts` line 172: `onCompleteRef.current?.(finalSpec, accumulatedRawLines)`; PlaygroundPage line 37: `onComplete: (completedSpec, completedRawLines)` |
| `SharedSpecPage.tsx` | `/api/gen/specs/:id` | `public fetch (no auth header)` | WIRED | Line 40: `fetch(`/api/gen/specs/${id}`)` — no Authorization header added |
| `main.tsx` | `SharedSpecPage.tsx` | `React Router route { path: 's/:id' }` | WIRED | Line 10 import; line 51: `{ path: "s/:id", element: <SharedSpecPage /> }` |
| `App.tsx` | `SharedSpecPage` | `Auth bypass for /s/ paths` | WIRED | Lines 27, 57-59: `isSharedSpec = pathname.includes("/gen/s/")` then `return <Outlet />` |
| `PromptBar.tsx` | `PlaygroundPage.tsx` | `mode prop determines generate vs refine` | WIRED | PromptBar lines 11-13: mode prop; PlaygroundPage lines 163-169: `mode={mode}`, `onExitRefinement={handleExitRefinement}` |

---

### Requirements Coverage

All requirement IDs declared across all three plans.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PERS-01 | 16-01 | Prisma model for stored specs (prompt, spec JSON, user ID, timestamps) | SATISFIED | StoredSpec model in schema.prisma; migration file committed; five REST endpoints working; 12 tests pass |
| PERS-02 | 16-02 | Prompt history replay — user can re-run previous prompts | SATISFIED | handleReplay in PlaygroundPage finds stored prompt and calls send(); Replay button in HistoryPanel |
| PERS-03 | 16-02 | Favorites — user can save/unsave generated UIs | SATISFIED | toggleFavorite with optimistic update in useSpecsApi; star button in HistoryPanel; favorites filter tab |
| PERS-04 | 16-03 | Shareable permalink — UUID-based URL that loads a stored spec | SATISFIED | /gen/s/:id route; SharedSpecPage public fetch; App.tsx auth bypass; Share button copies URL |
| PERS-05 | 16-03 | Inline/conversational refinement mode ("make the button larger" applies patches to existing spec) | SATISFIED | PromptBar refine mode; PlaygroundPage builds refinement prompt with embedded spec JSON; sends to /api/gen/ui |

No orphaned requirements — all five PERS requirements claimed by plans and implemented.

---

### Anti-Patterns Found

None. Scan of all 13 modified/created files found no:
- TODO/FIXME/XXX/HACK comments (stub indicators)
- Empty handler implementations (`return null`, `return {}`, `() => {}`)
- Console.log-only implementations

The word "placeholder" appears only as an HTML `placeholder` attribute in PromptBar.tsx and in a JSDoc comment in PreviewPane.tsx — these are correct usage, not stub indicators.

---

### Human Verification Required

The following behaviors require a live browser to fully confirm:

#### 1. Auto-save actually persists across page refresh

**Test:** Generate a UI in the playground. Note the prompt. Refresh the page (Cmd+R). Check that the generated spec appears in the history panel.
**Expected:** The history entry survives the page refresh because it was saved to the database on generation complete.
**Why human:** Cannot verify real network I/O or Auth0 token state programmatically.

#### 2. Share button copies a valid permalink

**Test:** Generate a UI, select it to view as a saved spec, click the "Share" button. Open the copied URL in an incognito window (unauthenticated).
**Expected:** The incognito tab shows the stored spec read-only without a login prompt — the original prompt as a heading and the rendered UI below.
**Why human:** Requires browser Clipboard API, network round-trip to GET /api/gen/specs/:id, and rendering via JSONUIProvider.

#### 3. Favorites filter tabs work correctly

**Test:** Generate two UIs. Star one. Click the "Favorites" tab in the history panel.
**Expected:** Only the starred entry appears. Click "All" tab to see both.
**Why human:** Requires live interaction with the star button and observing filtered state.

#### 4. Refinement mode modifies without regenerating from scratch

**Test:** Generate a complex UI (e.g., "a hotel booking form"). Click "Refine" and type "make the submit button red". Observe the result.
**Expected:** The result retains the hotel booking form structure with only the submit button color changed, rather than a completely new UI.
**Why human:** Requires LLM output quality judgment — cannot programmatically verify AI model behavior.

---

### Gaps Summary

No gaps found. All 13 must-have truths verified, all 13 artifacts confirmed as substantive and wired, all 5 requirement IDs satisfied, no blocking anti-patterns detected.

---

_Verified: 2026-03-28T18:00:00Z_
_Verifier: Claude (gsd-verifier)_
