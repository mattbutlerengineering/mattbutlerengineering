import { trace, SpanStatusCode } from "@opentelemetry/api";
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
import type { GatewayVerdict } from "./post-commit-gateway.js";
import { buildSessionResult } from "./cost-tracker.js";
import { scheduleWorktreeReap } from "./worktree-reaper.js";
import { recordFailure } from "./failure-memory.js";
import { withRetry } from "./retry.js";
import { emitEvent, sanitizeForCommitMessage } from "./utils.js";
import { categorizeFailure } from "./observability.js";
import { loadQaTuning, applyTuningDefaults } from "./qa-tuning-loader.js";
import { DEFAULT_SESSION_CONFIG } from "./types.js";
import {
  startActiveObservation,
  propagateAttributes,
  updateActiveObservation,
} from "@langfuse/tracing";

import { recordSessionCost } from "./cost-logger.js";
import type { PhaseDeps } from "./phases/index.js";
import {
  createDefaultPhaseDeps,
  WorktreePhase,
  QueryPhase,
  VerificationPhase,
  PublishPhase,
  FeedbackPhase,
} from "./phases/index.js";

const tracer = trace.getTracer("@mbe/agent-core");

// ── Pipeline phases (stateless singletons) ──────────────────────────

const worktreePhase = new WorktreePhase();
const queryPhase = new QueryPhase();
const verificationPhase = new VerificationPhase();
const publishPhase = new PublishPhase();
const feedbackPhase = new FeedbackPhase();

/**
 * Mutable accumulator threaded across phases. Each phase reads the fields
 * it needs and the session-runner composes the next phase's typed input
 * from these values. Replaces the former amorphous `PipelineContext` bag.
 */
interface SessionState {
  worktree?: WorktreeInfo;
  systemPrompt?: string;
  resultMessage?: SDKResultMessage;
  stuckReason?: StuckPattern;
  turnMetrics: readonly TurnMetrics[];
  toolCallMetrics: readonly ToolCallMetrics[];
  contextMetrics?: ContextMetrics;
  hasChanges: boolean;
  commitMsg?: string;
  cachedDiff?: string;
  gatewayVerdict?: GatewayVerdict;
  gatewayEvaluation?: EvaluationResult;
  prUrl: string | null;
  prNumber?: number;
  errors: string[];
}

// ── Public API ──────────────────────────────────────────────────────

export async function runSession(
  config: SessionConfig,
  onEvent?: SessionEventCallback,
  deps: PhaseDeps = createDefaultPhaseDeps()
): Promise<SessionResult> {
  return startActiveObservation(
    "agent-session",
    async (_lfTrace: unknown): Promise<SessionResult> => {
      return propagateAttributes(
        {
          metadata: {
            task: config.taskDescription,
            model: config.model,
            maxBudgetUsd: String(config.maxBudgetUsd),
            ...(config.modelRoutingReason ? { modelRoutingReason: config.modelRoutingReason } : {}),
            ...(config.modelRoutingTier ? { modelRoutingTier: config.modelRoutingTier } : {}),
          },
        },
        async (): Promise<SessionResult> => {
          const effectiveConfig = applyEffectiveConfig(config);

          const rootSpan = tracer.startSpan("agent_core.run_session", {
            attributes: buildRootSpanAttributes(effectiveConfig, loadQaTuning(config.repoPath)),
          });

          const cleanupErrors: string[] = [];
          const state: SessionState = {
            turnMetrics: [],
            toolCallMetrics: [],
            hasChanges: false,
            prUrl: null,
            errors: [],
          };

          let pendingResult: SessionResult | undefined;

          try {
            await runPipeline(effectiveConfig, onEvent, deps, state);
            pendingResult = buildFinalResult(effectiveConfig, state, rootSpan, onEvent);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            emitEvent(onEvent, "session:error", { message: errorMessage });
            rootSpan.recordException(error as Error);
            rootSpan.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });

            // Attempt to push partial work from failed sessions
            const prUrl = await pushPartialWork(
              effectiveConfig,
              state,
              deps,
              errorMessage,
              onEvent
            );

            rootSpan.setAttribute("session.status", "failed");
            pendingResult = {
              sessionId: "",
              status: "failed",
              branchName: state.worktree?.branchName ?? "",
              prUrl,
              costUsd: 0,
              tokenUsage: { inputTokens: 0, outputTokens: 0 },
              durationMs: 0,
              numTurns: 0,
              resultText: "",
              errors: [errorMessage],
              stuckPattern: state.stuckReason?.type,
            };
          } finally {
            // Clean up worktree when PR was created (branch is pushed).
            // Keep worktree when --no-pr so user can inspect.
            if (state.worktree && effectiveConfig.createPr) {
              try {
                await deps.worktreeManager.removeWorktree(
                  effectiveConfig.repoPath,
                  state.worktree.path
                );
              } catch (cleanupErr) {
                const cleanupMsg =
                  cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
                cleanupErrors.push(cleanupMsg);
                console.warn(`Worktree cleanup failed: ${cleanupMsg}`);
                emitEvent(onEvent, "session:cleanup_warning", {
                  message: `Worktree cleanup failed: ${cleanupMsg}`,
                });
                // Schedule a bounded retry so the worktree is reclaimed instead of
                // persisting until a human notices. Reap exhaustion logs at error
                // level (never silent) and is not treated as a session failure.
                await scheduleWorktreeReap({
                  repoPath: effectiveConfig.repoPath,
                  worktreePath: state.worktree.path,
                  mode: state.worktree.mode,
                });
              }
            }
            rootSpan.end();
          }

          const finalResultWithCleanup =
            cleanupErrors.length > 0 ? { ...pendingResult!, cleanupErrors } : pendingResult!;

          // Record spend so progress-tracker / learning-loop sensors have data
          try {
            recordSessionCost(effectiveConfig.repoPath, {
              costUsd: finalResultWithCleanup.costUsd,
              sessionId: finalResultWithCleanup.sessionId || undefined,
              model: effectiveConfig.model,
              status: finalResultWithCleanup.status,
            });
          } catch {
            // Best-effort — never fail a session over spend logging
          }

          return finalResultWithCleanup;
        }
      );
    }
  );
}

