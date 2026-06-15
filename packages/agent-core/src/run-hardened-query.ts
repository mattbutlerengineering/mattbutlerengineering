/**
 * packages/agent-core/src/run-hardened-query.ts
 *
 * One guarded streaming consumer for every query() call site.
 *
 * Encapsulates:
 *   - stuck detection (via createStuckDetector)
 *   - circuit breaker (module-level, shared with QueryPhase)
 *   - heartbeat / inactivity timeout
 *   - event mapping + turn/tool metrics
 *
 * Both QueryPhase and runFeedbackLoop delegate here so every real
 * agent run inherits the same safety guards.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { startObservation } from "@langfuse/tracing";
import { createStuckDetector } from "./stuck-detector.js";
import type { StuckPattern, StuckDetectorConfig } from "./stuck-detector.js";
import { mapSdkMessage } from "./event-mapper.js";
import type { TurnMetricsEvent } from "./event-mapper.js";
import { sanitizeStreamChunk } from "./sanitize-output.js";
import { ContextWindowExhaustedError } from "./retry.js";
import { CircuitBreaker, CircuitState } from "./circuit-breaker.js";
import { createToolPermissionHandler } from "./tool-permissions.js";
import { emitEvent } from "./utils.js";
import type { SessionEventCallback, HeartbeatConfig } from "./types.js";
import { DEFAULT_HEARTBEAT_CONFIG } from "./types.js";

// ── Shared circuit breaker ────────────────────────────────────────────
// Module-level so it persists across all call sites and multiple invocations.

const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_TIMEOUT_MS = 60_000;
const MAX_COMPACTIONS = 5;

export const apiCircuitBreaker = new CircuitBreaker({
  failureThreshold: CIRCUIT_BREAKER_FAILURE_THRESHOLD,
  resetTimeoutMs: CIRCUIT_BREAKER_RESET_TIMEOUT_MS,
});

// ── Types ────────────────────────────────────────────────────────────

export interface HardenedQueryConfig {
  /** The prompt to send to the agent. */
  readonly prompt: string;
  /** Working directory for the SDK. */
  readonly cwd: string;
  /** Model identifier. */
  readonly model: string;
  /** Maximum number of turns. */
  readonly maxTurns: number;
  /** Budget ceiling in USD. */
  readonly maxBudgetUsd: number;
  /** Allowed tool names. */
  readonly allowedTools: readonly string[];
  /**
   * Text appended to the preset system prompt.
   * Pass undefined to use only the claude_code preset.
   */
  readonly systemPromptAppend?: string;
  /** Stuck-detector overrides. */
  readonly stuckDetectorConfig?: Partial<StuckDetectorConfig>;
  /** Heartbeat configuration overrides. */
  readonly heartbeatConfig?: Partial<HeartbeatConfig>;
}

export interface RawTurnMetric {
  readonly turnIndex: number;
  readonly startedAt: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly thinkingTokens: number;
  readonly costUsd: number;
  readonly modelId: string;
}

export interface RawToolCallMetric {
  readonly toolName: string;
  readonly toolUseId: string;
  readonly latencyMs: number;
  readonly isError: boolean;
}

export interface HardenedQueryResult {
  readonly resultMessage: SDKResultMessage | null;
  readonly stuckReason: StuckPattern | null;
  readonly rawTurnMetrics: readonly RawTurnMetric[];
  readonly rawToolCallMetrics: readonly RawToolCallMetric[];
  /** Set when the query failed due to an unrecoverable error (SDK throw, etc.). */
  readonly errorMessage: string | null;
}

// ── Main function ─────────────────────────────────────────────────────

const tracer = trace.getTracer("@mbe/agent-core");

/**
 * Run a guarded agent query loop.
 *
 * Every call site (QueryPhase, feedback fix-session) delegates here so
 * stuck detection, circuit breaker, heartbeat, and metrics are applied
 * uniformly. Pass `onEvent` to receive streaming `SessionEvent`s.
 */
