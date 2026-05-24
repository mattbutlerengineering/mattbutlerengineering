import { hasChanges, commitChanges, pushBranch } from "../worktree-manager.js";
import { getGitDiff } from "../success-evaluator.js";
import { runPostCommitGateway } from "../post-commit-gateway.js";
import { withRetry } from "../retry.js";
import { emitEvent, sanitizeForCommitMessage } from "../utils.js";
import type { PipelineContext, PipelinePhase, PhaseResult } from "./pipeline-types.js";

export class VerificationPhase implements PipelinePhase {
  readonly name = "verification" as const;

  async run(ctx: PipelineContext): Promise<{ result: PhaseResult; ctx: PipelineContext }> {
    const { config, onEvent, worktree, resultMessage, stuckReason } = ctx;

    if (!worktree) {
      return {
        result: { phase: this.name, status: "skipped", errors: [] },
        ctx,
      };
    }

    const changed = await hasChanges(worktree.path);

    if (!changed) {
      emitEvent(onEvent, "session:result", {
        message: "No changes were made by the agent",
      });
      return {
        result: { phase: this.name, status: "success", errors: [] },
        ctx: { ...ctx, hasChanges: false },
      };
    }

    // Commit changes
    const isSuccess = resultMessage?.subtype === "success" && !stuckReason;
    const prefix = isSuccess ? "feat" : "wip";
    const commitMsg = `${prefix}: ${sanitizeForCommitMessage(config.taskDescription)}`;
    await commitChanges(worktree.path, commitMsg);

    // Push with retry for transient network failures
    await withRetry(() => pushBranch(worktree.path, worktree.branchName), { maxRetries: 3 });

    // Run post-commit gateway (verification + quality gates) only on success
    const errors: string[] = [];
    let gatewayVerdict;
    let gatewayEvaluation;
    let cachedDiff: string | undefined;

    if (isSuccess) {
      cachedDiff = await getGitDiff(worktree.path);
      gatewayVerdict = await runPostCommitGateway(
        {
          worktreePath: worktree.path,
          diff: cachedDiff,
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
      errors.push(...gatewayVerdict.errors);
      gatewayEvaluation = gatewayVerdict.evaluation;
    }

    return {
      result: { phase: this.name, status: "success", errors },
      ctx: {
        ...ctx,
        hasChanges: true,
        commitMsg,
        cachedDiff,
        gatewayVerdict,
        gatewayEvaluation,
        errors: [...ctx.errors, ...errors],
      },
    };
  }
}
