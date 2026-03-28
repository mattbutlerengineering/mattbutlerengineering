# Phase 17: Local Dev & Streaming Fixes - Research

**Researched:** 2026-03-28
**Domain:** Vite dev proxy configuration, AI SDK v6 stream format, custom streaming hooks
**Confidence:** HIGH

## Summary

This phase addresses two concrete integration gaps discovered post-implementation. The first is a Vite proxy routing bug in the hospitality app: the generic `/api` catch-all routes to port 3004 (reservations-api), so GenCopilot's `/api/gen/*` requests never reach the agent-api on port 3003. The fix requires adding a more-specific `/api/gen` proxy rule before the existing `/api` catch-all. The gen app's own proxy is already correct (all `/api` goes to 3003).

The second gap is a stream format mismatch. The agent-api uses `result.toUIMessageStream()` from AI SDK v6, which produces structured `UIMessageChunk` JSON objects — with `type` fields like `start`, `finish`, `text-start`, `text-delta`, `text-end`, `start-step`, `finish-step`, `error`, and `abort`. The two custom hooks (`useGenStream` in apps/gen and `useGenCopilotStream` in packages/rialto) parse these lines expecting flat JSON elements that can be fed into `flatToTree()`. They currently silently skip chunks they cannot parse as flat elements, but the more critical issue is that `gen-ui.ts` uses `Output.object({ schema })` with `toUIMessageStream()`, which changes the stream content — instead of raw text deltas, the model produces JSON output and the stream carries tool-related or partial-output chunks, not direct flat UI elements.

Neither hook contains a `usage` field extraction that matches the actual AI SDK v6 usage chunk format (the SDK emits `{type:"finish", finishReason:...}` not `{type:"usage", promptTokens:...}`). The hooks' `usage` parsing logic will never fire as written since the SDK never emits that format.

**Primary recommendation:** Fix the hospitality `vite.config.ts` proxy order first (1-line fix). Then audit whether `Output.object` + `toUIMessageStream()` delivers flat JSONL to the hooks, or whether the backend should switch to `toTextStream()` / plain NDJSON output that the hooks actually expect.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| COP-01 | `<GenCopilot>` component in `packages/rialto` with embedded generation panel | Already implemented; this phase ensures local dev routing works so it can be tested |
| COP-02 | Integration into hospitality app dashboard layout | Already wired in DashboardLayout; proxy fix enables local dev testing |
| COP-03 | Domain-aware prompt context (reservation schema, floor plan structure, guest data shapes) | Already implemented in useGenCopilotStream's buildPromptWithContext; no changes needed |
| GEN-01 | `POST /api/gen/ui` endpoint streams JSONL spec patches via SSE (standalone mode) | Backend implemented; stream format audit determines whether hooks need updating |
| PLAY-03 | Streaming preview pane renders Rialto components progressively as JSONL arrives | useGenStream drives this; stream format compatibility is the core concern |
| PERS-05 | Inline/conversational refinement mode applies patches to existing spec | Already implemented in PlaygroundPage; proxy fix ensures it works in local dev |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vite | 5.x (project-wide) | Dev proxy via `server.proxy` config | Built-in proxy, no extra packages |
| ai (Vercel AI SDK) | 6.0.141 | `toUIMessageStream()` produces wire format | Already in use for gen endpoints |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @json-render/react | 0.15.0 | `flatToTree()` builds Spec from flat elements | Used in both streaming hooks |

## Architecture Patterns

### Vite Proxy Order (CRITICAL)

Vite `server.proxy` uses **first-match** routing. More specific paths must appear before catch-alls.

**Current (broken) hospitality vite.config.ts:**
```typescript
proxy: {
  "/api/v1/users": { target: "http://localhost:3001", changeOrigin: true },
  "/api": { target: "http://localhost:3004", changeOrigin: true },  // catch-all → reservations-api
}
```

`/api/gen/ui` matches `/api` → routed to 3004 (reservations-api). That service has no `/api/gen/ui` route → 404.

**Fix (correct):**
```typescript
proxy: {
  "/api/v1/users": { target: "http://localhost:3001", changeOrigin: true },
  "/api/gen":      { target: "http://localhost:3003", changeOrigin: true },  // agent-api — BEFORE /api catch-all
  "/api":          { target: "http://localhost:3004", changeOrigin: true },  // reservations-api catch-all
}
```

Source: Vite docs on `server.proxy` — order matters, first match wins. [HIGH confidence — verified by reading actual vite.config.ts in both apps]

### AI SDK v6 `toUIMessageStream()` Wire Format

