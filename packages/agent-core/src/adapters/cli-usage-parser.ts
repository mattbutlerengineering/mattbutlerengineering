/**
 * Parses cost/token usage from CLI subprocess stdout, for the two adapters
 * whose backends can emit machine-readable usage data.
 *
 * Neither Gemini CLI nor OpenCode CLI reports this in their default
 * (human-formatted) output — only under an explicit JSON output flag
 * (`--output-format json` for Gemini, `--format json` for OpenCode). These
 * adapters currently invoke the default text mode (see gemini-adapter.ts /
 * opencode-adapter.ts), so parsing here documents the shape each CLI *would*
 * emit if that flag were adopted, while degrading honestly to `undefined`
 * against the plain-text output actually produced today (#2996).
 *
 * Parsing never throws — malformed or missing data always yields `{}`.
 */

import { z } from "zod";
import type { TokenUsage } from "../types.js";

export interface CliUsage {
  readonly costUsd?: number;
  readonly tokenUsage?: TokenUsage;
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
//   { session_id, response, stats: { models: Record<string, { tokens }> }, error?, warnings? }
// `stats.models[*].tokens` carries `prompt` (input) / `candidates` (output)
// counts per model. Gemini CLI's stats never carry a USD figure, so
// costUsd is always left undefined here.

const GeminiModelMetricsSchema = z.object({
  tokens: z
    .object({
      prompt: z.number().optional(),
      candidates: z.number().optional(),
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
  let found = false;
  for (const model of Object.values(models)) {
    if (!model.tokens) continue;
    found = true;
    inputTokens += model.tokens.prompt ?? 0;
    outputTokens += model.tokens.candidates ?? 0;
  }

  return found ? { tokenUsage: { inputTokens, outputTokens } } : {};
}

// ── OpenCode CLI (`--format json`) ───────────────────────────────────
//
// Streams newline-delimited JSON events; each `step_finish` event carries a
// per-step `cost` (USD) and `tokens` object. A run may include several steps
// (multi-turn agent loop) — sum across all step_finish events in the stream.

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
  let found = false;

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parsed = OpenCodeStepFinishEventSchema.safeParse(safeJsonParse(trimmed));
    if (!parsed.success) continue;

    found = true;
    costUsd += parsed.data.part.cost;
    inputTokens += parsed.data.part.tokens.input;
    outputTokens += parsed.data.part.tokens.output;
  }

  return found ? { costUsd, tokenUsage: { inputTokens, outputTokens } } : {};
}
