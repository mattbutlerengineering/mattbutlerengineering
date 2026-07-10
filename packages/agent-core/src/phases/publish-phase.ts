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

    // An absent gatewayVerdict means the gateway never ran, which happens
    // exactly when the session itself failed or got stuck (see
    // VerificationPhase's `isSuccess` gate). Absence is NOT approval — only
    // an explicit "create-pr" outcome (or a genuinely successful session
    // that skipped the gateway) earns a normal, non-draft PR. Every path
    // that ships or merges committed work is gated on `sessionSucceeded`,
    // including the dep-bump direct-merge fast path — its safety must not
    // depend on an invariant that lives in VerificationPhase (#3272).
    const sessionSucceeded = resultMessage?.success === true && !stuckReason;

    if (sessionSucceeded && gatewayVerdict?.outcome === "merge-direct") {
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
      this.collectFailureDetails(input),
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

  /**
   * Assembles the failure-body error list. At this point `input.errors`
   * holds only budget/gateway messages — the strings that explain a plain
   * failed session (the SDK-reported errors and the result subtype) are
   * otherwise synthesized post-pipeline in result-builder.ts, AFTER
   * PublishPhase has already created the PR. Surfacing them here keeps the
   * draft PR body diagnostically useful without reaching past the
   * adapter-neutral `SessionResultSummary` boundary (#3272).
   */
  private collectFailureDetails(input: PublishPhaseInput): readonly string[] {
    const { resultMessage, stuckReason, errors } = input;
    const details = [...errors];

    const pushUnique = (msg: string): void => {
      if (msg && !details.includes(msg)) details.push(msg);
    };

    for (const err of resultMessage?.errors ?? []) {
      pushUnique(err);
    }

    // Name the result subtype when a non-success session left no other
    // explanation (no stuck pattern, no gateway/budget error) — otherwise
    // "## Failure Details" renders empty for the common error_max_turns case.
    const subtype = resultMessage?.subtype;
    if (
      resultMessage &&
      !resultMessage.success &&
      !stuckReason &&
      subtype &&
      subtype !== "success"
    ) {
      pushUnique(`Session ended without success: ${subtype}`);
    }

    return details;
  }
}
