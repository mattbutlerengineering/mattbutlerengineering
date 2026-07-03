import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:util", () => ({
  promisify: vi.fn((fn: unknown) => fn),
}));

import { execFile } from "node:child_process";
import { ghPrFeedbackPort } from "../pr-feedback-port.js";

const mockExecFile = vi.mocked(
  execFile as unknown as (...args: unknown[]) => Promise<{ stdout: string }>
);

describe("ghPrFeedbackPort", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetchReviewThreads parses the GraphQL response into a ReviewThreadsResult", async () => {
    mockExecFile.mockResolvedValue({
      stdout: JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              reviewDecision: "CHANGES_REQUESTED",
              reviewThreads: {
                nodes: [
                  {
                    id: "thread-1",
                    isResolved: false,
                    comments: {
                      nodes: [
                        {
                          body: "Fix this",
                          path: "src/app.ts",
                          line: 10,
                          author: { login: "reviewer" },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      }),
    });

    const result = await ghPrFeedbackPort.fetchReviewThreads("owner", "repo", 42, "/repo");

    expect(result.reviewDecision).toBe("CHANGES_REQUESTED");
    expect(result.threads).toHaveLength(1);
    expect(result.threads[0].id).toBe("thread-1");
  });

  it("fetchChecks parses the checks JSON array", async () => {
    mockExecFile.mockResolvedValue({
      stdout: JSON.stringify([{ name: "test", state: "completed", conclusion: "failure" }]),
    });

    const checks = await ghPrFeedbackPort.fetchChecks(42, "/repo");

    expect(checks).toEqual([{ name: "test", state: "completed", conclusion: "failure" }]);
  });

  it("fetchFailedRunId returns the first databaseId or null", async () => {
    mockExecFile.mockResolvedValueOnce({ stdout: JSON.stringify([{ databaseId: 123 }]) });
    await expect(ghPrFeedbackPort.fetchFailedRunId("/repo")).resolves.toBe(123);

    mockExecFile.mockResolvedValueOnce({ stdout: JSON.stringify([]) });
    await expect(ghPrFeedbackPort.fetchFailedRunId("/repo")).resolves.toBeNull();
  });

  it("fetchRunLogs returns the raw log output", async () => {
    mockExecFile.mockResolvedValue({
      stdout: "FAIL tests/app.test.ts\nExpected: 200\nReceived: 500",
    });

    const logs = await ghPrFeedbackPort.fetchRunLogs(123, "/repo");

    expect(logs).toContain("Expected: 200");
  });

  it("passes a numeric timeout on every gh call", async () => {
    mockExecFile.mockImplementation(async (...args: unknown[]) => {
      const argList = args[1] as string[];
      if (argList[0] === "pr" && argList[1] === "checks") {
        return {
          stdout: JSON.stringify([{ name: "test", state: "completed", conclusion: "failure" }]),
        };
      }
      if (argList[0] === "run" && argList[1] === "list") {
        return { stdout: JSON.stringify([{ databaseId: 123 }]) };
      }
      if (argList[0] === "run" && argList[1] === "view") {
        return { stdout: "FAIL" };
      }
      return {
        stdout: JSON.stringify({
          data: {
            repository: { pullRequest: { reviewDecision: null, reviewThreads: { nodes: [] } } },
          },
        }),
      };
    });

    await ghPrFeedbackPort.fetchReviewThreads("owner", "repo", 42, "/repo");
    await ghPrFeedbackPort.fetchChecks(42, "/repo");
    await ghPrFeedbackPort.fetchFailedRunId("/repo");
    await ghPrFeedbackPort.fetchRunLogs(123, "/repo");

    expect(mockExecFile.mock.calls.length).toBeGreaterThan(0);
    for (const call of mockExecFile.mock.calls) {
      const options = call[2] as { timeout?: number } | undefined;
      expect(typeof options?.timeout).toBe("number");
      expect(options?.timeout).toBeGreaterThan(0);
    }
  });
});
