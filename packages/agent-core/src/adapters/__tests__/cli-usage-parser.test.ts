import { describe, it, expect } from "vitest";
import {
  parseOpenCodeUsage,
  parseClaudeCliUsage,
  parseGrokUsage,
  parseOmpUsage,
  extractOpenCodeError,
  extractClaudeCliError,
  extractGrokError,
  extractOmpError,
} from "../cli-usage-parser.js";

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

describe("parseClaudeCliUsage", () => {
  // Real captured shape from `claude -p "<prompt>" --output-format json
  // --max-turns 1` (measured, issue #3585 comment).
  it("maps total_cost_usd, num_turns, and usage onto CliUsage", () => {
    const stdout = JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: false,
      result: "Done.",
      session_id: "abc123",
      total_cost_usd: 0.193839,
      num_turns: 1,
      duration_ms: 4000,
      duration_api_ms: 3800,
      usage: {
        input_tokens: 1200,
        output_tokens: 340,
        cache_creation_input_tokens: 500,
        cache_read_input_tokens: 100,
      },
      modelUsage: {},
      stop_reason: null,
      permission_denials: [],
      uuid: "abc-def",
    });

    const usage = parseClaudeCliUsage(stdout);

    expect(usage.costUsd).toBeCloseTo(0.193839, 6);
    expect(usage.numTurns).toBe(1);
    expect(usage.tokenUsage).toEqual({ inputTokens: 1200, outputTokens: 340 });
  });

  it("returns no usage fields for non-JSON stdout, without throwing", () => {
    expect(() => parseClaudeCliUsage("not json output")).not.toThrow();

    const usage = parseClaudeCliUsage("not json output");

    expect(usage.costUsd).toBeUndefined();
    expect(usage.numTurns).toBeUndefined();
    expect(usage.tokenUsage).toBeUndefined();
  });

  it("returns no usage fields when the JSON blob has none of the expected keys", () => {
    const usage = parseClaudeCliUsage(JSON.stringify({ session_id: "abc" }));

    expect(usage.costUsd).toBeUndefined();
    expect(usage.numTurns).toBeUndefined();
    expect(usage.tokenUsage).toBeUndefined();
  });
});

describe("extractClaudeCliError", () => {
  it("recovers the result text when is_error is true", () => {
    const stdout = JSON.stringify({
      type: "result",
      subtype: "error_during_execution",
      is_error: true,
      result: "Agent stopped: unexpected tool failure.",
      session_id: "abc123",
    });

    expect(extractClaudeCliError(stdout)).toBe("Agent stopped: unexpected tool failure.");
  });

  it("falls back to subtype when result text is absent", () => {
    const stdout = JSON.stringify({
      type: "result",
      subtype: "error_max_turns",
      is_error: true,
      session_id: "abc123",
    });

    expect(extractClaudeCliError(stdout)).toBe("error_max_turns");
  });

  it("returns undefined when is_error is false", () => {
    const stdout = JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: false,
      result: "Done.",
    });

    expect(extractClaudeCliError(stdout)).toBeUndefined();
  });

  it("returns undefined when stdout is not JSON", () => {
    expect(extractClaudeCliError("plain text stderr-style output")).toBeUndefined();
  });
});

describe("parseGrokUsage", () => {
  it("folds cache buckets into inputTokens and reports cost and turns", () => {
    const stdout = JSON.stringify({
      text: "Done.",
      stopReason: "end_turn",
      num_turns: 7,
      usage: {
        input_tokens: 7210,
        cache_read_input_tokens: 41000,
        cache_creation_input_tokens: 12,
        output_tokens: 1893,
        reasoning_tokens: 412,
      },
      total_cost_usd: 0.01268905,
    });

    expect(parseGrokUsage(stdout)).toEqual({
      costUsd: 0.01268905,
      numTurns: 7,
      tokenUsage: { inputTokens: 48222, outputTokens: 1893 },
    });
  });

  it("omits costUsd when total_cost_usd is absent", () => {
    const stdout = JSON.stringify({
      text: "Done.",
      num_turns: 2,
      usage: { input_tokens: 10, output_tokens: 4 },
    });

    const usage = parseGrokUsage(stdout);
    expect(usage.costUsd).toBeUndefined();
    expect(usage.numTurns).toBe(2);
    expect(usage.tokenUsage).toEqual({ inputTokens: 10, outputTokens: 4 });
  });

  it("returns {} for plain text or malformed JSON", () => {
    expect(parseGrokUsage("All changes applied.\n")).toEqual({});
    expect(parseGrokUsage("{broken")).toEqual({});
    expect(parseGrokUsage("")).toEqual({});
  });

  it("returns no tokenUsage when the spend object has no usage", () => {
    const usage = parseGrokUsage(JSON.stringify({ text: "Done.", sessionId: "abc" }));
    expect(usage.tokenUsage).toBeUndefined();
    expect(usage.numTurns).toBeUndefined();
    expect(usage.costUsd).toBeUndefined();
  });
});

