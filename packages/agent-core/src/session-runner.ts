import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import type {
  SessionConfig,
  SessionResult,
  SessionEvent,
  SessionEventCallback,
  WorktreeInfo,
} from "./types.js";
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
  runVerification,
} from "./worktree-manager.js";
import {
  createPullRequest,
  buildPrTitle,
  buildPrBody,
  buildFailurePrBody,
} from "./pr-creator.js";
import { isTrivialDepBump, mergeDirectly } from "./dep-bump-merger.js";
import { evaluateSuccess, getGitDiff, shouldEvaluate } from "./success-evaluator.js";
import type { EvaluationResult } from "./success-evaluator.js";
import { reviewDiff } from "./diff-reviewer.js";
import type { ReviewResult } from "./diff-reviewer.js";
import {
  resolveSourceFiles,
  fetchRecentPrExamples,
  formatPrExamples,
} from "./task-intelligence.js";
import { analyzeDiff } from "./diff-static-analyzer.js";
import { mapSdkMessage } from "./event-mapper.js";
import {
  recordFailure,
  queryPastFailures,
  buildFailureContext,
  loadMemory,
} from "./failure-memory.js";
import { runFeedbackLoop } from "./feedback-loop.js";

// OTel API is a noop when no SDK is registered (e.g., in tests or local CLI).
const tracer = trace.getTracer("@mbe/agent-core");

function emitEvent(
  onEvent: SessionEventCallback | undefined,
  type: SessionEvent["type"],
  data: SessionEvent["data"]
): void {
  if (!onEvent) return;
  onEvent({
    type,
    timestamp: new Date().toISOString(),
    data,
  });
}

function sanitizeForCommitMessage(text: string): string {
  return text.replace(/[\n\r]/g, " ").slice(0, 72);
}

