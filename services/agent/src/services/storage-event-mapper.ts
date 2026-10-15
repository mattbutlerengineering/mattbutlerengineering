import type { EventProjector, MappedEvent, SessionEvent } from "@mbe/agent-core";

// ── Private helpers ───────────────────────────────────────────────────

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

function summarizeToolInput(input: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {};

  if (typeof input.file_path === "string") {
    summary.file_path = input.file_path;
  }

  if (typeof input.command === "string") {
    summary.command = truncate(input.command, 200);
  }

  if (typeof input.pattern === "string") {
    summary.pattern = input.pattern;
  }

  if (typeof input.path === "string" && !("file_path" in summary)) {
    summary.path = input.path;
  }

  return summary;
}

// ── Public interface ──────────────────────────────────────────────────

/**
 * Pure projection from a typed MappedEvent (agent-core) to the storage shape.
 * Applies truncation and field selection; no SDK message parsing.
 */
export function mapForStorage(event: MappedEvent): { type: string; data: Record<string, unknown> } {
  if (event.type === "session:tool_use") {
    return {
      type: event.type,
      data: {
        toolName: event.toolName,
        toolInput: summarizeToolInput(event.toolInput),
      },
    };
  }

  if (event.type === "session:assistant") {
    // Per-event projection: agent-core emits one AssistantTextEvent per text block,
    // so each is stored separately (no coalescing of blocks within a message). This is
    // an intentional granularity change from the old SDK-message-level text join.
    return {
      type: event.type,
      data: {
        textPreview: truncate(event.text, 200),
      },
    };
  }

  if (event.type === "session:tool_result") {
    return {
      type: event.type,
      data: {
        toolUseId: event.toolUseId,
        isError: event.isError,
      },
    };
  }

  // session:turn_metrics — pass through all fields
  return {
    type: event.type,
    data: { ...event },
  };
}

// ── Event projection ──────────────────────────────────────────────────

/**
 * Projects a runtime SessionEvent to the stored shape. `run-hardened-query`
 * emits typed MappedEvents as JSON in the event message; those are parsed and
 * passed through `mapForStorage` (truncation + field selection). Plain message
 * events (session:start, session:error, …) are stored verbatim.
 */
export const projectEvent: EventProjector = (event: SessionEvent) => {
  const eventData = event.data as { message?: string };
  if (typeof eventData.message === "string") {
    try {
      const parsed = JSON.parse(eventData.message) as MappedEvent;
      if (parsed && typeof parsed.type === "string" && parsed.type.startsWith("session:")) {
        return mapForStorage(parsed);
      }
    } catch {
      // Not JSON — fall through to plain message storage.
    }
  }
  return { type: event.type, data: event.data };
};
