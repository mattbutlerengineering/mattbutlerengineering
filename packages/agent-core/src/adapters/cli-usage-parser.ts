/**
 * Parses cost/token usage from CLI subprocess stdout, for the two adapters
 * whose backends can emit machine-readable usage data.
 *
 * Both Gemini CLI and OpenCode CLI request their JSON output flag
 * (`--output-format json` for Gemini, `--format json` for OpenCode; see
 * gemini-adapter.ts / opencode-adapter.ts, #3019), so parsing here operates
 * against real machine-readable output rather than default human-formatted
 * text.
 *
 * Parsing never throws — malformed or missing data always yields `{}`
 * (usage) or `undefined` (error extraction).
 */

import { z } from "zod";
import type { TokenUsage } from "../types.js";

export interface CliUsage {
  readonly costUsd?: number;
  readonly tokenUsage?: TokenUsage;
  /**
   * Turn count, when the CLI backend reports a real signal for it. Absent
   * (never a fabricated 0 or 1) when the backend emits nothing usable — see
   * `run-cli-adapter-session.ts` for how absence is handled (#4208).
   */
  readonly numTurns?: number;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// ── Gemini CLI (`--output-format json`) ─────────────────────────────
//
// Emits a single JSON object at the end of the run:
//   { session_id, response, stats: { models: Record<string, { tokens, api }> }, error?, warnings? }
// `stats.models[*].tokens` carries `prompt` (input) / `candidates` (output)
// counts per model. Gemini CLI's stats never carry a USD figure, so
// costUsd is always left undefined here.
//
// `stats.models[*].api.totalRequests` is a real signal for turn count: it is
// `UiTelemetryService`'s per-model API-call counter (its symbols are present
// in the installed @google/gemini-cli@0.49.0 package's bundled CLI output —
// upstream source is `packages/core/src/telemetry/uiTelemetry.ts`, but the
// published package ships only the bundled/minified form, not that path
// verbatim). It is NOT a strict 1:1 with logical turns: the bundle's
// `processApiResponse` (a successful call) AND `processApiError` (a failed
// or retried call) both increment it, so a retried/errored API call inflates
// the count above the true turn count. That inflation is harmless for this
// module's one real consumer — it only ever moves the value away from the
// `{turns: 0, costUsd: 0}` shape `taskDidNotRun` checks for, never toward it
// — but treat it as "API-call attempts", not an exact turn count, if you use
// it elsewhere. Summed across models, never fabricated (absent, not a
// hardcoded 0, when no model reports it).

const GeminiModelMetricsSchema = z.object({
  tokens: z
    .object({
      prompt: z.number().optional(),
      candidates: z.number().optional(),
    })
    .optional(),
  api: z
    .object({
      totalRequests: z.number().optional(),
    })
    .optional(),
});

const GeminiJsonOutputSchema = z.object({
  stats: z
    .object({
      models: z.record(z.string(), GeminiModelMetricsSchema).optional(),
    })
    .optional(),
});

export function parseGeminiUsage(stdout: string): CliUsage {
  const raw = safeJsonParse(stdout.trim());
  const parsed = GeminiJsonOutputSchema.safeParse(raw);
  const models = parsed.success ? parsed.data.stats?.models : undefined;
  if (!models) return {};

  let inputTokens = 0;
  let outputTokens = 0;
  let numTurns = 0;
  let tokensFound = false;
  let turnsFound = false;
  for (const model of Object.values(models)) {
    if (model.tokens) {
      tokensFound = true;
      inputTokens += model.tokens.prompt ?? 0;
      outputTokens += model.tokens.candidates ?? 0;
    }
    if (model.api?.totalRequests !== undefined) {
      turnsFound = true;
      numTurns += model.api.totalRequests;
    }
  }

  return {
    ...(tokensFound ? { tokenUsage: { inputTokens, outputTokens } } : {}),
    ...(turnsFound ? { numTurns } : {}),
  };
}

// ── OpenCode CLI (`--format json`) ───────────────────────────────────
//
// Streams newline-delimited JSON events; each `step_finish` event carries a
// per-step `cost` (USD) and `tokens` object. A run may include several steps
// (multi-turn agent loop) — sum across all step_finish events in the stream.
// Each `step_finish` event corresponds to exactly one model turn (verified
// against real `opencode run --format json` captures: a single-turn reply
// emits one step_finish, a tool-call-then-reply run emits two), so counting
// them is a real turn signal, not a fabricated one.

const OpenCodeStepFinishEventSchema = z.object({
  type: z.literal("step_finish"),
  part: z.object({
    cost: z.number(),
    tokens: z.object({
      input: z.number(),
      output: z.number(),
    }),
  }),
});

export function parseOpenCodeUsage(stdout: string): CliUsage {
  let costUsd = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let numTurns = 0;
  let found = false;

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parsed = OpenCodeStepFinishEventSchema.safeParse(safeJsonParse(trimmed));
    if (!parsed.success) continue;

    found = true;
    numTurns += 1;
    costUsd += parsed.data.part.cost;
    inputTokens += parsed.data.part.tokens.input;
    outputTokens += parsed.data.part.tokens.output;
  }

  return found ? { costUsd, numTurns, tokenUsage: { inputTokens, outputTokens } } : {};
}

// ── Soft-error extraction from JSON stdout (#3019) ──────────────────
//
// On failure, each CLI's JSON output carries structured failure detail in
// stdout the same way it carries usage — this recovers a human-readable
// message from it so the ADR-017 failure-PR body stays useful now that a
// CLI's descriptive error text may no longer land in stderr.

const GeminiJsonErrorSchema = z.object({
  error: z.object({ message: z.string() }).optional(),
});

/** Recovers Gemini's `--output-format json` error message, if present. */
export function extractGeminiError(stdout: string): string | undefined {
  const parsed = GeminiJsonErrorSchema.safeParse(safeJsonParse(stdout.trim()));
  return parsed.success ? parsed.data.error?.message : undefined;
}

const OpenCodeErrorEventSchema = z.object({
  type: z.literal("error"),
  error: z.object({
    name: z.string().optional(),
    data: z.object({ message: z.string() }).optional(),
  }),
});

/** Recovers OpenCode's `--format json` `type: "error"` event message, if present. */
export function extractOpenCodeError(stdout: string): string | undefined {
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parsed = OpenCodeErrorEventSchema.safeParse(safeJsonParse(trimmed));
    if (!parsed.success) continue;

    return parsed.data.error.data?.message ?? parsed.data.error.name;
  }
  return undefined;
}