// ── Pipeline composition ────────────────────────────────────────────
//
// Each phase receives a typed input composed from prior phase outputs.
// A failed phase short-circuits the pipeline (after a best-effort
// partial-work push), mirroring the prior break-on-failure behaviour.

async function runPipeline(
  config: SessionConfig,
  onEvent: SessionEventCallback | undefined,
  deps: PhaseDeps,
  state: SessionState
): Promise<void> {
  // WorktreePhase
  const worktreeExec = await worktreePhase.run({ config, onEvent }, deps);
  if (worktreeExec.output) {
    state.worktree = worktreeExec.output.worktree;
    state.systemPrompt = worktreeExec.output.systemPrompt;
  }
  if (await abortOnFailure(worktreeExec.result, config, state, deps, onEvent)) return;

  // QueryPhase
  const queryExec = await queryPhase.run(
    { config, onEvent, worktree: state.worktree!, systemPrompt: state.systemPrompt! },
    deps
  );
  if (queryExec.output) {
    state.resultMessage = queryExec.output.resultMessage;
    state.stuckReason = queryExec.output.stuckReason;
    state.turnMetrics = queryExec.output.turnMetrics;
    state.toolCallMetrics = queryExec.output.toolCallMetrics;
    state.contextMetrics = queryExec.output.contextMetrics;
  }
  if (await abortOnFailure(queryExec.result, config, state, deps, onEvent)) return;

  // VerificationPhase
  const verifyExec = await verificationPhase.run(
    {
      config,
      onEvent,
      worktree: state.worktree!,
      resultMessage: state.resultMessage,
      stuckReason: state.stuckReason,
    },
    deps
  );
  if (verifyExec.output) {
    state.hasChanges = verifyExec.output.hasChanges;
    state.commitMsg = verifyExec.output.commitMsg;
    state.cachedDiff = verifyExec.output.cachedDiff;
    state.gatewayVerdict = verifyExec.output.gatewayVerdict;
    state.gatewayEvaluation = verifyExec.output.gatewayEvaluation;
  }
  // VerificationPhase always succeeds; its gateway errors flow into the
  // final result via state.errors (e.g. a draft PR with failing gates).
  state.errors.push(...verifyExec.result.errors);
  if (await abortOnFailure(verifyExec.result, config, state, deps, onEvent)) return;

  // PublishPhase
  const publishExec = await publishPhase.run(
    {
      config,
      onEvent,
      worktree: state.worktree!,
      hasChanges: state.hasChanges,
      resultMessage: state.resultMessage,
      stuckReason: state.stuckReason,
      gatewayVerdict: state.gatewayVerdict,
      errors: state.errors,
    },
    deps
  );
  if (publishExec.output) {
    state.prUrl = publishExec.output.prUrl;
    state.prNumber = publishExec.output.prNumber;
  }
  if (await abortOnFailure(publishExec.result, config, state, deps, onEvent)) return;

  // FeedbackPhase
  const feedbackExec = await feedbackPhase.run(
    {
      config,
      onEvent,
      worktree: state.worktree!,
      resultMessage: state.resultMessage,
      prUrl: state.prUrl,
      prNumber: state.prNumber,
    },
    deps
  );
  await abortOnFailure(feedbackExec.result, config, state, deps, onEvent);
}

