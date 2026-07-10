import { trace, SpanStatusCode } from "@opentelemetry/api";
import type { SessionConfig, SessionResult, SessionEventCallback, WorktreeInfo } from "./types.js";
import { shouldHaltForBudget } from "./budget-gate.js";
import { scheduleWorktreeReap } from "./worktree-reaper.js";
import { withRetry } from "./retry.js";
import { emitEvent, sanitizeForCommitMessage } from "./utils.js";
import { loadQaTuning, applyTuningDefaults } from "./qa-tuning-loader.js";
import { DEFAULT_SESSION_CONFIG } from "./types.js";
import { startActiveObservation, propagateAttributes } from "@langfuse/tracing";

import { recordSpend } from "./spend-recorder.js";
import { buildSessionResultSummary } from "./cost-tracker.js";
import type { StuckPattern } from "./stuck-detector.js";
import type { PhaseDeps, PhaseExecution } from "./phases/index.js";
import {
  createDefaultPhaseDeps,
  WorktreePhase,
  QueryPhase,
  VerificationPhase,
  PublishPhase,
  FeedbackPhase,
} from "./phases/index.js";
import type { PipelineOutcome } from "./result-builder.js";
import { buildFinalResult, buildRootSpanAttributes } from "./result-builder.js";

const tracer = trace.getTracer("@mbe/agent-core");

// ── Pipeline phases (stateless singletons) ──────────────────────────

const worktreePhase = new WorktreePhase();
const queryPhase = new QueryPhase();
const verificationPhase = new VerificationPhase();
const publishPhase = new PublishPhase();
const feedbackPhase = new FeedbackPhase();

// ── Pipeline result ─────────────────────────────────────────────────

/**
 * What `runPipeline` hands back to `runSession`. `ok: true` carries the
 * accumulated typed phase outputs for the final-result builder; `ok: false`
 * means the pipeline threw (abort at a phase boundary, or an unexpected
 * phase error) and carries just what error recovery needs — the error plus
 * the worktree/stuck-reason known at throw time.
 */
type PipelineRun =
  | { readonly ok: true; readonly outcome: PipelineOutcome }
  | {
      readonly ok: false;
      readonly error: unknown;
      readonly worktree?: WorktreeInfo;
      readonly stuckReason?: StuckPattern;
    };

function pipelineWorktree(run: PipelineRun | undefined): WorktreeInfo | undefined {
  if (!run) return undefined;
  return run.ok ? run.outcome.worktree : run.worktree;
}

function pipelineStuckReason(run: PipelineRun | undefined): StuckPattern | undefined {
  if (!run) return undefined;
  return run.ok ? run.outcome.stuckReason : run.stuckReason;
}

// ── Public API ──────────────────────────────────────────────────────