export async function runSession(
  config: SessionConfig,
  onEvent?: SessionEventCallback
): Promise<SessionResult> {
  const rootSpan = tracer.startSpan("agent_core.run_session", {
    attributes: {
      "session.task": config.taskDescription.slice(0, 200),
      "session.model": config.model,
      "session.max_turns": config.maxTurns,
      "session.max_budget_usd": config.maxBudgetUsd,
      "session.base_branch": config.baseBranch,
    },
  });

  {
      const abortController = new AbortController();
      let worktree: WorktreeInfo | undefined;
      let stuckReason: StuckPattern | null = null;

      try {
        // 1. Create isolated worktree
        emitEvent(onEvent, "session:start", { message: "Creating worktree..." });

        const wtSpan = tracer.startSpan("agent_core.create_worktree");
        try {
          worktree = await createWorktree(
            config.repoPath,
            config.baseBranch,
            config.taskDescription
          );
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
        const resolvedSourcePaths = config.sourceFiles ?? resolveSourceFiles(config.taskDescription);
        const sourceFileEntries = resolvedSourcePaths.length > 0
          ? await loadSourceFiles(resolvedSourcePaths)
          : undefined;

        // Fetch recent successful PRs as examples (non-blocking)
        const prExamples = await fetchRecentPrExamples(config.repoPath).catch(() => []);
        const prExamplesSection = formatPrExamples(prExamples);

        // Load project CLAUDE.md for coding conventions (non-blocking)
        const projectContext = await loadProjectContext(worktree.path).catch(() => null);
        const projectSection = projectContext
          ? `\n\n## Project Conventions (from CLAUDE.md)\n\n${projectContext}`
          : "";

        const systemPrompt =
          buildSystemPrompt(config.taskDescription, sourceFileEntries, prExamplesSection) + projectSection + failureContext;

        // 3. Run the agent via SDK query()
        emitEvent(onEvent, "session:start", {
          message: `Starting agent on branch ${worktree.branchName}`,
        });

        const canUseTool = createToolPermissionHandler(worktree.path);

        let resultMessage: SDKResultMessage | null = null;

        const detector = createStuckDetector(config.stuckDetectorConfig);
        const conversation = query({
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

        // 4. Stream events with stuck detection and event mapping
        const querySpan = tracer.startSpan("agent_core.sdk_query", {
          attributes: { "sdk.model": config.model },
        });

        try {
          for await (const message of conversation) {
            emitEvent(onEvent, "session:message", message);

            // Emit typed events for observability
            for (const mapped of mapSdkMessage(message)) {
              emitEvent(onEvent, mapped.type, { message: JSON.stringify(mapped) });
            }

            if (message.type === "result") {
              resultMessage = message as SDKResultMessage;
              continue;
            }

            const stuckPattern = detector.ingest(message);
            if (stuckPattern) {
              if (stuckPattern.severity === "error") {
                stuckReason = stuckPattern;
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

          querySpan.setAttribute("sdk.turns_completed", resultMessage?.num_turns ?? 0);
        } catch (err) {
          querySpan.recordException(err as Error);
          querySpan.setStatus({ code: SpanStatusCode.ERROR });
          throw err;
        } finally {
          querySpan.end();
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

        let evaluation: EvaluationResult | undefined;

        if (changed && worktree) {
          const prefix = isSuccess ? "feat" : "wip";
          const commitMsg = `${prefix}: ${sanitizeForCommitMessage(config.taskDescription)}`;
          await commitChanges(worktree.path, commitMsg);

          // 6a. Run lint + typecheck + test verification before pushing
          let verificationPassed = true;
          if (isSuccess) {
            const verifySpan = tracer.startSpan("agent_core.verify_changes");
            try {
              const verification = await runVerification(worktree.path);
              verificationPassed = verification.passed;
              verifySpan.setAttribute("verify.passed", verification.passed);
              verifySpan.setAttribute("verify.lint", verification.lintOk);
              verifySpan.setAttribute("verify.typecheck", verification.typecheckOk);
              verifySpan.setAttribute("verify.tests", verification.testsOk);

              emitEvent(onEvent, "session:verification", {
                message: verification.passed
                  ? "Verification passed (lint + typecheck + tests)"
                  : `Verification failed — lint: ${verification.lintOk ? "OK" : "FAIL"}, typecheck: ${verification.typecheckOk ? "OK" : "FAIL"}, tests: ${verification.testsOk ? "OK" : "FAIL"}`,
              });

              if (!verification.passed) {
                const parts: string[] = [];
                if (!verification.lintOk) parts.push(`lint: ${verification.lintOutput}`);
                if (!verification.typecheckOk) parts.push(`typecheck: ${verification.typecheckOutput}`);
                if (!verification.testsOk) parts.push(`tests: ${verification.testOutput}`);
                errors.push(`Verification failed: ${parts.join("; ")}`);
              }
            } finally {
              verifySpan.end();
            }
          }

          await pushBranch(worktree.path, worktree.branchName);

          // 6b. Run LLM success evaluation on successful sessions
          let evaluationPassed = isSuccess;
          if (isSuccess && config.evaluateSuccess !== false) {
            const diff = await getGitDiff(worktree.path);
            if (!shouldEvaluate(diff, { commitTitle: commitMsg })) {
              emitEvent(onEvent, "session:evaluation", {
                message: "Evaluation skipped — trivial diff",
              });
            } else {
              const evalSpan = tracer.startSpan("agent_core.evaluate_success");
              try {
                evaluation = await evaluateSuccess(config.taskDescription, diff);
                evalSpan.setAttribute("evaluation.passed", evaluation.passed);
                evalSpan.setAttribute("evaluation.confidence", evaluation.confidence);
              } finally {
                evalSpan.end();
              }
              evaluationPassed = evaluation.passed;

              emitEvent(onEvent, "session:evaluation", {
                message: `Evaluation: ${evaluation.passed ? "PASS" : "FAIL"} (confidence: ${evaluation.confidence.toFixed(2)})`,
              });

              if (!evaluation.passed) {
                errors.push(`Evaluation failed: ${evaluation.reasoning}`);
              }
            }
          }

          // 6c. Run fast static analysis on the diff (milliseconds, no AI)
          let staticAnalysisClean = true;
          if (isSuccess && verificationPassed) {
            const diff = await getGitDiff(worktree.path);
            const staticResult = analyzeDiff(diff);
            staticAnalysisClean = staticResult.clean;

            const errorViolations = staticResult.violations.filter((v) => v.severity === "error");
            if (errorViolations.length > 0) {
              const formatted = errorViolations.map(
                (v) => `${v.file}:${v.line} [${v.rule}] ${v.message}`
              ).join("; ");
              errors.push(`Static analysis errors: ${formatted}`);
              emitEvent(onEvent, "session:verification", {
                message: `Static analysis: ${errorViolations.length} error(s) — ${formatted}`,
              });
            } else if (!staticResult.clean) {
              emitEvent(onEvent, "session:verification", {
                message: `Static analysis: ${staticResult.violations.length} warning(s) (non-blocking)`,
              });
            }
          }

          // 6d. Run AI security review on the diff
          let securityReview: ReviewResult | undefined;
          if (isSuccess && verificationPassed && staticAnalysisClean) {
            const reviewSpan = tracer.startSpan("agent_core.security_review");
            try {
              const diff = await getGitDiff(worktree.path);
              securityReview = await reviewDiff(diff);
              reviewSpan.setAttribute("review.approved", securityReview.approved);
              reviewSpan.setAttribute("review.issues_count", securityReview.issues.length);

              emitEvent(onEvent, "session:review", {
                message: securityReview.approved
                  ? "Security review: APPROVED"
                  : `Security review: BLOCKED — ${securityReview.issues.join("; ")}`,
              });

              if (!securityReview.approved) {
                errors.push(`Security review failed: ${securityReview.issues.join("; ")}`);
              }
            } finally {
              reviewSpan.end();
            }
          }

          const allGatesPass = evaluationPassed && verificationPassed && staticAnalysisClean && (securityReview?.approved !== false);

          if (config.createPr) {
            // Fast-path: trivial dependency bumps that passed tests are merged
            // directly without waiting for PR review.
            if (allGatesPass) {
              const depBumpCheck = isTrivialDepBump(await getGitDiff(worktree.path));
              if (depBumpCheck.isTrivial) {
                const commitTitle = buildPrTitle(config.taskDescription);
                prUrl = await mergeDirectly({
                  branchName: worktree.branchName,
                  baseBranch: config.baseBranch,
                  repoPath: worktree.path,
                  commitTitle,
                });
                emitEvent(onEvent, "session:result", {
                  message: `Trivial dep bump — direct-merged: ${prUrl}`,
                });
              } else {
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
                  pr = await createPullRequest({
                    title,
                    body,
                    baseBranch: config.baseBranch,
                    branchName: worktree.branchName,
                    repoPath: worktree.path,
                    draft: false,
                  });
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
                  const fbSpan = tracer.startSpan("agent_core.feedback_loop");
                  let feedbackResult;
                  try {
                    feedbackResult = await runFeedbackLoop(
                      {
                        prNumber: pr.number,
                        branchName: worktree.branchName,
                        repoPath: worktree.path,
                        model: config.model,
                        maxRetries: config.feedbackLoop.maxRetries ?? 2,
                        pollIntervalMs: config.feedbackLoop.pollIntervalMs ?? 30_000,
                        pollTimeoutMs: config.feedbackLoop.pollTimeoutMs ?? 300_000,
                        maxBudgetUsd: config.maxBudgetUsd * 0.5,
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
              }
            } else {
              // Quality gates failed — create draft PR so humans can review
              const gateFailures: string[] = [];
              if (!verificationPassed) gateFailures.push("verification");
              if (!staticAnalysisClean) gateFailures.push("static-analysis");
              if (!evaluationPassed) gateFailures.push("evaluation");
              if (securityReview?.approved === false) gateFailures.push("security-review");

              const title = `wip: ${config.taskDescription.slice(0, 57)}`;
              const body = buildFailurePrBody(
                config.taskDescription,
                errors,
                stuckReason?.type
              );

              const pr = await createPullRequest({
                title,
                body,
                baseBranch: config.baseBranch,
                branchName: worktree.branchName,
                repoPath: worktree.path,
                draft: true,
              });

              prUrl = pr.url;
              emitEvent(onEvent, "session:result", {
                message: `Draft PR created (failed gates: ${gateFailures.join(", ")}): ${pr.url}`,
              });
            }
          }
        } else {
          emitEvent(onEvent, "session:result", {
            message: "No changes were made by the agent",
          });
        }

        // 7. Build final result
        const evalSummary = evaluation
          ? { passed: evaluation.passed, confidence: evaluation.confidence, reasoning: evaluation.reasoning }
          : undefined;

        if (resultMessage) {
          const sessionResult = buildSessionResult(
            resultMessage,
            worktree?.branchName ?? "",
            prUrl
          );

          const finalResult = {
            ...sessionResult,
            ...(stuckReason ? { status: "failed" as const, stuckPattern: stuckReason.type } : {}),
            ...(evalSummary ? { evaluation: evalSummary } : {}),
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
          if (finalResult.stuckPattern) rootSpan.setAttribute("session.stuck_pattern", finalResult.stuckPattern);

          emitEvent(onEvent, "session:result", {
            message: `Session completed: ${finalResult.status}`,
          });

          return finalResult;
        }

        rootSpan.setAttribute("session.status", "failed");
        return {
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
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        emitEvent(onEvent, "session:error", { message: errorMessage });
        rootSpan.recordException(error as Error);
        rootSpan.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });

        // Attempt to push partial work from failed sessions
        let prUrl: string | null = null;
        if (worktree && config.createPr) {
          try {
            const changed = await hasChanges(worktree.path);
            if (changed) {
              const commitMsg = `wip: ${sanitizeForCommitMessage(config.taskDescription)}`;
              await commitChanges(worktree.path, commitMsg);
              await pushBranch(worktree.path, worktree.branchName);

              const pr = await createPullRequest({
                title: `wip: ${config.taskDescription.slice(0, 57)}`,
                body: buildFailurePrBody(config.taskDescription, [errorMessage], stuckReason?.type),
                baseBranch: config.baseBranch,
                branchName: worktree.branchName,
                repoPath: worktree.path,
                draft: true,
              });
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
        return {
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
          } catch {
            // Worktree cleanup is best-effort
          }
        }
        rootSpan.end();
      }
  }
}
