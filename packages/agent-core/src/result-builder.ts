import type { Span } from "@opentelemetry/api";
import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import type {
  SessionConfig,
  SessionResult,
  SessionEventCallback,
  WorktreeInfo,
  TurnMetrics,
  ToolCallMetrics,
} from "./types.js";
import type { StuckPattern } from "./stuck-detector.js";
import type { ContextMetrics } from "./context-budget.js";
import type { EvaluationResult } from "./success-evaluator.js";
import type { QaTuningThresholds } from "./qa-tuning-loader.js";
import { buildSessionResult } from "./cost-tracker.js";
import { recordFailure } from "./failure-memory.js";
import { emitEvent } from "./utils.js";
import { categorizeFailure } from "./observability.js";
import { updateActiveObservation } from "@langfuse/tracing";

/**
 * Immutable input to `buildFinalResult`: the typed phase outputs the
 * session-runner accumulated while threading the pipeline. Built once from
 * local consts at each pipeline exit — never mutated across phases
 * (replaces the former mutable `SessionState` accumulator).
 */
export interface PipelineOutcome {
  readonly worktree?: WorktreeInfo;
  readonly resultMessage?: SDKResultMessage;
  readonly stuckReason?: StuckPattern;
  readonly turnMetrics: readonly TurnMetrics[];
  readonly toolCallMetrics: readonly ToolCallMetrics[];
  readonly contextMetrics?: ContextMetrics;
  readonly gatewayEvaluation?: EvaluationResult;
  readonly prUrl: string | null;
  readonly errors: readonly string[];
  /** Set when enforceBudget=true and per-turn costs exceeded maxBudgetUsd. */
  readonly budgetEnforced?: boolean;
}

export function buildRootSpanAttributes(
  config: SessionConfig,
  tuning: QaTuningThresholds | null
): Record<string, string | number | boolean> {
  return {
    "session.task": config.taskDescription.slice(0, 200),
    "session.model": config.model,
    "session.max_turns": config.maxTurns,
    "session.max_budget_usd": config.maxBudgetUsd,
    "session.base_branch": config.baseBranch,
    ...(tuning ? { "session.qa_tuning_applied": true } : {}),
    ...(config.modelRoutingReason
      ? { "session.model_routing_reason": config.modelRoutingReason }
      : {}),
    ...(config.modelRoutingTier ? { "session.model_routing_tier": config.modelRoutingTier } : {}),
  };
}

