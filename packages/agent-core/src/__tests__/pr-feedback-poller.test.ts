import { describe, it, expect } from "vitest";
import {
  fetchUnresolvedComments,
  fetchCIFailures,
  pollForFeedback,
} from "../pr-feedback-poller.js";
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

describe("fetchUnresolvedComments", () => {
  it("extracts unresolved review threads via the injected port", async () => {
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

    const result = await fetchUnresolvedComments("owner", "repo", 42, "/repo", port);

    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].threadId).toBe("thread-1");
    expect(result.comments[0].body).toBe("Fix this");
    expect(result.reviewDecision).toBe("CHANGES_REQUESTED");
  });

  it("returns empty on port error", async () => {
    const port = createFakePort({
      fetchReviewThreads: async () => {
        throw new Error("gh not found");
      },
    });

    const result = await fetchUnresolvedComments("owner", "repo", 42, "/repo", port);

    expect(result.comments).toHaveLength(0);
    expect(result.reviewDecision).toBe("UNKNOWN");
  });
});

describe("fetchCIFailures", () => {
  it("returns empty when all checks pass", async () => {
    const port = createFakePort({
      fetchChecks: async () => [{ name: "test", state: "completed", conclusion: "success" }],
    });

    const failures = await fetchCIFailures(42, "/repo", 100, port);

    expect(failures).toHaveLength(0);
  });

  it("returns failures with log snippets", async () => {
    const port = createFakePort({
      fetchChecks: async () => [{ name: "test", state: "completed", conclusion: "failure" }],
      fetchFailedRunId: async () => 123,
      fetchRunLogs: async () => "FAIL tests/app.test.ts\nExpected: 200\nReceived: 500",
    });

    const failures = await fetchCIFailures(42, "/repo", 100, port);

    expect(failures).toHaveLength(1);
    expect(failures[0].checkName).toBe("test");
    expect(failures[0].logSnippet).toContain("Expected: 200");
  });

  it("falls back to a placeholder snippet when log retrieval fails", async () => {
    const port = createFakePort({
      fetchChecks: async () => [{ name: "test", state: "completed", conclusion: "failure" }],
      fetchFailedRunId: async () => {
        throw new Error("no runs");
      },
    });

    const failures = await fetchCIFailures(42, "/repo", 100, port);

    expect(failures).toHaveLength(1);
    expect(failures[0].logSnippet).toBe("(Could not fetch CI logs)");
  });
});

describe("pollForFeedback", () => {
  it("returns null when no new feedback", async () => {
    const port = createFakePort();

    const result = await pollForFeedback("owner", "repo", 42, "/repo", "", port);

    expect(result).toBeNull();
  });

  it("returns feedback when new comments appear", async () => {
    const port = createFakePort({
      fetchReviewThreads: async () => ({
        reviewDecision: "CHANGES_REQUESTED",
        threads: [
          {
            id: "thread-new",
            isResolved: false,
            comments: {
              nodes: [
                { body: "New comment", path: "src/app.ts", line: 5, author: { login: "reviewer" } },
              ],
            },
          },
        ],
      }),
    });

    const result = await pollForFeedback("owner", "repo", 42, "/repo", "old-fingerprint", port);

    expect(result).not.toBeNull();
    expect(result!.context.reviewComments).toHaveLength(1);
    expect(result!.fingerprint).toBe("thread-new");
  });

  it("returns null when fingerprint unchanged and no CI failures", async () => {
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

    const result = await pollForFeedback("owner", "repo", 42, "/repo", "thread-1", port);

    expect(result).toBeNull();
  });
});
