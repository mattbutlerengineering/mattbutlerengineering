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
// `uiTelemetryService.getMetrics()`'s per-model API-call counter (verified
// against the installed @google/gemini-cli package's own
// packages/core/src/telemetry/uiTelemetry.ts), incremented once per model
// API call — i.e. once per turn. Summed across models, never fabricated.

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
