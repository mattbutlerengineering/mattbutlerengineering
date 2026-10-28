import { anthropic } from "@ai-sdk/anthropic";
import { streamText, stepCountIs } from "ai";
// Permission policy sourced from agent-core — not duplicated here (security requirement)
import { GEN_BLOCKED_TOOLS, genIsBashCommandBlocked } from "@mbe/agent-core";
import { genSystemInstructions } from "./gen-stream.js";
import { completeJsonElements } from "./gen-json-elements.js";

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
  readonly finishReason?: string;
}

export interface GenRunnerConfig {
  readonly systemPrompt: string;
  readonly modelId: string;
  /** Output-token ceiling per model call; hitting it fails the run (never a partial result). */
  readonly maxOutputTokens: number;
  readonly maxSteps: number;
  readonly onFinish?: (payload: GenFinishPayload) => Promise<void>;
  /**
   * Forces a specific tool call (e.g. `{ type: "tool", toolName: "render_component" }`)
   * instead of leaving tool use to the model's discretion. Omit to keep the
   * provider's default ("auto") behavior — existing callers are unaffected.
   */
  readonly toolChoice?: { readonly type: "tool"; readonly toolName: string };
  /**
   * When true, a `tool-error` part (schema-invalid tool input) throws
   * immediately instead of letting it pass. Only safe when maxSteps === 1
   * (no possible retry) — gen-ui sets this. With maxSteps > 1, ai@7's own
   * multi-step loop resends the tool error to the model and can recover on a
   * later step via the SAME fullStream; throwing unconditionally there would
   * kill the turn before that recovery ever runs (verified against the real
   * SDK — gen-agent regressed this way when the throw was unconditional).
   * Leave unset for any runner where maxSteps > 1.
   */
  readonly failOnToolError?: boolean;
}

/** Tool names that require user confirmation before execution. */
export const GEN_WRITE_TOOL_NAMES = [
  "create_reservation",
  "modify_reservation",
  "cancel_reservation",
  "seat_walk_in",
  "update_table_status",
  "change_tonight_availability",
  "end_tonight_change",
  "undo_availability_change",
] as const;

const GEN_WRITE_TOOLS: ReadonlySet<string> = new Set(GEN_WRITE_TOOL_NAMES);

export type GenToolMap = Record<string, unknown>;
export type GenEventCallback = (event: GenStreamEvent) => Promise<void>;

export interface GenRunner {
  run(
    messages: ReadonlyArray<{ role: "user" | "assistant"; content: string }>,
    tools: GenToolMap,
    onEvent: GenEventCallback,
    /** Aborts the model call, e.g. when the client disconnects mid-stream. */
    signal?: AbortSignal
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
    async run(messages, tools, onEvent, signal) {
      const result = streamText({
        model: anthropic(config.modelId),
        abortSignal: signal,
        // System prompt goes through `instructions` — ai@7 rejects system-role
        // entries inside `messages` (see genSystemInstructions).
        instructions: genSystemInstructions(config.systemPrompt),
        messages: [...messages],
        tools: tools as Parameters<typeof streamText>[0]["tools"],
        toolChoice: config.toolChoice,
        stopWhen: stepCountIs(config.maxSteps),
        maxOutputTokens: config.maxOutputTokens,
        providerOptions: {
          anthropic: {
            // Haiku 5.5 thinks before the tool call, and those tokens count
            // against the output cap. Nothing is emitted until thinking
            // finishes, so a large form sits silent until the gateway 504s.
            thinking: { type: "disabled" },
            toolStreaming: true,
          },
        },
        onFinish: config.onFinish
          ? async ({ usage, providerMetadata, finishReason }) => {
              await config.onFinish!({ usage, providerMetadata, finishReason });
            }
          : undefined,
      });

      // Text from a later step (after a tool call) would otherwise run straight
      // on from the previous step's: "…for 2 people:Monday's slots…" (F29).
      let textSoFar = false;
      let stepEnded = false;
      let renderJson = "";
      let renderEmitted = 0;
      let trackingRender = false;
      for await (const event of result.fullStream) {
        if (event.type === "tool-input-start" && event.toolName === "render_component") {
          trackingRender = true;
          renderJson = "";
          renderEmitted = 0;
        } else if (event.type === "tool-input-delta" && trackingRender) {
          renderJson += event.delta;
          const ready = completeJsonElements(renderJson);
          for (const element of ready.slice(renderEmitted)) {
            await onEvent({ type: "element", element });
          }
          renderEmitted = ready.length;
        } else if (event.type === "text-delta") {
          const content = textSoFar && stepEnded ? `\n\n${event.text}` : event.text;
          textSoFar = true;
          stepEnded = false;
          await onEvent({ type: "text", content });
        } else if (event.type === "finish-step" && event.finishReason !== "length") {
          stepEnded = true;
        } else if (event.type === "tool-call") {
          const already =
            trackingRender && event.toolName === "render_component" ? renderEmitted : 0;
          await handleToolCall(event, onEvent, already);
          if (event.toolName === "render_component") trackingRender = false;
        } else if (event.type === "tool-result") {
          await onEvent({
            type: "tool_status",
            tool: event.toolName,
            status: "complete",
          });
        } else if (
          (event.type === "finish-step" || event.type === "finish") &&
          event.finishReason === "length"
        ) {
          // The output-token cap truncated the response (thinking tokens
          // count against it). Fail rather than hand the client a partial
          // element list; the route factory's error path logs this message.
          throw new Error(
            `gen output truncated: hit maxOutputTokens (${config.maxOutputTokens}) cap`
          );
        } else if (event.type === "error") {
          // ai@7 does not throw on a failed model call (e.g. 529/401) — it
          // yields this part and completes the stream normally. Without this,
          // the loop just finishes: the caller sees a clean return and zero
          // events, indistinguishable from "nothing to generate" rather than
          // "the call failed". Always fatal — there is no recovery from a
          // failed model call.
          throw toError(event.error);
        } else if (event.type === "tool-error" && config.failOnToolError) {
          // Unlike `error`, a `tool-error` (schema-invalid tool input) is
          // NOT always fatal: with maxSteps > 1, ai@7 resends it to the model
          // and a later step can recover on this same fullStream. Only throw
          // when the caller has said no retry is possible (see
          // GenRunnerConfig.failOnToolError).
          throw toError(event.error);
        }
      }
    },
  };
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

async function handleToolCall(
  event: { toolCallId: string; toolName: string; input: unknown; invalid?: boolean },
  onEvent: GenEventCallback,
  alreadyEmitted = 0
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
    for (const element of (typedInput.elements ?? []).slice(alreadyEmitted)) {
      await onEvent({ type: "element", element });
    }
    return;
  }

  // Write tools emit action_request (require user confirmation). A schema-invalid
  // call never executes, and the SDK resends its error to the model: no confirm bar.
  if (GEN_WRITE_TOOLS.has(toolName)) {
    if (event.invalid) return;
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
