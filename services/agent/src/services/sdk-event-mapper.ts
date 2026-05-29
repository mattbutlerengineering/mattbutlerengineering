import type { SessionEvent } from "@mbe/agent-core";

// ── Private helpers ───────────────────────────────────────────────────

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (block: Record<string, unknown>) => block.type === "text" && typeof block.text === "string"
    )
    .map((block: Record<string, unknown>) => block.text as string)
    .join("\n");
}

function summarizeToolInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  const obj = input as Record<string, unknown>;
  const summary: Record<string, unknown> = {};

  if (typeof obj.file_path === "string") {
    summary.file_path = obj.file_path;
  }

  if (typeof obj.command === "string") {
    summary.command = truncate(obj.command, 200);
  }

  if (typeof obj.pattern === "string") {
    summary.pattern = obj.pattern;
  }

  if (typeof obj.path === "string" && !("file_path" in summary)) {
    summary.path = obj.path;
  }

  return summary;
}

// ── Public interface ──────────────────────────────────────────────────

export function mapSdkEvent(event: SessionEvent): { type: string; data: Record<string, unknown> } {
  let eventType = event.type as string;
  let eventData: Record<string, unknown>;

  if ("message" in event.data) {
    eventData = { message: (event.data as { message: string }).message };
  } else {
    const sdkMsg = event.data as Record<string, unknown>;
    eventData = {
      messageType: (sdkMsg.type as string) ?? "unknown",
    };

    if (event.type === "session:tool_use" && sdkMsg.tool_name) {
      eventData.toolName = sdkMsg.tool_name;
      eventData.toolInput = summarizeToolInput(sdkMsg.input);
    }

    if (sdkMsg.type === "assistant" && sdkMsg.content) {
      eventType = "session:assistant";
      eventData.textPreview = truncate(extractText(sdkMsg.content), 200);
    }
  }

  return { type: eventType, data: eventData };
}
