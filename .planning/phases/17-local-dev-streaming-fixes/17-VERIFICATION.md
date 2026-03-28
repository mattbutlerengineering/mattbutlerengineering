---
phase: 17-local-dev-streaming-fixes
verified: 2026-03-28T11:26:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
human_verification:
  - test: "Start local dev (pnpm dev:local) and open hospitality app GenCopilot"
    expected: "Network tab shows /api/gen/ui requests going to port 3003 (agent-api), not port 3004 (reservations-api)"
    why_human: "Vite proxy order is correct in config but actual proxy behavior at runtime requires a browser network trace to confirm"
  - test: "Submit a prompt in GenCopilot (hospitality app, local dev)"
    expected: "Rialto components render progressively in the panel as the stream arrives (not all at once or blank)"
    why_human: "Progressive rendering requires real AI stream output; cannot verify with grep or static analysis"
---

# Phase 17: Local Dev & Streaming Fixes Verification Report

**Phase Goal:** Fix local dev proxy routing and streaming response format mismatches blocking GenCopilot and gen playground testing
**Verified:** 2026-03-28T11:26:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | GenCopilot in hospitality app routes /api/gen/* requests to agent-api (port 3003) in local dev | VERIFIED | `apps/hospitality/vite.config.ts` lines 92-95: `/api/gen` proxy rule targeting `http://localhost:3003` appears before the `/api` catch-all (line 96-99) targeting port 3004 |
| 2 | useGenStream correctly parses streamed lines as flat elements and renders Rialto components progressively | VERIFIED | `apps/gen/src/hooks/useGenStream.ts`: every non-empty line is parsed with `JSON.parse` and pushed directly to `accumulatedElements` as a `FlatElement`, then `flatToTree([...accumulatedElements])` is called to update spec state. No `type === "usage"` conditional, no `TokenUsage` interface, no dead branches |
| 3 | useGenCopilotStream correctly parses streamed lines as flat elements and renders Rialto components progressively | VERIFIED | `packages/rialto/src/components/GenCopilot/useGenCopilotStream.ts`: same flat element parsing pattern — every non-empty line is parsed and accumulated with `flatToTree`. No `type === "usage"` skip logic in line loop (line 133 `continue` is only for empty `trimmed` lines) or buffer flush |
| 4 | Dead usage extraction code is removed from both hooks (SDK never emits {type:'usage'} chunks) | VERIFIED | `useGenStream.ts`: grep for `TokenUsage`, `setUsage`, `usage.*state`, `type.*usage` returns no matches. `useGenCopilotStream.ts`: grep for `type.*usage`, `parsed\.type` returns no matches |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|---------|--------|---------|
| `apps/hospitality/vite.config.ts` | Vite proxy with /api/gen route before /api catch-all | VERIFIED | Lines 92-99: `/api/gen` → port 3003 at line 92, `/api` → port 3004 at line 96. Correct ordering confirmed. |
| `services/agent/src/routes/gen-ui.ts` | Streaming gen-ui route using result.textStream without Output.object | VERIFIED | Line 4: `import { streamText } from "ai"` (no `Output`). Line 56: `streamText({...})` without `output:` field. Line 98: `return reply.send(result.textStream)`. No `x-vercel-ai-ui-message-stream` header. |
| `services/agent/src/routes/gen-chat.ts` | Streaming gen-chat route using result.textStream | VERIFIED | Line 4: `import { streamText } from "ai"`. Line 54: `streamText({...})`. Line 93: `return reply.send(result.textStream)`. No `x-vercel-ai-ui-message-stream` header. |
| `apps/gen/src/hooks/useGenStream.ts` | Streaming hook with flat element parsing, no dead usage code | VERIFIED | 184 lines. No `TokenUsage` interface, no `usage` state variable, no `setUsage`, no usage branch. Every parsed line accumulated as `FlatElement` and fed to `flatToTree`. |
| `packages/rialto/src/components/GenCopilot/useGenCopilotStream.ts` | Copilot streaming hook with flat element parsing, no dead usage code | VERIFIED | 190 lines. No `type === "usage"` skip. No usage-guard on buffer flush. Every parsed line accumulated as `FlatElement` and fed to `flatToTree`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `apps/hospitality/vite.config.ts` | `http://localhost:3003` | Vite server.proxy `/api/gen` rule | WIRED | Pattern `"/api/gen".*3003` confirmed at lines 92-95 of vite.config.ts |
| `services/agent/src/routes/gen-ui.ts` | `apps/gen/src/hooks/useGenStream.ts` | `result.textStream` emits raw text lines that hooks parse as flat elements | WIRED | Route uses `result.textStream` (line 98). Hook reads raw body with `getReader()` + line splitting + `JSON.parse` per line. Format alignment confirmed. |
| `services/agent/src/routes/gen-ui.ts` | `packages/rialto/src/components/GenCopilot/useGenCopilotStream.ts` | `result.textStream` emits raw text lines that hooks parse as flat elements | WIRED | Same route. Hook reads raw body with `getReader()` + line splitting + `JSON.parse` per line. Format alignment confirmed. |

### Requirements Coverage

All 6 requirement IDs declared in the plan frontmatter are cross-referenced below.

| Requirement | Source Plan | Description | Status | Evidence / Note |
|-------------|------------|-------------|--------|-----------------|
| COP-01 | 17-01-PLAN.md | `<GenCopilot>` component in `packages/rialto` with embedded generation panel | SATISFIED | Component implemented in Phase 15. Phase 17 fixes streaming format so the component actually works end-to-end in local dev. |
| COP-02 | 17-01-PLAN.md | Integration into hospitality app dashboard layout | SATISFIED | Integration implemented in Phase 15. Phase 17 Vite proxy fix enables local dev routing to correct service. |
| COP-03 | 17-01-PLAN.md | Domain-aware prompt context (reservation schema, floor plan structure, guest data shapes) | SATISFIED | `buildPromptWithContext()` in `useGenCopilotStream.ts` (lines 30-38) prepends domain schemas to user prompt. |
| GEN-01 | 17-01-PLAN.md | `POST /api/gen/ui` endpoint streams JSONL spec patches via SSE (standalone mode) | SATISFIED | `gen-ui.ts` streams raw NDJSON via `result.textStream`. `Output.object` removed so model outputs line-by-line NDJSON as catalog prompt instructs. |
| PLAY-03 | 17-01-PLAN.md | Streaming preview pane renders Rialto components progressively as JSONL arrives | SATISFIED | `useGenStream.ts` calls `setSpec(updatedSpec)` inside the line-reading loop — spec state updates per line, enabling progressive rendering. |
| PERS-05 | 17-01-PLAN.md | Inline/conversational refinement mode | SATISFIED | Implemented in Phase 16 via `gen-chat.ts`. Phase 17 switches it to `result.textStream` for correct format. |

**Orphaned requirements check:** REQUIREMENTS.md traceability table assigns all 6 IDs to phases 13-16 (GEN-01 → Phase 13, PLAY-03 → Phase 14, COP-01/02/03 → Phase 15, PERS-05 → Phase 16). Phase 17 is not listed in the traceability table. This is expected — phase 17 is an integration fix that enables requirements already counted as complete in prior phases to actually work in local dev. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `services/agent/src/routes/gen-ui.test.ts` | 7-9, 115, 148 | Mock provides `toUIMessageStream` but production code accesses `result.textStream` (a different property) | Warning | Tests pass because they only assert on `streamText` call arguments, not on what property the route reads. The test mock does not exercise the actual stream response path. |
| `services/agent/src/routes/gen-chat.test.ts` | 7-9, 105, 139 | Same stale mock — `toUIMessageStream` provided but `textStream` accessed | Warning | Same impact — test quality gap, not a functional regression. Route behavior is correct; tests just don't verify it. |

No blocker anti-patterns found. No TODO/FIXME/HACK/PLACEHOLDER comments in any of the 5 modified files.

### Human Verification Required

#### 1. Vite Proxy Runtime Routing

**Test:** Start `pnpm dev:local`, open hospitality app at `http://localhost:3002/hospitality`, open browser DevTools Network tab, open GenCopilot panel, submit any prompt.
**Expected:** Network tab shows `/api/gen/ui` request going to `localhost:3003` (not `localhost:3004`). Response status 200 with `Content-Type: text/plain`.
**Why human:** Vite proxy ordering is statically verified in config, but runtime proxy behavior (correct first-match routing) requires actual request observation.

#### 2. Progressive Component Rendering

**Test:** With local dev running and all services healthy, submit a prompt like "Show a table of reservations" in GenCopilot.
**Expected:** Components appear incrementally in the preview panel as the stream arrives — not all at once at the end, and not a blank panel followed by a sudden render.
**Why human:** Progressive rendering requires live AI streaming output; cannot verify with static analysis. Depends on AI Gateway API key being present in `.env`.

### Gaps Summary

No gaps found. All 4 observable truths are verified. All 5 required artifacts exist, are substantive, and are correctly wired. All 3 key links are connected. No blocker anti-patterns.

The only items flagged are:
1. Two warning-level test quality gaps (stale `toUIMessageStream` mocks in gen-ui and gen-chat tests) — tests pass but do not exercise the stream response path.
2. Two human verification items for runtime behavior.

---

_Verified: 2026-03-28T11:26:00Z_
_Verifier: Claude (gsd-verifier)_
