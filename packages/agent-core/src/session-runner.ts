import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import type {
  SessionConfig,
  SessionResult,
  SessionEvent,
  SessionEventCallback,
  WorktreeInfo,
} from "./types.js";
import { buildSystemPrompt, loadSourceFiles } from "./prompt-builder.js";
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
import {
  createPullRequest,
  buildPrTitle,
  buildPrBody,
  buildFailurePrBody,
} from "./pr-creator.js";
import { isTrivialDepBump, mergeDirectly } from "./dep-bump-merger.js";
import { evaluateSuccess, getGitDiff, shouldEvaluate } from "./success-evaluator.js";
import type { EvaluationResult } from "./success-evaluator.js";
import { mapSdkMessage } from "./event-mapper.js";
import {
  recordFailure,
  queryPastFailures,
  buildFailureContext,
  loadMemory,
} from "./failure-memory.js";

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
  const abortController = new AbortController();
  let worktree: WorktreeInfo | undefined;
  let stuckReason: StuckPattern | null = null;

  try {
    // 1. Create isolated worktree
    emitEvent(onEvent, "session:start", { message: "Creating worktree..." });

    worktree = await createWorktree(
      config.repoPath,
      config.baseBranch,
      config.taskDescription
    );

    // 2. Build system prompt with failure context and source files
    const failureMemory = await loadMemory(config.repoPath);
    const pastFailures = queryPastFailures(failureMemory, config.taskDescription);
    const failureContext = buildFailureContext(pastFailures);
    const sourceFileEntries = config.sourceFiles
      ? await loadSourceFiles(config.sourceFiles)
      : undefined;
    const systemPrompt =
      buildSystemPrompt(config.taskDescription, sourceFileEntries) + failureContext;

    // 3. Run the agent via SDK query()
    emitEvent(onEvent, "session:start", {
      message: `Starting agent on branch ${worktree.branchName}`,
    });

    const canUseTool = createToolPermissionHandler(worktree.path);

    let resultMessage: SDKResultMessage | null = null;

    const detector = createStuckDetector();
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
        stuckReason = stuckPattern;
        emitEvent(onEvent, "session:stuck", {
          message: `Stuck detected: ${stuckPattern.description}`,
        });
        abortController.abort();
        break;
      }
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
          evaluation = await evaluateSuccess(config.taskDescription, diff);
          evaluationPassed = evaluation.passed;

          emitEvent(onEvent, "session:evaluation", {
            message: `Evaluation: ${evaluation.passed ? "PASS" : "FAIL"} (confidence: ${evaluation.confidence.toFixed(2)})`,
          });

          if (!evaluation.passed) {
            errors.push(`Evaluation failed: ${evaluation.reasoning}`);
          }
        }
      }

      if (config.createPr) {
        // Fast-path: trivial dependency bumps that passed tests are merged
        // directly without waiting for PR review.
        if (evaluationPassed) {
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

            const pr = await createPullRequest({
              title,
              body,
              baseBranch: config.baseBranch,
              branchName: worktree.branchName,
              repoPath: worktree.path,
              draft: false,
            });

            prUrl = pr.url;
            emitEvent(onEvent, "session:result", {
              message: `PR created: ${pr.url}`,
            });
          }
        } else {
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
            message: `Draft PR created: ${pr.url}`,
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

      emitEvent(onEvent, "session:result", {
        message: `Session completed: ${finalResult.status}`,
      });

      return finalResult;
    }

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
  }
}
