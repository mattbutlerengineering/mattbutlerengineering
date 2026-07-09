import { withRetry } from "../retry.js";
import { emitEvent, sanitizeForCommitMessage } from "../utils.js";
import { getGitDiff, type EvaluationResult } from "../success-evaluator.js";
import { runPostCommitGateway, type GatewayVerdict } from "../post-commit-gateway.js";
import type {
  Phase,
  PhaseDeps,
  PhaseExecution,
  VerificationPhaseInput,
  VerificationPhaseOutput,
} from "./pipeline-types.js";

export class VerificationPhase implements Phase<VerificationPhaseInput, VerificationPhaseOutput> {
  readonly name = "verification" as const;

  async run(
    input: VerificationPhaseInput,
    deps: PhaseDeps
  ): Promise<PhaseExecution<VerificationPhaseOutput>> {
    const { config, onEvent, worktree, resultMessage, stuckReason } = input;
    const { worktreeManager } = deps;

    const changed = await worktreeManager.hasChanges(worktree.path);

    if (!changed) {
      emitEvent(onEvent, "session:result", {
        message: "No changes were made by the agent",
      });
      return {
        result: { phase: this.name, status: "success", errors: [] },
        output: { hasChanges: false },
      };
    }

    // Commit changes
    const isSuccess = resultMessage?.success === true && !stuckReason;
    const prefix = isSuccess ? "feat" : "wip";
    const commitMsg = `${prefix}: ${sanitizeForCommitMessage(config.taskDescription)}`;
    await worktreeManager.commitChanges(worktree.path, commitMsg);

    // Push with retry for transient network failures
    await withRetry(() => worktreeManager.pushBranch(worktree.path, worktree.branchName), {
      maxRetries: 3,
    });

    // Run post-commit gateway (verification + quality gates) only on success.
    // The diff is fetched once and passed straight through as an immutable
    // argument into the gateway/gate pipeline — it never lives on shared
    // session state, so no downstream phase or gate can read a stale value.
    const errors: string[] = [];
    let gatewayVerdict: GatewayVerdict | undefined;
    let gatewayEvaluation: EvaluationResult | undefined;

    if (isSuccess) {
      const diff = await getGitDiff(worktree.path);
      gatewayVerdict = await runPostCommitGateway(
        {
          worktreePath: worktree.path,
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
      errors.push(...gatewayVerdict.errors);
      gatewayEvaluation = gatewayVerdict.evaluation;
    }

    return {
      result: { phase: this.name, status: "success", errors },
      output: {
        hasChanges: true,
        commitMsg,
        gatewayVerdict,
        gatewayEvaluation,
      },
    };
  }
}
