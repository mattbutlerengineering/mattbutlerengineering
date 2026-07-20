import { ghPrFeedbackPort } from "./pr-feedback-port.js";
import type { PrFeedbackPort } from "./pr-feedback-port.js";

// ── Types ───────────────────────────────────────────────────────────

export interface ReviewComment {
  readonly threadId: string;
  readonly author: string;
  readonly body: string;
  readonly path: string | null;
  readonly line: number | null;
}

export interface CIFailure {
  readonly checkName: string;
  readonly conclusion: string;
  readonly logSnippet: string;
}

export interface FeedbackContext {
  readonly prNumber: number;
  readonly reviewComments: readonly ReviewComment[];
  readonly ciFailures: readonly CIFailure[];
  readonly reviewDecision: string;
}

export interface PollResult {
  readonly context: FeedbackContext;
  readonly fingerprint: string;
}

export interface FeedbackPoller {
  /**
   * Polls once for new PR feedback. Returns `null` when there is nothing to
   * act on — either no feedback at all, or the review-thread fingerprint is
   * unchanged from `lastFingerprint` and there are no CI failures.
   */
  poll(prNumber: number, lastFingerprint: string): Promise<PollResult | null>;
}

// ── Review comment extraction ───────────────────────────────────────

async function fetchUnresolvedComments(
  owner: string,
  repo: string,
  prNumber: number,
  repoPath: string,
  port: PrFeedbackPort
): Promise<{ comments: readonly ReviewComment[]; reviewDecision: string }> {
  try {
    const { reviewDecision, threads } = await port.fetchReviewThreads(
      owner,
      repo,
      prNumber,
      repoPath
    );

    const comments: ReviewComment[] = threads
      .filter((t) => !t.isResolved && t.comments.nodes.length > 0)
      .map((t) => {
        const comment = t.comments.nodes[0];
        return {
          threadId: t.id,
          author: comment.author.login,
          body: comment.body,
          path: comment.path,
          line: comment.line,
        };
      });

    return {
      comments,
      reviewDecision: reviewDecision ?? "PENDING",
    };
  } catch {
    return { comments: [], reviewDecision: "UNKNOWN" };
  }
}

// ── CI failure extraction ───────────────────────────────────────────

async function fetchCIFailures(
  prNumber: number,
  repoPath: string,
  tailLines: number,
  port: PrFeedbackPort
): Promise<readonly CIFailure[]> {
  try {
    const checks = await port.fetchChecks(prNumber, repoPath);
    const failed = checks.filter((c) => c.conclusion === "failure");

    if (failed.length === 0) return [];

    // Get log snippet from the most recent failed run
    let logSnippet = "";
    try {
      const runId = await port.fetchFailedRunId(repoPath);
      if (runId !== null) {
        const logs = await port.fetchRunLogs(runId, repoPath);
        const lines = logs.split("\n");
        logSnippet = lines.slice(-tailLines).join("\n");
      }
    } catch {
      logSnippet = "(Could not fetch CI logs)";
    }

    return failed.map((f) => ({
      checkName: f.name,
      conclusion: f.conclusion,
      logSnippet,
    }));
  } catch {
    return [];
  }
}

// ── Fingerprint ──────────────────────────────────────────────────────

function computeFingerprint(comments: readonly ReviewComment[]): string {
  return comments
    .map((c) => c.threadId)
    .sort()
    .join(",");
}

// ── Poller factory ───────────────────────────────────────────────────

/**
 * Builds a `FeedbackPoller` bound to one repo/PR-owner scaffold. `owner`,
 * `repo`, `repoPath`, and `port` are invariant across a feedback loop's
 * retry iterations, so they're resolved once at construction — call sites
 * poll with just the two things that change per attempt.
 */
export function createFeedbackPoller(
  owner: string,
  repo: string,
  repoPath: string,
  port: PrFeedbackPort = ghPrFeedbackPort
): FeedbackPoller {
  return {
    async poll(prNumber, lastFingerprint) {
      const { comments, reviewDecision } = await fetchUnresolvedComments(
        owner,
        repo,
        prNumber,
        repoPath,
        port
      );

      const ciFailures = await fetchCIFailures(prNumber, repoPath, 100, port);

      const fingerprint = computeFingerprint(comments);

      // No new feedback if fingerprint unchanged and no CI failures
      if (fingerprint === lastFingerprint && ciFailures.length === 0) {
        return null;
      }

      // No feedback at all
      if (comments.length === 0 && ciFailures.length === 0) {
        return null;
      }

      return {
        context: {
          prNumber,
          reviewComments: comments,
          ciFailures,
          reviewDecision,
        },
        fingerprint,
      };
    },
  };
}
