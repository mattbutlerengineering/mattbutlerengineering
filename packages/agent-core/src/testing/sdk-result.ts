/**
 * Typed SDK result-message builders shared by session fixtures and the mock
 * Claude client. Typed against the real SDK so shape drift fails typecheck.
 */

import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";

export interface ResultInputs {
  readonly sessionId: string;
  readonly numTurns: number;
  readonly costUsd: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly durationMs: number;
}

/** Deterministic UUID-shaped id derived from a seed (the SDK types uuid as a 5-part template). */
function fixtureUuid(seed: string): SDKResultMessage["uuid"] {
  const hex = Buffer.from(seed).toString("hex").padEnd(32, "0").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function buildUsage(inputTokens: number, outputTokens: number): SDKResultMessage["usage"] {
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 },
    inference_geo: "us",
    iterations: [],
    server_tool_use: { web_fetch_requests: 0, web_search_requests: 0 },
    service_tier: "standard",
    speed: "standard",
  };
}

export function buildSuccessResult(opts: ResultInputs, result: string): SDKResultMessage {
  return {
    type: "result",
    subtype: "success",
    uuid: fixtureUuid(opts.sessionId),
    session_id: opts.sessionId,
    duration_ms: opts.durationMs,
    duration_api_ms: Math.floor(opts.durationMs * 0.9),
    is_error: false,
    num_turns: opts.numTurns,
    result,
    stop_reason: "end_turn",
    total_cost_usd: opts.costUsd,
    usage: buildUsage(opts.inputTokens, opts.outputTokens),
    modelUsage: {},
    permission_denials: [],
  };
}