describe("extractGrokError", () => {
  it("recovers the message from a type:error object", () => {
    const stdout = JSON.stringify({
      type: "error",
      message: "Couldn't start session: not logged in",
    });

    expect(extractGrokError(stdout)).toBe("Couldn't start session: not logged in");
  });

  it("returns undefined for a success object or plain text", () => {
    expect(
      extractGrokError(JSON.stringify({ text: "Done.", stopReason: "end_turn" }))
    ).toBeUndefined();
    expect(extractGrokError("plain text stderr-style output")).toBeUndefined();
  });
});

describe("parseOmpUsage", () => {
  it("sums assistant message_end usage and folds cache buckets into input", () => {
    const stdout = [
      JSON.stringify({ type: "session", version: 3 }),
      JSON.stringify({
        type: "message_update",
        usage: { input: 1, output: 1, cacheRead: 1, cacheWrite: 1, cost: { total: 9 } },
      }),
      JSON.stringify({
        type: "message_end",
        message: { role: "user", usage: { input: 999, output: 999, cost: { total: 9 } } },
      }),
      JSON.stringify({ type: "turn_end", message: { role: "assistant" } }),
      JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          usage: { input: 100, output: 20, cacheRead: 50, cacheWrite: 4, cost: { total: 0.004 } },
        },
      }),
      JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          usage: { input: 10, output: 5, cost: { total: 0.001 } },
        },
      }),
    ].join("\n");

    const usage = parseOmpUsage(stdout);

    expect(usage.tokenUsage).toEqual({ inputTokens: 164, outputTokens: 25 });
    expect(usage.costUsd).toBeCloseTo(0.005, 6);
    expect(usage.numTurns).toBe(1);
  });

  it("falls back to assistant message_end count when no turn_end is present", () => {
    const stdout = [
      JSON.stringify({
        type: "message_end",
        message: { role: "assistant", usage: { input: 1, output: 1 } },
      }),
      JSON.stringify({
        type: "message_end",
        message: { role: "assistant", usage: { input: 2, output: 2 } },
      }),
    ].join("\n");

    expect(parseOmpUsage(stdout).numTurns).toBe(2);
    expect(parseOmpUsage(stdout).costUsd).toBeUndefined();
  });

  it("records a numeric zero cost and omits cost when the field is absent", () => {
    const zero = parseOmpUsage(
      JSON.stringify({
        type: "message_end",
        message: { role: "assistant", usage: { input: 1, output: 1, cost: { total: 0 } } },
      })
    );
    expect(zero.costUsd).toBe(0);

    const absent = parseOmpUsage(
      JSON.stringify({
        type: "message_end",
        message: { role: "assistant", usage: { input: 1, output: 1 } },
      })
    );
    expect(absent.costUsd).toBeUndefined();
  });

  it("returns {} for plain text, broken JSON, and empty stdout", () => {
    expect(parseOmpUsage("All changes applied.\n")).toEqual({});
    expect(parseOmpUsage("{broken")).toEqual({});
    expect(parseOmpUsage("")).toEqual({});
  });
});

describe("extractOmpError", () => {
  it("recovers finalError from a failed auto_retry_end", () => {
    expect(
      extractOmpError(
        JSON.stringify({ type: "auto_retry_end", success: false, finalError: "not logged in" })
      )
    ).toBe("not logged in");
  });

  it("keeps the last matching error in the stream", () => {
    const stdout = [
      JSON.stringify({ type: "auto_retry_end", success: false, finalError: "first" }),
      JSON.stringify({ type: "compaction_end", errorMessage: "compaction failed" }),
      JSON.stringify({
        type: "message_update",
        assistantMessageEvent: { type: "error", error: "stream failed" },
      }),
      JSON.stringify({ type: "extension_error", error: "extension failed" }),
      JSON.stringify({ type: "error", message: "last" }),
    ].join("\n");

    expect(extractOmpError(stdout)).toBe("last");
  });

  it("returns undefined for a success stream or plain text", () => {
    expect(
      extractOmpError(JSON.stringify({ type: "auto_retry_end", success: true, finalError: "nope" }))
    ).toBeUndefined();
    expect(extractOmpError("plain text stderr-style output")).toBeUndefined();
  });
});
