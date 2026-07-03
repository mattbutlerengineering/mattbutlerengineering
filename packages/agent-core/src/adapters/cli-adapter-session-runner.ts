/**
 * runCliAdapterSession — full-pipeline `AgentSessionAdapter.runSession()`
 * implementation shared by every CLI-subprocess-backed adapter (Gemini,
 * OpenCode).
 *
 * Wraps the adapter's existing `run()` (spawn CLI, detect changes, commit —
 * unchanged) with the SAME worktree lifecycle, GateRunner suite, and
 * draft-vs-normal publish decision that ClaudeAdapter's `runSession()`
 * drives via `session-runner.ts` — closing the gating gap where gemini/
 * opencode PRs previously skipped static-analysis/security-review/llm-eval
 * (#2973).
 */

import { withRetry } from "../retry.js";
import { emitEvent } from "../utils.js";
import { categorizeFailure } from "../observability.js";
import { createDefaultPhaseDeps } from "../phases/default-deps.js";
import type { PhaseDeps, PrCreatorDeps } from "../phases/index.js";
import type { AgentAdapter } from "../cli-adapter.js";
import type { GatewayVerdict } from "../post-commit-gateway.js";
import type {
  FailureCategory,
  SessionConfig,
  SessionEventCallback,
  SessionResult,
  WorktreeInfo,
} from "../types.js";

/** ~2 minutes per turn — matches the CLI's prior worktree-managed dispatch. */
const TIMEOUT_MS_PER_TURN = 120_000;

export async function runCliAdapterSession(
  cliAdapter: AgentAdapter,
  config: SessionConfig,
  onEvent?: SessionEventCallback,
  deps: PhaseDeps = createDefaultPhaseDeps(),
  _signal?: AbortSignal
): Promise<SessionResult> {
  const { worktreeManager, successEvaluator, gateway, prCreator } = deps;

  emitEvent(onEvent, "session:start", { message: `Creating worktree for ${cliAdapter.name}...` });
  const { value: worktree } = await withRetry(
    () =>
      worktreeManager.createWorktree(config.repoPath, config.baseBranch, config.taskDescription),
    { maxRetries: 2 }
  );
  emitEvent(onEvent, "session:start", {
    message: `Starting ${cliAdapter.name} on branch ${worktree.branchName}`,
  });

  const adapterResult = await cliAdapter.run({
    taskDescription: config.taskDescription,
    worktreePath: worktree.path,
    repoPath: config.repoPath,
    baseBranch: config.baseBranch,
    model: config.model,
    maxTurns: config.maxTurns,
    timeoutMs: config.maxTurns * TIMEOUT_MS_PER_TURN,
  });

  const errors: string[] = adapterResult.error ? [adapterResult.error] : [];
  let prUrl: string | null = null;

  if (!adapterResult.hasChanges) {
    emitEvent(onEvent, "session:result", { message: "No changes were made by the agent" });
  } else {
    await withRetry(() => worktreeManager.pushBranch(worktree.path, worktree.branchName), {
      maxRetries: 3,
    });

    let gatewayVerdict: GatewayVerdict | undefined;
    if (adapterResult.success) {
      const diff = await successEvaluator.getGitDiff(worktree.path);
      gatewayVerdict = await gateway.runPostCommitGateway(
        {
          worktreePath: worktree.path,
          diff,
          commitMsg: `feat: ${config.taskDescription}`,
          taskDescription: config.taskDescription,
          config: {
            evaluateSuccess: config.evaluateSuccess,
            runSecurityReview: true,
            runStaticAnalysis: true,
          },
        },
        onEvent
      );
      errors.push(...gatewayVerdict.errors);
    }

    if (config.createPr) {
      prUrl = await publishCliAdapterResult({
        config,
        worktree,
        adapterSucceeded: adapterResult.success,
        gatewayVerdict,
        cliAdapterName: cliAdapter.name,
        costUsd: adapterResult.costUsd,
        errors,
        prCreator,
        onEvent,
      });
    }
  }

  if (config.createPr) {
    await worktreeManager.removeWorktree(config.repoPath, worktree.path);
  }

  const failureCategory: FailureCategory | undefined = !adapterResult.success
    ? adapterResult.rateLimited
      ? "rate_limited"
      : categorizeFailure(errors)
    : undefined;

  const status = adapterResult.success ? "succeeded" : "failed";
  emitEvent(onEvent, "session:result", { message: `Session completed: ${status}` });

  return {
    sessionId: "",
    status,
    branchName: worktree.branchName,
    prUrl,
    costUsd: adapterResult.costUsd ?? 0,
    tokenUsage: adapterResult.tokenUsage ?? { inputTokens: 0, outputTokens: 0 },
    durationMs: adapterResult.durationMs,
    numTurns: 0,
    resultText: "",
    errors,
    ...(failureCategory ? { failureCategory } : {}),
  };
}

