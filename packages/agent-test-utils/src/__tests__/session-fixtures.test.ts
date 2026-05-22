import { describe, it, expect } from "vitest";
import {
  buildMinimalSuccessFixture,
  buildBugFixFixture,
  buildFailureFixture,
  createFixturePlayer,
  extractToolCalls,
  compareToolCalls,
  serializeFixture,
} from "../session-fixtures.js";
import type { SessionEvent } from "@mbe/agent-core";

describe("buildMinimalSuccessFixture", () => {
  it("returns at least start and result events", () => {
    const events = buildMinimalSuccessFixture();
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0].type).toBe("session:start");
    expect(events[events.length - 1].type).toBe("session:result");
  });

  it("uses provided session options", () => {
    const events = buildMinimalSuccessFixture({ sessionId: "my-session", numTurns: 10 });
    const result = events[events.length - 1];
    const data = result.data as { num_turns: number; session_id: string };
    expect(data.num_turns).toBe(10);
    expect(data.session_id).toBe("my-session");
  });

  it("all events have timestamps", () => {
    const events = buildMinimalSuccessFixture();
    for (const event of events) {
      expect(event.timestamp).toBeTruthy();
      expect(() => new Date(event.timestamp)).not.toThrow();
    }
  });
});

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
    expect(events[0].type).toBe("session:start");
    expect(events[events.length - 1].type).toBe("session:result");
  });

  it("allows customizing tool calls", () => {
    const events = buildBugFixFixture({
      toolCalls: [{ toolName: "Bash", input: { command: "ls" }, output: "file.ts" }],
    });
    const toolUseEvents = events.filter((e) => e.type === "session:tool_use");
    expect(toolUseEvents).toHaveLength(1);
  });
});

describe("buildFailureFixture", () => {
  it("includes session:error event", () => {
    const events = buildFailureFixture();
    const errorEvents = events.filter((e) => e.type === "session:error");
    expect(errorEvents.length).toBeGreaterThan(0);
  });

  it("ends with a result event with is_error=true", () => {
    const events = buildFailureFixture();
    const last = events[events.length - 1];
    expect(last.type).toBe("session:result");
    const data = last.data as { is_error: boolean };
    expect(data.is_error).toBe(true);
  });
});

describe("createFixturePlayer", () => {
  it("steps through events one at a time", () => {
    const events = buildMinimalSuccessFixture();
    const player = createFixturePlayer(events);

    expect(player.hasMore()).toBe(true);
    const first = player.next();
    expect(first?.type).toBe("session:start");
    expect(player.position()).toBe(1);
  });

  it("returns undefined when exhausted", () => {
    const events: SessionEvent[] = [];
    const player = createFixturePlayer(events);
    expect(player.hasMore()).toBe(false);
    expect(player.next()).toBeUndefined();
  });

  it("drainAll returns remaining events", () => {
    const events = buildMinimalSuccessFixture();
    const player = createFixturePlayer(events);
    player.next(); // consume first

    const remaining = player.drainAll();
    expect(remaining.length).toBe(events.length - 1);
    expect(player.hasMore()).toBe(false);
  });

  it("reset returns to position 0", () => {
    const events = buildMinimalSuccessFixture();
    const player = createFixturePlayer(events);
    player.drainAll();

    expect(player.hasMore()).toBe(false);
    player.reset();
    expect(player.hasMore()).toBe(true);
    expect(player.position()).toBe(0);
  });
});

describe("extractToolCalls", () => {
  it("extracts tool names from tool_use events", () => {
    const events = buildBugFixFixture();
    const calls = extractToolCalls(events);
    expect(calls.length).toBeGreaterThan(0);
    const toolNames = calls.map((c) => c.toolName);
    expect(toolNames).toContain("Read");
  });

  it("returns empty array when no tool_use events", () => {
    const events = buildMinimalSuccessFixture();
    const calls = extractToolCalls(events);
    expect(calls).toHaveLength(0);
  });
});

describe("compareToolCalls", () => {
  it("identifies matched calls", () => {
    const expected = [{ toolName: "Read", input: {} }];
    const actual = [
      { toolName: "Read", input: { file_path: "/foo.ts" } },
      { toolName: "Bash", input: { command: "ls" } },
    ];
    const diff = compareToolCalls(expected, actual);
    expect(diff.matched).toHaveLength(1);
    expect(diff.matched[0].toolName).toBe("Read");
  });

  it("identifies missing calls", () => {
    const expected = [
      { toolName: "Read", input: {} },
      { toolName: "Write", input: {} },
    ];
    const actual = [{ toolName: "Read", input: {} }];
    const diff = compareToolCalls(expected, actual);
    expect(diff.missing).toHaveLength(1);
    expect(diff.missing[0].toolName).toBe("Write");
    expect(diff.passed).toBe(false);
  });

  it("identifies unexpected calls", () => {
    const expected = [{ toolName: "Read", input: {} }];
    const actual = [
      { toolName: "Read", input: {} },
      { toolName: "Bash", input: {} },
    ];
    const diff = compareToolCalls(expected, actual);
    expect(diff.unexpected).toHaveLength(1);
    expect(diff.unexpected[0].toolName).toBe("Bash");
    expect(diff.passed).toBe(false);
  });

  it("passes when expected and actual match exactly", () => {
    const calls = [{ toolName: "Grep", input: { pattern: "foo" } }];
    const diff = compareToolCalls(calls, calls);
    expect(diff.passed).toBe(true);
    expect(diff.missing).toHaveLength(0);
    expect(diff.unexpected).toHaveLength(0);
  });
});

describe("serializeFixture", () => {
  it("serializes to valid JSON", () => {
    const events = buildMinimalSuccessFixture();
    const json = serializeFixture(events);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("round-trips fixture data", () => {
    const events = buildMinimalSuccessFixture({ sessionId: "round-trip-test" });
    const json = serializeFixture(events);
    const parsed = JSON.parse(json) as SessionEvent[];
    expect(parsed[0].type).toBe("session:start");
  });
});