/**
 * On phase failure: record the phase errors, push partial work (when a
 * worktree exists and PRs are enabled), and signal the caller to abort.
 * Returns `true` when the pipeline should stop.
 *
 * No-op for non-failing phases. VerificationPhase always succeeds and
 * pushes its gateway errors into `state.errors` directly, so this never
 * double-counts.
 */
async function abortOnFailure(
  result: { status: string; errors: readonly string[] },
  config: SessionConfig,
  state: SessionState,
  deps: PhaseDeps,
  onEvent: SessionEventCallback | undefined
): Promise<boolean> {
  if (result.status !== "failed") return false;

  state.errors.push(...result.errors);

  if (state.worktree && config.createPr) {
    const errorMsg = result.errors[0] ?? "Phase failed";
    const prUrl = await pushPartialWork(config, state, deps, errorMsg, onEvent);
    if (prUrl) {
      state.prUrl = prUrl;
    }
  }
  return true;
}

// ── Config helpers ──────────────────────────────────────────────────

function applyEffectiveConfig(config: SessionConfig): SessionConfig {
  const tuning = loadQaTuning(config.repoPath);
  const tuningOverrides = tuning
    ? applyTuningDefaults(
        {
          maxBudgetUsd: config.maxBudgetUsd,
          stuckDetectorConfig: config.stuckDetectorConfig,
        },
        tuning,
        DEFAULT_SESSION_CONFIG.maxBudgetUsd
      )
    : null;

  return tuningOverrides
    ? {
        ...config,
        maxBudgetUsd: tuningOverrides.maxBudgetUsd,
        stuckDetectorConfig: {
          ...config.stuckDetectorConfig,
          ...tuningOverrides.stuckDetectorConfig,
        },
      }
    : config;
}

function buildRootSpanAttributes(
  config: SessionConfig,
  tuning: ReturnType<typeof loadQaTuning>
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

// ── Result builder ──────────────────────────────────────────────────

function buildFinalResult(
  config: SessionConfig,
  state: SessionState,
  rootSpan: ReturnType<ReturnType<typeof trace.getTracer>["startSpan"]>,
  onEvent: SessionEventCallback | undefined
): SessionResult {
  const {
    resultMessage,
    stuckReason,
    gatewayEvaluation,
    turnMetrics,
    toolCallMetrics,
    contextMetrics,
  } = state;
  const errors = [...state.errors];

  if (stuckReason) {
    // Deduplicate — stuck error may already be in state.errors
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
      state.worktree?.branchName ?? "",
      state.prUrl ?? null
    );

    const isFailed = sessionResult.status === "failed" || !!stuckReason;
    const failureCategory = isFailed ? categorizeFailure(errors, stuckReason?.type) : undefined;

    const finalResult: SessionResult = {
      ...sessionResult,
      ...(stuckReason ? { status: "failed" as const, stuckPattern: stuckReason.type } : {}),
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
    branchName: state.worktree?.branchName ?? "",
    prUrl: state.prUrl ?? null,
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

// ── Error recovery ──────────────────────────────────────────────────

async function pushPartialWork(
  config: SessionConfig,
  state: SessionState,
  deps: PhaseDeps,
  errorMessage: string,
  onEvent: SessionEventCallback | undefined
): Promise<string | null> {
  const { worktree, stuckReason } = state;
  const { worktreeManager, prCreator } = deps;

  if (!worktree || !config.createPr) return null;

  try {
    const changed = await worktreeManager.hasChanges(worktree.path);
    if (!changed) return null;

    const commitMsg = `wip: ${sanitizeForCommitMessage(config.taskDescription)}`;
    await worktreeManager.commitChanges(worktree.path, commitMsg);
    await withRetry(() => worktreeManager.pushBranch(worktree.path, worktree.branchName), {
      maxRetries: 2,
    });

    const { value: pr } = await withRetry(
      () =>
        prCreator.createPullRequest({
          title: `wip: ${config.taskDescription.slice(0, 57)}`,
          body: prCreator.buildFailurePrBody(
            config.taskDescription,
            [errorMessage],
            stuckReason?.type
          ),
          baseBranch: config.baseBranch,
          branchName: worktree.branchName,
          repoPath: worktree.path,
          draft: true,
        }),
      { maxRetries: 2 }
    );

    emitEvent(onEvent, "session:result", {
      message: `Draft PR created from failed session: ${pr.url}`,
    });
    return pr.url;
  } catch {
    // Best-effort — don't mask the original error
    return null;
  }
}
