import { describe, it, expect } from "vitest";
import {
  parseGeminiUsage,
  parseOpenCodeUsage,
  extractGeminiError,
  extractOpenCodeError,
} from "../cli-usage-parser.js";

describe("parseGeminiUsage", () => {
  it("sums input/output tokens across models from a `--output-format json` blob", () => {
    const stdout = JSON.stringify({
      session_id: "abc123",
      response: "Done.",
      stats: {
        models: {
          "gemini-2.5-pro": {
            tokens: { prompt: 1200, candidates: 340, total: 1540, cached: 0 },
          },
          "gemini-2.5-flash": {
            tokens: { prompt: 300, candidates: 60, total: 360, cached: 0 },
          },
        },
      },
    });

    const usage = parseGeminiUsage(stdout);

    expect(usage.tokenUsage).toEqual({ inputTokens: 1500, outputTokens: 400 });
    // Gemini CLI's stats never carry a USD figure — cost is always undefined.
    expect(usage.costUsd).toBeUndefined();
  });

  it("returns no usage fields for Gemini's default (non-JSON) text output", () => {
    const usage = parseGeminiUsage("All changes applied.\n");

    expect(usage.tokenUsage).toBeUndefined();
    expect(usage.costUsd).toBeUndefined();
  });

  it("returns no usage fields when the JSON blob has no stats", () => {
    const usage = parseGeminiUsage(JSON.stringify({ session_id: "abc", response: "Done." }));

    expect(usage.tokenUsage).toBeUndefined();
  });
});

describe("parseOpenCodeUsage", () => {
  it("sums cost/tokens across step_finish NDJSON events from `--format json`", () => {
    const lines = [
      JSON.stringify({ type: "step_start", sessionID: "s1", part: {} }),
      JSON.stringify({
        type: "step_finish",
        sessionID: "s1",
        part: {
          cost: 0.012,
          tokens: { input: 800, output: 150, reasoning: 0, cache: { read: 0, write: 0 } },
        },
      }),
      JSON.stringify({
        type: "step_finish",
        sessionID: "s1",
        part: {
          cost: 0.008,
          tokens: { input: 200, output: 50, reasoning: 0, cache: { read: 0, write: 0 } },
        },
      }),
    ];

    const usage = parseOpenCodeUsage(lines.join("\n"));

    expect(usage.costUsd).toBeCloseTo(0.02, 6);
    expect(usage.tokenUsage).toEqual({ inputTokens: 1000, outputTokens: 200 });
  });

  it("returns no usage fields for OpenCode's default (non-JSON) text output", () => {
    const usage = parseOpenCodeUsage("Applied fix.\nDone.\n");

    expect(usage.tokenUsage).toBeUndefined();
    expect(usage.costUsd).toBeUndefined();
  });

  it("ignores malformed lines without throwing", () => {
    const usage = parseOpenCodeUsage("not json\n{broken\n");

    expect(usage.tokenUsage).toBeUndefined();
    expect(usage.costUsd).toBeUndefined();
  });
});

// ── Soft-error extraction from JSON stdout (#3019) ───────────────────

describe("extractGeminiError", () => {
  it("recovers the error message from a `--output-format json` error blob", () => {
    const stdout = JSON.stringify({
      session_id: "abc123",
      error: { type: "FatalError", message: "Something went fatally wrong", code: 1 },
    });

    expect(extractGeminiError(stdout)).toBe("Something went fatally wrong");
  });

  it("returns undefined when stdout is not JSON", () => {
    expect(extractGeminiError("plain text stderr-style output")).toBeUndefined();
  });

  it("returns undefined when the JSON blob has no error field", () => {
    expect(
      extractGeminiError(JSON.stringify({ session_id: "abc", response: "Done." }))
    ).toBeUndefined();
  });
});

describe("extractOpenCodeError", () => {
  it("recovers the error message from a `type: error` NDJSON event", () => {
    // Matches the real `opencode run --format json` failure event shape.
    const stdout = JSON.stringify({
      type: "error",
      timestamp: 1783049957300,
      sessionID: "ses_abc123",
      error: { name: "UnknownError", data: { message: "Unexpected server error.", ref: "err_1" } },
    });

    expect(extractOpenCodeError(stdout)).toBe("Unexpected server error.");
  });

  it("falls back to the error name when no data.message is present", () => {
    const stdout = JSON.stringify({
      type: "error",
      sessionID: "ses_abc123",
      error: { name: "MessageOutputLengthError" },
    });

    expect(extractOpenCodeError(stdout)).toBe("MessageOutputLengthError");
  });

  it("returns undefined when stdout is not JSON", () => {
    expect(extractOpenCodeError("plain text stderr-style output")).toBeUndefined();
  });

  it("returns undefined when no line is an error event", () => {
    const stdout = [
      JSON.stringify({ type: "step_start", sessionID: "s1", part: {} }),
      JSON.stringify({
        type: "step_finish",
        sessionID: "s1",
        part: { cost: 0, tokens: { input: 1, output: 1 } },
      }),
    ].join("\n");

    expect(extractOpenCodeError(stdout)).toBeUndefined();
  });
});