export async function runSession(
  config: SessionConfig,
  onEvent?: SessionEventCallback,
  deps: PhaseDeps = createDefaultPhaseDeps(),
  signal?: AbortSignal
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
          let run: PipelineRun | undefined;
          let pendingResult: SessionResult | undefined;

          try {
            run = await runPipeline(effectiveConfig, onEvent, deps, signal);
            if (!run.ok) throw run.error;
            pendingResult = buildFinalResult(effectiveConfig, run.outcome, rootSpan, onEvent);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            emitEvent(onEvent, "session:error", { message: errorMessage });
            rootSpan.recordException(error as Error);
            rootSpan.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });

            // Attempt to push partial work from failed sessions
            const prUrl = await pushPartialWork(
              effectiveConfig,
              pipelineWorktree(run),
              pipelineStuckReason(run),
              deps,
              errorMessage,
              onEvent
            );

            rootSpan.setAttribute("session.status", "failed");
            pendingResult = {
              sessionId: "",
              status: "failed",
              branchName: pipelineWorktree(run)?.branchName ?? "",
              prUrl,
              costUsd: 0,
              tokenUsage: { inputTokens: 0, outputTokens: 0 },
              durationMs: 0,
              numTurns: 0,
              resultText: "",
              errors: [errorMessage],
              stuckPattern: pipelineStuckReason(run)?.type,
            };
          } finally {
            // Clean up worktree when PR was created (branch is pushed).
            // Keep worktree when --no-pr so user can inspect.
            const worktree = pipelineWorktree(run);
            if (worktree && effectiveConfig.createPr) {
              try {
                await deps.worktreeManager.removeWorktree(effectiveConfig.repoPath, worktree.path);
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
                  worktreePath: worktree.path,
                  mode: worktree.mode,
                });
              }
            }
            rootSpan.end();
          }

          const finalResultWithCleanup =
            cleanupErrors.length > 0 ? { ...pendingResult!, cleanupErrors } : pendingResult!;

          // Record spend through the single seam so the token-cost sensors,
          // progress-tracker, and learning-loop have accurate, single-sourced
          // data. This is the ONLY spend write for a claude run — the CLI no
          // longer double-records it.
          try {
            recordSpend(effectiveConfig.repoPath, {
              costUsd: finalResultWithCleanup.costUsd,
              sessionId: finalResultWithCleanup.sessionId || undefined,
              model: effectiveConfig.model,
              adapter: "claude",
              status: finalResultWithCleanup.status,
              inputTokens: finalResultWithCleanup.tokenUsage.inputTokens,
              outputTokens: finalResultWithCleanup.tokenUsage.outputTokens,
              numTurns: finalResultWithCleanup.numTurns,
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
// Each phase receives a typed input composed directly from prior phase
// outputs, held in local consts — ordering is enforced by lexical scope
// (a phase's input simply cannot name an output that does not exist yet).
// A failed phase short-circuits the pipeline (after a best-effort
// partial-work push), returning the outcome accumulated so far.
//
// An aborted `signal` is checked at each boundary between phases (never
// mid-phase — an in-flight phase always runs to its own natural end) and
// throws, so it short-circuits through the same catch in `runSession` as
// any other pipeline error: `session:error` is emitted, a best-effort
// partial-work push is attempted, and the `finally` worktree cleanup still
// runs.

/** Fills the outcome fields an early-exiting pipeline never produced. */
function pipelineOutcome(partial: Partial<PipelineOutcome>): PipelineOutcome {
  return {
    turnMetrics: [],
    toolCallMetrics: [],
    prUrl: null,
    errors: [],
    ...partial,
  };
}

/**
 * Narrows a successful phase's output. A phase that did not fail always
 * carries its typed output (`PhaseExecution` contract), so this turns a
 * contract violation into a loud pipeline error instead of the silent
 * non-null assertions it replaces.
 */
function requireOutput<T>(exec: PhaseExecution<T>, phase: string): T {
  if (exec.output === null) {
    throw new Error(`${phase} phase reported success without an output`);
  }
  return exec.output;
}

async function runPipeline(
  config: SessionConfig,
  onEvent: SessionEventCallback | undefined,
  deps: PhaseDeps,
  signal?: AbortSignal
): Promise<PipelineRun> {
  // Captured for the `ok: false` recovery path only (partial-work push,
  // failure branch name, worktree cleanup). Assigned once, as soon as the
  // producing phase has run — never read by later phases, whose inputs are
  // threaded as consts below.
  let recoveryWorktree: WorktreeInfo | undefined;
  let recoveryStuckReason: StuckPattern | undefined;

  try {
    // WorktreePhase
    const worktreeExec = await worktreePhase.run({ config, onEvent }, deps);
    recoveryWorktree = worktreeExec.output?.worktree;
    const worktreeAbort = await abortOnFailure(
      worktreeExec.result,
      config,
      worktreeExec.output?.worktree,
      undefined,
      deps,
      onEvent
    );
    if (worktreeAbort) {
      return {
        ok: true,
        outcome: pipelineOutcome({
          worktree: worktreeExec.output?.worktree,
          errors: worktreeAbort.errors,
          prUrl: worktreeAbort.prUrl,
        }),
      };
    }
    const { worktree, systemPrompt } = requireOutput(worktreeExec, worktreePhase.name);
    throwIfAborted(signal);

    // QueryPhase
    const queryExec = await queryPhase.run({ config, onEvent, worktree, systemPrompt }, deps);
    recoveryStuckReason = queryExec.output?.stuckReason;
    const queryAbort = await abortOnFailure(
      queryExec.result,
      config,
      worktree,
      queryExec.output?.stuckReason,
      deps,
      onEvent
    );
    if (queryAbort) {
      return {
        ok: true,
        outcome: pipelineOutcome({
          worktree,
          resultMessage: queryExec.output?.resultMessage,
          stuckReason: queryExec.output?.stuckReason,
          turnMetrics: queryExec.output?.turnMetrics ?? [],
          toolCallMetrics: queryExec.output?.toolCallMetrics ?? [],
          contextMetrics: queryExec.output?.contextMetrics,
          errors: queryAbort.errors,
          prUrl: queryAbort.prUrl,
        }),
      };
    }
    const query = requireOutput(queryExec, queryPhase.name);

    // Adapter-neutral summary for VerificationPhase/PublishPhase/FeedbackPhase
    // (#3233) — session-runner is the Claude-adapter boundary that maps the
    // raw SDK result to the shape shared across adapters. `query.resultMessage`
    // stays SDK-shaped for `buildFinalResult`'s full accounting at the end of
    // the pipeline.
    const resultSummary = query.resultMessage
      ? buildSessionResultSummary(query.resultMessage)
      : undefined;

    // ── Budget gate (observe/warn by default; halts only when enforceBudget=true) ─
    const breach = shouldHaltForBudget(query.turnMetrics, config.maxBudgetUsd);
    if (breach.exceeded) {
      emitEvent(onEvent, "session:budget_breach", {
        message: JSON.stringify(breach),
      });
      if (config.enforceBudget) {
        const breachMsg = `Budget breached: accumulated $${breach.accumulatedCostUsd.toFixed(4)} exceeds limit $${breach.maxBudgetUsd}`;
        return {
          ok: true,
          outcome: pipelineOutcome({
            worktree,
            resultMessage: query.resultMessage,
            stuckReason: query.stuckReason,
            turnMetrics: query.turnMetrics,
            toolCallMetrics: query.toolCallMetrics,
            contextMetrics: query.contextMetrics,
            errors: [breachMsg],
            budgetEnforced: true,
          }),
        };
      }
    }
    throwIfAborted(signal);

    // VerificationPhase — always succeeds; its gateway errors flow into the
    // final result via the accumulated `gatewayErrors` (e.g. a draft PR with
    // failing gates).
    const verifyExec = await verificationPhase.run(
      { config, onEvent, worktree, resultMessage: resultSummary, stuckReason: query.stuckReason },
      deps
    );
    const gatewayErrors = verifyExec.result.errors;
    const verifyAbort = await abortOnFailure(
      verifyExec.result,
      config,
      worktree,
      query.stuckReason,
      deps,
      onEvent
    );
    if (verifyAbort) {
      return {
        ok: true,
        outcome: pipelineOutcome({
          worktree,
          resultMessage: query.resultMessage,
          stuckReason: query.stuckReason,
          turnMetrics: query.turnMetrics,
          toolCallMetrics: query.toolCallMetrics,
          contextMetrics: query.contextMetrics,
          gatewayEvaluation: verifyExec.output?.gatewayEvaluation,
          errors: [...gatewayErrors, ...verifyAbort.errors],
          prUrl: verifyAbort.prUrl,
        }),
      };
    }
    const verification = requireOutput(verifyExec, verificationPhase.name);
    throwIfAborted(signal);

    // PublishPhase
    const publishExec = await publishPhase.run(
      {
        config,
        onEvent,
        worktree,
        hasChanges: verification.hasChanges,
        resultMessage: resultSummary,
        stuckReason: query.stuckReason,
        gatewayVerdict: verification.gatewayVerdict,
        errors: gatewayErrors,
      },
      deps
    );
    const publishAbort = await abortOnFailure(
      publishExec.result,
      config,
      worktree,
      query.stuckReason,
      deps,
      onEvent
    );
    if (publishAbort) {
      return {
        ok: true,
        outcome: pipelineOutcome({
          worktree,
          resultMessage: query.resultMessage,
          stuckReason: query.stuckReason,
          turnMetrics: query.turnMetrics,
          toolCallMetrics: query.toolCallMetrics,
          contextMetrics: query.contextMetrics,
          gatewayEvaluation: verification.gatewayEvaluation,
          errors: [...gatewayErrors, ...publishAbort.errors],
          prUrl: publishAbort.prUrl || (publishExec.output?.prUrl ?? null),
        }),
      };
    }
    // PublishPhase is skipped (null output) when --no-pr or no changes.
    const prUrl = publishExec.output?.prUrl ?? null;
    const prNumber = publishExec.output?.prNumber;
    throwIfAborted(signal);

    // FeedbackPhase
    const feedbackExec = await feedbackPhase.run(
      { config, onEvent, worktree, resultMessage: resultSummary, prUrl, prNumber, signal },
      deps
    );
    const feedbackAbort = await abortOnFailure(
      feedbackExec.result,
      config,
      worktree,
      query.stuckReason,
      deps,
      onEvent
    );

    return {
      ok: true,
      outcome: {
        worktree,
        resultMessage: query.resultMessage,
        stuckReason: query.stuckReason,
        turnMetrics: query.turnMetrics,
        toolCallMetrics: query.toolCallMetrics,
        contextMetrics: query.contextMetrics,
        gatewayEvaluation: verification.gatewayEvaluation,
        prUrl: feedbackAbort?.prUrl || prUrl,
        errors: feedbackAbort ? [...gatewayErrors, ...feedbackAbort.errors] : gatewayErrors,
      },
    };
  } catch (error) {
    return { ok: false, error, worktree: recoveryWorktree, stuckReason: recoveryStuckReason };
  }
}

/** Throws when `signal` has fired, so a phase boundary check short-circuits
 * the pipeline via the same catch/finally used for every other pipeline
 * error. */
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new Error("Session aborted");
  }
}

/**
 * On phase failure: push partial work (when a worktree exists and PRs are
 * enabled) and hand back what the abort outcome needs — the phase's errors
 * plus any draft-PR URL the push produced. Returns `null` for non-failing
 * phases, signalling the pipeline to continue.
 *
 * VerificationPhase always succeeds and its gateway errors are threaded
 * separately as `gatewayErrors`, so this never double-counts.
 */
async function abortOnFailure(
  result: { status: string; errors: readonly string[] },
  config: SessionConfig,
  worktree: WorktreeInfo | undefined,
  stuckReason: StuckPattern | undefined,
  deps: PhaseDeps,
  onEvent: SessionEventCallback | undefined
): Promise<{ readonly errors: readonly string[]; readonly prUrl: string | null } | null> {
  if (result.status !== "failed") return null;

  const errorMsg = result.errors[0] ?? "Phase failed";
  const prUrl =
    worktree && config.createPr
      ? await pushPartialWork(config, worktree, stuckReason, deps, errorMsg, onEvent)
      : null;

  return { errors: result.errors, prUrl };
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

// ── Error recovery ──────────────────────────────────────────────────

async function pushPartialWork(
  config: SessionConfig,
  worktree: WorktreeInfo | undefined,
  stuckReason: StuckPattern | undefined,
  deps: PhaseDeps,
  errorMessage: string,
  onEvent: SessionEventCallback | undefined
): Promise<string | null> {
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
