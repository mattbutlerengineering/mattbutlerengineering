import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { startObservation } from "@langfuse/tracing";
import { createToolPermissionHandler } from "../tool-permissions.js";
import { createStuckDetector } from "../stuck-detector.js";
import type { StuckPattern } from "../stuck-detector.js";
import { mapSdkMessage } from "../event-mapper.js";
import type { TurnMetricsEvent } from "../event-mapper.js";
import { sanitizeStreamChunk } from "../sanitize-output.js";
import { ContextWindowExhaustedError } from "../retry.js";
import { CircuitBreaker, CircuitState } from "../circuit-breaker.js";
import { DEFAULT_HEARTBEAT_CONFIG } from "../types.js";
import { emitEvent } from "../utils.js";
import type { PipelineContext, PipelinePhase, PhaseResult } from "./pipeline-types.js";

const tracer = trace.getTracer("@mbe/agent-core");

/** Maximum compaction events before treating the session as exhausted. */
const MAX_COMPACTIONS = 5;

/** Circuit breaker default configuration. */
const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_TIMEOUT_MS = 60_000;

/**
 * Module-level circuit breaker protecting Anthropic API calls.
 * Persists across `QueryPhase.run()` invocations so repeated failures
 * trip the breaker and prevent hammering a degraded API.
 */
const apiCircuitBreaker = new CircuitBreaker({
  failureThreshold: CIRCUIT_BREAKER_FAILURE_THRESHOLD,
  resetTimeoutMs: CIRCUIT_BREAKER_RESET_TIMEOUT_MS,
});

interface StreamingResult {
  readonly resultMessage: SDKResultMessage | null;
  readonly stuckDetected: StuckPattern | null;
}

export class QueryPhase implements PipelinePhase {
  readonly name = "query" as const;

  async run(ctx: PipelineContext): Promise<{ result: PhaseResult; ctx: PipelineContext }> {
    const { config, onEvent, worktree, systemPrompt } = ctx;

    if (!worktree || !systemPrompt) {
      const msg = "QueryPhase requires worktree and systemPrompt in context";
      return {
        result: { phase: this.name, status: "failed", errors: [msg] },
        ctx: { ...ctx, errors: [...ctx.errors, msg] },
      };
    }

    // Fail fast if the circuit breaker is open
    if (apiCircuitBreaker.getState() === CircuitState.Open) {
      const circuitMsg =
        "Circuit breaker is OPEN — Anthropic API appears degraded. Skipping session.";
      emitEvent(onEvent, "session:error", { message: circuitMsg });
      return {
        result: { phase: this.name, status: "failed", errors: [circuitMsg] },
        ctx: { ...ctx, errors: [...ctx.errors, circuitMsg] },
      };
    }

    const abortController = new AbortController();
    const canUseTool = createToolPermissionHandler(worktree.path);

    const detector = createStuckDetector(config.stuckDetectorConfig);

    let conversation: ReturnType<typeof query>;
    try {
      conversation = query({
        prompt: config.taskDescription,
        options: {
          abortController,
          cwd: worktree.path,
          model: config.model,
          maxTurns: config.maxTurns,
          maxBudgetUsd: config.maxBudgetUsd,
          allowedTools: [...config.allowedTools],
          permissionMode: "acceptEdits",
          settingSources: ["project"],
          systemPrompt: {
            type: "preset",
            preset: "claude_code",
            append: systemPrompt,
          },
          canUseTool: async (toolName, input) => canUseTool(toolName, input),
        },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        result: { phase: this.name, status: "failed", errors: [errMsg] },
        ctx: { ...ctx, errors: [...ctx.errors, errMsg] },
      };
    }

    const querySpan = tracer.startSpan("agent_core.sdk_query", {
      attributes: { "sdk.model": config.model },
    });

    let compactionCount = 0;
    let turnIndex = 0;

    const rawTurnMetrics: Array<{
      turnIndex: number;
      startedAt: string;
      inputTokens: number;
      outputTokens: number;
      thinkingTokens: number;
      costUsd: number;
      modelId: string;
    }> = [];

    const rawToolCallMetrics: Array<{
      toolName: string;
      toolUseId: string;
      latencyMs: number;
      isError: boolean;
    }> = [];

    const pendingToolCalls = new Map<string, { toolName: string; startMs: number }>();

    // Heartbeat: periodic liveness signal + inactivity timeout
    const heartbeat = DEFAULT_HEARTBEAT_CONFIG;
    const startTime = Date.now();
    let lastActivityMs = Date.now();
    let stuckReason: StuckPattern | null = null;

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
      if (silenceMs >= heartbeat.inactivityTimeoutMs) {
        stuckReason = {
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
    }, heartbeat.intervalMs);

    let streamResult: StreamingResult = { resultMessage: null, stuckDetected: null };
    let circuitBreakerTripped = false;

    try {
      streamResult = await apiCircuitBreaker.wrap(async (): Promise<StreamingResult> => {
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
        return { resultMessage: innerResult, stuckDetected: innerStuck };
      });
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
        return {
          result: { phase: this.name, status: "failed", errors: [errMsg] },
          ctx: { ...ctx, errors: [...ctx.errors, errMsg] },
        };
      }
    } finally {
      clearInterval(heartbeatInterval);
      querySpan.end();
    }

    const resultMessage = streamResult.resultMessage ?? undefined;
    const detectedStuck = streamResult.stuckDetected ?? stuckReason ?? undefined;

    if (circuitBreakerTripped) {
      const circuitMsg = "Circuit breaker tripped — too many consecutive API failures";
      return {
        result: { phase: this.name, status: "failed", errors: [circuitMsg] },
        ctx: { ...ctx, errors: [...ctx.errors, circuitMsg] },
      };
    }

    const { buildTurnMetricsList, buildToolCallMetricsList } = await import("../observability.js");

    return {
      result: { phase: this.name, status: "success", errors: [] },
      ctx: {
        ...ctx,
        resultMessage,
        stuckReason: detectedStuck,
        turnMetrics: buildTurnMetricsList(rawTurnMetrics),
        toolCallMetrics: buildToolCallMetricsList(rawToolCallMetrics),
      },
    };
  }
}
