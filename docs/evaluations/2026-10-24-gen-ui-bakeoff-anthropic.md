# Generative UI Bake-off: Claude Haiku 5.5 — October 2026

Second and deciding arm of the #6948 generative-UI model bake-off, run 2026-10-24 against a freshly provisioned Anthropic API key. The [Gemini free-tier arm](./2026-10-22-gen-ui-bakeoff-gemini.md) (2026-10-22) set the bar at 85% valid first try / 100% after repair. Production has been wired to Haiku 5.5 (`GEN_MODEL_ID = "claude-haiku-5-5"`) since #7172; this run is the measurement that decision was waiting on.

## Current state

| Fact        | Value                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| Harness     | `packages/rialto-catalog/scripts/gen-ui-bakeoff.ts` (production config, 429 retry from #7329)        |
| Prompts     | Same 20 fixtures as the Gemini arm, real `catalog.prompt()`                                          |
| Arms        | `default` (no thinking config — what production sends today) and `low` (`output_config.effort: low`) |
| Model       | `claude-haiku-5-5`                                                                                   |
| Total spend | $0.028 (plus a $0.002 one-prompt wire smoke)                                                         |

## Results (2026-10-24)

| Arm     | Valid 1st try    | Valid after repair | Mean in tok | Mean out tok | Cached $/1k gens | Uncached $/1k gens |
| ------- | ---------------- | ------------------ | ----------- | ------------ | ---------------- | ------------------ |
| default | **100% (20/20)** | 100%               | 10,332      | 1,192        | **$0.70**        | $1.63              |
| low     | 95% (19/20)      | 100%               | 10,917      | 1,155        | $0.70            | $1.67              |

The single `low`-arm first-try failure (pasta-menu card prompt) was repaired. Zero errors, zero `length` truncations in 40 calls.

## Findings

1. **Haiku 5.5 clears the Gemini bar decisively**: 100%/100% vs 85%/100%. The repair pass was never needed on the default arm.
2. **The predicted ~2.5× thinking-effort lever does not exist for this task.** `low` produced only 3% fewer output tokens than `default` (1,155 vs 1,192), identical cached cost ($0.70/1k), and a slightly worse first-try rate. Haiku's adaptive default evidently already spends near-minimum thinking on catalog-constrained generation. **Consequence: no `GEN_THINKING_EFFORT` knob gets built** — the simpler configuration is also the better one. (Contrast Gemini, where the explicit `low` floor was 2.6× _more_ expensive.)
3. **`output_config.effort` works on the wire** — validated live in the smoke run before the budgeted run.
4. **Measured production cost: $0.70 per 1k generations with the prompt cache warm** ($1.63 cold). The default `GEN_DAILY_CEILING_USD` of $0.50/day therefore bounds spend at ~700 generations/day ≈ $15/month worst case — the budget #6948 set, with no env override needed.

## Verdict

- **Production model: Claude Haiku 5.5, default thinking, confirmed.** No code or config change required — the service ships as wired.
- **Ceiling: keep the $0.50/day default.**
- Go-live is now purely a key-deploy: `ANTHROPIC_API_KEY` as a SECRET env var on the `agent-api` DO component (env vars are Pulumi-unmanaged, #3277), then live verification. Runbook on #6948.
