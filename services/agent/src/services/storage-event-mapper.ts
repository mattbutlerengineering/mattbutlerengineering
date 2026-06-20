import type { MappedEvent } from "@mbe/agent-core";

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
    data: { ...event } as Record<string, unknown>,
  };
}
