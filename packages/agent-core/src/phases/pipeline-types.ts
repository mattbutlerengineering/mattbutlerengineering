import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import type {
  SessionConfig,
  SessionEventCallback,
  WorktreeInfo,
  TurnMetrics,
  ToolCallMetrics,
} from "../types.js";
import type { StuckPattern } from "../stuck-detector.js";
import type { ContextMetrics } from "../context-budget.js";
import type { EvaluationResult } from "../success-evaluator.js";
import type { GatewayVerdict } from "../post-commit-gateway.js";
import type { TaskSignals } from "../task-signal-registry.js";

// ── Phase result ────────────────────────────────────────────────────

export type PhaseStatus = "success" | "failed" | "skipped";

export interface PhaseResult {
  readonly phase: string;
  readonly status: PhaseStatus;
  readonly errors: readonly string[];
}

// ── Immutable pipeline context ──────────────────────────────────────
//
// Each phase receives the context and returns a new context (spread)
// with its additions. No mutation.

export interface PipelineContext {
  /** Effective config after QA tuning overrides. */
  readonly config: SessionConfig;
  /** Event callback for streaming. */
  readonly onEvent?: SessionEventCallback;

  // WorktreePhase outputs
  readonly worktree?: WorktreeInfo;
  readonly systemPrompt?: string;
  /**
   * Task signals (tier/domains/context bundles) classified once from the task
   * description by the shared TaskSignalRegistry, so downstream consumers do
   * not re-scan the description.
   */
  readonly taskSignals?: TaskSignals;

  // QueryPhase outputs
  readonly resultMessage?: SDKResultMessage;
  readonly stuckReason?: StuckPattern;
  readonly turnMetrics?: readonly TurnMetrics[];
  readonly toolCallMetrics?: readonly ToolCallMetrics[];
  readonly contextMetrics?: ContextMetrics;

  // VerificationPhase outputs
  readonly hasChanges?: boolean;
  readonly gatewayVerdict?: GatewayVerdict;
  readonly gatewayEvaluation?: EvaluationResult;
  readonly cachedDiff?: string;
  readonly commitMsg?: string;

  // PublishPhase outputs
  readonly prUrl?: string | null;
  readonly prNumber?: number;

  // Accumulated errors from all phases
  readonly errors: readonly string[];
}

/**
 * A pipeline phase: receives immutable context, returns a result and
 * an updated context. The caller spreads the returned context into the
 * next phase invocation.
 */
export interface PipelinePhase {
  readonly name: string;
  run(ctx: PipelineContext): Promise<{
    readonly result: PhaseResult;
    readonly ctx: PipelineContext;
  }>;
}
