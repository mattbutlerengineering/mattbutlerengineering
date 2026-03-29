import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

// ── Types ───────────────────────────────────────────────────────────

export interface ToolUseEvent {
  readonly type: "session:tool_use";
  readonly toolName: string;
  readonly toolInput: Record<string, unknown>;
  readonly toolUseId: string;
}

export interface ToolResultEvent {
  readonly type: "session:tool_result";
  readonly toolUseId: string;
  readonly isError: boolean;
}

export interface AssistantTextEvent {
  readonly type: "session:assistant";
  readonly text: string;
}

export type MappedEvent = ToolUseEvent | ToolResultEvent | AssistantTextEvent;

// ── Content block types ─────────────────────────────────────────────

interface ToolUseBlock {
  readonly type: "tool_use";
  readonly id: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
}

interface TextBlock {
  readonly type: "text";
  readonly text: string;
}

interface ToolResultBlock {
  readonly type: "tool_result";
  readonly tool_use_id: string;
  readonly is_error?: boolean;
}

type ContentBlock = ToolUseBlock | TextBlock | ToolResultBlock | { type: string };

// ── Mapper ──────────────────────────────────────────────────────────

function mapAssistantMessage(
  content: readonly ContentBlock[]
): readonly MappedEvent[] {
  const events: MappedEvent[] = [];

  for (const block of content) {
    if (block.type === "tool_use") {
      const toolBlock = block as ToolUseBlock;
      events.push({
        type: "session:tool_use",
        toolName: toolBlock.name,
        toolInput: toolBlock.input,
        toolUseId: toolBlock.id,
      });
    } else if (block.type === "text") {
      const textBlock = block as TextBlock;
      if (textBlock.text.trim()) {
        events.push({
          type: "session:assistant",
          text: textBlock.text,
        });
      }
    }
  }

  return events;
}

function mapUserMessage(
  content: unknown
): readonly MappedEvent[] {
  if (!Array.isArray(content)) return [];

  const events: MappedEvent[] = [];

  for (const block of content as ContentBlock[]) {
    if (block.type === "tool_result") {
      const resultBlock = block as ToolResultBlock;
      events.push({
        type: "session:tool_result",
        toolUseId: resultBlock.tool_use_id,
        isError: resultBlock.is_error === true,
      });
    }
  }

  return events;
}

/**
 * Map a raw SDK message to typed events for observability.
 * Returns an empty array for message types with no relevant events.
 */
export function mapSdkMessage(
  message: SDKMessage
): readonly MappedEvent[] {
  if (message.type === "assistant") {
    const assistantMsg = message as {
      message: { content: readonly ContentBlock[] };
    };
    return mapAssistantMessage(assistantMsg.message.content);
  }

  if (message.type === "user") {
    const userMsg = message as {
      message: { content: unknown };
    };
    return mapUserMessage(userMsg.message.content);
  }

  return [];
}