`toUIMessageStream()` serializes each chunk as a JSON object on its own line (NDJSON). The full set of chunk types emitted by a bare `streamText()` call is:

```
{"type":"start","messageId":"..."}           // sendStart=true (default)
{"type":"start-step"}
{"type":"text-start","id":"..."}
{"type":"text-delta","id":"...","delta":"some text"}
{"type":"text-delta","id":"...","delta":" more text"}
{"type":"text-end","id":"..."}
{"type":"finish-step"}
{"type":"finish","finishReason":"stop"}      // sendFinish=true (default)
```

For `streamText()` with `Output.object({ schema })` (as used in `gen-ui.ts`), the model outputs JSON text and the stream contains the same `text-*` chunk sequence — the partial JSON is delivered as `text-delta` chunks. The `Output.object` option primarily affects what `.object` / `.partialObject` accessors return; it does NOT change the chunk types in `toUIMessageStream()`. The text deltas contain the raw JSON string being built up.

Source: Read from `/node_modules/.pnpm/ai@6.0.141.../stream-text.ts` and `ui-message-chunks.ts` [HIGH confidence]

### What the Hooks Actually Receive vs. What They Expect

**Hooks expect:** Lines where `JSON.parse(line)` produces a flat element recognized by `flatToTree()`. They check `parsed.type === "usage"` to extract token counts (their custom format).

**SDK actually emits:**
- `{type: "start", messageId?: string}` — silently skipped (no `type === "usage"`, no `flatToTree` key)
- `{type: "text-start", id: string}` — silently skipped
- `{type: "text-delta", id: string, delta: string}` — the actual content, but structured as `{type:"text-delta", delta:"..."}` not as a flat element
- `{type: "text-end", id: string}` — silently skipped
- `{type: "finish", finishReason: string}` — silently skipped
- `{type: "start-step"}`, `{type: "finish-step"}` — silently skipped

**The hooks' `usage` extraction block:**
```typescript
if (parsed.type === "usage") {
  // Extract token usage info
  const usageData: TokenUsage = {
    promptTokens: (parsed.promptTokens as number) ?? 0,
    ...
  };
}
```
This will never fire. The SDK emits `{type: "finish", finishReason: "stop"}` at the end, not a `{type: "usage"}` chunk. Token counts are only available server-side via `onFinish` callback.

**Result for flatToTree:** The hooks accumulate all non-`usage` typed lines as `FlatElement[]` and pass to `flatToTree()`. With the SDK stream format, they'd be accumulating `{type:"start"}`, `{type:"text-start", id:"..."}`, `{type:"text-delta", id:"...", delta:"..."}` objects — none of which are valid flat elements for `@json-render/react`. `flatToTree()` will receive garbage and either throw or produce an empty/invalid spec.

### What Should Be Streaming: Two Viable Approaches

**Option A: Change the backend to emit raw NDJSON flat elements** (matches what the hooks expect)

Instead of `result.toUIMessageStream()`, stream the partial object output as flat elements directly. For `Output.object`, use `result.partialObjectStream` which yields partial parsed objects, then serialize each as NDJSON. This requires the backend to know how to flatten the Rialto spec and emit it incrementally.

**Option B: Update the hooks to parse `text-delta` chunks and reassemble** (matches what SDK emits)

The hooks accumulate `text-delta` chunks' `delta` fields to build the full JSON string, then parse it once complete (or incrementally parse partial JSON). This is more robust for the actual SDK integration but requires extracting deltas rather than treating each line as a whole flat element.

Given that the existing hook architecture does line-by-line flat element parsing (not delta accumulation), and the backend uses `Output.object` (structured output, complete JSON at end), **Option B is the correct fix** — adapt the hooks to extract `delta` from `text-delta` chunks and accumulate them into a full JSON string, then parse once on `text-end` or `finish`.

However, there is a simpler Option C: **the backend stops using `Output.object` and `toUIMessageStream()` altogether**, instead streaming flat elements directly using a custom NDJSON loop with `streamText` and partial output — but this loses the structured output guarantee.

**Recommended approach (from evidence):** The simplest fix that preserves the existing hook architecture is to change the backend `gen-ui.ts` to use `result.toTextStream()` instead of `result.toUIMessageStream()`. `toTextStream()` emits only the raw text deltas as plain strings (no JSON wrapper). Combined with `Output.object`, the complete output will be the JSON spec. The hooks can then accumulate the full text and parse it once at end, OR the backend can switch from `Output.object` to plain `streamText()` where the model outputs NDJSON flat elements line by line (as the catalog prompt presumably instructs). The catalog system prompt directs the model to output flat JSON elements — so with plain `streamText()`, each line is a flat element parseable by the hooks.

