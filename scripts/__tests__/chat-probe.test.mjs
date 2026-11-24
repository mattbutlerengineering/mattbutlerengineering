import { describe, expect, it } from "vitest";
import {
  COST_CEILING_USD,
  ESTIMATED_COST_PER_REQUEST_USD,
  PROBE_PROMPTS,
  buildIssue,
  buildRequestBody,
  classifyReply,
  createCostGuard,
  dedupeKey,
  parseNdjson,
  runProbe,
} from "../lib/chat-probe.mjs";

const text = (content) => ({ type: "text", content });
const element = (type = "StatusLED") => ({
  type: "element",
  element: { id: "e", type, props: {}, children: [] },
});
const prompt = (overrides = {}) => ({ id: "p", prompt: "hi", expect: "any", ...overrides });

describe("PROBE_PROMPTS", () => {
  it("has at least 8 prompts with unique ids", () => {
    expect(PROBE_PROMPTS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(PROBE_PROMPTS.map((p) => p.id)).size).toBe(PROBE_PROMPTS.length);
  });

  it("includes at least one write prompt that must reach a confirmation", () => {
    expect(PROBE_PROMPTS.some((p) => p.expect === "confirm")).toBe(true);
  });

  it("fits inside the cost ceiling", () => {
    expect(PROBE_PROMPTS.length * ESTIMATED_COST_PER_REQUEST_USD).toBeLessThanOrEqual(
      COST_CEILING_USD
    );
  });
});

describe("parseNdjson", () => {
  it("parses lines, skipping blanks and unparseable lines", () => {
    const events = parseNdjson('\n{"type":"text","content":"a"}\nnot json\n');
    expect(events).toEqual([{ type: "text", content: "a" }]);
  });
});

describe("classifyReply", () => {
  it("passes a clean text reply", () => {
    const result = classifyReply(prompt(), {
      status: 200,
      events: [text("You have 3 tables free.")],
    });
    expect(result).toEqual({ verdict: "pass", failures: [] });
  });

  it.each([
    ["element call text", "ReservationList(reservations=[{time: 1}])", "raw-element-call"],
    ["TimeSlots call", 'TimeSlots(date="Monday")', "raw-element-call"],
    ["JSONL patch", '{"op":"add","path":"/x"}', "raw-tool-json"],
    ["tool json", '{"toolName":"get_table_status"}', "raw-tool-json"],
    ["stack trace", "TypeError: boom\n    at foo (/app/x.js:1:2)", "stack-trace"],
    ["undefined", "Table undefined is free", "undefined-text"],
    ["placeholder braces", "Hello {{guestName}}", "unrendered-placeholder"],
    ["placeholder prose", "[ReservationList elements show here]", "unrendered-placeholder"],
    ["seam fallback", "Component could not be displayed", "seam-fallback"],
  ])("flags %s", (_label, content, code) => {
    const result = classifyReply(prompt(), { status: 200, events: [text(content)] });
    expect(result.verdict).toBe("fail");
    expect(result.failures.map((f) => f.code)).toContain(code);
  });

  it("flags a $genError reply", () => {
    const result = classifyReply(prompt(), {
      status: 200,
      events: [{ $genError: "Generation failed before a UI came back." }],
    });
    expect(result.failures.map((f) => f.code)).toContain("gen-error");
  });

  it("treats a busy upstream message as inconclusive, not a failure", () => {
    const result = classifyReply(prompt(), {
      status: 200,
      events: [{ $genError: "The assistant is busy right now. Wait a minute, then try again." }],
    });
    expect(result.verdict).toBe("inconclusive");
  });

  it("treats 429 as inconclusive and other non-200s as failures", () => {
    expect(classifyReply(prompt(), { status: 429, events: [] }).verdict).toBe("inconclusive");
    const bad = classifyReply(prompt(), { status: 500, events: [] });
    expect(bad.failures.map((f) => f.code)).toEqual(["http-500"]);
  });

  it("flags an empty reply", () => {
    const result = classifyReply(prompt(), { status: 200, events: [] });
    expect(result.failures.map((f) => f.code)).toContain("empty-reply");
  });

  it("flags a missing element when one is expected", () => {
    const result = classifyReply(prompt({ expect: "element" }), {
      status: 200,
      events: [text("All tables are free.")],
    });
    expect(result.failures.map((f) => f.code)).toContain("missing-element");
    expect(
      classifyReply(prompt({ expect: "element" }), { status: 200, events: [element()] }).verdict
    ).toBe("pass");
  });

  it("requires an action_request for a confirm prompt", () => {
    const missing = classifyReply(prompt({ expect: "confirm" }), {
      status: 200,
      events: [text("Which table?")],
    });
    expect(missing.failures.map((f) => f.code)).toContain("missing-confirmation");
    const ok = classifyReply(prompt({ expect: "confirm" }), {
      status: 200,
      events: [{ type: "action_request", actionId: "a", toolName: "seat_walk_in", toolInput: {} }],
    });
    expect(ok.verdict).toBe("pass");
  });
});

