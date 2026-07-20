import { describe, it, expect } from "vitest";
import { createFeedbackPoller } from "../pr-feedback-poller.js";
import type { PrFeedbackPort } from "../pr-feedback-port.js";

/** Fake PrFeedbackPort for tests — no `gh` binary, no child_process mocking. */
function createFakePort(overrides: Partial<PrFeedbackPort> = {}): PrFeedbackPort {
  return {
    getRepoOwner: async () => ({ owner: "owner", repo: "repo" }),
    fetchReviewThreads: async () => ({ reviewDecision: null, threads: [] }),
    fetchChecks: async () => [],
    fetchFailedRunId: async () => null,
    fetchRunLogs: async () => "",
    ...overrides,
  };
}

describe("createFeedbackPoller().poll()", () => {
  it("returns null when there is no feedback at all", async () => {
    const poller = createFeedbackPoller("owner", "repo", "/repo", createFakePort());

    const result = await poller.poll(42, "");

    expect(result).toBeNull();
  });

  it("returns feedback with unresolved review comments only", async () => {
    const port = createFakePort({
      fetchReviewThreads: async () => ({
        reviewDecision: "CHANGES_REQUESTED",
        threads: [
          {
            id: "thread-1",
            isResolved: false,
            comments: {
              nodes: [
                { body: "Fix this", path: "src/app.ts", line: 10, author: { login: "reviewer" } },
              ],
            },
          },
          {
            id: "thread-2",
            isResolved: true,
            comments: {
              nodes: [
                {
                  body: "Already fixed",
                  path: "src/old.ts",
                  line: 5,
                  author: { login: "reviewer" },
                },
              ],
            },
          },
        ],
      }),
    });
    const poller = createFeedbackPoller("owner", "repo", "/repo", port);

    const result = await poller.poll(42, "");

    expect(result).not.toBeNull();
    expect(result!.context.reviewComments).toHaveLength(1);
    expect(result!.context.reviewComments[0].threadId).toBe("thread-1");
    expect(result!.context.reviewComments[0].body).toBe("Fix this");
    expect(result!.context.reviewDecision).toBe("CHANGES_REQUESTED");
    expect(result!.context.ciFailures).toHaveLength(0);
    expect(result!.fingerprint).toBe("thread-1");
  });

  it("returns feedback with CI failures only, including a log snippet", async () => {
    const port = createFakePort({
      fetchChecks: async () => [{ name: "test", state: "completed", conclusion: "failure" }],
      fetchFailedRunId: async () => 123,
      fetchRunLogs: async () => "FAIL tests/app.test.ts\nExpected: 200\nReceived: 500",
    });
    const poller = createFeedbackPoller("owner", "repo", "/repo", port);

    const result = await poller.poll(42, "");

    expect(result).not.toBeNull();
    expect(result!.context.reviewComments).toHaveLength(0);
    expect(result!.context.ciFailures).toHaveLength(1);
    expect(result!.context.ciFailures[0].checkName).toBe("test");
    expect(result!.context.ciFailures[0].logSnippet).toContain("Expected: 200");
  });

  it("returns feedback with both unresolved comments and CI failures", async () => {
    const port = createFakePort({
      fetchReviewThreads: async () => ({
        reviewDecision: "CHANGES_REQUESTED",
        threads: [
          {
            id: "thread-1",
            isResolved: false,
            comments: {
              nodes: [
                { body: "Fix this", path: "src/app.ts", line: 10, author: { login: "reviewer" } },
              ],
            },
          },
        ],
      }),
      fetchChecks: async () => [{ name: "lint", state: "completed", conclusion: "failure" }],
    });
    const poller = createFeedbackPoller("owner", "repo", "/repo", port);

    const result = await poller.poll(42, "");

    expect(result).not.toBeNull();
    expect(result!.context.reviewComments).toHaveLength(1);
    expect(result!.context.ciFailures).toHaveLength(1);
  });

  it("returns null when fingerprint is unchanged and no CI failures", async () => {
    const port = createFakePort({
      fetchReviewThreads: async () => ({
        reviewDecision: "CHANGES_REQUESTED",
        threads: [
          {
            id: "thread-1",
            isResolved: false,
            comments: {
              nodes: [
                {
                  body: "Same old comment",
                  path: "src/app.ts",
                  line: 5,
                  author: { login: "reviewer" },
                },
              ],
            },
          },
        ],
      }),
    });
    const poller = createFeedbackPoller("owner", "repo", "/repo", port);

    const result = await poller.poll(42, "thread-1");

    expect(result).toBeNull();
  });

  it("returns fresh feedback again even with an unchanged fingerprint when CI failures are present", async () => {
    const port = createFakePort({
      fetchReviewThreads: async () => ({
        reviewDecision: "CHANGES_REQUESTED",
        threads: [
          {
            id: "thread-1",
            isResolved: false,
            comments: {
              nodes: [
                {
                  body: "Still broken",
                  path: "src/app.ts",
                  line: 5,
                  author: { login: "reviewer" },
                },
              ],
            },
          },
        ],
      }),
      fetchChecks: async () => [{ name: "test", state: "completed", conclusion: "failure" }],
    });
    const poller = createFeedbackPoller("owner", "repo", "/repo", port);

    const result = await poller.poll(42, "thread-1");

    expect(result).not.toBeNull();
    expect(result!.context.ciFailures).toHaveLength(1);
  });

  it("falls back to UNKNOWN review decision and empty comments on port error", async () => {
    const port = createFakePort({
      fetchReviewThreads: async () => {
        throw new Error("gh not found");
      },
      fetchChecks: async () => [{ name: "test", state: "completed", conclusion: "failure" }],
    });
    const poller = createFeedbackPoller("owner", "repo", "/repo", port);

    const result = await poller.poll(42, "");

    expect(result).not.toBeNull();
    expect(result!.context.reviewComments).toHaveLength(0);
    expect(result!.context.reviewDecision).toBe("UNKNOWN");
  });
});
