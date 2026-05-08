/**
 * Session event fixtures for testing agent-core without live API calls.
 *
 * Provides:
 * - Pre-built realistic SessionEvent sequences
 * - Step-through mode for testing event processing
 * - Fixture loading from JSON files
 * - Expected vs actual tool call comparison
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SessionEvent, SessionEventType } from "@mbe/agent-core";

// ── Built-in fixture types ────────────────────────────────────────────

export interface ToolCallRecord {
  readonly toolName: string;
  readonly input: Record<string, unknown>;
  readonly output?: string;
}

export interface FixtureOptions {
  readonly sessionId?: string;
  readonly numTurns?: number;
  readonly costUsd?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly durationMs?: number;
  readonly resultText?: string;
  readonly toolCalls?: readonly ToolCallRecord[];
}

// ── Event builder helpers ─────────────────────────────────────────────

function makeTimestamp(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function buildStartEvent(sessionId: string): SessionEvent {
  return {
    type: "session:start",
    timestamp: makeTimestamp(),
    data: { message: `Session ${sessionId} started` },
  };
}

function buildAssistantEvent(text: string, offsetMs = 0): SessionEvent {
  return {
    type: "session:assistant",
    timestamp: makeTimestamp(offsetMs),
    data: {
      type: "assistant",
      message: {
        id: `msg_${Math.random().toString(36).slice(2, 10)}`,
        type: "message",
        role: "assistant",
        content: [{ type: "text", text }],
        model: "claude-sonnet-4-6",
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    } as unknown as SessionEvent["data"],
  };
}

function buildToolUseEvent(call: ToolCallRecord, offsetMs = 0): SessionEvent {
  return {
    type: "session:tool_use",
    timestamp: makeTimestamp(offsetMs),
    data: {
      type: "tool_use",
      tool_use: {
        id: `toolu_${Math.random().toString(36).slice(2, 10)}`,
        name: call.toolName,
        input: call.input,
      },
    } as unknown as SessionEvent["data"],
  };
}

function buildToolResultEvent(call: ToolCallRecord, offsetMs = 0): SessionEvent {
  return {
    type: "session:tool_result",
    timestamp: makeTimestamp(offsetMs),
    data: {
      type: "tool_result",
      tool_use_id: `toolu_${Math.random().toString(36).slice(2, 10)}`,
      content: call.output ?? "Tool executed successfully",
    } as unknown as SessionEvent["data"],
  };
}

function buildResultEvent(opts: Required<FixtureOptions>): SessionEvent {
  return {
    type: "session:result",
    timestamp: makeTimestamp(opts.durationMs),
    data: {
      type: "result",
      subtype: "success",
      uuid: `uuid_${opts.sessionId}`,
      session_id: opts.sessionId,
      duration_ms: opts.durationMs,
      duration_api_ms: Math.floor(opts.durationMs * 0.9),
      is_error: false,
      num_turns: opts.numTurns,
      result: opts.resultText,
      stop_reason: "end_turn",
      total_cost_usd: opts.costUsd,
      usage: {
        input_tokens: opts.inputTokens,
        output_tokens: opts.outputTokens,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      modelUsage: {},
      permission_denials: [],
    } as unknown as SessionEvent["data"],
  };
}

// ── Pre-built fixture sequences ───────────────────────────────────────

const DEFAULT_OPTS: Required<FixtureOptions> = {
  sessionId: "fixture-session-001",
  numTurns: 5,
  costUsd: 0.05,
  inputTokens: 5000,
  outputTokens: 1000,
  durationMs: 3000,
  resultText: "Task completed successfully",
  toolCalls: [],
};

/**
 * A minimal fixture: just start + result, no tool calls.
 * Good for testing the happy path of session completion.
 */
export function buildMinimalSuccessFixture(opts: FixtureOptions = {}): readonly SessionEvent[] {
  const o = { ...DEFAULT_OPTS, ...opts };
  return [
    buildStartEvent(o.sessionId),
    buildAssistantEvent("I'll help you with that task."),
    buildResultEvent(o),
  ];
}

/**
 * A fixture that includes typical Read/Edit/Bash tool calls.
 * Mirrors what a real agent session looks like when fixing a bug.
 */
export function buildBugFixFixture(opts: FixtureOptions = {}): readonly SessionEvent[] {
  const o = {
    ...DEFAULT_OPTS,
    numTurns: 8,
    costUsd: 0.12,
    inputTokens: 10000,
    outputTokens: 2500,
    durationMs: 8000,
    resultText: "Fixed the bug by updating the validation logic",
    toolCalls: [
      {
        toolName: "Read",
        input: { file_path: "/repo/src/auth.ts" },
        output: "export function validate() {...}",
      },
      {
        toolName: "Grep",
        input: { pattern: "validateToken", path: "/repo/src" },
        output: "src/auth.ts:12: validateToken",
      },
      {
        toolName: "Edit",
        input: {
          file_path: "/repo/src/auth.ts",
          old_string: "if (token)",
          new_string: "if (token && token.length > 0)",
        },
        output: "File updated",
      },
      {
        toolName: "Bash",
        input: { command: "cd /repo && pnpm test --filter auth" },
        output: "All 12 tests passed",
      },
    ] as ToolCallRecord[],
    ...opts,
  };

  const events: SessionEvent[] = [buildStartEvent(o.sessionId)];
  let offset = 500;

  for (const call of o.toolCalls) {
    events.push(
      buildAssistantEvent(`Let me ${call.toolName.toLowerCase()} the relevant files.`, offset)
    );
    offset += 200;
    events.push(buildToolUseEvent(call, offset));
    offset += 100;
    events.push(buildToolResultEvent(call, offset));
    offset += 100;
  }

  events.push(buildAssistantEvent("All changes are complete and tests pass.", offset));
  events.push(buildResultEvent(o));

  return events;
}

