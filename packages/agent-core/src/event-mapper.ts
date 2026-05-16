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

/**
 * Per-turn token / cost metrics extracted from an assistant message.
 * Populated when the SDK message includes usage data on the inner message.
 */
export interface TurnMetricsEvent {
  readonly type: "session:turn_metrics";
  readonly turnIndex: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly thinkingTokens: number;
  readonly costUsd: number;
  readonly modelId: string;
}

export type MappedEvent = ToolUseEvent | ToolResultEvent | AssistantTextEvent | TurnMetricsEvent;

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

/** Shape of the usage object on assistant messages (SDK may vary). */
interface MessageUsage {
  readonly input_tokens?: number | null;
  readonly output_tokens?: number | null;
  readonly cache_creation_input_tokens?: number | null;
  readonly cache_read_input_tokens?: number | null;
}

/** Minimal shape of the inner `message` field on assistant SDK messages. */
interface AssistantInnerMessage {
  readonly content: readonly ContentBlock[];
  readonly model?: string;
  readonly usage?: MessageUsage;
}

// ── Mapper ──────────────────────────────────────────────────────────

function mapAssistantMessage(
  innerMessage: AssistantInnerMessage,
  turnIndex: number
): readonly MappedEvent[] {
  const events: MappedEvent[] = [];

  for (const block of innerMessage.content) {
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

  // Emit per-turn metrics if usage data is present
  if (innerMessage.usage) {
    const usage = innerMessage.usage;
    const inputTokens = usage.input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;
    // Thinking tokens are not directly exposed in the standard usage shape;
    // some SDK versions surface them via cache_creation_input_tokens.
    const thinkingTokens = 0;

    events.push({
      type: "session:turn_metrics",
      turnIndex,
      inputTokens,
      outputTokens,
      thinkingTokens,
      // Per-turn cost is not directly available from usage alone; set to 0 here.
      // Accurate session-level cost comes from the result message.
      costUsd: 0,
      modelId: innerMessage.model ?? "",
    });
  }

  return events;
}

function mapUserMessage(content: unknown): readonly MappedEvent[] {
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
 *
 * @param message   The raw SDK message to map.
 * @param turnIndex 1-based turn counter maintained by the caller; used to
 *                  annotate per-turn metrics events so consumers can correlate
 *                  metrics across turns.
 *
 * Returns an empty array for message types with no relevant events.
 */
export function mapSdkMessage(message: SDKMessage, turnIndex = 0): readonly MappedEvent[] {
  if (message.type === "assistant") {
    const assistantMsg = message as {
      message: AssistantInnerMessage;
    };
    return mapAssistantMessage(assistantMsg.message, turnIndex);
  }

  if (message.type === "user") {
    const userMsg = message as {
      message: { content: unknown };
    };
    return mapUserMessage(userMsg.message.content);
  }

  return [];
}
