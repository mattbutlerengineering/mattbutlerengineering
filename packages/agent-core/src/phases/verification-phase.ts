import { withRetry } from "../retry.js";
import { emitEvent, sanitizeForCommitMessage } from "../utils.js";
import type { GatewayVerdict } from "../post-commit-gateway.js";
import type { EvaluationResult } from "../success-evaluator.js";
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
    const { worktreeManager, successEvaluator, gateway } = deps;

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
    const isSuccess = resultMessage?.subtype === "success" && !stuckReason;
    const prefix = isSuccess ? "feat" : "wip";
    const commitMsg = `${prefix}: ${sanitizeForCommitMessage(config.taskDescription)}`;
    await worktreeManager.commitChanges(worktree.path, commitMsg);

    // Push with retry for transient network failures
    await withRetry(() => worktreeManager.pushBranch(worktree.path, worktree.branchName), {
      maxRetries: 3,
    });

    // Run post-commit gateway (verification + quality gates) only on success
    const errors: string[] = [];
    let gatewayVerdict: GatewayVerdict | undefined;
    let gatewayEvaluation: EvaluationResult | undefined;
    let cachedDiff: string | undefined;

    if (isSuccess) {
      cachedDiff = await successEvaluator.getGitDiff(worktree.path);
      gatewayVerdict = await gateway.runPostCommitGateway(
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
      output: {
        hasChanges: true,
        commitMsg,
        cachedDiff,
        gatewayVerdict,
        gatewayEvaluation,
      },
    };
  }
}
