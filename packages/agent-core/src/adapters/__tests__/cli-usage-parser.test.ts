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

  // #4208: numTurns must be derived from real subprocess activity, never a
  // hardcoded 0. `stats.models[*].api.totalRequests` is the real field Gemini
  // CLI's own JSON formatter emits for this — verified against the installed
  // @google/gemini-cli@0.46.0 package: `uiTelemetryService.getMetrics()`
  // (packages/core/src/telemetry/uiTelemetry.ts) feeds `JsonFormatter.format`
  // (packages/core/src/output/json-formatter.ts) as the `stats` field, and
  // `createInitialModelMetrics()` gives each model an `api.totalRequests`
  // counter incremented once per model API call — i.e. once per turn. A live
  // successful capture could not be obtained in this environment (the
  // account behind the locally-installed CLI returns `IneligibleTierError`,
  // a server-side account-tier deprecation unrelated to missing
  // credentials), so this fixture reproduces that real, cited schema rather
  // than inventing a plausible-looking shape.
  it("sums api.totalRequests across models into numTurns", () => {
    const stdout = JSON.stringify({
      session_id: "abc123",
      response: "Done.",
      stats: {
        models: {
          "gemini-2.5-pro": {
            api: { totalRequests: 3 },
            tokens: { prompt: 1200, candidates: 340 },
          },
          "gemini-2.5-flash": {
            api: { totalRequests: 1 },
            tokens: { prompt: 300, candidates: 60 },
          },
        },
      },
    });

    const usage = parseGeminiUsage(stdout);

    expect(usage.numTurns).toBe(4);
  });

  // Real captured stdout: an actual `gemini -p "..." --yolo --output-format
  // json` invocation against a genuinely unusable account (server-side tier
  // deprecation, functionally identical to "no credentials" for this
  // adapter) — the CLI exits non-zero with every diagnostic on stderr and
  // emits nothing on stdout at all. This is the real shape a credential-less
  // run produces, not a hand-built empty string.
  it("returns no numTurns for a real captured no-credentials failure (empty stdout)", () => {
    const usage = parseGeminiUsage("");

    expect(usage.numTurns).toBeUndefined();
    expect(usage.costUsd).toBeUndefined();
    expect(usage.tokenUsage).toBeUndefined();
  });

  it("returns no numTurns when no model reports api.totalRequests", () => {
    const usage = parseGeminiUsage(
      JSON.stringify({
        stats: { models: { "gemini-2.5-pro": { tokens: { prompt: 10, candidates: 5 } } } },
      })
    );

    expect(usage.numTurns).toBeUndefined();
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

  // #4208: numTurns must be derived from real subprocess activity. Both
  // fixtures below are real, unedited `opencode run "<prompt>" --format
  // json` stdout captured live from the installed opencode CLI (1.17.20) —
  // not hand-built to match the implementation.
  it("counts one turn per step_finish event — real single-turn capture", () => {
    // Real capture: `opencode run "Reply with exactly the word: pong. Do not
    // use any tools." --format json` — one step_start/text/step_finish triad.
    const stdout = [
      '{"type":"step_start","timestamp":1786737264397,"sessionID":"ses_ffe290195ffeSCuHVYQeRNfF65","part":{"id":"prt_001d7070b001dcFNngtLAqQHdV","messageID":"msg_001d6ff6b001d8mmEJ9yIsAHkL","sessionID":"ses_ffe290195ffeSCuHVYQeRNfF65","snapshot":"a962ef1dfe0c16cade9a4cd8b9465002ac5da388","type":"step-start"}}',
      '{"type":"text","timestamp":1786737265427,"sessionID":"ses_ffe290195ffeSCuHVYQeRNfF65","part":{"id":"prt_001d70ae5001deBoVZkvdVdSlg","messageID":"msg_001d6ff6b001d8mmEJ9yIsAHkL","sessionID":"ses_ffe290195ffeSCuHVYQeRNfF65","type":"text","text":"pong","time":{"start":1786737265381,"end":1786737265424}}}',
      '{"type":"step_finish","timestamp":1786737265529,"sessionID":"ses_ffe290195ffeSCuHVYQeRNfF65","part":{"id":"prt_001d70b73001PXiXfgXxvEVMDZ","reason":"stop","snapshot":"926177d97f1d182fcc8f9812b549b1a00c5365be","messageID":"msg_001d6ff6b001d8mmEJ9yIsAHkL","sessionID":"ses_ffe290195ffeSCuHVYQeRNfF65","type":"step-finish","tokens":{"total":9412,"input":9409,"output":3,"reasoning":0,"cache":{"write":0,"read":0}},"cost":0}}',
    ].join("\n");

    const usage = parseOpenCodeUsage(stdout);

    expect(usage.numTurns).toBe(1);
  });

  it("counts multiple turns across a tool-use step plus a final-answer step — real multi-turn capture", () => {
    // Real capture: `opencode run "Run the bash command 'echo hello' using
    // your tool, then in a separate final message reply with exactly: done"
    // --format json` — a tool-call step_finish followed by a stop step_finish.
    const stdout = [
      '{"type":"step_start","timestamp":1786737278594,"sessionID":"ses_ffe28c8d2ffekLzAfdgiPKtVjs","part":{"id":"prt_001d73e80001ByjNPmyXif7tHW","messageID":"msg_001d738150017NkHamgfPxALna","sessionID":"ses_ffe28c8d2ffekLzAfdgiPKtVjs","snapshot":"f7d0de8ec935e7c5ff356f33a774f76753b3ec0c","type":"step-start"}}',
      '{"type":"tool_use","timestamp":1786737279693,"sessionID":"ses_ffe28c8d2ffekLzAfdgiPKtVjs","part":{"type":"tool","tool":"bash","callID":"call_00_uiGdXV862L7iasfOFMUU4764","state":{"status":"completed","input":{"command":"echo hello"},"output":"hello\\n","metadata":{"output":"hello\\n","exit":0,"truncated":false},"title":"echo hello","time":{"start":1786737279688,"end":1786737279691}},"id":"prt_001d74260001LO6sNgopubS5Ra","sessionID":"ses_ffe28c8d2ffekLzAfdgiPKtVjs","messageID":"msg_001d738150017NkHamgfPxALna"}}',
      '{"type":"step_finish","timestamp":1786737279822,"sessionID":"ses_ffe28c8d2ffekLzAfdgiPKtVjs","part":{"id":"prt_001d74349001H2ifn3cCGKj1Am","reason":"tool-calls","snapshot":"ba9982c4b57041104ce9256a9d35e97c2cc70f9b","messageID":"msg_001d738150017NkHamgfPxALna","sessionID":"ses_ffe28c8d2ffekLzAfdgiPKtVjs","type":"step-finish","tokens":{"total":9480,"input":74,"output":44,"reasoning":18,"cache":{"write":0,"read":9344}},"cost":0}}',
      '{"type":"step_start","timestamp":1786737280687,"sessionID":"ses_ffe28c8d2ffekLzAfdgiPKtVjs","part":{"id":"prt_001d746ad001Gak5HyNeuGETXS","messageID":"msg_001d743c8001T041Lbrl6Sl4si","sessionID":"ses_ffe28c8d2ffekLzAfdgiPKtVjs","snapshot":"feefe6f4bf9147f866023a0de4c16239b9a6efc8","type":"step-start"}}',
      '{"type":"text","timestamp":1786737281576,"sessionID":"ses_ffe28c8d2ffekLzAfdgiPKtVjs","part":{"id":"prt_001d749fd0016HzFouif8pjlTl","messageID":"msg_001d743c8001T041Lbrl6Sl4si","sessionID":"ses_ffe28c8d2ffekLzAfdgiPKtVjs","type":"text","text":"done","time":{"start":1786737281533,"end":1786737281574}}}',
      '{"type":"step_finish","timestamp":1786737281673,"sessionID":"ses_ffe28c8d2ffekLzAfdgiPKtVjs","part":{"id":"prt_001d74a86001Wb0QPSJGwOqxl9","reason":"stop","snapshot":"f68d8419dc13703ff1d82707bb3cd4a2aeec39d3","messageID":"msg_001d743c8001T041Lbrl6Sl4si","sessionID":"ses_ffe28c8d2ffekLzAfdgiPKtVjs","type":"step-finish","tokens":{"total":9496,"input":22,"output":2,"reasoning":0,"cache":{"write":0,"read":9472}},"cost":0}}',
    ].join("\n");

    const usage = parseOpenCodeUsage(stdout);

    expect(usage.numTurns).toBe(2);
  });

  it("returns no numTurns for OpenCode's default (non-JSON) text output", () => {
    const usage = parseOpenCodeUsage("Applied fix.\nDone.\n");

    expect(usage.numTurns).toBeUndefined();
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
