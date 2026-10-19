/**
 * Session event fixture for testing agent-core consumers without live API calls.
 */

import { buildSuccessResult } from "./sdk-result.js";
import type { MappedEvent, SessionEvent } from "../index.js";

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

/**
 * Typed observability events are emitted by agent-core's run-hardened-query as
 * `{ message: JSON.stringify(mappedEvent) }`. Build them from the real
 * `MappedEvent` shape so the compiler checks the payload.
 */
function buildMappedEvent(mapped: MappedEvent, offsetMs = 0): SessionEvent {
  return {
    type: mapped.type,
    timestamp: makeTimestamp(offsetMs),
    data: { message: JSON.stringify(mapped) },
  };
}

function buildAssistantEvent(text: string, offsetMs = 0): SessionEvent {
  return buildMappedEvent({ type: "session:assistant", text }, offsetMs);
}

/** Deterministic id so a tool_result pairs with its tool_use. */
function toolUseIdFor(call: ToolCallRecord, index: number): string {
  return `toolu_${index}_${call.toolName.toLowerCase()}`;
}

function buildToolUseEvent(call: ToolCallRecord, index: number, offsetMs = 0): SessionEvent {
  return buildMappedEvent(
    {
      type: "session:tool_use",
      toolName: call.toolName,
      toolInput: call.input,
      toolUseId: toolUseIdFor(call, index),
    },
    offsetMs
  );
}

function buildToolResultEvent(call: ToolCallRecord, index: number, offsetMs = 0): SessionEvent {
  return buildMappedEvent(
    { type: "session:tool_result", toolUseId: toolUseIdFor(call, index), isError: false },
    offsetMs
  );
}

function buildResultEvent(opts: Required<FixtureOptions>): SessionEvent {
  return {
    type: "session:result",
    timestamp: makeTimestamp(opts.durationMs),
    data: buildSuccessResult(opts, opts.resultText),
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

  for (const [index, call] of o.toolCalls.entries()) {
    events.push(
      buildAssistantEvent(`Let me ${call.toolName.toLowerCase()} the relevant files.`, offset)
    );
    offset += 200;
    events.push(buildToolUseEvent(call, index, offset));
    offset += 100;
    events.push(buildToolResultEvent(call, index, offset));
    offset += 100;
  }

  events.push(buildAssistantEvent("All changes are complete and tests pass.", offset));
  events.push(buildResultEvent(o));

  return events;
}
