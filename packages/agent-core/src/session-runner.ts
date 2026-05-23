import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import type { SessionConfig, SessionResult, SessionEventCallback, WorktreeInfo } from "./types.js";
import { DEFAULT_HEARTBEAT_CONFIG } from "./types.js";
import { buildSystemPrompt, loadSourceFiles, loadProjectContext } from "./prompt-builder.js";
import { createToolPermissionHandler } from "./tool-permissions.js";
import { buildSessionResult } from "./cost-tracker.js";
import { createStuckDetector } from "./stuck-detector.js";
import type { StuckPattern } from "./stuck-detector.js";
import {
  createWorktree,
  commitChanges,
  pushBranch,
  hasChanges,
  removeWorktree,
} from "./worktree-manager.js";
import { createPullRequest, buildPrTitle, buildPrBody, buildFailurePrBody } from "./pr-creator.js";
import { mergeDirectly } from "./dep-bump-merger.js";
import { getGitDiff } from "./success-evaluator.js";
import type { EvaluationResult } from "./success-evaluator.js";
import { mapSdkMessage } from "./event-mapper.js";
import type { TurnMetricsEvent } from "./event-mapper.js";
import { sanitizeStreamChunk } from "./sanitize-output.js";
import {
  recordFailure,
  queryPastFailures,
  buildFailureContext,
  loadMemory,
} from "./failure-memory.js";
import { runFeedbackLoop } from "./feedback-loop.js";
import { getFeedbackLoopModel } from "./model-router.js";
import { withRetry, ContextWindowExhaustedError } from "./retry.js";
import { CircuitBreaker, CircuitState } from "./circuit-breaker.js";
import {
  categorizeFailure,
  buildTurnMetricsList,
  buildToolCallMetricsList,
} from "./observability.js";
import {
  startActiveObservation,
  startObservation,
  propagateAttributes,
  updateActiveObservation,
} from "@langfuse/tracing";

// New modularized sub-phases
import { emitEvent, sanitizeForCommitMessage } from "./utils.js";
import { runPostCommitGateway } from "./post-commit-gateway.js";

// QA tuning — adaptive thresholds from .github/auto-qa-tuning.json
import { loadQaTuning, applyTuningDefaults } from "./qa-tuning-loader.js";
import { DEFAULT_SESSION_CONFIG } from "./types.js";

// OTel API is a noop when no SDK is registered (e.g., in tests or local CLI).
const tracer = trace.getTracer("@mbe/agent-core");

/** Maximum compaction events before treating the session as exhausted. */
const MAX_COMPACTIONS = 5;

/** Circuit breaker default configuration. */
const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_TIMEOUT_MS = 60_000;

/**
 * Module-level circuit breaker protecting Anthropic API calls.
 * Persists across `runSession` invocations so repeated failures
 * trip the breaker and prevent hammering a degraded API.
 */
