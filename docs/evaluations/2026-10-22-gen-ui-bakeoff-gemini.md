# Generative UI Bake-off: Gemini Free Tier — October 2026

First live run of the #6948 generative-UI model bake-off. Only the Gemini arm ran, by Owner decision: a free-tier key with **no billing account linked** is a hard $0 — a stronger guarantee than any spend cap — and the other two candidates (Claude Haiku 5.5, GPT-6 Luna) need paid keys that are deliberately not provisioned yet. Production stays on Haiku 5.5, inert, until an Anthropic key exists.

## Current state

| Fact                | Value                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| Harness             | `packages/rialto-catalog/scripts/gen-ui-bakeoff.ts` (#7019, production config per #7233/#7235/#7239) |
| Prompts             | 20 fixture prompts, real `catalog.prompt()` (~7,100-token system prompt)                             |
| Arms                | `default` (no thinking config) and `low` (`thinkingConfig.thinkingLevel: "low"`)                     |
| Model               | `gemini-3.1-flash-lite` — the guessed id in `DEFAULT_MODELS` was accepted as-is                      |
| Tier                | Free (no billing account on the project); measured spend $0.00                                       |
| Production decision | Unchanged: Haiku 5.5 (#6948) — this run is a baseline and a harness shakedown, not a production pick |

## Results (2026-10-22)

| Arm     | Valid 1st try | Valid after repair | Mean in tok | Mean out tok | Errors |
| ------- | ------------- | ------------------ | ----------- | ------------ | ------ |
| default | 85% (17/20)   | **100% (20/20)**   | 8,233       | 582          | 0/20   |
| low     | 85% (17/20)   | 95% (19/20)        | 8,264       | 1,535        | 0/20   |

First-try failures, all recovered by the repair pass except one:

| Arm     | Prompt (truncated)                                    | Repaired |
| ------- | ----------------------------------------------------- | -------- |
| default | Banner announcing the patio is open, dismissible      | yes      |
| default | Empty state for a waitlist screen                     | yes      |
| default | Newsletter sign-up block with email input + Subscribe | yes      |
| low     | Opening-hours panel, Sunday marked closed             | yes      |
| low     | Tabbed menu (Lunch/Dinner/Drinks)                     | **no**   |
| low     | Empty state for a waitlist screen                     | yes      |

## Findings

1. **Gemini 3.1 Flash-Lite produces valid rialto catalog specs.** 85% first try, 100% after one repair pass on the default arm. The repair loop earns its keep — it converted every default-arm failure.
2. **`thinkingLevel: "low"` is counterproductive on this model — in both directions.** It emitted ~2.6× the output tokens of the default arm (1,535 vs 582 mean; thinking tokens bill as output on Gemini) **and** scored worse after repair (95% vs 100%). Gemini's dynamic default picks less thinking than the explicit "low" floor for this task. On paid rates the "cheap" arm would be the expensive one. For Gemini: send no thinking config. This says nothing about Anthropic's `effort: low`, a different mechanism, still unmeasured.
3. **The effort wire field is live, not silently ignored** — the two arms differ sharply in token counts, which was the pre-registered detection for a silently-dropped field.
4. **Free-tier RPM limits break an unprotected run.** The first full run lost 8 of 20 default-arm prompts and the entire low arm to HTTP 429 (per-minute quota; a probe minutes later returned 200). Fixed in the harness: `createProvider` now retries 429s up to 4 attempts, honoring `Retry-After` (capped 120s, default 30s), other statuses still fail fast. The retried run completed 40/40 calls with zero errors.
5. **Input cost picture confirms #6948's measurement**: ~8.2k mean input tokens (catalog prompt plus repair passes), byte-identical system prompt every call — caching remains the dominant input lever for any paid provider.

## Verdict

- **Harness: production-ready.** Wire formats, free-tier handling, spend guard, and 429 resilience all exercised live at $0.
- **Gemini free tier is a viable $0 test bed** for catalog-constrained generation (and its numbers set the bar the paid arms must beat), but stays ruled out for production at paid rates (2.9× per generation plus ~$5/month standing cache storage — see #6948).
- **The production decision still rests on the unmeasured Anthropic arm.** When an Anthropic key exists, run the same harness with `ANTHROPIC_API_KEY` (<$1) and compare `Valid 1st try` / `Valid after repair` against default-arm Gemini's 85%/100%, plus the `effort` arms — the go-live runbook lives on #6948.
