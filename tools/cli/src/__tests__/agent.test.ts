import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @mbe/agent-core
vi.mock("@mbe/agent-core", () => ({
  runSession: vi.fn(),
  DEFAULT_SESSION_CONFIG: { model: "test-model" },
  DEFAULT_FEEDBACK_LOOP_CONFIG: {},
  resolveBudget: vi.fn((b) => b),
  resolveModel: vi.fn((m) => m),
  routeModelWithReason: vi.fn((m) => ({ model: m, reason: "test" })),
  sanitizeForCommitMessage: vi.fn((m) => m),
}));

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("agent command", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit called with ${code}`);
    });
  });

  async function runAgent(args: string[]): Promise<void> {
    const { agentCommand } = await import("../commands/agent.js");
    await agentCommand.parseAsync(["node", "mbe", ...args]);
  }

  describe("list", () => {
    it("lists sessions from the API", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "sess-1",
              status: "running",
              taskDescription: "Fix bugs",
              model: "claude-3",
              maxBudgetUsd: 1.0,
              maxTurns: 50,
              createdAt: new Date().toISOString(),
              errors: [],
              costUsd: null,
              numTurns: null,
              durationMs: null,
            },
          ],
          pagination: { total: 1, page: 1, totalPages: 1 },
        }),
      });

      await runAgent(["list"]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/v1/sessions"),
        expect.anything()
      );
      const logOutput = logSpy.mock.calls.flat().join(" ");
      expect(logOutput).toContain("sess-1");
      expect(logOutput).toContain("running");
      expect(logOutput).toContain("Fix bugs");
    });

    it("handles API errors gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: async () => ({ message: "API Error Message" }),
      });

      await expect(runAgent(["list"])).rejects.toThrow("process.exit called with 1");
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("API Error Message"));
    });
  });

  describe("status", () => {
    it("views a specific session status", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            id: "sess-2",
            status: "succeeded",
            taskDescription: "Improve tests",
            model: "claude-3",
            maxBudgetUsd: 1.0,
            maxTurns: 50,
            createdAt: new Date().toISOString(),
            errors: [],
            costUsd: 0.05,
            numTurns: 10,
            durationMs: 60000,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            inputTokens: 1000,
            outputTokens: 500,
            branchName: "agent/test",
            prUrl: "https://github.com/test/pull/1",
          },
        }),
      });

      await runAgent(["status", "sess-2"]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/v1/sessions/sess-2"),
        expect.anything()
      );
      const logOutput = logSpy.mock.calls.flat().join(" ");
      expect(logOutput).toContain("sess-2");
      expect(logOutput).toContain("succeeded");
      expect(logOutput).toContain("Improve tests");
    });
  });
});