const apiCircuitBreaker = new CircuitBreaker({
  failureThreshold: CIRCUIT_BREAKER_FAILURE_THRESHOLD,
  resetTimeoutMs: CIRCUIT_BREAKER_RESET_TIMEOUT_MS,
});

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
          // Apply QA tuning defaults from .github/auto-qa-tuning.json.
          // Explicit config (e.g. CLI --max-budget) wins over tuning values.
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

          {
            // Fail fast if the circuit breaker is open (API is degraded)
            if (apiCircuitBreaker.getState() === CircuitState.Open) {
              const circuitMsg =
                "Circuit breaker is OPEN — Anthropic API appears degraded. Skipping session.";
              emitEvent(onEvent, "session:error", { message: circuitMsg });
              rootSpan.setAttribute("session.status", "failed");
              rootSpan.setAttribute("session.circuit_breaker", "open");
              rootSpan.end();
              return {
                sessionId: "",
                status: "failed",
                branchName: "",
                prUrl: null,
                costUsd: 0,
                tokenUsage: { inputTokens: 0, outputTokens: 0 },
                durationMs: 0,
                numTurns: 0,
                resultText: "",
                errors: [circuitMsg],
              };
            }

            const abortController = new AbortController();
            let worktree: WorktreeInfo | undefined;
            let stuckReason: StuckPattern | null = null;
            const cleanupErrors: string[] = [];
            let pendingResult: SessionResult | undefined;

            // Cached git diff — computed once, reused across evaluation, static analysis,
            // security review, dep-bump check, and PR body generation.
            let cachedDiff: string | null = null;

            async function getCachedDiff(worktreePath: string): Promise<string> {
              if (cachedDiff === null) {
                cachedDiff = await getGitDiff(worktreePath);
              }
              return cachedDiff;
            }

            try {
              // 1. Create isolated worktree (with retry for transient git failures)
              emitEvent(onEvent, "session:start", { message: "Creating worktree..." });

              const wtSpan = tracer.startSpan("agent_core.create_worktree");
              try {
                const { value: wt } = await withRetry(
                  () => createWorktree(config.repoPath, config.baseBranch, config.taskDescription),
                  { maxRetries: 2 }
                );
                worktree = wt;
                wtSpan.setAttribute("worktree.branch", worktree.branchName);
                wtSpan.setAttribute("worktree.mode", worktree.mode);
              } finally {
                wtSpan.end();
              }

              // 2. Build system prompt with failure context, source files, and PR examples
              const failureMemory = await loadMemory(config.repoPath);
              const pastFailures = queryPastFailures(failureMemory, config.taskDescription);
              const failureContext = buildFailureContext(pastFailures);

              // Auto-resolve source files from task description if none provided
              const resolvedSourcePaths =
                config.sourceFiles ??
                (async () => {
                  const { resolveSourceFiles } = await import("./source-resolver.js");
                  return resolveSourceFiles(config.taskDescription);
                })();

              // Wait for resolved source paths if it was an async resolution
              const finalSourcePaths = await resolvedSourcePaths;

              const sourceFileEntries =
                finalSourcePaths.length > 0 ? await loadSourceFiles(finalSourcePaths) : undefined;

              // Fetch recent successful PRs as examples (non-blocking)
              const { fetchRecentPrExamples, formatPrExamples } =
                await import("./budget-calculator.js");
              const prExamples = await fetchRecentPrExamples(config.repoPath).catch(() => []);
              const prExamplesSection = formatPrExamples(prExamples);

              // Load project CLAUDE.md for coding conventions (non-blocking)
              const projectContext = await loadProjectContext(worktree.path).catch(() => null);
              const projectSection = projectContext
                ? `\n\n## Project Conventions (from CLAUDE.md)\n\n${projectContext}`
                : "";

              const systemPrompt =
                (await buildSystemPrompt(config.taskDescription, {
                  sourceFileEntries,
                  prExamplesSection,
                  failureContext,
                })) + projectSection;

              // 3. Run the agent via SDK query()
              emitEvent(onEvent, "session:start", {
                message: `Starting agent on branch ${worktree.branchName}`,
              });

              const canUseTool = createToolPermissionHandler(worktree.path);

              const detector = createStuckDetector(effectiveConfig.stuckDetectorConfig);
              const conversation = query({
                prompt: effectiveConfig.taskDescription,
                options: {
                  abortController,
                  cwd: worktree.path,
                  model: effectiveConfig.model,
                  maxTurns: effectiveConfig.maxTurns,
                  maxBudgetUsd: effectiveConfig.maxBudgetUsd,
                  allowedTools: [...effectiveConfig.allowedTools],
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

              // 4. Stream events with stuck detection, context exhaustion tracking,
              //    and event mapping
              const querySpan = tracer.startSpan("agent_core.sdk_query", {
                attributes: { "sdk.model": config.model },
              });

              let compactionCount = 0;

              // Per-turn and tool-call metrics accumulators
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

              // Track pending tool calls by toolUseId → { name, startMs }
              const pendingToolCalls = new Map<string, { toolName: string; startMs: number }>();

              // Heartbeat: periodic liveness signal + inactivity timeout
              const heartbeat = DEFAULT_HEARTBEAT_CONFIG;
              const startTime = Date.now();
              let lastActivityMs = Date.now();
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

              // Wrap the SDK streaming loop with the circuit breaker so that
              // repeated API failures trip the breaker and subsequent sessions
              // fail fast instead of hammering a degraded API.
              interface StreamingResult {
                readonly resultMessage: SDKResultMessage | null;
                readonly stuckDetected: StuckPattern | null;
              }

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

                      // Increment turn counter for assistant messages
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

                      // Emit typed events for observability (pass current turn index)
                      for (const mapped of mapSdkMessage(message, turnIndex)) {
                        emitEvent(onEvent, mapped.type, {
                          message: sanitizeStreamChunk(JSON.stringify(mapped)),
                        });

                        // Accumulate per-turn metrics
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

                        // Record tool call start time for latency tracking
                        if (mapped.type === "session:tool_use") {
                          pendingToolCalls.set(mapped.toolUseId, {
                            toolName: mapped.toolName,
                            startMs: Date.now(),
                          });
                        }

                        // Record tool call completion and compute latency
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

                      // Track compaction events for context window exhaustion detection
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
                        // Warnings are emitted but don't abort the session
                        emitEvent(onEvent, "session:stuck", {
                          message: `Stuck warning: ${stuckPattern.description}`,
                        });
                      }
                    }

                    querySpan.setAttribute("sdk.turns_completed", innerResult?.num_turns ?? 0);
                    querySpan.setAttribute("sdk.compaction_count", compactionCount);
                  } catch (err) {
                    // Detect context window exhaustion from SDK errors
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
                // Handle circuit breaker OPEN — graceful exit instead of crash
                const errMsg = err instanceof Error ? err.message : String(err);
                if (errMsg.includes("Circuit breaker is OPEN")) {
                  circuitBreakerTripped = true;
                  emitEvent(onEvent, "session:error", {
                    message: `Circuit breaker tripped: ${errMsg}`,
                  });
                  querySpan.setAttribute("session.circuit_breaker", "tripped");
                } else {
                  // Re-throw non-circuit-breaker errors for the outer handler
                  throw err;
                }
              } finally {
                clearInterval(heartbeatInterval);
                querySpan.end();
              }

              // Unpack streaming results for downstream consumption
              const resultMessage = streamResult.resultMessage;
              stuckReason = streamResult.stuckDetected;

              // If the circuit breaker tripped mid-session, treat as a failed session
              if (circuitBreakerTripped) {
                const circuitMsg = "Circuit breaker tripped — too many consecutive API failures";
                emitEvent(onEvent, "session:error", { message: circuitMsg });
                rootSpan.setAttribute("session.status", "failed");
                rootSpan.setAttribute("session.circuit_breaker", "tripped");
                rootSpan.end();
                return {
                  sessionId: "",
                  status: "failed",
                  branchName: worktree?.branchName ?? "",
                  prUrl: null,
                  costUsd: 0,
                  tokenUsage: { inputTokens: 0, outputTokens: 0 },
                  durationMs: 0,
                  numTurns: 0,
                  resultText: "",
                  errors: [circuitMsg],
                };
              }

              // 5. Determine success/failure
              const isSuccess = resultMessage?.subtype === "success" && !stuckReason;
              const errors: string[] = [];

              if (stuckReason) {
                errors.push(`Stuck: ${stuckReason.description}`);
              }
              if (!resultMessage) {
                errors.push("No result message received from agent");
              }

              // 6. Commit, push, and create PR if there are changes
              let prUrl: string | null = null;
              const changed = worktree ? await hasChanges(worktree.path) : false;

              let gatewayEvaluation: EvaluationResult | undefined;

              if (changed && worktree) {
                // Capture narrowed worktree for use in closures (TS loses narrowing in callbacks)
                const wt = worktree;
                const prefix = isSuccess ? "feat" : "wip";
                const commitMsg = `${prefix}: ${sanitizeForCommitMessage(config.taskDescription)}`;
                await commitChanges(wt.path, commitMsg);

                // Push with retry for transient network failures
                await withRetry(() => pushBranch(wt.path, wt.branchName), { maxRetries: 3 });

                // 6a–6d. Run post-commit gateway (verification + quality gates)
                let verdict;
                if (isSuccess) {
                  const diff = await getCachedDiff(wt.path);
                  verdict = await runPostCommitGateway(
                    {
                      worktreePath: wt.path,
                      diff,
                      commitMsg,
                      taskDescription: config.taskDescription,
                      config: {
                        evaluateSuccess: config.evaluateSuccess,
                        runSecurityReview: true,
                        runStaticAnalysis: true,
                      },
                    },
                    onEvent
                  );
                  errors.push(...verdict.errors);
                  gatewayEvaluation = verdict.evaluation;
                }

                if (config.createPr) {
                  if (verdict?.outcome === "merge-direct") {
                    // Fast-path: trivial dep bump — direct-merge
                    const commitTitle = buildPrTitle(config.taskDescription);
                    prUrl = await mergeDirectly({
                      branchName: wt.branchName,
                      baseBranch: config.baseBranch,
                      repoPath: wt.path,
                      commitTitle,
                    });
                    emitEvent(onEvent, "session:result", {
                      message: `Trivial dep bump — direct-merged: ${prUrl}`,
                    });
                  } else if (!verdict || verdict.outcome === "create-pr") {
                    // All gates passed — create normal PR
                    const title = buildPrTitle(config.taskDescription);
                    const body = resultMessage
                      ? buildPrBody(
                          config.taskDescription,
                          resultMessage.session_id,
                          resultMessage.total_cost_usd,
                          resultMessage.num_turns
                        )
                      : buildFailurePrBody(config.taskDescription, errors, stuckReason?.type);

                    const prSpan = tracer.startSpan("agent_core.create_pr");
                    let pr;
                    try {
                      // Retry PR creation for transient GitHub API failures
                      const { value: prResult } = await withRetry(
                        () =>
                          createPullRequest({
                            title,
                            body,
                            baseBranch: config.baseBranch,
                            branchName: wt.branchName,
                            repoPath: wt.path,
                            draft: false,
                          }),
                        { maxRetries: 3 }
                      );
                      pr = prResult;
                      prSpan.setAttribute("pr.url", pr.url);
                      prSpan.setAttribute("pr.number", pr.number);
                      prSpan.setAttribute("pr.draft", false);
                    } finally {
                      prSpan.end();
                    }

                    prUrl = pr.url;
                    emitEvent(onEvent, "session:result", {
                      message: `PR created: ${pr.url}`,
                    });

                    // Run feedback loop if enabled (poll for review comments / CI failures)
                    if (config.feedbackLoop?.enabled) {
                      // Use remaining budget instead of fixed 50% ratio
                      const sessionCost = resultMessage?.total_cost_usd ?? 0;
                      const remainingBudget = Math.max(
                        0,
                        effectiveConfig.maxBudgetUsd - sessionCost
                      );

                      const fbSpan = tracer.startSpan("agent_core.feedback_loop");
                      let feedbackResult;
                      try {
                        feedbackResult = await runFeedbackLoop(
                          {
                            prNumber: pr.number,
                            branchName: wt.branchName,
                            repoPath: wt.path,
                            model: getFeedbackLoopModel(config.model),
                            maxRetries: config.feedbackLoop.maxRetries ?? 2,
                            pollIntervalMs: config.feedbackLoop.pollIntervalMs ?? 30_000,
                            pollTimeoutMs: config.feedbackLoop.pollTimeoutMs ?? 300_000,
                            maxBudgetUsd: remainingBudget,
                            allowedTools: config.allowedTools,
                          },
                          onEvent
                        );
                        fbSpan.setAttribute("feedback.retries_used", feedbackResult.retriesUsed);
                        fbSpan.setAttribute("feedback.resolved", feedbackResult.resolved);
                      } finally {
                        fbSpan.end();
                      }

                      emitEvent(onEvent, "session:result", {
                        message: `Feedback loop: ${feedbackResult.resolved ? "resolved" : "escalated"} after ${feedbackResult.retriesUsed} retries`,
                      });
                    }
                  } else {
                    // verdict.outcome === "create-draft-pr" — quality gates failed
                    const title = `wip: ${config.taskDescription.slice(0, 57)}`;
                    const body = buildFailurePrBody(
                      config.taskDescription,
                      errors,
                      stuckReason?.type
                    );

                    // Retry draft PR creation for transient failures
                    const { value: pr } = await withRetry(
                      () =>
                        createPullRequest({
                          title,
                          body,
                          baseBranch: config.baseBranch,
                          branchName: wt.branchName,
                          repoPath: wt.path,
                          draft: true,
                        }),
                      { maxRetries: 3 }
                    );

                    prUrl = pr.url;
                    emitEvent(onEvent, "session:result", {
                      message: `Draft PR created (failed gates: ${verdict.gateFailures.join(", ")}): ${pr.url}`,
                    });
                  }
                }
              } else {
                emitEvent(onEvent, "session:result", {
                  message: "No changes were made by the agent",
                });
              }

              // 7. Build final result
              const evalSummary = gatewayEvaluation
                ? {
                    passed: gatewayEvaluation.passed,
                    confidence: gatewayEvaluation.confidence,
                    reasoning: gatewayEvaluation.reasoning,
                  }
                : undefined;

              const collectedTurnMetrics = buildTurnMetricsList(rawTurnMetrics);
              const collectedToolCallMetrics = buildToolCallMetricsList(rawToolCallMetrics);

              if (resultMessage) {
                const sessionResult = buildSessionResult(
                  resultMessage,
                  worktree?.branchName ?? "",
                  prUrl
                );

                const isFailed = sessionResult.status === "failed" || !!stuckReason;

                const failureCategory = isFailed
                  ? categorizeFailure(errors, stuckReason?.type)
                  : undefined;

                const finalResult = {
                  ...sessionResult,
                  ...(stuckReason
                    ? { status: "failed" as const, stuckPattern: stuckReason.type }
                    : {}),
                  ...(evalSummary ? { evaluation: evalSummary } : {}),
                  ...(failureCategory ? { failureCategory } : {}),
                  turnMetrics: collectedTurnMetrics,
                  toolCallMetrics: collectedToolCallMetrics,
                };

                // Record failure for future context
                if (finalResult.status === "failed") {
                  await recordFailure(config.repoPath, {
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
                if (failureCategory)
                  rootSpan.setAttribute("session.failure_category", failureCategory);
                rootSpan.setAttribute("session.turn_count", collectedTurnMetrics.length);
                rootSpan.setAttribute("session.tool_call_count", collectedToolCallMetrics.length);

                emitEvent(onEvent, "session:result", {
                  message: `Session completed: ${finalResult.status}`,
                });

                // Attach session metrics to the Langfuse trace as metadata
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
                  },
                });

                pendingResult = finalResult;
              } else {
                const failureCategoryNoResult = categorizeFailure(errors, stuckReason?.type);

                rootSpan.setAttribute("session.status", "failed");
                pendingResult = {
                  sessionId: "",
                  status: "failed",
                  branchName: worktree?.branchName ?? "",
                  prUrl,
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
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              emitEvent(onEvent, "session:error", { message: errorMessage });
              rootSpan.recordException(error as Error);
              rootSpan.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });

              // Attempt to push partial work from failed sessions
              let prUrl: string | null = null;
              if (worktree && config.createPr) {
                const failedWt = worktree;
                try {
                  const changed = await hasChanges(failedWt.path);
                  if (changed) {
                    const commitMsg = `wip: ${sanitizeForCommitMessage(config.taskDescription)}`;
                    await commitChanges(failedWt.path, commitMsg);
                    await withRetry(() => pushBranch(failedWt.path, failedWt.branchName), {
                      maxRetries: 2,
                    });

                    const { value: pr } = await withRetry(
                      () =>
                        createPullRequest({
                          title: `wip: ${config.taskDescription.slice(0, 57)}`,
                          body: buildFailurePrBody(
                            config.taskDescription,
                            [errorMessage],
                            stuckReason?.type
                          ),
                          baseBranch: config.baseBranch,
                          branchName: failedWt.branchName,
                          repoPath: failedWt.path,
                          draft: true,
                        }),
                      { maxRetries: 2 }
                    );
                    prUrl = pr.url;
                    emitEvent(onEvent, "session:result", {
                      message: `Draft PR created from failed session: ${pr.url}`,
                    });
                  }
                } catch {
                  // Best-effort — don't mask the original error
                }
              }

              rootSpan.setAttribute("session.status", "failed");
              pendingResult = {
                sessionId: "",
                status: "failed",
                branchName: worktree?.branchName ?? "",
                prUrl,
                costUsd: 0,
                tokenUsage: { inputTokens: 0, outputTokens: 0 },
                durationMs: 0,
                numTurns: 0,
                resultText: "",
                errors: [errorMessage],
                stuckPattern: stuckReason?.type,
              };
            } finally {
              // Clean up worktree when PR was created (branch is pushed, worktree not needed)
              // Keep worktree when --no-pr so user can inspect the agent's work
              if (worktree && config.createPr) {
                try {
                  await removeWorktree(config.repoPath, worktree.path);
                } catch (cleanupErr) {
                  const cleanupMsg =
                    cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
                  cleanupErrors.push(cleanupMsg);
                  console.warn(`Worktree cleanup failed: ${cleanupMsg}`);
                  emitEvent(onEvent, "session:cleanup_warning", {
                    message: `Worktree cleanup failed: ${cleanupMsg}`,
                  });
                }
              }
              rootSpan.end();
            }

            // Attach any cleanup errors to the final result (immutable spread)
            return cleanupErrors.length > 0 ? { ...pendingResult!, cleanupErrors } : pendingResult!;
          }
        }
      );
    }
  );
}
