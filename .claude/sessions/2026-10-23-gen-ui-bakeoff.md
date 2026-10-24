---
date: 2026-10-22
session: gen-ui-go-live-gemini-bakeoff
duration: ~1h
model: claude-fable-5
branch: main (plus feat/gen-ui-bakeoff-gemini-run, merged)
---

# Session Summary

## 2026-10-22 (late)

Session focus: `/plan` → implement the generative UI solution. Scoped with Matt to
the #6948 go-live path; his decisions: Gemini free-tier key only (hard $0, no
billing account linked), production stays on Haiku 5.5 inert — "test with free
gemini to start and use haiku later."

## What changed

- **Merged #7329** (`a41625269`) — bounded 429 retry in the bake-off's
  `createProvider` (4 attempts, Retry-After honored, capped 120s; non-429 still
  fails fast; TDD, 4 new tests) + `docs/evaluations/2026-10-22-gen-ui-bakeoff-gemini.md`
  - index row. Reviews: universal reviewer pass 9/10, determinism reviewer PASS
    (all four llms artifacts verified against fresh regen).
- **First live bake-off arm run** (Gemini 3.1 Flash-Lite, free tier, $0, 20
  prompts × 2 arms, 0 errors after the retry fix): default arm **85% valid 1st
  try / 100% after repair** (582 mean out tok); `low` arm 85%/95% (1,535 out
  tok). Guessed model id accepted as-is. `thinkingLevel: low` measured
  counterproductive on Gemini — 2.6× output tokens AND worse repair rate.
- **#6948 comment** posted: results, scorecard, and the full Haiku go-live
  runbook (Anthropic key → Anthropic bake-off arm → set GEN_DAILY_CEILING_USD →
  key as SECRET env on agent-api **via DO dashboard**, since Pulumi
  `ignoreChanges: ["spec.services"]` leaves env vars unmanaged, #3277 → verify
  live → label #7231 ready). Issue stays open, `ready-for-human`.
- Memory: `project_gen_ui_go_live_2026_10_22.md` + MEMORY.md index row.

## What was tried

1. **First full bake-off run without retry:** lost 8/20 default-arm prompts and
   the whole low arm to free-tier per-MINUTE 429s (probe minutes later returned
   200 → RPM, not daily). Fixed in-harness rather than batching by hand.
2. **Matt's Google billing dead-card dialog:** bypassed — card removal is
   irrelevant; hard-$0 comes from the key's project having no billing account
   (created the key in a fresh no-billing AI Studio project instead).

## Gotchas touched

- Keychain `security add-generic-password -U` does NOT update an existing item
  in interactive `-w` mode on current macOS — it errors without prompting;
  delete-then-add is the reliable path.
- The bake-off's stored provider errors are truncated to 300 chars, which cuts
  off Gemini's quota-dimension detail — a live 1-token probe was needed to
  classify RPM vs RPD.
- Explore-confirmed: all 5 generative-UI PRD phases are built (incl. persistence
  `StoredSpec` + hospitality ChatPanel embed); `/api/gen/chat` has no caller
  outside tests (possible dead code, not filed this session).
