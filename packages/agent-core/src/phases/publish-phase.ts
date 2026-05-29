import { trace } from "@opentelemetry/api";
import { createPullRequest, buildPrTitle, buildPrBody, buildFailurePrBody } from "../pr-creator.js";
import { mergeDirectly } from "../dep-bump-merger.js";
import { withRetry } from "../retry.js";
import { emitEvent } from "../utils.js";
import type { WorktreeInfo } from "../types.js";
import type { PipelineContext, PipelinePhase, PhaseResult } from "./pipeline-types.js";

const tracer = trace.getTracer("@mbe/agent-core");

export class PublishPhase implements PipelinePhase {
  readonly name = "publish" as const;

  async run(ctx: PipelineContext): Promise<{ result: PhaseResult; ctx: PipelineContext }> {
    const { config, worktree } = ctx;

    if (!config.createPr || !ctx.hasChanges || !worktree) {
      return {
        result: { phase: this.name, status: "skipped", errors: [] },
        ctx,
      };
    }

    const { prUrl, prNumber } = await this.createOrMergePr(ctx, worktree);

    return {
      result: { phase: this.name, status: "success", errors: [] },
      ctx: { ...ctx, prUrl, prNumber },
    };
  }

  private async createOrMergePr(
    ctx: PipelineContext,
    worktree: WorktreeInfo
  ): Promise<{ prUrl: string | null; prNumber?: number }> {
    const { config, onEvent, resultMessage, stuckReason, gatewayVerdict } = ctx;

    if (gatewayVerdict?.outcome === "merge-direct") {
      const commitTitle = buildPrTitle(config.taskDescription);
      const mergedUrl = await mergeDirectly({
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
      const title = buildPrTitle(config.taskDescription);
      const body = resultMessage
        ? buildPrBody(
            config.taskDescription,
            resultMessage.session_id,
            resultMessage.total_cost_usd,
            resultMessage.num_turns
          )
        : buildFailurePrBody(config.taskDescription, [...ctx.errors], stuckReason?.type);

      const prSpan = tracer.startSpan("agent_core.create_pr");
      try {
        const { value: pr } = await withRetry(
          () =>
            createPullRequest({
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
    const body = buildFailurePrBody(config.taskDescription, [...ctx.errors], stuckReason?.type);

    const { value: pr } = await withRetry(
      () =>
        createPullRequest({
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
