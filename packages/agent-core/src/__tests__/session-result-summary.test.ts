import { describe, it, expect } from "vitest";
import type { SessionResultSummary } from "../types.js";
import type { AdapterResult } from "../cli-adapter.js";

// SessionResultSummary is the adapter-neutral shape VerificationPhase,
// PublishPhase, and FeedbackPhase consume off `resultMessage` (#3233).
// This test proves it's constructible from a non-Claude adapter's output
// (AdapterResult, which has no SDKResultMessage dependency) — not just from
// the Claude Agent SDK's result message.

describe("SessionResultSummary", () => {
  it("is constructible from CLI-adapter output (Gemini/OpenCode, no SDKResultMessage)", () => {
    const adapterResult: AdapterResult = {
      success: true,
      hasChanges: true,
      rateLimited: false,
      durationMs: 4200,
      costUsd: 0.12,
    };

    const summary: SessionResultSummary = {
      success: adapterResult.success,
      sessionId: "",
      costUsd: adapterResult.costUsd ?? 0,
      numTurns: 0,
    };

    expect(summary).toEqual({
      success: true,
      sessionId: "",
      costUsd: 0.12,
      numTurns: 0,
    });
  });
});
