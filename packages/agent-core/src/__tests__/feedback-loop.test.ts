import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionEvent } from "../types.js";

// The commit/push subprocess path, owner/repo lookup, and PR polling are all
// injected via `FeedbackLoopRunnerDeps.feedbackPoller` (a fake PrFeedbackPort)
// — NO `vi.mock("node:child_process")` and NO `vi.mock("../pr-feedback-poller.js")`.
// Only the fix-session collaborators are module-mocked.

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
}));

vi.mock("../feedback-prompt-builder.js", () => ({
  buildReviewFixPrompt: vi.fn(),
}));

vi.mock("../tool-permissions.js", () => ({
  createToolPermissionHandler: vi.fn(),
}));

import { query } from "@anthropic-ai/claude-agent-sdk";
import { createMockQueryStream } from "@mbe/agent-test-utils";
import { buildReviewFixPrompt } from "../feedback-prompt-builder.js";
import { createToolPermissionHandler } from "../tool-permissions.js";
import { runFeedbackLoop } from "../feedback-loop.js";
import type { FeedbackLoopParams, FeedbackLoopRunnerDeps } from "../feedback-loop.js";
import type { PrFeedbackPort, GraphQLThreadNode, CheckResult } from "../pr-feedback-port.js";

const BASE_PARAMS: FeedbackLoopParams = {
  prNumber: 42,
  branchName: "agent/fix-bug-abc123",
  repoPath: "/repo",
  model: "claude-sonnet-4-6",
  maxRetries: 2,
  pollIntervalMs: 10, // Short for tests
  pollTimeoutMs: 50,
  maxBudgetUsd: 0.5,
  allowedTools: ["Read", "Write", "Edit", "Bash"],
};

/** An unresolved review thread — drives a single review comment through the poller. */
const UNRESOLVED_THREAD: GraphQLThreadNode = {
  id: "thread-1",
  isResolved: false,
  comments: {
    nodes: [{ body: "Please fix this", path: "src/main.ts", line: 10, author: { login: "reviewer" } }],
  },
};

const FAILING_CHECK: CheckResult = { name: "lint", state: "completed", conclusion: "failure" };

/**
 * A fake `PrFeedbackPort`: every `gh`-backed call is a `vi.fn()` whose default
 * yields no feedback. Tests override `fetchReviewThreads` / `fetchChecks` to
 * feed the loop review comments or CI failures without spawning a subprocess.
 */
function createFakePort(overrides: Partial<PrFeedbackPort> = {}): PrFeedbackPort {
  return {
    getRepoOwner: vi.fn().mockResolvedValue({ owner: "owner", repo: "repo" }),
    fetchReviewThreads: vi.fn().mockResolvedValue({ reviewDecision: null, threads: [] }),
    fetchChecks: vi.fn().mockResolvedValue([]),
    fetchFailedRunId: vi.fn().mockResolvedValue(null),
    fetchRunLogs: vi.fn().mockResolvedValue(""),
    ...overrides,
  };
}

/** Fresh injected deps: a fake `commitAndPush` + the given (or default) fake port. */
function makeDeps(feedbackPoller: PrFeedbackPort = createFakePort()): FeedbackLoopRunnerDeps {
  return {
    worktreeManager: {
      commitAndPush: vi.fn().mockResolvedValue(undefined),
      resolveRepoIdentity: vi.fn().mockResolvedValue({ owner: "owner", repo: "repo" }),
    },
    feedbackPoller,
  };
}

