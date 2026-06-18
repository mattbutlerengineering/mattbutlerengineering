import { anthropic } from "@ai-sdk/anthropic";
import { streamText, stepCountIs } from "ai";
// Permission policy sourced from agent-core — not duplicated here (security requirement)
import { GEN_BLOCKED_TOOLS, genIsBashCommandBlocked } from "@mbe/agent-core";

// ── Public types ──────────────────────────────────────────────────────

export type GenStreamEvent =
  | { readonly type: "text"; readonly content: string }
  | { readonly type: "element"; readonly element: unknown }
  | {
      readonly type: "action_request";
      readonly actionId: string;
      readonly toolName: string;
      readonly toolInput: unknown;
    }
  | {
      readonly type: "tool_status";
      readonly tool: string;
      readonly status: "running" | "complete";
    }
  | {
      readonly type: "permission_denied";
      readonly toolName: string;
      readonly reason: string;
    };

export interface GenFinishPayload {
  readonly usage: { readonly inputTokens?: number; readonly outputTokens?: number };
  readonly providerMetadata: unknown;
}

export interface GenRunnerConfig {
  readonly systemPrompt: string;
  readonly modelId: string;
  readonly maxSteps: number;
  readonly onFinish?: (payload: GenFinishPayload) => Promise<void>;
}

/** Tool names that require user confirmation before execution. */
export const GEN_WRITE_TOOLS: ReadonlySet<string> = new Set([
  "create_reservation",
  "modify_reservation",
  "cancel_reservation",
  "seat_walk_in",
  "update_table_status",
]);

export type GenToolMap = Record<string, unknown>;
export type GenEventCallback = (event: GenStreamEvent) => Promise<void>;

export interface GenRunner {
  run(
    messages: ReadonlyArray<{ role: "user" | "assistant"; content: string }>,
    tools: GenToolMap,
    onEvent: GenEventCallback
  ): Promise<void>;
}

// ── Implementation ────────────────────────────────────────────────────

/**
 * Create a GenRunner that owns streaming, tool dispatch, and permission policy
 * for lightweight generation tasks (no worktree / PR phases).
 *
 * Permission policy comes from @mbe/agent-core (gen-permissions.ts) — never
 * duplicated here. This is a security requirement: one authoritative source
 * for all blocked tools and bash patterns.
 */
export function createGenRunner(config: GenRunnerConfig): GenRunner {
  return {
    async run(messages, tools, onEvent) {
      const aiMessages = [
        {
          role: "system" as const,
          content: config.systemPrompt,
          providerOptions: { anthropic: { cacheControl: { type: "ephemeral" as const } } },
        },
        ...messages,
      ];

      const result = streamText({
        model: anthropic(config.modelId),
        messages: aiMessages,
        tools: tools as Parameters<typeof streamText>[0]["tools"],
        stopWhen: stepCountIs(config.maxSteps),
        onFinish: config.onFinish
          ? async ({ usage, providerMetadata }) => {
              await config.onFinish!({ usage, providerMetadata });
            }
          : undefined,
      });

      for await (const event of result.fullStream) {
        if (event.type === "text-delta") {
          await onEvent({ type: "text", content: event.text });
        } else if (event.type === "tool-call") {
          await handleToolCall(event, onEvent);
        } else if (event.type === "tool-result") {
          await onEvent({
            type: "tool_status",
            tool: event.toolName,
            status: "complete",
          });
        }
      }
    },
  };
}

async function handleToolCall(
  event: { toolCallId: string; toolName: string; input: unknown },
  onEvent: GenEventCallback
): Promise<void> {
  const { toolName, toolCallId, input } = event;

  // Permission check: blocked tool names (policy from agent-core)
  if (GEN_BLOCKED_TOOLS.has(toolName)) {
    await onEvent({
      type: "permission_denied",
      toolName,
      reason: `Tool "${toolName}" is not allowed in gen sessions`,
    });
    return;
  }

  // Permission check: bash command patterns (policy from agent-core)
  if (toolName === "Bash") {
    const command = (input as Record<string, unknown>).command as string | undefined;
    if (command) {
      const blockReason = genIsBashCommandBlocked(command);
      if (blockReason) {
        await onEvent({ type: "permission_denied", toolName, reason: blockReason });
        return;
      }
    }
  }

  // render_component emits element events (no status — handled by tool-result)
  if (toolName === "render_component") {
    const typedInput = input as { elements?: unknown[] };
    for (const element of typedInput.elements ?? []) {
      await onEvent({ type: "element", element });
    }
    return;
  }

  // Write tools emit action_request (require user confirmation)
  if (GEN_WRITE_TOOLS.has(toolName)) {
    await onEvent({
      type: "action_request",
      actionId: toolCallId,
      toolName,
      toolInput: input,
    });
    return;
  }

  // Read/status tools emit running status
  await onEvent({ type: "tool_status", tool: toolName, status: "running" });
}