// ── Publish decision ────────────────────────────────────────────────
//
// Mirrors PublishPhase's merge-direct / create-pr / create-draft-pr decision
// tree, adapted for CLI-subprocess adapters: there is no SDKResultMessage,
// so success/failure is driven by `adapterSucceeded` instead of an optional
// resultMessage (avoiding PublishPhase's Claude-specific coupling).

interface PublishCliAdapterInput {
  readonly config: SessionConfig;
  readonly worktree: WorktreeInfo;
  readonly adapterSucceeded: boolean;
  readonly gatewayVerdict: GatewayVerdict | undefined;
  readonly cliAdapterName: string;
  readonly costUsd: number | undefined;
  readonly errors: readonly string[];
  readonly prCreator: PrCreatorDeps;
  readonly onEvent: SessionEventCallback | undefined;
}

async function publishCliAdapterResult(input: PublishCliAdapterInput): Promise<string> {
  const {
    config,
    worktree,
    adapterSucceeded,
    gatewayVerdict,
    cliAdapterName,
    costUsd,
    errors,
    prCreator,
    onEvent,
  } = input;

  if (!adapterSucceeded) {
    const { value: pr } = await withRetry(
      () =>
        prCreator.createPullRequest({
          title: `wip: ${config.taskDescription.slice(0, 57)}`,
          body: prCreator.buildFailurePrBody(config.taskDescription, errors),
          baseBranch: config.baseBranch,
          branchName: worktree.branchName,
          repoPath: worktree.path,
          draft: true,
        }),
      { maxRetries: 3 }
    );
    emitEvent(onEvent, "session:result", {
      message: `Draft PR created (${cliAdapterName} adapter failed): ${pr.url}`,
    });
    return pr.url;
  }

  if (gatewayVerdict?.outcome === "merge-direct") {
    const mergedUrl = await prCreator.mergeDirectly({
      branchName: worktree.branchName,
      baseBranch: config.baseBranch,
      repoPath: worktree.path,
      commitTitle: prCreator.buildPrTitle(config.taskDescription),
    });
    emitEvent(onEvent, "session:result", {
      message: `Trivial dep bump — direct-merged: ${mergedUrl}`,
    });
    return mergedUrl;
  }

  const gatesPassed = gatewayVerdict?.passed !== false;
  const { value: pr } = await withRetry(
    () =>
      prCreator.createPullRequest({
        title: gatesPassed
          ? prCreator.buildPrTitle(config.taskDescription)
          : `wip: ${config.taskDescription.slice(0, 57)}`,
        body: gatesPassed
          ? prCreator.buildPrBody(config.taskDescription, cliAdapterName, costUsd, 0)
          : prCreator.buildFailurePrBody(config.taskDescription, errors),
        baseBranch: config.baseBranch,
        branchName: worktree.branchName,
        repoPath: worktree.path,
        draft: !gatesPassed,
      }),
    { maxRetries: 3 }
  );

  emitEvent(onEvent, "session:result", {
    message: gatesPassed
      ? `PR created: ${pr.url}`
      : `Draft PR created (failed gates: ${gatewayVerdict!.gateFailures.join(", ")}): ${pr.url}`,
  });
  return pr.url;
}
