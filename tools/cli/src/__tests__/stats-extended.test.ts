import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, readFileSync, appendFileSync, mkdirSync, writeFileSync } from "node:fs";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockAppendFileSync = vi.mocked(appendFileSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

describe("stats extended commands", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    vi.spyOn(process, "cwd").mockReturnValue("/repo");
    mockExistsSync.mockImplementation((p: unknown) =>
      String(p).endsWith("pnpm-workspace.yaml") || String(p).includes("docs/logs")
    );
  });

  // ── log-session ───────────────────────────────────────────────────────────

  describe("log-session command", () => {
    async function runLogSession(args: string[]): Promise<void> {
      const { logSessionCommand } = await import("../commands/stats.js");
      await logSessionCommand.parseAsync(args, { from: "user" });
    }

    it("appends session record to log file", async () => {
      await runLogSession([
        "--id", "session-123",
        "--research", "3",
        "--execution", "5",
        "--success",
        "--cost", "0.15",
        "--model", "claude-sonnet-4-6",
      ]);

      expect(mockAppendFileSync).toHaveBeenCalledOnce();
      const [filePath, content] = mockAppendFileSync.mock.calls[0];
      expect(String(filePath)).toContain("agent-perf.jsonl");
      const record = JSON.parse(String(content).trim());
      expect(record.sessionId).toBe("session-123");
      expect(record.researchTurns).toBe(3);
      expect(record.executionTurns).toBe(5);
      expect(record.totalTurns).toBe(8);
      expect(record.firstPassSuccess).toBe(true);
      expect(record.costUsd).toBe(0.15);
      expect(record.modelId).toBe("claude-sonnet-4-6");

      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("session-123");
      expect(output).toContain("logged");
    });

    it("creates log directory if missing", async () => {
      mockExistsSync.mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith("pnpm-workspace.yaml")) return true;
        return false; // docs/logs does not exist
      });

      await runLogSession([
        "--id", "s1",
        "--research", "1",
        "--execution", "2",
      ]);

      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining("docs/logs"),
        { recursive: true }
      );
    });

    it("records milestone when provided", async () => {
      await runLogSession([
        "--id", "s2",
        "--research", "1",
        "--execution", "1",
        "--milestone", "v1.5",
      ]);

      const [, content] = mockAppendFileSync.mock.calls[0];
      const record = JSON.parse(String(content).trim());
      expect(record.milestone).toBe("v1.5");
    });
  });

  // ── stats (no-data path) ──────────────────────────────────────────────────

  describe("stats command (no data)", () => {
    async function runStats(): Promise<void> {
      const { statsCommand } = await import("../commands/stats.js");
      await statsCommand.parseAsync([], { from: "user" });
    }

    it("prints no-data message when log file does not exist", async () => {
      mockExistsSync.mockImplementation((p: unknown) => {
        const path = String(p);
        return path.endsWith("pnpm-workspace.yaml");
        // logFile not found
      });

      await runStats();

      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("No performance data found");
    });
  });

  // ── audit-perf ─────────────────────────────────────────────────────────────

  describe("audit-perf command", () => {
    async function runAuditPerf(args: string[] = []): Promise<void> {
      const { auditPerfCommand } = await import("../commands/stats.js");
      await auditPerfCommand.parseAsync(args, { from: "user" });
    }

    it("prints no-data message when log file does not exist", async () => {
      mockExistsSync.mockImplementation((p: unknown) =>
        String(p).endsWith("pnpm-workspace.yaml")
      );

      await runAuditPerf();

      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("No performance data found");
    });

    it("shows no bottlenecks when data is clean", async () => {
      mockExistsSync.mockReturnValue(true);
      const cleanRecord = {
        sessionId: "s1",
        researchTurns: 2,
        executionTurns: 3,
        firstPassSuccess: true,
        humanInterventions: 0,
        costUsd: 0.1,
        modelId: "claude-sonnet-4-6",
        timestamp: new Date().toISOString(),
        totalTurns: 5,
      };
      mockReadFileSync.mockReturnValue(JSON.stringify(cleanRecord) as never);

      await runAuditPerf();

      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("No significant process bottlenecks detected");
    });

    it("detects high research turns", async () => {
      mockExistsSync.mockReturnValue(true);
      const record = {
        sessionId: "s1",
        researchTurns: 9,
        executionTurns: 3,
        firstPassSuccess: true,
        humanInterventions: 0,
        costUsd: 0.1,
        modelId: "claude-sonnet-4-6",
        timestamp: new Date().toISOString(),
        totalTurns: 12,
      };
      mockReadFileSync.mockReturnValue(JSON.stringify(record) as never);

      await runAuditPerf();

      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("High Research Turns detected");
    });

    it("detects low first-pass success rate", async () => {
      mockExistsSync.mockReturnValue(true);
      const records = [
        { sessionId: "s1", researchTurns: 2, executionTurns: 3, firstPassSuccess: false, humanInterventions: 0, costUsd: 0.1, modelId: "m", timestamp: "t", totalTurns: 5 },
        { sessionId: "s2", researchTurns: 2, executionTurns: 3, firstPassSuccess: false, humanInterventions: 0, costUsd: 0.1, modelId: "m", timestamp: "t", totalTurns: 5 },
        { sessionId: "s3", researchTurns: 2, executionTurns: 3, firstPassSuccess: false, humanInterventions: 0, costUsd: 0.1, modelId: "m", timestamp: "t", totalTurns: 5 },
      ];
      mockReadFileSync.mockReturnValue(records.map(r => JSON.stringify(r)).join("\n") as never);

      await runAuditPerf();

      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("failed on first pass");
    });

    it("detects human interventions", async () => {
      mockExistsSync.mockReturnValue(true);
      const record = {
        sessionId: "s1",
        researchTurns: 2,
        executionTurns: 3,
        firstPassSuccess: true,
        humanInterventions: 2,
        costUsd: 0.1,
        modelId: "m",
        timestamp: "t",
        totalTurns: 5,
      };
      mockReadFileSync.mockReturnValue(JSON.stringify(record) as never);

      await runAuditPerf();

      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("Human interventions detected");
    });

    it("creates auto-plan when --auto-plan is provided and improvements exist", async () => {
      mockExistsSync.mockReturnValue(true);
      const record = {
        sessionId: "s1",
        researchTurns: 2,
        executionTurns: 3,
        firstPassSuccess: false,
        humanInterventions: 2,
        costUsd: 0.1,
        modelId: "m",
        timestamp: "t",
        totalTurns: 5,
      };
      mockReadFileSync.mockReturnValue(JSON.stringify(record) as never);

      await runAuditPerf(["--auto-plan"]);

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining("AUTO-PERF-OPTIMIZATION.md"),
        expect.stringContaining("Auto-Generated Performance Optimization")
      );

      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("Created autonomous optimization plan");
    });
  });
});
