import { ghPrFeedbackPort } from "./pr-feedback-port.js";
import type { PrFeedbackPort } from "./pr-feedback-port.js";
import { pollForFeedback } from "./pr-feedback-poller.js";
import { buildReviewFixPrompt } from "./feedback-prompt-builder.js";
import { runHardenedQuery } from "./run-hardened-query.js";
import { commitAndPush, resolveRepoIdentity } from "./worktree-manager.js";
import type { WorktreeManagerDeps } from "./phases/pipeline-types.js";
import type { SessionEventCallback, SessionEvent } from "./types.js";

// ── Types ───────────────────────────────────────────────────────────

export interface FeedbackLoopParams {
  readonly prNumber: number;
  readonly branchName: string;
  readonly repoPath: string;
  readonly model: string;
  readonly maxRetries: number;
  readonly pollIntervalMs: number;
  readonly pollTimeoutMs: number;
  readonly maxBudgetUsd: number;
  readonly allowedTools: readonly string[];
  /**
   * External abort signal forwarded from the pipeline's cancel(). When it
   * fires, the wait/poll delays reject and the fix-session query is
   * short-circuited, mirroring `session-runner`'s `throwIfAborted` semantics
   * — the rejection propagates out of `runFeedbackLoop` instead of being
   * swallowed.
   */
  readonly signal?: AbortSignal;
}

export interface FeedbackLoopResult {
  readonly retriesUsed: number;
  readonly resolved: boolean;
  readonly lastFingerprint: string | null;
}

/**
 * Collaborators injected into `runFeedbackLoop`. Defaults wire the real
 * validated worktree-manager `commitAndPush` and the `gh`-backed
 * `PrFeedbackPort`; tests pass fakes so the loop runs without spawning any
 * subprocess.
 */
export interface FeedbackLoopRunnerDeps {
  readonly worktreeManager: Pick<WorktreeManagerDeps, "commitAndPush" | "resolveRepoIdentity">;
  readonly feedbackPoller: PrFeedbackPort;
}

// ── Helpers ─────────────────────────────────────────────────────────

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

/**
 * Waits `ms` milliseconds, or rejects with the signal's `AbortError` the
 * moment it fires — whichever comes first. Clears the timer and removes its
 * own listener on either outcome, so an aborted wait never leaves a dangling
 * timer or listener behind.
 */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();

  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("Delay aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

const defaultRunnerDeps: FeedbackLoopRunnerDeps = {
  worktreeManager: { commitAndPush, resolveRepoIdentity },
  feedbackPoller: ghPrFeedbackPort,
};

// ── Main feedback loop ──────────────────────────────────────────────

export async function runFeedbackLoop(
  config: FeedbackLoopParams,
  deps: FeedbackLoopRunnerDeps = defaultRunnerDeps,
  onEvent?: SessionEventCallback
): Promise<FeedbackLoopResult> {
  const { signal } = config;
  const { feedbackPoller } = deps;
  const { owner, repo } = await deps.worktreeManager.resolveRepoIdentity(config.repoPath);

  let lastFingerprint = "";
  let retriesUsed = 0;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    emitEvent(onEvent, "session:message", {
      message: `Feedback loop: waiting ${config.pollIntervalMs}ms before polling (attempt ${attempt + 1}/${config.maxRetries})`,
    });

    // Wait before polling to give reviewers/CI time. Rejects immediately
    // (an AbortError) if `signal` fires during the wait, short-circuiting
    // the loop instead of running it out to maxRetries * pollTimeoutMs.
    await delay(config.pollIntervalMs, signal);

    // Poll for feedback with timeout
    const pollStart = Date.now();
    let feedback = await pollForFeedback(
      owner,
      repo,
      config.prNumber,
      config.repoPath,
      lastFingerprint,
      feedbackPoller
    );

    // If no feedback yet, keep polling until timeout
    while (!feedback && Date.now() - pollStart < config.pollTimeoutMs) {
      await delay(config.pollIntervalMs, signal);
      feedback = await pollForFeedback(
        owner,
        repo,
        config.prNumber,
        config.repoPath,
        lastFingerprint,
        feedbackPoller
      );
    }

    // No feedback found — PR is clean
    if (!feedback) {
      emitEvent(onEvent, "session:message", {
        message: "Feedback loop: no feedback found, PR looks clean",
      });
      return { retriesUsed, resolved: true, lastFingerprint: lastFingerprint || null };
    }

    // Feedback found — dispatch a fix session via the hardened query loop
    retriesUsed += 1;
    lastFingerprint = feedback.fingerprint;

    const commentCount = feedback.context.reviewComments.length;
    const ciFailureCount = feedback.context.ciFailures.length;
    emitEvent(onEvent, "session:message", {
      message: `Feedback loop: found ${commentCount} comment(s) and ${ciFailureCount} CI failure(s), running fix session`,
    });

    const fixPrompt = buildReviewFixPrompt(feedback.context);

    // runHardenedQuery provides stuck detection, circuit breaker, and heartbeat/
    // inactivity timeout — the fix-session is now as well-guarded as the primary run.
    await runHardenedQuery(
      {
        prompt: fixPrompt,
        cwd: config.repoPath,
        model: config.model,
        maxTurns: 30,
        maxBudgetUsd: config.maxBudgetUsd,
        allowedTools: config.allowedTools,
        systemPromptAppend:
          "You are fixing feedback on an existing PR. Work in the current branch. Do NOT create a new branch or PR.",
        signal,
      },
      onEvent
    );

    // A cancel() arriving mid-query short-circuits the SDK call above, but
    // that call resolves normally rather than throwing — check here so a
    // cancelled fix-session never pushes a commit to an abandoned branch.
    signal?.throwIfAborted();

    // Commit and push the fixes via the validated worktree-manager seam.
    await deps.worktreeManager.commitAndPush(
      config.repoPath,
      `fix: address PR feedback (attempt ${attempt + 1})`
    );

    emitEvent(onEvent, "session:message", {
      message: `Feedback loop: fix session complete, pushed changes (attempt ${attempt + 1})`,
    });
  }

  // Exhausted retries — check one more time if resolved
  const finalFeedback = await pollForFeedback(
    owner,
    repo,
    config.prNumber,
    config.repoPath,
    lastFingerprint,
    feedbackPoller
  );

  const resolved = finalFeedback === null;

  emitEvent(onEvent, "session:message", {
    message: resolved
      ? "Feedback loop: all feedback resolved"
      : `Feedback loop: unresolved feedback after ${retriesUsed} retries, escalating`,
  });

  return {
    retriesUsed,
    resolved,
    lastFingerprint: lastFingerprint || null,
  };
}
