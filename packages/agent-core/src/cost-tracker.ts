import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import type { TokenUsage, SessionResult, SessionStatus } from "./types.js";

interface RawResultSuccess {
  readonly subtype: "success";
  readonly session_id: string;
  readonly duration_ms: number;
  readonly num_turns: number;
  readonly result: string;
  readonly total_cost_usd: number;
  readonly usage: {
    readonly input_tokens: number | null;
    readonly output_tokens: number | null;
  };
}

interface RawResultError {
  readonly subtype:
    | "error_max_turns"
    | "error_during_execution"
    | "error_max_budget_usd"
    | "error_max_structured_output_retries";
  readonly session_id: string;
  readonly duration_ms: number;
  readonly num_turns: number;
  readonly total_cost_usd: number;
  readonly usage: {
    readonly input_tokens: number | null;
    readonly output_tokens: number | null;
  };
  readonly errors: readonly string[];
}

export function extractTokenUsage(result: SDKResultMessage): TokenUsage {
  return {
    inputTokens: result.usage.input_tokens ?? 0,
    outputTokens: result.usage.output_tokens ?? 0,
  };
}

export function extractCost(result: SDKResultMessage): number {
  return result.total_cost_usd;
}

function mapSubtypeToStatus(subtype: string): SessionStatus {
  if (subtype === "success") return "succeeded";
  return "failed";
}

function getResultText(result: SDKResultMessage): string {
  if (result.subtype === "success") {
    return (result as unknown as RawResultSuccess).result;
  }
  return "";
}

function getErrors(result: SDKResultMessage): readonly string[] {
  if (result.subtype !== "success") {
    return (result as unknown as RawResultError).errors ?? [];
  }
  return [];
}

export function buildSessionResult(
  result: SDKResultMessage,
  branchName: string,
  prUrl: string | null
): SessionResult {
  return {
    sessionId: result.session_id,
    status: mapSubtypeToStatus(result.subtype),
    branchName,
    prUrl,
    costUsd: extractCost(result),
    tokenUsage: extractTokenUsage(result),
    durationMs: result.duration_ms,
    numTurns: result.num_turns,
    resultText: getResultText(result),
    errors: [...getErrors(result)],
  };
}
