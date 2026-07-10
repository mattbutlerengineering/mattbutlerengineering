import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import type { TokenUsage, SessionResult, SessionResultSummary, SessionStatus } from "./types.js";

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
    return result.result;
  }
  return "";
}

function getErrors(result: SDKResultMessage): readonly string[] {
  if (result.subtype !== "success") {
    return result.errors ?? [];
  }
  return [];
}

/**
 * Maps a Claude SDK result to the adapter-neutral summary consumed by
 * VerificationPhase, PublishPhase, and FeedbackPhase (#3233). This is the
 * seam where Claude's `SDKResultMessage` stays confined to the Claude
 * adapter path — downstream phases only ever see this neutral shape.
 */
export function buildSessionResultSummary(result: SDKResultMessage): SessionResultSummary {
  return {
    success: result.subtype === "success",
    sessionId: result.session_id,
    costUsd: extractCost(result),
    numTurns: result.num_turns,
    subtype: result.subtype,
    errors: getErrors(result),
  };
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