**Most likely root cause:** The backend uses `Output.object` (structured JSON output) + `toUIMessageStream()` (SDK message stream format), but the hooks were written expecting plain NDJSON flat elements from `toTextStream()` or a custom streaming loop. The fix is to align one side with the other.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Vite path matching | Custom middleware | `server.proxy` with ordered keys | Built into Vite; regex also supported |
| Stream format parsing | Custom binary protocol | NDJSON line splitting (existing approach) | Already correct; just the per-line schema is wrong |
| Token counting | Custom counter | AI SDK `onFinish` callback (server-side only) | SDK tracks tokens; client cannot infer them from stream |

## Common Pitfalls

### Pitfall 1: Vite proxy catch-all ordering
**What goes wrong:** Generic `/api` prefix matches before `/api/gen`, so all gen requests go to the wrong service.
**Why it happens:** JavaScript object key order is preserved in modern engines, but Vite processes proxy rules in definition order.
**How to avoid:** Always list longer/more-specific prefixes first. `/api/gen` before `/api`.
**Warning signs:** 404 from hospitality dev server when submitting GenCopilot prompt.

### Pitfall 2: AI SDK v6 stream format assumed to be raw text
**What goes wrong:** Hook tries to `JSON.parse` a line like `{"type":"text-delta","id":"abc","delta":"{\n  \""}` as a flat element, which succeeds (it IS valid JSON) but produces `{type: "text-delta", ...}` — not a flat element — and `flatToTree()` gets garbage.
**Why it happens:** The SDK wraps every chunk in a JSON envelope. The actual content is in the `delta` field.
**How to avoid:** Either (a) use `toTextStream()` on the backend so lines are raw text, or (b) update hooks to recognize and extract `delta` from `text-delta` chunks.
**Warning signs:** `flatToTree()` returning empty or malformed spec; no visible component rendering during stream; no JSON.parse errors (silent because catch block exists).

### Pitfall 3: `Output.object` with `toUIMessageStream()` produces no real-time partial renders
**What goes wrong:** With structured output (`Output.object`), the model outputs a complete JSON object — partial deltas are an incomplete JSON string. The hook cannot call `flatToTree()` on partial JSON.
**Why it happens:** `Output.object` requests JSON mode from the model. The model builds the JSON string incrementally. Only at the end is it valid parseable JSON.
**How to avoid:** For progressive rendering, either switch to plain `streamText()` with NDJSON output (line-by-line elements), or parse the final complete output after `finish` chunk.
**Warning signs:** No progressive rendering during stream; spec appears all at once at the end (or after a long delay).

### Pitfall 4: Usage extraction from client hooks
**What goes wrong:** Hooks try to extract `promptTokens`/`completionTokens` from a `{type:"usage"}` line that never arrives.
**Why it happens:** The AI SDK v6 does not emit a client-visible usage chunk in this format. Token counts are available only in the server-side `onFinish` callback.
**How to avoid:** Remove client-side usage extraction from hooks, or change `onFinish` to forward a custom `{type:"usage",...}` line to the stream. If usage display is needed in the UI, the server must explicitly write it to the stream.
**Warning signs:** `usage` state in `useGenStream` always remains `null`.

## Code Examples

### Correct Vite proxy configuration for hospitality app
```typescript
// Source: apps/hospitality/vite.config.ts — AFTER FIX
server: {
  port: 3002,
  proxy: {
    "/api/v1/users": {
      target: "http://localhost:3001",
      changeOrigin: true,
    },
    "/api/gen": {
      target: "http://localhost:3003",  // agent-api — more specific, must come first
      changeOrigin: true,
    },
    "/api": {
      target: "http://localhost:3004",  // reservations-api catch-all
      changeOrigin: true,
    },
  },
},
```

### Backend: toTextStream() for plain text delivery (if switching from toUIMessageStream)
```typescript
// In gen-ui.ts: change this line:
return reply.send(result.toUIMessageStream());
// To:
return reply.send(result.toTextStream());
// Then remove the x-vercel-ai-ui-message-stream header (no longer applicable)
```

With plain `streamText()` (no `Output.object`) and the catalog prompt directing the model to output NDJSON flat elements line by line, `toTextStream()` delivers exactly what the hooks expect: one flat element JSON object per line.

