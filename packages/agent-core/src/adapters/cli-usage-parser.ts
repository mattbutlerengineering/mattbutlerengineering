/**
 * Parses cost/token usage from CLI subprocess stdout.
 *
 * OpenCode (`--format json`), Claude CLI, Grok (`--output-format json`), and
 * Oh My Pi (`omp -p --mode json`) all emit machine-readable output. Parsing
 * never throws — malformed or missing data always yields `{}` (usage) or
 * `undefined` (error extraction).
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

// ── Claude CLI (`--output-format json`) ─────────────────────────────
//
// Emits a single JSON object at the end of the run (measured, issue #3585):
//   { type, subtype, is_error, result, session_id, total_cost_usd,
//     num_turns, duration_ms, duration_api_ms, usage, modelUsage,
//     stop_reason, permission_denials, uuid }
// `usage.input_tokens` / `usage.output_tokens` are the real per-run token
// counts; `total_cost_usd` and `num_turns` are reported directly, unlike
// OpenCode (summed across step_finish events) or Oh My Pi (summed across
// assistant message_end events). Grok reports the same top-level cost
// field; see parseGrokUsage.

const ClaudeCliUsageSchema = z.object({
  input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
});

const ClaudeCliJsonOutputSchema = z.object({
  total_cost_usd: z.number().optional(),
  num_turns: z.number().optional(),
  usage: ClaudeCliUsageSchema.optional(),
});

export function parseClaudeCliUsage(stdout: string): CliUsage {
  const raw = safeJsonParse(stdout.trim());
  const parsed = ClaudeCliJsonOutputSchema.safeParse(raw);
  if (!parsed.success) return {};

  const { total_cost_usd, num_turns, usage } = parsed.data;
  const tokensFound =
    usage !== undefined && (usage.input_tokens !== undefined || usage.output_tokens !== undefined);

  return {
    ...(total_cost_usd !== undefined ? { costUsd: total_cost_usd } : {}),
    ...(num_turns !== undefined ? { numTurns: num_turns } : {}),
    ...(tokensFound
      ? {
          tokenUsage: {
            inputTokens: usage?.input_tokens ?? 0,
            outputTokens: usage?.output_tokens ?? 0,
          },
        }
      : {}),
  };
}

const ClaudeCliResultSchema = z.object({
  is_error: z.boolean().optional(),
  subtype: z.string().optional(),
  result: z.string().optional(),
});

/**
 * Recovers Claude CLI's `--output-format json` failure message, if present.
 * Only returns a message when `is_error` is true — a successful run's
 * `result` field is the task's actual output, not an error to surface.
 */
export function extractClaudeCliError(stdout: string): string | undefined {
  const parsed = ClaudeCliResultSchema.safeParse(safeJsonParse(stdout.trim()));
  if (!parsed.success || !parsed.data.is_error) return undefined;
  return parsed.data.result ?? parsed.data.subtype;
}

// ── Grok CLI (`grok -p --output-format json`) ────────────────────────
//
// Emits one JSON object. `usage.input_tokens` is uncached input only;
// cache hits live in sibling buckets. `TokenUsage` has a single input
// counter, so those buckets are summed into `inputTokens`.
// `total_cost_usd` is omitted when the server did not report a complete
// cost (pool/OAuth, or `cost_is_partial`). Absence means unreported,
// never free — leave `costUsd` undefined rather than writing 0.
// `reasoning_tokens` is already excluded from grok's own `total_tokens`
// formula, so it is not added to `outputTokens`.

const GrokTokenUsageSchema = z.object({
  input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
  cache_read_input_tokens: z.number().optional(),
  cache_creation_input_tokens: z.number().optional(),
});

const GrokJsonOutputSchema = z.object({
  num_turns: z.number().optional(),
  total_cost_usd: z.number().optional(),
  usage: GrokTokenUsageSchema.optional(),
});

export function parseGrokUsage(stdout: string): CliUsage {
  const parsed = GrokJsonOutputSchema.safeParse(safeJsonParse(stdout.trim()));
  if (!parsed.success) return {};

  const { usage, num_turns: numTurns, total_cost_usd: costUsd } = parsed.data;
  const hasTokens =
    usage !== undefined &&
    (usage.input_tokens !== undefined ||
      usage.output_tokens !== undefined ||
      usage.cache_read_input_tokens !== undefined ||
      usage.cache_creation_input_tokens !== undefined);

  return {
    ...(costUsd !== undefined ? { costUsd } : {}),
    ...(numTurns !== undefined ? { numTurns } : {}),
    ...(hasTokens && usage
      ? {
          tokenUsage: {
            inputTokens:
              (usage.input_tokens ?? 0) +
              (usage.cache_read_input_tokens ?? 0) +
              (usage.cache_creation_input_tokens ?? 0),
            outputTokens: usage.output_tokens ?? 0,
          },
        }
      : {}),
  };
}

