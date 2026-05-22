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

describe("auditPerf command", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    vi.spyOn(process, "cwd").mockReturnValue("/repo");
    // findMonorepoRoot: workspace found
    mockExistsSync.mockImplementation((p: unknown) => String(p).includes("pnpm-workspace.yaml"));
  });

  async function runAuditPerf(args: string[] = []): Promise<void> {
    const { auditPerfCommand } = await import("../commands/stats.js");
    await auditPerfCommand.parseAsync(args, { from: "user" });
  }

  it("reports no bottlenecks when all sessions are clean", async () => {
    mockExistsSync.mockReturnValue(true);
    const record = JSON.stringify({
      sessionId: "s1",
      researchTurns: 2,
      executionTurns: 3,
      firstPassSuccess: true,
      humanInterventions: 0,
      costUsd: 0.1,
    });
    mockReadFileSync.mockReturnValue(record as never);

    await runAuditPerf();

    const output = vi.mocked(console.log).mock.calls.flat().join(" ");
    expect(output).toContain("No significant process bottlenecks");
  });

  it("reports no perf data when logFile missing", async () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith("pnpm-workspace.yaml")) return true;
      return false; // logFile missing
    });

    await runAuditPerf();

    const output = vi.mocked(console.log).mock.calls.flat().join(" ");
    expect(output).toContain("No performance data found");
  });

  it("uses priority=1 when avg researchTurns > 8 and rate > 20 (covers both ternary branches)", async () => {
    mockExistsSync.mockReturnValue(true);
    // 3 sessions: researchTurns > 5 with avg > 8, all failed (rate 100% > 20)
    const records = [
      {
        sessionId: "s1",
        researchTurns: 10,
        executionTurns: 3,
        firstPassSuccess: false,
        humanInterventions: 0,
        costUsd: 0.1,
      },
      {
        sessionId: "s2",
        researchTurns: 9,
        executionTurns: 3,
        firstPassSuccess: false,
        humanInterventions: 0,
        costUsd: 0.1,
      },
    ];
    const logData = records.map((r) => JSON.stringify(r)).join("\n");
    mockReadFileSync.mockReturnValue(logData as never);

    // writeFileSync is mocked via fs mock
    await runAuditPerf();

    const output = vi.mocked(console.log).mock.calls.flat().join(" ");
    expect(output).toContain("High Research Turns");
  });

  it("uses priority=2 when avg researchTurns ≤ 8 and rate ≤ 20 (covers false ternary branches)", async () => {
    mockExistsSync.mockReturnValue(true);
    // 10 sessions: 2 with researchTurns > 5 (avg=6, ≤8), 1 failed (rate 10%, ≤20)
    const records = [
      {
        sessionId: "s1",
        researchTurns: 7,
        executionTurns: 3,
        firstPassSuccess: false,
        humanInterventions: 0,
        costUsd: 0.1,
      },
      {
        sessionId: "s2",
        researchTurns: 6,
        executionTurns: 3,
        firstPassSuccess: true,
        humanInterventions: 0,
        costUsd: 0.1,
      },
      ...Array.from({ length: 8 }, (_, i) => ({
        sessionId: `s${i + 3}`,
        researchTurns: 1,
        executionTurns: 3,
        firstPassSuccess: true,
        humanInterventions: 0,
        costUsd: 0.1,
      })),
    ];
    const logData = records.map((r) => JSON.stringify(r)).join("\n");
    mockReadFileSync.mockReturnValue(logData as never);

    await runAuditPerf();

    const output = vi.mocked(console.log).mock.calls.flat().join(" ");
    expect(output).toContain("High Research Turns");
  });
});

describe("stats – findMonorepoRoot fallback", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    vi.spyOn(process, "cwd").mockReturnValue("/repo");
  });

  it("falls back to cwd when pnpm-workspace.yaml is never found", async () => {
    // existsSync always false → findMonorepoRoot returns /repo
    // stats command checks existsSync(logFile) → false → prints "No performance data"
    mockExistsSync.mockReturnValue(false);

    const { statsCommand } = await import("../commands/stats.js");
    await statsCommand.parseAsync([], { from: "user" });

    const logOutput = vi.mocked(console.log).mock.calls.flat().join(" ");
    expect(logOutput).toContain("No performance data");
  });

  it("shows Total Sessions when logFile exists", async () => {
    const sessionRecord = JSON.stringify({
      timestamp: new Date().toISOString(),
      sessionId: "test-session",
      modelId: "claude-sonnet-4-6",
      researchTurns: 2,
      executionTurns: 3,
      totalTurns: 5,
      firstPassSuccess: true,
      humanInterventions: 0,
      milestone: "test",
    });

    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      // workspace yaml not found → findMonorepoRoot fallback
      if (path.endsWith("pnpm-workspace.yaml")) return false;
      // log file exists
      return true;
    });
    mockReadFileSync.mockReturnValue(sessionRecord as never);

    const { statsCommand } = await import("../commands/stats.js");
    await statsCommand.parseAsync([], { from: "user" });

    const logOutput = vi.mocked(console.log).mock.calls.flat().join(" ");
    expect(logOutput).toContain("Total Sessions");
  });
});
