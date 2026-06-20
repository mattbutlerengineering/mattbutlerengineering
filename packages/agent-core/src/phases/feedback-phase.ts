import { trace } from "@opentelemetry/api";
import { getFeedbackLoopModel } from "../model-router.js";
import { emitEvent } from "../utils.js";
import type { Phase, PhaseDeps, PhaseExecution, FeedbackPhaseInput } from "./pipeline-types.js";

const tracer = trace.getTracer("@mbe/agent-core");

export class FeedbackPhase implements Phase<FeedbackPhaseInput, void> {
  readonly name = "feedback" as const;

  async run(input: FeedbackPhaseInput, deps: PhaseDeps): Promise<PhaseExecution<void>> {
    const { config, onEvent, worktree, resultMessage, prNumber, prUrl } = input;

    if (!config.feedbackLoop?.enabled || !prNumber || !prUrl) {
      return {
        result: { phase: this.name, status: "skipped", errors: [] },
        output: null,
      };
    }

    // Use remaining budget instead of fixed 50% ratio
    const sessionCost = resultMessage?.total_cost_usd ?? 0;
    const remainingBudget = Math.max(0, config.maxBudgetUsd - sessionCost);

    const fbSpan = tracer.startSpan("agent_core.feedback_loop");
    let feedbackResult;
    try {
      feedbackResult = await deps.feedbackLoop.runFeedbackLoop(
        {
          prNumber,
          branchName: worktree.branchName,
          repoPath: worktree.path,
          model: getFeedbackLoopModel(config.model),
          maxRetries: config.feedbackLoop.maxRetries ?? 2,
          pollIntervalMs: config.feedbackLoop.pollIntervalMs ?? 30_000,
          pollTimeoutMs: config.feedbackLoop.pollTimeoutMs ?? 300_000,
          maxBudgetUsd: remainingBudget,
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

    return {
      result: { phase: this.name, status: "success", errors: [] },
      output: undefined,
    };
  }
}