/**
 * A fixture representing a failed session (error during turn).
 */
export function buildFailureFixture(opts: FixtureOptions = {}): readonly SessionEvent[] {
  const o = {
    ...DEFAULT_OPTS,
    numTurns: 2,
    costUsd: 0.02,
    inputTokens: 2000,
    outputTokens: 300,
    durationMs: 1500,
    resultText: "",
    ...opts,
  };

  return [
    buildStartEvent(o.sessionId),
    buildAssistantEvent("I'll try to complete the task."),
    {
      type: "session:error" as SessionEventType,
      timestamp: makeTimestamp(1000),
      data: { message: "Rate limit exceeded. Please try again later." },
    },
    {
      type: "session:result",
      timestamp: makeTimestamp(o.durationMs),
      data: {
        type: "result",
        subtype: "error_during_turn",
        uuid: `uuid_${o.sessionId}`,
        session_id: o.sessionId,
        duration_ms: o.durationMs,
        duration_api_ms: Math.floor(o.durationMs * 0.9),
        is_error: true,
        num_turns: o.numTurns,
        result: "",
        stop_reason: "error",
        total_cost_usd: o.costUsd,
        usage: {
          input_tokens: o.inputTokens,
          output_tokens: o.outputTokens,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        modelUsage: {},
        permission_denials: [],
        errors: ["Rate limit exceeded. Please try again later."],
      } as unknown as SessionEvent["data"],
    },
  ];
}

// ── Step-through player ───────────────────────────────────────────────

export interface FixturePlayer {
  /** Returns the next event, or undefined if exhausted. */
  readonly next: () => SessionEvent | undefined;
  /** Returns true if there are more events. */
  readonly hasMore: () => boolean;
  /** Resets to the beginning of the fixture. */
  readonly reset: () => void;
  /** Returns all remaining events at once. */
  readonly drainAll: () => readonly SessionEvent[];
  /** Number of events already consumed. */
  readonly position: () => number;
}

/**
 * Creates a step-through player for a fixture sequence.
 * Useful for testing event-by-event processing logic.
 */
export function createFixturePlayer(events: readonly SessionEvent[]): FixturePlayer {
  let cursor = 0;

  return {
    next(): SessionEvent | undefined {
      if (cursor >= events.length) return undefined;
      const event = events[cursor];
      cursor += 1;
      return event;
    },
    hasMore(): boolean {
      return cursor < events.length;
    },
    reset(): void {
      cursor = 0;
    },
    drainAll(): readonly SessionEvent[] {
      const remaining = events.slice(cursor);
      cursor = events.length;
      return remaining;
    },
    position(): number {
      return cursor;
    },
  };
}

// ── Tool call comparison ──────────────────────────────────────────────

export interface ToolCallDiff {
  readonly matched: readonly ToolCallRecord[];
  readonly missing: readonly ToolCallRecord[];
  readonly unexpected: readonly ToolCallRecord[];
  readonly passed: boolean;
}

/**
 * Extracts tool_use events from a fixture sequence.
 */
export function extractToolCalls(events: readonly SessionEvent[]): readonly ToolCallRecord[] {
  return events
    .filter((e) => e.type === "session:tool_use")
    .map((e) => {
      const data = e.data as { tool_use?: { name: string; input: Record<string, unknown> } };
      return {
        toolName: data.tool_use?.name ?? "unknown",
        input: data.tool_use?.input ?? {},
      };
    });
}

/**
 * Compares expected vs actual tool calls.
 * Matching is by toolName only — use for asserting that specific tools were invoked.
 */
export function compareToolCalls(
  expected: readonly ToolCallRecord[],
  actual: readonly ToolCallRecord[]
): ToolCallDiff {
  const actualNames = actual.map((c) => c.toolName);
  const expectedNames = expected.map((c) => c.toolName);

  const matched = expected.filter((e) => actualNames.includes(e.toolName));
  const missing = expected.filter((e) => !actualNames.includes(e.toolName));
  const unexpected = actual.filter((a) => !expectedNames.includes(a.toolName));

  return {
    matched,
    missing,
    unexpected,
    passed: missing.length === 0 && unexpected.length === 0,
  };
}

// ── JSON fixture loading ──────────────────────────────────────────────

/**
 * Loads a session fixture from a JSON file on disk.
 * Useful for recording real API responses and replaying them.
 */
export function loadFixtureFromFile(filePath: string): readonly SessionEvent[] {
  const absolutePath = resolve(filePath);
  const raw = readFileSync(absolutePath, "utf-8");
  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed)) {
    throw new TypeError(`Fixture file must contain a JSON array: ${absolutePath}`);
  }

  return parsed as SessionEvent[];
}

/**
 * Serializes a fixture sequence to a JSON string suitable for saving.
 */
export function serializeFixture(events: readonly SessionEvent[]): string {
  return JSON.stringify(events, null, 2);
}
