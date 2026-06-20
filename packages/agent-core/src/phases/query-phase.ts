import { CircuitState } from "../circuit-breaker.js";
import { apiCircuitBreaker } from "../run-hardened-query.js";
import { emitEvent } from "../utils.js";
import type {
  Phase,
  PhaseDeps,
  PhaseExecution,
  QueryPhaseInput,
  QueryPhaseOutput,
} from "./pipeline-types.js";

export class QueryPhase implements Phase<QueryPhaseInput, QueryPhaseOutput> {
  readonly name = "query" as const;

  async run(input: QueryPhaseInput, deps: PhaseDeps): Promise<PhaseExecution<QueryPhaseOutput>> {
    const { config, onEvent, worktree, systemPrompt } = input;

    // Fail fast if the circuit breaker is open
    if (apiCircuitBreaker.getState() === CircuitState.Open) {
      const circuitMsg =
        "Circuit breaker is OPEN — Anthropic API appears degraded. Skipping session.";
      emitEvent(onEvent, "session:error", { message: circuitMsg });
      return {
        result: { phase: this.name, status: "failed", errors: [circuitMsg] },
        output: null,
      };
    }

    const {
      resultMessage,
      stuckReason,
      rawTurnMetrics,
      rawToolCallMetrics,
      errorMessage,
      contextMetrics,
    } = await deps.queryRunner.runHardenedQuery(
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
        output: null,
      };
    }

    const { buildTurnMetricsList, buildToolCallMetricsList } = await import("../observability.js");

    return {
      result: { phase: this.name, status: "success", errors: [] },
      output: {
        resultMessage: resultMessage ?? undefined,
        stuckReason: stuckReason ?? undefined,
        turnMetrics: buildTurnMetricsList(rawTurnMetrics),
        toolCallMetrics: buildToolCallMetricsList(rawToolCallMetrics),
        contextMetrics: contextMetrics ?? undefined,
      },
    };
  }
}
