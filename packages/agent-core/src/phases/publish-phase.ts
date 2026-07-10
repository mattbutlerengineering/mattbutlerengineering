import { trace } from "@opentelemetry/api";
import { withRetry } from "../retry.js";
import { emitEvent } from "../utils.js";
import type { WorktreeInfo } from "../types.js";
import type {
  Phase,
  PhaseDeps,
  PhaseExecution,
  PublishPhaseInput,
  PublishPhaseOutput,
} from "./pipeline-types.js";

const tracer = trace.getTracer("@mbe/agent-core");

export class PublishPhase implements Phase<PublishPhaseInput, PublishPhaseOutput> {
  readonly name = "publish" as const;

  async run(
    input: PublishPhaseInput,
    deps: PhaseDeps
  ): Promise<PhaseExecution<PublishPhaseOutput>> {
    const { config, worktree, hasChanges } = input;

    if (!config.createPr || !hasChanges) {
      return {
        result: { phase: this.name, status: "skipped", errors: [] },
        output: null,
      };
    }

    const { prUrl, prNumber } = await this.createOrMergePr(input, worktree, deps);

    return {
      result: { phase: this.name, status: "success", errors: [] },
      output: { prUrl, prNumber },
    };
  }

  private async createOrMergePr(
    input: PublishPhaseInput,
    worktree: WorktreeInfo,
    deps: PhaseDeps
  ): Promise<{ prUrl: string | null; prNumber?: number }> {
    const { config, onEvent, resultMessage, stuckReason, gatewayVerdict } = input;
    const { prCreator } = deps;

    if (gatewayVerdict?.outcome === "merge-direct") {
      const commitTitle = prCreator.buildPrTitle(config.taskDescription);
      const mergedUrl = await prCreator.mergeDirectly({
        branchName: worktree.branchName,
        baseBranch: config.baseBranch,
        repoPath: worktree.path,
        commitTitle,
      });
      emitEvent(onEvent, "session:result", {
        message: `Trivial dep bump — direct-merged: ${mergedUrl}`,
      });
      return { prUrl: mergedUrl };
    }

    // An absent gatewayVerdict means the gateway never ran, which happens
    // exactly when the session itself failed or got stuck (see
    // VerificationPhase's `isSuccess` gate). Absence is NOT approval — only
    // an explicit "create-pr" outcome (or a genuinely successful session
    // that skipped the gateway) earns a normal, non-draft PR.
    const sessionSucceeded = resultMessage?.success === true && !stuckReason;

    if (sessionSucceeded && (!gatewayVerdict || gatewayVerdict.outcome === "create-pr")) {
      const title = prCreator.buildPrTitle(config.taskDescription);
      const body = prCreator.buildPrBody(
        config.taskDescription,
        resultMessage.sessionId,
        resultMessage.costUsd,
        resultMessage.numTurns
      );

      const prSpan = tracer.startSpan("agent_core.create_pr");
      try {
        const { value: pr } = await withRetry(
          () =>
            prCreator.createPullRequest({
              title,
              body,
              baseBranch: config.baseBranch,
              branchName: worktree.branchName,
              repoPath: worktree.path,
              draft: false,
            }),
          { maxRetries: 3 }
        );
        prSpan.setAttribute("pr.url", pr.url);
        prSpan.setAttribute("pr.number", pr.number);
        prSpan.setAttribute("pr.draft", false);

        emitEvent(onEvent, "session:result", {
          message: `PR created: ${pr.url}`,
        });
        return { prUrl: pr.url, prNumber: pr.number };
      } finally {
        prSpan.end();
      }
    }

    // Draft/failure path — either the gateway ran and gates failed
    // (outcome === "create-draft-pr"), or the gateway never ran because the
    // session itself failed or got stuck.
    const title = `wip: ${config.taskDescription.slice(0, 57)}`;
    const body = prCreator.buildFailurePrBody(
      config.taskDescription,
      [...input.errors],
      stuckReason?.type
    );

    const { value: pr } = await withRetry(
      () =>
        prCreator.createPullRequest({
          title,
          body,
          baseBranch: config.baseBranch,
          branchName: worktree.branchName,
          repoPath: worktree.path,
          draft: true,
        }),
      { maxRetries: 3 }
    );

    const reason = gatewayVerdict
      ? `failed gates: ${gatewayVerdict.gateFailures.join(", ")}`
      : "session failed";
    emitEvent(onEvent, "session:result", {
      message: `Draft PR created (${reason}): ${pr.url}`,
    });
    return { prUrl: pr.url, prNumber: pr.number };
  }
}
