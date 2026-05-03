import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:util", () => ({
  promisify: vi.fn((fn: unknown) => fn),
}));

import { execFile } from "node:child_process";
import {
  fetchUnresolvedComments,
  fetchCIFailures,
  pollForFeedback,
} from "../pr-feedback-poller.js";

const mockExecFile = vi.mocked(
  execFile as unknown as (...args: unknown[]) => Promise<{ stdout: string }>
);

describe("fetchUnresolvedComments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts unresolved review threads", async () => {
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
              },
            },
          },
        },
      }),
    });

    const result = await fetchUnresolvedComments("owner", "repo", 42, "/repo");

    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].threadId).toBe("thread-1");
    expect(result.comments[0].body).toBe("Fix this");
    expect(result.reviewDecision).toBe("CHANGES_REQUESTED");
  });

  it("returns empty on API error", async () => {
    mockExecFile.mockRejectedValue(new Error("gh not found"));

    const result = await fetchUnresolvedComments("owner", "repo", 42, "/repo");

    expect(result.comments).toHaveLength(0);
    expect(result.reviewDecision).toBe("UNKNOWN");
  });
});

describe("fetchCIFailures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty when all checks pass", async () => {
    mockExecFile.mockResolvedValue({
      stdout: JSON.stringify([{ name: "test", state: "completed", conclusion: "success" }]),
    });

    const failures = await fetchCIFailures(42, "/repo");

    expect(failures).toHaveLength(0);
  });

  it("returns failures with log snippets", async () => {
    // First call: pr checks
    mockExecFile
      .mockResolvedValueOnce({
        stdout: JSON.stringify([{ name: "test", state: "completed", conclusion: "failure" }]),
      })
      // Second call: run list
      .mockResolvedValueOnce({
        stdout: JSON.stringify([{ databaseId: 123 }]),
      })
      // Third call: run view --log-failed
      .mockResolvedValueOnce({
        stdout: "FAIL tests/app.test.ts\nExpected: 200\nReceived: 500",
      });

    const failures = await fetchCIFailures(42, "/repo");

    expect(failures).toHaveLength(1);
    expect(failures[0].checkName).toBe("test");
    expect(failures[0].logSnippet).toContain("Expected: 200");
  });
});

describe("pollForFeedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no new feedback", async () => {
    // Review comments call
    mockExecFile
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          data: {
            repository: {
              pullRequest: {
                reviewDecision: null,
                reviewThreads: { nodes: [] },
              },
            },
          },
        }),
      })
      // CI checks call
      .mockResolvedValueOnce({
        stdout: JSON.stringify([]),
      });

    const result = await pollForFeedback("owner", "repo", 42, "/repo", "");

    expect(result).toBeNull();
  });

  it("returns feedback when new comments appear", async () => {
    mockExecFile
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          data: {
            repository: {
              pullRequest: {
                reviewDecision: "CHANGES_REQUESTED",
                reviewThreads: {
                  nodes: [
                    {
                      id: "thread-new",
                      isResolved: false,
                      comments: {
                        nodes: [
                          {
                            body: "New comment",
                            path: "src/app.ts",
                            line: 5,
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
      })
      .mockResolvedValueOnce({
        stdout: JSON.stringify([]),
      });

    const result = await pollForFeedback("owner", "repo", 42, "/repo", "old-fingerprint");

    expect(result).not.toBeNull();
    expect(result!.context.reviewComments).toHaveLength(1);
    expect(result!.fingerprint).toBe("thread-new");
  });

  it("returns null when fingerprint unchanged and no CI failures", async () => {
    mockExecFile
      .mockResolvedValueOnce({
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
                            body: "Same old comment",
                            path: "src/app.ts",
                            line: 5,
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
      })
      .mockResolvedValueOnce({
        stdout: JSON.stringify([]),
      });

    const result = await pollForFeedback("owner", "repo", 42, "/repo", "thread-1");

    expect(result).toBeNull();
  });
});
