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

    if (!gatewayVerdict || gatewayVerdict.outcome === "create-pr") {
      const title = prCreator.buildPrTitle(config.taskDescription);
      const body = resultMessage
        ? prCreator.buildPrBody(
            config.taskDescription,
            resultMessage.session_id,
            resultMessage.total_cost_usd,
            resultMessage.num_turns
          )
        : prCreator.buildFailurePrBody(
            config.taskDescription,
            [...input.errors],
            stuckReason?.type
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

    // verdict.outcome === "create-draft-pr" — quality gates failed
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

    emitEvent(onEvent, "session:result", {
      message: `Draft PR created (failed gates: ${gatewayVerdict!.gateFailures.join(", ")}): ${pr.url}`,
    });
    return { prUrl: pr.url, prNumber: pr.number };
  }
}
