---
phase: 17-local-dev-streaming-fixes
plan: 01
subsystem: api
tags: [ai-sdk, streaming, vite, gen-ui, gen-chat, hooks]

requires:
  - phase: 15-hospitality-copilot
    provides: useGenCopilotStream hook in rialto
  - phase: 14-playground-app
    provides: useGenStream hook in apps/gen
  - phase: 13-ai-generation-endpoint
    provides: gen-ui and gen-chat routes in agent service

provides:
  - Hospitality Vite proxy routes /api/gen/* to agent-api (port 3003)
  - gen-ui and gen-chat routes stream raw NDJSON via result.textStream
  - useGenStream parses every line as flat element (no dead usage code)
  - useGenCopilotStream parses every line as flat element (no dead usage code)

affects: [local-dev, gen-playground, hospitality-copilot]

tech-stack:
  added: []
  patterns:
    - "AI SDK v6 textStream: use result.textStream (ReadableStream property) not result.toTextStream() (method does not exist)"
    - "Vite proxy ordering: specific routes (/api/gen) must precede catch-all (/api) for correct routing"

key-files:
  created: []
  modified:
    - apps/hospitality/vite.config.ts
    - services/agent/src/routes/gen-ui.ts
    - services/agent/src/routes/gen-chat.ts
    - apps/gen/src/hooks/useGenStream.ts
    - packages/rialto/src/components/GenCopilot/useGenCopilotStream.ts

key-decisions:
  - "AI SDK v6 result.textStream is a ReadableStream property, not a toTextStream() method — plan referenced wrong API name"
  - "Output.object removed from gen-ui streamText call — was forcing structured JSON mode, preventing line-by-line NDJSON output"
  - "x-vercel-ai-ui-message-stream header removed — no longer applicable with raw text stream"

patterns-established:
  - "AI SDK v6 streaming: result.textStream (property) streams raw text content line-by-line"

requirements-completed: [COP-01, COP-02, COP-03, GEN-01, PLAY-03, PERS-05]

duration: 4min
completed: 2026-03-28
---

# Phase 17 Plan 01: Local Dev Streaming Fixes Summary

**Fixed end-to-end streaming pipeline: Vite proxy now routes /api/gen to agent-api, backend uses result.textStream for raw NDJSON, and both hooks parse every line as a flat element without dead usage branches**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-28T18:18:28Z
- **Completed:** 2026-03-28T18:22:08Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Hospitality Vite proxy now correctly routes `/api/gen/*` to agent-api (port 3003) before the `/api` catch-all that routes to reservations-api (port 3004)
- Backend gen-ui and gen-chat routes now stream raw text via `result.textStream` instead of `toUIMessageStream()` which wrapped each chunk in SDK JSON envelopes
- `Output.object` removed from gen-ui's `streamText()` call — it was forcing structured JSON mode, overriding the catalog prompt's line-by-line NDJSON instruction
- Dead `{type:"usage"}` parsing branches removed from both streaming hooks — AI SDK v6 never emits these client-side

## Task Commits

1. **Task 1: Fix Vite proxy and switch backend to textStream** - `a42be71` (fix)
2. **Task 2: Clean up streaming hooks — remove dead usage code** - `0a7f5f9` (refactor)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `apps/hospitality/vite.config.ts` - Added `/api/gen` proxy rule targeting port 3003 before `/api` catch-all
- `services/agent/src/routes/gen-ui.ts` - Removed Output import/usage, removed x-vercel-ai-ui-message-stream header, switched to result.textStream
- `services/agent/src/routes/gen-chat.ts` - Removed x-vercel-ai-ui-message-stream header, switched to result.textStream
- `apps/gen/src/hooks/useGenStream.ts` - Removed TokenUsage interface, usage state, and dead usage parsing branches
- `packages/rialto/src/components/GenCopilot/useGenCopilotStream.ts` - Removed dead usage skip logic from line loop and buffer flush

## Decisions Made

- AI SDK v6 exposes `result.textStream` as a ReadableStream property — the plan referenced `toTextStream()` which does not exist in v6. Fixed automatically.
- `Output.object` was removed because it forces the model into structured JSON mode, producing a single JSON blob instead of the line-by-line NDJSON flat elements the hooks expect.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] result.textStream is a property, not toTextStream() method**
- **Found during:** Task 1 (Fix Vite proxy and switch backend to toTextStream())
- **Issue:** Plan specified `result.toTextStream()` but AI SDK v6 exposes text streaming as `result.textStream` (a ReadableStream property). TypeScript error: `Property 'toTextStream' does not exist on type 'StreamTextResult'`
- **Fix:** Used `result.textStream` instead of `result.toTextStream()`
- **Files modified:** services/agent/src/routes/gen-ui.ts, services/agent/src/routes/gen-chat.ts
- **Verification:** `pnpm --filter @mbe/agent-service typecheck` passes
- **Committed in:** a42be71 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - API name correction)
**Impact on plan:** Essential fix — wrong method name from plan. No scope creep.

## Issues Encountered

- Pre-existing `@mbe/rialto-catalog` typecheck failure (CSS module type declarations missing) — confirmed pre-existing via git stash, out of scope for this plan. Logged to deferred items.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Local dev streaming pipeline is now end-to-end aligned
- GenCopilot in hospitality and gen playground both ready for functional local testing
- Both hooks parse raw NDJSON flat elements correctly for flatToTree() consumption

## Self-Check: PASSED

All files present. All commits verified (a42be71, 0a7f5f9).

---
*Phase: 17-local-dev-streaming-fixes*
*Completed: 2026-03-28*