const GrokJsonErrorSchema = z.object({
  type: z.literal("error"),
  message: z.string().min(1),
});

/** Recovers Grok's `--output-format json` `{ type: "error", message }` text, if present. */
export function extractGrokError(stdout: string): string | undefined {
  const parsed = GrokJsonErrorSchema.safeParse(safeJsonParse(stdout.trim()));
  return parsed.success ? parsed.data.message : undefined;
}

// ── Oh My Pi (`omp -p --mode json`) ──────────────────────────────────
//
// Newline-delimited JSON. Authoritative token usage is on assistant
// `message_end` events (`message.usage`). Streaming `message_update`
// events repeat partial counters, so they are ignored. `usage.input` is
// uncached; cache hits live in `cacheRead` / `cacheWrite`. `TokenUsage`
// has one input counter, so those buckets are summed into `inputTokens`.
// `usage.cost.total` is an API-price figure, not a bill. A missing cost
// field stays undefined (unreported). A numeric 0 is recorded.
// `numTurns` counts `turn_end` events. When the stream has assistant
// `message_end` events but no `turn_end`, that count is the fallback.

const OmpUsageSchema = z.object({
  input: z.number().optional(),
  output: z.number().optional(),
  cacheRead: z.number().optional(),
  cacheWrite: z.number().optional(),
  cost: z
    .object({
      total: z.number().optional(),
    })
    .optional(),
});

const OmpMessageEndSchema = z.object({
  type: z.literal("message_end"),
  message: z.object({
    role: z.string().optional(),
    usage: OmpUsageSchema.optional(),
  }),
});

const OmpTurnEndSchema = z.object({
  type: z.literal("turn_end"),
});

export function parseOmpUsage(stdout: string): CliUsage {
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let tokensFound = false;
  let costFound = false;
  let turnEnds = 0;
  let assistantEnds = 0;

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const raw = safeJsonParse(trimmed);
    if (raw === undefined) continue;

    if (OmpTurnEndSchema.safeParse(raw).success) {
      turnEnds += 1;
    }

    const messageEnd = OmpMessageEndSchema.safeParse(raw);
    if (!messageEnd.success || messageEnd.data.message.role !== "assistant") continue;
    assistantEnds += 1;
    const usage = messageEnd.data.message.usage;
    if (!usage) continue;

    const hasTokens =
      usage.input !== undefined ||
      usage.output !== undefined ||
      usage.cacheRead !== undefined ||
      usage.cacheWrite !== undefined;
    if (hasTokens) {
      tokensFound = true;
      inputTokens += (usage.input ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
      outputTokens += usage.output ?? 0;
    }
    if (usage.cost?.total !== undefined) {
      costFound = true;
      costUsd += usage.cost.total;
    }
  }

  const numTurns = turnEnds > 0 ? turnEnds : assistantEnds > 0 ? assistantEnds : undefined;
  if (!tokensFound && !costFound && numTurns === undefined) return {};

  return {
    ...(costFound ? { costUsd } : {}),
    ...(numTurns !== undefined ? { numTurns } : {}),
    ...(tokensFound ? { tokenUsage: { inputTokens, outputTokens } } : {}),
  };
}

const OmpAutoRetryErrorSchema = z.object({
  type: z.literal("auto_retry_end"),
  success: z.literal(false),
  finalError: z.string().min(1),
});

const OmpCompactionErrorSchema = z.object({
  type: z.literal("compaction_end"),
  errorMessage: z.string().min(1),
});

const OmpAssistantStreamErrorSchema = z.object({
  type: z.literal("message_update"),
  assistantMessageEvent: z.object({
    type: z.literal("error"),
    error: z.string().min(1),
  }),
});

const OmpExtensionErrorSchema = z.object({
  type: z.literal("extension_error"),
  error: z.string().min(1),
});

const OmpGenericErrorSchema = z.object({
  type: z.literal("error"),
  message: z.string().min(1),
});

function ompErrorFromRecord(raw: unknown): string | undefined {
  const retry = OmpAutoRetryErrorSchema.safeParse(raw);
  if (retry.success) return retry.data.finalError;
  const compaction = OmpCompactionErrorSchema.safeParse(raw);
  if (compaction.success) return compaction.data.errorMessage;
  const stream = OmpAssistantStreamErrorSchema.safeParse(raw);
  if (stream.success) return stream.data.assistantMessageEvent.error;
  const extension = OmpExtensionErrorSchema.safeParse(raw);
  if (extension.success) return extension.data.error;
  const generic = OmpGenericErrorSchema.safeParse(raw);
  if (generic.success) return generic.data.message;
  return undefined;
}

/** Last matching Oh My Pi JSONL error wins. Never throws. */
export function extractOmpError(stdout: string): string | undefined {
  let message: string | undefined;
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const found = ompErrorFromRecord(safeJsonParse(trimmed));
    if (found) message = found;
  }
  return message;
}
