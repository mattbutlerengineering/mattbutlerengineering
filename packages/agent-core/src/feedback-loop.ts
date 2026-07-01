import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pollForFeedback } from "./pr-feedback-poller.js";
import { buildReviewFixPrompt } from "./feedback-prompt-builder.js";
import { runHardenedQuery } from "./run-hardened-query.js";
import type { SessionEventCallback, SessionEvent } from "./types.js";

const execFileAsync = promisify(execFile);

/** Bound `git` subprocess calls (covers network stalls on push). */
const GIT_TIMEOUT_MS = 60_000;
/** Bound `gh` subprocess calls (GitHub API latency). */
const GH_TIMEOUT_MS = 30_000;

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
}

export interface FeedbackLoopResult {
  readonly retriesUsed: number;
  readonly resolved: boolean;
  readonly lastFingerprint: string | null;
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseOwnerRepo(repoPath: string): Promise<{ owner: string; repo: string }> {
  const { stdout } = await execFileAsync("gh", ["repo", "view", "--json", "owner,name"], {
    cwd: repoPath,
    timeout: GH_TIMEOUT_MS,
  });
  const parsed = JSON.parse(stdout) as { owner: { login: string }; name: string };
  return { owner: parsed.owner.login, repo: parsed.name };
}

/**
 * True only for a genuine `git diff --cached --quiet` exit code 1 ("there are
 * changes"). A timeout kills the process (`killed: true`, `code: null`) and
 * must NOT be mistaken for that clean exit — it needs to propagate instead.
 */
function isExitCodeOne(err: unknown): boolean {
  const execError = err as { code?: number | string | null; killed?: boolean };
  return execError.code === 1 && !execError.killed;
}

async function commitAndPush(repoPath: string, message: string): Promise<void> {
  await execFileAsync("git", ["add", "-A"], { cwd: repoPath, timeout: GIT_TIMEOUT_MS });

  // Check if there are staged changes before committing
  try {
    await execFileAsync("git", ["diff", "--cached", "--quiet"], {
      cwd: repoPath,
      timeout: GIT_TIMEOUT_MS,
    });
    // Exit code 0 means no changes — nothing to commit
    return;
  } catch (err) {
    if (!isExitCodeOne(err)) {
      // A timeout (or any other non-exit-1 failure) must propagate rather
      // than being silently treated as "no changes".
      throw err;
    }
    // Exit code 1 means there are changes — proceed with commit
  }

  await execFileAsync("git", ["commit", "-m", message], {
    cwd: repoPath,
    timeout: GIT_TIMEOUT_MS,
  });
  await execFileAsync("git", ["push"], { cwd: repoPath, timeout: GIT_TIMEOUT_MS });
}

// ── Main feedback loop ──────────────────────────────────────────────

export async function runFeedbackLoop(
  config: FeedbackLoopParams,
  onEvent?: SessionEventCallback
): Promise<FeedbackLoopResult> {
  const { owner, repo } = await parseOwnerRepo(config.repoPath);

  let lastFingerprint = "";
  let retriesUsed = 0;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    emitEvent(onEvent, "session:message", {
      message: `Feedback loop: waiting ${config.pollIntervalMs}ms before polling (attempt ${attempt + 1}/${config.maxRetries})`,
    });

    // Wait before polling to give reviewers/CI time
    await delay(config.pollIntervalMs);

    // Poll for feedback with timeout
    const pollStart = Date.now();
    let feedback = await pollForFeedback(
      owner,
      repo,
      config.prNumber,
      config.repoPath,
      lastFingerprint
    );

    // If no feedback yet, keep polling until timeout
    while (!feedback && Date.now() - pollStart < config.pollTimeoutMs) {
      await delay(config.pollIntervalMs);
      feedback = await pollForFeedback(
        owner,
        repo,
        config.prNumber,
        config.repoPath,
        lastFingerprint
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
      },
      onEvent
    );

    // Commit and push the fixes
    await commitAndPush(config.repoPath, `fix: address PR feedback (attempt ${attempt + 1})`);

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
    lastFingerprint
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