describe("runFeedbackLoop", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(createToolPermissionHandler).mockReturnValue(
      vi.fn().mockResolvedValue({ behavior: "allow" })
    );

    vi.mocked(buildReviewFixPrompt).mockReturnValue("Fix the issues");

    vi.mocked(query).mockReturnValue(
      createMockQueryStream([{ type: "result", subtype: "success" }]) as ReturnType<typeof query>
    );
  });

  it("resolves immediately when no feedback is found", async () => {
    const deps = makeDeps();

    const result = await runFeedbackLoop(BASE_PARAMS, deps);

    expect(result.resolved).toBe(true);
    expect(result.retriesUsed).toBe(0);
    expect(result.lastFingerprint).toBeNull();
    expect(vi.mocked(deps.worktreeManager.commitAndPush)).not.toHaveBeenCalled();
  });

  it("runs a fix session when feedback is found and resolves after one retry", async () => {
    const port = createFakePort({
      fetchReviewThreads: vi
        .fn()
        .mockResolvedValueOnce({ reviewDecision: "CHANGES_REQUESTED", threads: [UNRESOLVED_THREAD] })
        .mockResolvedValue({ reviewDecision: null, threads: [] }),
    });
    const deps = makeDeps(port);

    const result = await runFeedbackLoop(BASE_PARAMS, deps);

    expect(result.resolved).toBe(true);
    expect(result.retriesUsed).toBe(1);
    expect(result.lastFingerprint).toBe("thread-1");
    expect(buildReviewFixPrompt).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("delegates the commit to the injected worktreeManager.commitAndPush", async () => {
    const port = createFakePort({
      fetchReviewThreads: vi
        .fn()
        .mockResolvedValueOnce({ reviewDecision: "CHANGES_REQUESTED", threads: [UNRESOLVED_THREAD] })
        .mockResolvedValue({ reviewDecision: null, threads: [] }),
    });
    const deps = makeDeps(port);

    await runFeedbackLoop(BASE_PARAMS, deps);

    expect(vi.mocked(deps.worktreeManager.commitAndPush)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deps.worktreeManager.commitAndPush)).toHaveBeenCalledWith(
      BASE_PARAMS.repoPath,
      expect.stringContaining("address PR feedback")
    );
  });

  it("resolves owner/repo through the injected worktreeManager.resolveRepoIdentity", async () => {
    const deps = makeDeps();

    await runFeedbackLoop(BASE_PARAMS, deps);

    expect(vi.mocked(deps.worktreeManager.resolveRepoIdentity)).toHaveBeenCalledWith(
      BASE_PARAMS.repoPath
    );
  });

  it("routes all git/gh operations through the WorktreeManagerDeps seam (#3115)", async () => {
    // A review comment on the first poll, clean thereafter: the loop resolves
    // repo identity once, then commits+pushes the fix once — all via the
    // injected seam. child_process is never mocked here.
    const port = createFakePort({
      fetchReviewThreads: vi
        .fn()
        .mockResolvedValueOnce({ reviewDecision: "CHANGES_REQUESTED", threads: [UNRESOLVED_THREAD] })
        .mockResolvedValue({ reviewDecision: null, threads: [] }),
    });
    const deps = makeDeps(port);

    await runFeedbackLoop(BASE_PARAMS, deps);

    expect(vi.mocked(deps.worktreeManager.resolveRepoIdentity)).toHaveBeenCalledWith(
      BASE_PARAMS.repoPath
    );
    expect(vi.mocked(deps.worktreeManager.commitAndPush)).toHaveBeenCalledWith(
      BASE_PARAMS.repoPath,
      expect.stringContaining("address PR feedback")
    );
    // The port's getRepoOwner is no longer the loop's identity source.
    expect(vi.mocked(port.getRepoOwner)).not.toHaveBeenCalled();
  });

  it("escalates after exhausting maxRetries when feedback persists", async () => {
    // Persistent feedback: a review comment plus a CI failure on every poll, so
    // the fingerprint dedup never short-circuits the loop.
    const port = createFakePort({
      fetchReviewThreads: vi
        .fn()
        .mockResolvedValue({ reviewDecision: "CHANGES_REQUESTED", threads: [UNRESOLVED_THREAD] }),
      fetchChecks: vi.fn().mockResolvedValue([FAILING_CHECK]),
    });

    const params = { ...BASE_PARAMS, maxRetries: 2 };
    const result = await runFeedbackLoop(params, makeDeps(port));

    expect(result.resolved).toBe(false);
    expect(result.retriesUsed).toBe(2);
    expect(result.lastFingerprint).toBe("thread-1");
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("respects maxRetries config", async () => {
    const port = createFakePort({
      fetchReviewThreads: vi
        .fn()
        .mockResolvedValue({ reviewDecision: "CHANGES_REQUESTED", threads: [UNRESOLVED_THREAD] }),
      fetchChecks: vi.fn().mockResolvedValue([FAILING_CHECK]),
    });

    const params = { ...BASE_PARAMS, maxRetries: 1 };
    const result = await runFeedbackLoop(params, makeDeps(port));

    expect(result.retriesUsed).toBe(1);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("emits events correctly throughout the loop", async () => {
    const port = createFakePort({
      fetchReviewThreads: vi
        .fn()
        .mockResolvedValueOnce({ reviewDecision: "CHANGES_REQUESTED", threads: [UNRESOLVED_THREAD] })
        .mockResolvedValue({ reviewDecision: null, threads: [] }),
    });

    const events: SessionEvent[] = [];
    await runFeedbackLoop(BASE_PARAMS, makeDeps(port), (event) => events.push(event));

    const messages = events.map((e) => {
      const data = e.data;
      return typeof data === "object" && data !== null && "message" in data &&
        typeof data.message === "string"
        ? data.message
        : "";
    });

    expect(messages.some((m) => m.includes("waiting"))).toBe(true);
    expect(messages.some((m) => m.includes("found"))).toBe(true);
    expect(messages.some((m) => m.includes("fix session complete"))).toBe(true);
  });

  // ── AbortSignal cancellation (#3111) ───────────────────────────────

  describe("AbortSignal cancellation", () => {
    it("rejects with AbortError instead of polling when signal is already aborted", async () => {
      const port = createFakePort();
      const controller = new AbortController();
      controller.abort();

      const params = { ...BASE_PARAMS, signal: controller.signal };

      await expect(runFeedbackLoop(params, makeDeps(port))).rejects.toMatchObject({
        name: "AbortError",
      });
      expect(vi.mocked(port.fetchReviewThreads)).not.toHaveBeenCalled();
    });

    it("halts polling within one pollIntervalMs when cancel fires mid-wait, instead of running to pollTimeoutMs", async () => {
      const port = createFakePort();
      const controller = new AbortController();
      // pollIntervalMs/pollTimeoutMs are large so a passing test proves the
      // abort short-circuited the wait rather than the delay naturally elapsing.
      const params = {
        ...BASE_PARAMS,
        pollIntervalMs: 60_000,
        pollTimeoutMs: 600_000,
        maxRetries: 5,
        signal: controller.signal,
      };

      const resultPromise = runFeedbackLoop(params, makeDeps(port));
      const assertion = expect(resultPromise).rejects.toMatchObject({ name: "AbortError" });

      // Fire the abort almost immediately — well under one pollIntervalMs.
      setTimeout(() => controller.abort(), 5);

      await assertion;
      expect(vi.mocked(port.fetchReviewThreads)).not.toHaveBeenCalled();
    });

    it("does not push a commit when abort fires during the fix-session query", async () => {
      const port = createFakePort({
        fetchReviewThreads: vi
          .fn()
          .mockResolvedValue({ reviewDecision: "CHANGES_REQUESTED", threads: [UNRESOLVED_THREAD] }),
      });
      const controller = new AbortController();

      // Simulate a concurrent cancel() arriving once the fix-session query
      // starts: the mocked SDK stream stalls until the internal abortController
      // (bridged from `controller.signal`) fires.
      vi.mocked(query).mockImplementation((opts) => {
        const internalSignal = opts.options?.abortController?.signal;
        queueMicrotask(() => controller.abort());
        const done: IteratorResult<never> = { value: undefined, done: true };
        return {
          [Symbol.asyncIterator](): AsyncIterator<never> {
            return {
              next(): Promise<IteratorResult<never>> {
                const { promise, resolve } = Promise.withResolvers<IteratorResult<never>>();
                if (internalSignal?.aborted) {
                  resolve(done);
                } else {
                  internalSignal?.addEventListener("abort", () => resolve(done), { once: true });
                }
                return promise;
              },
            };
          },
        } as unknown as ReturnType<typeof query>;
      });

      const params = { ...BASE_PARAMS, signal: controller.signal };
      const deps = makeDeps(port);

      await expect(runFeedbackLoop(params, deps)).rejects.toMatchObject({ name: "AbortError" });
      expect(vi.mocked(deps.worktreeManager.commitAndPush)).not.toHaveBeenCalled();
    });
  });

  it("handles CI failures in feedback", async () => {
    // First poll surfaces a CI failure (no review comments); subsequent polls are clean.
    const port = createFakePort({
      fetchChecks: vi.fn().mockResolvedValueOnce([FAILING_CHECK]).mockResolvedValue([]),
    });

    const result = await runFeedbackLoop(BASE_PARAMS, makeDeps(port));

    expect(result.resolved).toBe(true);
    expect(result.retriesUsed).toBe(1);
    expect(buildReviewFixPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        ciFailures: [expect.objectContaining({ checkName: "lint", conclusion: "failure" })],
      })
    );
  });
});
