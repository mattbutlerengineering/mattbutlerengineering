import { describe, it, expect } from "vitest";
import { buildBugFixFixture } from "../index.js";
import type { SessionEvent } from "../../index.js";

describe("buildBugFixFixture", () => {
  it("includes tool_use and tool_result events", () => {
    const events = buildBugFixFixture();
    const toolUseEvents = events.filter((e) => e.type === "session:tool_use");
    const toolResultEvents = events.filter((e) => e.type === "session:tool_result");
    expect(toolUseEvents.length).toBeGreaterThan(0);
    expect(toolResultEvents.length).toBeGreaterThan(0);
  });

  it("starts with session:start and ends with session:result", () => {
    const events = buildBugFixFixture();
    expect(events[0]!.type).toBe("session:start");
    expect(events[events.length - 1]!.type).toBe("session:result");
  });

  it("allows customizing tool calls", () => {
    const events = buildBugFixFixture({
      toolCalls: [{ toolName: "Bash", input: { command: "ls" }, output: "file.ts" }],
    });
    const toolUseEvents = events.filter((e) => e.type === "session:tool_use");
    expect(toolUseEvents).toHaveLength(1);
  });

  it("uses provided session options on the result event", () => {
    const events = buildBugFixFixture({ sessionId: "my-session", numTurns: 10 });
    const data = events[events.length - 1]!.data as { num_turns: number; session_id: string };
    expect(data.num_turns).toBe(10);
    expect(data.session_id).toBe("my-session");
  });

  it("gives every event a parseable timestamp", () => {
    for (const event of buildBugFixFixture()) {
      expect(Number.isNaN(new Date(event.timestamp).getTime())).toBe(false);
    }
  });
});

describe("tool_use payload shape", () => {
  function payload(event: SessionEvent | undefined): Record<string, unknown> {
    return JSON.parse((event!.data as { message: string }).message) as Record<string, unknown>;
  }

  it("carries the shape agent-core's event mapper emits", () => {
    const events = buildBugFixFixture({
      toolCalls: [{ toolName: "Bash", input: { command: "ls" } }],
    });
    const use = payload(events.find((e) => e.type === "session:tool_use"));
    const res = payload(events.find((e) => e.type === "session:tool_result"));
    expect(use).toEqual({
      type: "session:tool_use",
      toolName: "Bash",
      toolInput: { command: "ls" },
      toolUseId: expect.any(String),
    });
    expect(res.toolUseId).toBe(use.toolUseId);
  });

  it("gives every tool call a unique toolUseId, even for same-tool same-size inputs", () => {
    const events = buildBugFixFixture({
      toolCalls: [
        { toolName: "Read", input: { file_path: "a.ts" } },
        { toolName: "Read", input: { file_path: "b.ts" } },
      ],
    });
    const uses = events.filter((e) => e.type === "session:tool_use").map((e) => payload(e));
    const results = events.filter((e) => e.type === "session:tool_result").map((e) => payload(e));
    expect(new Set(uses.map((u) => u.toolUseId)).size).toBe(2);
    expect(results.map((r) => r.toolUseId)).toEqual(uses.map((u) => u.toolUseId));
  });
});
