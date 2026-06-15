import { CircuitState } from "../circuit-breaker.js";
import { apiCircuitBreaker, runHardenedQuery } from "../run-hardened-query.js";
import { emitEvent } from "../utils.js";
import type { PipelineContext, PipelinePhase, PhaseResult } from "./pipeline-types.js";

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

    const { resultMessage, stuckReason, rawTurnMetrics, rawToolCallMetrics, errorMessage } =
      await runHardenedQuery(
        {
          prompt: config.taskDescription,
          cwd: worktree.path,
          model: config.model,
          maxTurns: config.maxTurns,
          maxBudgetUsd: config.maxBudgetUsd,
          allowedTools: config.allowedTools,
          systemPromptAppend: systemPrompt,
          stuckDetectorConfig: config.stuckDetectorConfig,
        },
        onEvent
      );

    // Propagate errors from runHardenedQuery as phase failures
    if (errorMessage) {
      return {
        result: { phase: this.name, status: "failed", errors: [errorMessage] },
        ctx: { ...ctx, errors: [...ctx.errors, errorMessage] },
      };
    }

    const { buildTurnMetricsList, buildToolCallMetricsList } = await import("../observability.js");

    return {
      result: { phase: this.name, status: "success", errors: [] },
      ctx: {
        ...ctx,
        resultMessage: resultMessage ?? undefined,
        stuckReason: stuckReason ?? undefined,
        turnMetrics: buildTurnMetricsList(rawTurnMetrics),
        toolCallMetrics: buildToolCallMetricsList(rawToolCallMetrics),
      },
    };
  }
}
