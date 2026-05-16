import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

describe("stats commands", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "cwd").mockReturnValue("/repo");
    mockExistsSync.mockImplementation((p: unknown) => String(p).includes("pnpm-workspace.yaml"));
  });

  async function runCmd(cmd: string, args: string[]): Promise<void> {
    if (cmd === "stats") {
      const { statsCommand } = await import("../commands/stats.js");
      await statsCommand.parseAsync(["node", "mbe", ...args]);
    }
  }

  describe("stats", () => {
    it("displays aggregated statistics", async () => {
      const mockLines = [
        JSON.stringify({
          sessionId: "s1",
          researchTurns: 2,
          executionTurns: 3,
          firstPassSuccess: true,
          humanInterventions: 0,
          costUsd: 0.1,
        }),
      ].join("\n");

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(mockLines);

      await runCmd("stats", []);

      const logOutput = logSpy.mock.calls.flat().join(" ");
      expect(logOutput).toContain("Total Sessions:         1");
    });
  });
});
