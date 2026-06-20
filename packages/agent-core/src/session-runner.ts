import { trace, SpanStatusCode } from "@opentelemetry/api";
import type { SessionConfig, SessionResult, SessionEventCallback } from "./types.js";
import { buildSessionResult } from "./cost-tracker.js";
import { hasChanges, commitChanges, pushBranch, removeWorktree } from "./worktree-manager.js";
import { scheduleWorktreeReap } from "./worktree-reaper.js";
import { createPullRequest, buildFailurePrBody } from "./pr-creator.js";
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
import type { PipelineContext } from "./phases/pipeline-types.js";
import {
  WorktreePhase,
  QueryPhase,
  VerificationPhase,
  PublishPhase,
  FeedbackPhase,
} from "./phases/index.js";

const tracer = trace.getTracer("@mbe/agent-core");

// ── Pipeline phases (stateless singletons) ──────────────────────────

const phases = [
  new WorktreePhase(),
  new QueryPhase(),
  new VerificationPhase(),
  new PublishPhase(),
  new FeedbackPhase(),
] as const;

// ── Public API ──────────────────────────────────────────────────────

export async function runSession(
  config: SessionConfig,
  onEvent?: SessionEventCallback
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
          // Apply QA tuning defaults from .github/auto-qa-tuning.json
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

          const effectiveConfig = tuningOverrides
            ? {
                ...config,
                maxBudgetUsd: tuningOverrides.maxBudgetUsd,
                stuckDetectorConfig: {
                  ...config.stuckDetectorConfig,
                  ...tuningOverrides.stuckDetectorConfig,
                },
              }
            : config;

          const rootSpan = tracer.startSpan("agent_core.run_session", {
            attributes: {
              "session.task": effectiveConfig.taskDescription.slice(0, 200),
              "session.model": effectiveConfig.model,
              "session.max_turns": effectiveConfig.maxTurns,
              "session.max_budget_usd": effectiveConfig.maxBudgetUsd,
              "session.base_branch": effectiveConfig.baseBranch,
              ...(tuning ? { "session.qa_tuning_applied": true } : {}),
              ...(effectiveConfig.modelRoutingReason
                ? { "session.model_routing_reason": effectiveConfig.modelRoutingReason }
                : {}),
              ...(effectiveConfig.modelRoutingTier
                ? { "session.model_routing_tier": effectiveConfig.modelRoutingTier }
                : {}),
            },
          });

          const cleanupErrors: string[] = [];
          let ctx: PipelineContext = {
            config: effectiveConfig,
            onEvent,
            errors: [],
          };

          let pendingResult: SessionResult | undefined;

          try {
            // Run pipeline phases sequentially
            for (const phase of phases) {
              const { result, ctx: nextCtx } = await phase.run(ctx);
              ctx = nextCtx;

              if (result.status === "failed") {
                // Phase failure — attempt partial work push then abort
                if (ctx.worktree && effectiveConfig.createPr) {
                  const errorMsg = result.errors[0] ?? "Phase failed";
                  const prUrl = await pushPartialWork(ctx, errorMsg);
                  if (prUrl) {
                    ctx = { ...ctx, prUrl };
                  }
                }
                break;
              }
            }

            pendingResult = buildFinalResult(ctx, rootSpan);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            emitEvent(onEvent, "session:error", { message: errorMessage });
            rootSpan.recordException(error as Error);
            rootSpan.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });

            // Attempt to push partial work from failed sessions
            const prUrl = await pushPartialWork(ctx, errorMessage);

            rootSpan.setAttribute("session.status", "failed");
            pendingResult = {
              sessionId: "",
              status: "failed",
              branchName: ctx.worktree?.branchName ?? "",
              prUrl,
              costUsd: 0,
              tokenUsage: { inputTokens: 0, outputTokens: 0 },
              durationMs: 0,
              numTurns: 0,
              resultText: "",
              errors: [errorMessage],
              stuckPattern: ctx.stuckReason?.type,
            };
          } finally {
            // Clean up worktree when PR was created (branch is pushed)
            // Keep worktree when --no-pr so user can inspect
            if (ctx.worktree && effectiveConfig.createPr) {
              try {
                await removeWorktree(effectiveConfig.repoPath, ctx.worktree.path);
              } catch (cleanupErr) {
                const cleanupMsg =
                  cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
                // Record the error in the result (unchanged behavior)
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
                  worktreePath: ctx.worktree.path,
                  mode: ctx.worktree.mode,
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

// ── Result builder ──────────────────────────────────────────────────

function buildFinalResult(
  ctx: PipelineContext,
  rootSpan: ReturnType<ReturnType<typeof trace.getTracer>["startSpan"]>
): SessionResult {
  const {
    resultMessage,
    stuckReason,
    gatewayEvaluation,
    turnMetrics,
    toolCallMetrics,
    contextMetrics,
  } = ctx;
  const errors = [...ctx.errors];

  if (stuckReason) {
    // Deduplicate — stuck error may already be in ctx.errors
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
      ctx.worktree?.branchName ?? "",
      ctx.prUrl ?? null
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
      recordFailure(ctx.config.repoPath, {
        taskDescription: ctx.config.taskDescription,
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

    emitEvent(ctx.onEvent, "session:result", {
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
    branchName: ctx.worktree?.branchName ?? "",
    prUrl: ctx.prUrl ?? null,
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

async function pushPartialWork(ctx: PipelineContext, errorMessage: string): Promise<string | null> {
  const { config, worktree, stuckReason, onEvent } = ctx;

  if (!worktree || !config.createPr) return null;

  try {
    const changed = await hasChanges(worktree.path);
    if (!changed) return null;

    const commitMsg = `wip: ${sanitizeForCommitMessage(config.taskDescription)}`;
    await commitChanges(worktree.path, commitMsg);
    await withRetry(() => pushBranch(worktree.path, worktree.branchName), {
      maxRetries: 2,
    });

    const { value: pr } = await withRetry(
      () =>
        createPullRequest({
          title: `wip: ${config.taskDescription.slice(0, 57)}`,
          body: buildFailurePrBody(config.taskDescription, [errorMessage], stuckReason?.type),
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