export function buildFinalResult(
  config: SessionConfig,
  outcome: PipelineOutcome,
  rootSpan: Span,
  onEvent: SessionEventCallback | undefined
): SessionResult {
  const {
    resultMessage,
    stuckReason,
    gatewayEvaluation,
    turnMetrics,
    toolCallMetrics,
    contextMetrics,
    budgetEnforced,
  } = outcome;
  const errors = [...outcome.errors];

  if (stuckReason) {
    // Deduplicate — stuck error may already be in outcome.errors
    const stuckMsg = `Stuck: ${stuckReason.description}`;
    if (!errors.includes(stuckMsg)) {
      errors.push(stuckMsg);
    }
  }
  if (!resultMessage) {
    const noResultMsg = "No result message received from agent";
    if (!errors.includes(noResultMsg)) {
      errors.push(noResultMsg);
    }
  }

  const evalSummary = gatewayEvaluation
    ? {
        passed: gatewayEvaluation.passed,
        confidence: gatewayEvaluation.confidence,
        reasoning: gatewayEvaluation.reasoning,
      }
    : undefined;

  const collectedTurnMetrics = turnMetrics ?? [];
  const collectedToolCallMetrics = toolCallMetrics ?? [];

  if (resultMessage) {
    const sessionResult = buildSessionResult(
      resultMessage,
      outcome.worktree?.branchName ?? "",
      outcome.prUrl ?? null
    );

    const isFailed = sessionResult.status === "failed" || !!stuckReason || !!budgetEnforced;
    const failureCategory = isFailed ? categorizeFailure(errors, stuckReason?.type) : undefined;

    const finalResult: SessionResult = {
      ...sessionResult,
      ...(stuckReason ? { status: "failed" as const, stuckPattern: stuckReason.type } : {}),
      ...(budgetEnforced
        ? {
            status: "failed" as const,
            errors: [
              ...sessionResult.errors,
              ...errors.filter((e) => !sessionResult.errors.includes(e)),
            ],
          }
        : {}),
      ...(evalSummary ? { evaluation: evalSummary } : {}),
      ...(failureCategory ? { failureCategory } : {}),
      turnMetrics: collectedTurnMetrics,
      toolCallMetrics: collectedToolCallMetrics,
    };

    // Record failure for future context
    if (finalResult.status === "failed") {
      recordFailure(config.repoPath, {
        taskDescription: config.taskDescription,
        timestamp: new Date().toISOString(),
        stuckPattern: stuckReason?.type,
        errors,
        approach: finalResult.resultText || "Unknown approach",
      }).catch(() => {});
    }

    // Set final span attributes
    rootSpan.setAttribute("session.status", finalResult.status);
    rootSpan.setAttribute("session.cost_usd", finalResult.costUsd);
    rootSpan.setAttribute("session.num_turns", finalResult.numTurns);
    rootSpan.setAttribute("session.branch", finalResult.branchName);
    if (finalResult.prUrl) rootSpan.setAttribute("session.pr_url", finalResult.prUrl);
    if (finalResult.stuckPattern)
      rootSpan.setAttribute("session.stuck_pattern", finalResult.stuckPattern);
    if (failureCategory) rootSpan.setAttribute("session.failure_category", failureCategory);
    rootSpan.setAttribute("session.turn_count", collectedTurnMetrics.length);
    rootSpan.setAttribute("session.tool_call_count", collectedToolCallMetrics.length);
    if (contextMetrics) {
      rootSpan.setAttribute("session.context_percent_at_exit", contextMetrics.contextPercentAtExit);
      rootSpan.setAttribute("session.peak_context_percent", contextMetrics.peakContextPercent);
      rootSpan.setAttribute("session.context_compaction_count", contextMetrics.compactionCount);
    }

    emitEvent(onEvent, "session:result", {
      message: `Session completed: ${finalResult.status}`,
    });

    // Attach session metrics to the Langfuse trace
    updateActiveObservation({
      metadata: {
        success: String(finalResult.status === "succeeded" ? 1 : 0),
        cost_usd: String(finalResult.costUsd),
        num_turns: String(finalResult.numTurns),
        stuck: String(stuckReason ? 1 : 0),
        ...(evalSummary
          ? {
              evaluation_confidence: String(evalSummary.confidence),
              evaluation_reasoning: evalSummary.reasoning,
            }
          : {}),
        ...(contextMetrics
          ? {
              context_percent_at_exit: String(contextMetrics.contextPercentAtExit),
              peak_context_percent: String(contextMetrics.peakContextPercent),
              context_compaction_count: String(contextMetrics.compactionCount),
            }
          : {}),
      },
    });

    return finalResult;
  }

  // No result message — build a failure result
  const failureCategoryNoResult = categorizeFailure(errors, stuckReason?.type);
  rootSpan.setAttribute("session.status", "failed");

  return {
    sessionId: "",
    status: "failed",
    branchName: outcome.worktree?.branchName ?? "",
    prUrl: outcome.prUrl ?? null,
    costUsd: 0,
    tokenUsage: { inputTokens: 0, outputTokens: 0 },
    durationMs: 0,
    numTurns: 0,
    resultText: "",
    errors,
    stuckPattern: stuckReason?.type,
    evaluation: evalSummary,
    ...(failureCategoryNoResult ? { failureCategory: failureCategoryNoResult } : {}),
    turnMetrics: collectedTurnMetrics,
    toolCallMetrics: collectedToolCallMetrics,
  };
}
