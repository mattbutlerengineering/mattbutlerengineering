import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import type {
  SessionConfig,
  SessionResult,
  SessionEvent,
  SessionEventCallback,
  WorktreeInfo,
} from "./types.js";
import { buildSystemPrompt } from "./prompt-builder.js";
import { createToolPermissionHandler } from "./tool-permissions.js";
import { buildSessionResult } from "./cost-tracker.js";
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
} from "./pr-creator.js";

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

  try {
    // 1. Create isolated worktree
    emitEvent(onEvent, "session:start", { message: "Creating worktree..." });

    worktree = await createWorktree(
      config.repoPath,
      config.baseBranch,
      config.taskDescription
    );

    // 2. Build system prompt
    const systemPrompt = buildSystemPrompt(config.taskDescription);

    // 3. Run the agent via SDK query()
    emitEvent(onEvent, "session:start", {
      message: `Starting agent on branch ${worktree.branchName}`,
    });

    const canUseTool = createToolPermissionHandler(worktree.path);

    let resultMessage: SDKResultMessage | null = null;

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

    // 4. Stream events
    for await (const message of conversation) {
      emitEvent(onEvent, "session:message", message);

      if (message.type === "result") {
        resultMessage = message as SDKResultMessage;
      }
    }

    if (!resultMessage) {
      return {
        sessionId: "",
        status: "failed",
        branchName: worktree.branchName,
        prUrl: null,
        costUsd: 0,
        tokenUsage: { inputTokens: 0, outputTokens: 0 },
        durationMs: 0,
        numTurns: 0,
        resultText: "",
        errors: ["No result message received from agent"],
      };
    }

    // 5. Commit, push, and create PR if there are changes
    let prUrl: string | null = null;

    const changed = await hasChanges(worktree.path);

    if (changed) {
      const commitMsg = `feat: ${sanitizeForCommitMessage(config.taskDescription)}`;
      await commitChanges(worktree.path, commitMsg);
      await pushBranch(worktree.path, worktree.branchName);

      if (config.createPr) {
        const title = buildPrTitle(config.taskDescription);
        const body = buildPrBody(
          config.taskDescription,
          resultMessage.session_id,
          resultMessage.total_cost_usd,
          resultMessage.num_turns
        );

        const pr = await createPullRequest({
          title,
          body,
          baseBranch: config.baseBranch,
          branchName: worktree.branchName,
          repoPath: worktree.path,
        });

        prUrl = pr.url;
        emitEvent(onEvent, "session:result", { message: `PR created: ${pr.url}` });
      }
    } else {
      emitEvent(onEvent, "session:result", {
        message: "No changes were made by the agent",
      });
    }

    // 6. Build final result
    const sessionResult = buildSessionResult(resultMessage, worktree.branchName, prUrl);

    emitEvent(onEvent, "session:result", {
      message: `Session completed: ${sessionResult.status}`,
    });

    return sessionResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    emitEvent(onEvent, "session:error", { message: errorMessage });

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
      errors: [errorMessage],
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