### Hook: if staying with toUIMessageStream, extract delta from text-delta chunks
```typescript
// Replace the per-line parsing block in useGenStream send():
if (parsed.type === "text-delta" && typeof parsed.delta === "string") {
  // Accumulate delta text — the model is building a JSON string
  textBuffer += parsed.delta;
} else if (parsed.type === "finish") {
  // Full text assembled — now parse as flat elements (one per line)
  const allLines = textBuffer.split("\n").filter(Boolean);
  for (const line of allLines) {
    try {
      const el = JSON.parse(line) as FlatElement;
      accumulatedElements.push(el);
    } catch { /* skip */ }
  }
  const finalSpec = flatToTree(accumulatedElements);
  setSpec(finalSpec);
}
```

### Backend: emit custom usage line for client consumption (optional)
```typescript
// In onFinish callback of gen-ui.ts — after logging, write to custom stream:
// This requires NOT using toUIMessageStream() — use a manual WritableStream approach
// or pass usage via a custom chunk appended before closing the stream.
// RECOMMENDATION: skip client-side usage display for now; it's a nice-to-have.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| AI SDK v3 `data:` prefix SSE lines | AI SDK v6 JSON-per-line NDJSON via `toUIMessageStream()` | AI SDK v5→v6 | Wire format completely changed; old parsers break |
| `toDataStream()` | `toUIMessageStream()` | AI SDK v6 | Method renamed and behavior changed |
| `promptTokens`/`completionTokens` in AI SDK | `inputTokens`/`outputTokens` in `LanguageModelUsage` | AI SDK v5→v6 | Already noted in STATE.md decisions |

**Deprecated/outdated:**
- `toDataStream()`: Removed in AI SDK v6; replaced by `toUIMessageStream()` and `toTextStream()`
- Client-visible `{type:"usage"}` chunk: Not part of AI SDK v6 UIMessageChunk spec — never emitted

## Open Questions

1. **Does `gen-ui.ts` with `Output.object` ever produce progressive flat element output?**
   - What we know: `Output.object` requests structured JSON; the model outputs the entire JSON object as streamed text deltas. The hooks cannot parse partial JSON as flat elements.
   - What's unclear: Whether the catalog prompt's instruction to output NDJSON makes the model output line-by-line flat elements even in JSON mode, or whether `Output.object` overrides that and produces one big JSON blob.
   - Recommendation: Test empirically. If `Output.object` forces single-blob output, drop it and use plain `streamText()` + rely on catalog prompt for NDJSON discipline.

2. **Should `gen-chat.ts` also switch away from `toUIMessageStream()`?**
   - What we know: `gen-chat.ts` also uses `toUIMessageStream()` but there is no client-side hook for chat currently (PlaygroundPage uses `useGenStream` with `/api/gen/ui`).
   - What's unclear: Future chat integration path.
   - Recommendation: Fix gen-chat.ts consistently alongside gen-ui.ts when fixing the stream format.

3. **Is the `usage` state in `useGenStream` actively displayed in any UI?**
   - What we know: `useGenStream` returns `usage` but PlaygroundPage doesn't appear to render it.
   - What's unclear: Whether any component consumes `usage` for display.
   - Recommendation: Remove or deprecate unused `usage` return value; clean up dead `{type:"usage"}` parsing code.

## Sources

### Primary (HIGH confidence)
- Direct read: `/node_modules/.pnpm/ai@6.0.141.../src/generate-text/stream-text.ts` — `toUIMessageStream()` implementation, chunk types
- Direct read: `/node_modules/.pnpm/ai@6.0.141.../src/ui-message-stream/ui-message-chunks.ts` — full UIMessageChunk type union
- Direct read: `apps/hospitality/vite.config.ts` — proxy config showing the bug
- Direct read: `apps/gen/vite.config.ts` — correct proxy config (reference)
- Direct read: `apps/gen/src/hooks/useGenStream.ts` — hook implementation
- Direct read: `packages/rialto/src/components/GenCopilot/useGenCopilotStream.ts` — hook implementation
- Direct read: `services/agent/src/routes/gen-ui.ts` — backend stream emission
- Direct read: `apps/hospitality/src/components/DashboardLayout.tsx` — GenCopilot integration, `/api/gen/ui` endpoint confirmed

### Secondary (MEDIUM confidence)
- Vite proxy ordering: First-match behavior is well-documented behavior; confirmed by proxy config analysis

## Metadata

**Confidence breakdown:**
- Proxy bug: HIGH — read both vite.config.ts files directly; bug is unambiguous
- Stream format mismatch: HIGH — read AI SDK v6 source directly; chunk types confirmed
- Fix approach (toTextStream vs hook update): MEDIUM — best approach depends on empirical test of Output.object behavior; two viable options documented
- Usage chunk dead code: HIGH — UIMessageChunk type union confirmed; no `{type:"usage"}` chunk exists in SDK

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (AI SDK v6 is fast-moving; re-verify if version bumps)