export async function runHardenedQuery(
  config: HardenedQueryConfig,
  onEvent?: SessionEventCallback
): Promise<HardenedQueryResult> {
  const heartbeatCfg: HeartbeatConfig = {
    ...DEFAULT_HEARTBEAT_CONFIG,
    ...config.heartbeatConfig,
  };

  // Fail fast if circuit breaker is open
  if (apiCircuitBreaker.getState() === CircuitState.Open) {
    const msg = "Circuit breaker is OPEN — Anthropic API appears degraded. Skipping query.";
    emitEvent(onEvent, "session:error", { message: msg });
    return {
      resultMessage: null,
      stuckReason: {
        type: "zero_progress",
        count: 0,
        threshold: 0,
        description: msg,
        severity: "error",
      },
      rawTurnMetrics: [],
      rawToolCallMetrics: [],
      errorMessage: msg,
    };
  }

  const abortController = new AbortController();
  const canUseTool = createToolPermissionHandler(config.cwd);
  const detector = createStuckDetector(config.stuckDetectorConfig);

  let conversation: ReturnType<typeof query>;
  try {
    conversation = query({
      prompt: config.prompt,
      options: {
        abortController,
        cwd: config.cwd,
        model: config.model,
        maxTurns: config.maxTurns,
        maxBudgetUsd: config.maxBudgetUsd,
        allowedTools: [...config.allowedTools],
        permissionMode: "acceptEdits",
        settingSources: ["project"],
        ...(config.systemPromptAppend !== undefined
          ? {
              systemPrompt: {
                type: "preset" as const,
                preset: "claude_code" as const,
                append: config.systemPromptAppend,
              },
            }
          : {
              systemPrompt: {
                type: "preset" as const,
                preset: "claude_code" as const,
              },
            }),
        canUseTool: async (toolName, input) => canUseTool(toolName, input),
      },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    emitEvent(onEvent, "session:error", { message: errMsg });
    return {
      resultMessage: null,
      stuckReason: null,
      rawTurnMetrics: [],
      rawToolCallMetrics: [],
      errorMessage: errMsg,
    };
  }

  const querySpan = tracer.startSpan("agent_core.sdk_query_hardened", {
    attributes: { "sdk.model": config.model },
  });

  let compactionCount = 0;
  let turnIndex = 0;

  const rawTurnMetrics: RawTurnMetric[] = [];
  const rawToolCallMetrics: RawToolCallMetric[] = [];
  const pendingToolCalls = new Map<string, { toolName: string; startMs: number }>();

  // Heartbeat: periodic liveness signal + inactivity timeout
  const startTime = Date.now();
  let lastActivityMs = Date.now();
  let heartbeatStuckReason: StuckPattern | null = null;

  const heartbeatInterval = setInterval(() => {
    const silenceMs = Date.now() - lastActivityMs;
    emitEvent(onEvent, "session:heartbeat", {
      message: JSON.stringify({
        turnCount: turnIndex,
        compactionCount,
        elapsedMs: Date.now() - startTime,
        lastActivityMs: silenceMs,
      }),
    });
    if (silenceMs >= heartbeatCfg.inactivityTimeoutMs) {
      heartbeatStuckReason = {
        type: "zero_progress" as const,
        count: 0,
        threshold: 0,
        description: `No SDK activity for ${Math.round(silenceMs / 1000)}s — session appears hung`,
        severity: "error" as const,
      };
      emitEvent(onEvent, "session:stuck", {
        message: `Inactivity timeout: no messages for ${Math.round(silenceMs / 1000)}s`,
      });
      abortController.abort();
    }
  }, heartbeatCfg.intervalMs);

  let resultMessage: SDKResultMessage | null = null;
  let streamStuck: StuckPattern | null = null;
  let circuitBreakerTripped = false;

  try {
    const streamResult = await apiCircuitBreaker.wrap(async () => {
      let innerResult: SDKResultMessage | null = null;
      let innerStuck: StuckPattern | null = null;

      try {
        for await (const message of conversation) {
          lastActivityMs = Date.now();
          emitEvent(onEvent, "session:message", message);

          if (message.type === "assistant") {
            turnIndex++;
          }

          // Track assistant messages as Langfuse generation observations
          if (message.type === "assistant" && "message" in message) {
            const msg = message.message as {
              role: string;
              content: unknown;
              usage?: { input_tokens?: number; output_tokens?: number };
            };
            const gen = startObservation(
              `llm-turn-${turnIndex}`,
              { model: config.model, input: msg.content },
              { asType: "generation" }
            );
            gen
              .update({
                output: msg.content,
                usageDetails: {
                  input: msg.usage?.input_tokens ?? 0,
                  output: msg.usage?.output_tokens ?? 0,
                },
              })
              .end();
          }

          // Emit typed events for observability
          for (const mapped of mapSdkMessage(message, turnIndex)) {
            emitEvent(onEvent, mapped.type, {
              message: sanitizeStreamChunk(JSON.stringify(mapped)),
            });

            if (mapped.type === "session:turn_metrics") {
              const tm = mapped as TurnMetricsEvent;
              rawTurnMetrics.push({
                turnIndex: tm.turnIndex,
                startedAt: new Date().toISOString(),
                inputTokens: tm.inputTokens,
                outputTokens: tm.outputTokens,
                thinkingTokens: tm.thinkingTokens,
                costUsd: tm.costUsd,
                modelId: tm.modelId,
              });
            }

            if (mapped.type === "session:tool_use") {
              pendingToolCalls.set(mapped.toolUseId, {
                toolName: mapped.toolName,
                startMs: Date.now(),
              });
            }

            if (mapped.type === "session:tool_result") {
              const pending = pendingToolCalls.get(mapped.toolUseId);
              if (pending) {
                const latencyMs = Date.now() - pending.startMs;
                rawToolCallMetrics.push({
                  toolName: pending.toolName,
                  toolUseId: mapped.toolUseId,
                  latencyMs,
                  isError: mapped.isError,
                });
                pendingToolCalls.delete(mapped.toolUseId);
                emitEvent(onEvent, "session:tool_latency", {
                  message: JSON.stringify({
                    toolName: pending.toolName,
                    toolUseId: mapped.toolUseId,
                    latencyMs,
                    isError: mapped.isError,
                  }),
                });
              }
            }
          }

          // Track compaction events
          if (
            message.type === "system" &&
            "subtype" in message &&
            message.subtype === "compact_boundary"
          ) {
            compactionCount++;
            if (compactionCount >= MAX_COMPACTIONS) {
              innerStuck = {
                type: "context_window_loop",
                count: compactionCount,
                threshold: MAX_COMPACTIONS,
                description: `Context window compacted ${compactionCount} times — session exhausted`,
                severity: "error",
              };
              emitEvent(onEvent, "session:stuck", {
                message: `Context window exhaustion: ${compactionCount} compactions reached limit of ${MAX_COMPACTIONS}`,
              });
              querySpan.setAttribute("sdk.compaction_count", compactionCount);
              abortController.abort();
              break;
            }
          }

          if (message.type === "result") {
            innerResult = message as SDKResultMessage;
            continue;
          }

          const stuckPattern = detector.ingest(message);
          if (stuckPattern) {
            if (stuckPattern.severity === "error") {
              innerStuck = stuckPattern;
              emitEvent(onEvent, "session:stuck", {
                message: `Stuck detected: ${stuckPattern.description}`,
              });
              querySpan.setAttribute("sdk.stuck_pattern", stuckPattern.type);
              abortController.abort();
              break;
            }
            emitEvent(onEvent, "session:stuck", {
              message: `Stuck warning: ${stuckPattern.description}`,
            });
          }
        }

        querySpan.setAttribute("sdk.turns_completed", innerResult?.num_turns ?? 0);
        querySpan.setAttribute("sdk.compaction_count", compactionCount);
      } catch (err) {
        if (err instanceof ContextWindowExhaustedError) {
          innerStuck = {
            type: "context_window_loop",
            count: compactionCount,
            threshold: MAX_COMPACTIONS,
            description: err.message,
            severity: "error",
          };
          emitEvent(onEvent, "session:stuck", {
            message: `Context window exhaustion: ${err.message}`,
          });
        } else {
          querySpan.recordException(err as Error);
          querySpan.setStatus({ code: SpanStatusCode.ERROR });
          throw err;
        }
      }

      return { innerResult, innerStuck };
    });

    resultMessage = streamResult.innerResult;
    streamStuck = streamResult.innerStuck;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes("Circuit breaker is OPEN")) {
      circuitBreakerTripped = true;
      emitEvent(onEvent, "session:error", {
        message: `Circuit breaker tripped: ${errMsg}`,
      });
      querySpan.setAttribute("session.circuit_breaker", "tripped");
    } else {
      clearInterval(heartbeatInterval);
      querySpan.end();
      emitEvent(onEvent, "session:error", { message: errMsg });
      return {
        resultMessage: null,
        stuckReason: null,
        rawTurnMetrics,
        rawToolCallMetrics,
        errorMessage: errMsg,
      };
    }
  } finally {
    clearInterval(heartbeatInterval);
    querySpan.end();
  }

  if (circuitBreakerTripped) {
    const circuitMsg = "Circuit breaker tripped — too many consecutive API failures";
    return {
      resultMessage: null,
      stuckReason: {
        type: "zero_progress",
        count: 0,
        threshold: 0,
        description: circuitMsg,
        severity: "error",
      },
      rawTurnMetrics,
      rawToolCallMetrics,
      errorMessage: circuitMsg,
    };
  }

  return {
    resultMessage,
    stuckReason: streamStuck ?? heartbeatStuckReason,
    rawTurnMetrics,
    rawToolCallMetrics,
    errorMessage: null,
  };
}