describe("dedupeKey", () => {
  const results = [
    { id: "b", failures: [{ code: "x" }] },
    { id: "a", failures: [{ code: "y" }, { code: "x" }] },
  ];

  it("is stable across ordering and ignores passing prompts", () => {
    const reversed = [...results].reverse().map((r) => ({
      ...r,
      failures: [...r.failures].reverse(),
    }));
    expect(dedupeKey(results)).toBe(dedupeKey(reversed));
    expect(dedupeKey([...results, { id: "ok", failures: [] }])).toBe(dedupeKey(results));
  });

  it("changes when the failing set changes", () => {
    expect(dedupeKey(results)).not.toBe(dedupeKey(results.slice(0, 1)));
  });
});

describe("cost guard", () => {
  it("refuses a request that would pass the ceiling", () => {
    const guard = createCostGuard({ ceilingUsd: 0.01, perRequestUsd: 0.005 });
    expect(guard.tryReserve()).toBe(true);
    expect(guard.tryReserve()).toBe(true);
    expect(guard.tryReserve()).toBe(false);
    expect(guard.spentUsd()).toBeCloseTo(0.01);
  });
});

describe("buildRequestBody / never confirms", () => {
  it("never carries actionConfirm", () => {
    for (const p of PROBE_PROMPTS) {
      const body = buildRequestBody(p, { venueId: "v1", timeZone: "UTC" });
      expect(body).not.toHaveProperty("actionConfirm");
      expect(body.messages).toEqual([{ role: "user", content: p.prompt }]);
      expect(body.venueId).toBe("v1");
    }
  });

  it("runProbe never sends a confirm and stops after the confirmation", async () => {
    const bodies = [];
    const send = async (body) => {
      bodies.push(body);
      return {
        status: 200,
        events: [
          { type: "action_request", actionId: "a", toolName: "seat_walk_in", toolInput: {} },
        ],
      };
    };
    const report = await runProbe({ send, context: { venueId: "v1", timeZone: "UTC" } });
    expect(bodies.length).toBe(PROBE_PROMPTS.length);
    expect(bodies.every((b) => b.actionConfirm === undefined)).toBe(true);
    expect(JSON.stringify(bodies)).not.toContain("actionConfirm");
    expect(JSON.stringify(bodies)).not.toMatch(/I confirm the pending/);
    expect(report.spentUsd).toBeLessThanOrEqual(COST_CEILING_USD);
  });

  it("runProbe stops sending once the cost guard refuses", async () => {
    let calls = 0;
    const send = async () => {
      calls += 1;
      return { status: 200, events: [text("ok")] };
    };
    const report = await runProbe({
      send,
      context: { venueId: "v1", timeZone: "UTC" },
      guard: createCostGuard({ ceilingUsd: 0.01, perRequestUsd: 0.005 }),
    });
    expect(calls).toBe(2);
    expect(report.skipped).toBeGreaterThan(0);
  });
});

describe("buildIssue", () => {
  const results = [
    {
      id: "table-status",
      prompt: "x",
      failures: [{ code: "raw-element-call", detail: "StatusLED(" }],
    },
  ];

  it("returns null when nothing failed", () => {
    expect(buildIssue([{ id: "a", failures: [] }], { runUrl: "u" })).toBeNull();
  });

  it("builds a title carrying the dedupe key and a body naming each failure", () => {
    const issue = buildIssue(results, { runUrl: "https://example.test/run/1" });
    expect(issue.title).toContain(dedupeKey(results));
    expect(issue.body).toContain("table-status");
    expect(issue.body).toContain("raw-element-call");
    expect(issue.body).toContain("https://example.test/run/1");
  });
});
