import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type * as AgentCore from "@mbe/agent-core";

const mockLoadSuite = vi.fn();
const mockRunAgentSession = vi.fn();
const mockResolveSessionAdapter = vi.fn();
const mockAppendFileSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();

// Static import keeps the heavy module load (real @mbe/agent-core via
// importOriginal) in file setup, outside the per-test timeout window.
// vi.mock factories below are hoisted above this import by vitest.
import { agentEvalCommand } from "../commands/agent-eval.js";

// Keep the real harness/scorer/types; stub only the suite loader + the
// adapter-resolved session seam (resolveSessionAdapter + runAgentSession —
// the same seam `mbe agent run` uses, per #4199). Note: `runSession` (the
// raw SDK entry point) is deliberately NOT mocked here anymore — agent-eval
// no longer calls it directly, and ClaudeAdapter imports it via a relative
// path internal to @mbe/agent-core, so mocking the package's `runSession`
// export would silently no-op against the adapter-routed call.
vi.mock("@mbe/agent-core", async (orig) => {
  const actual = await orig<typeof AgentCore>();
  return {
    ...actual,
    loadSuite: (...a: unknown[]) => mockLoadSuite(...a),
    resolveSessionAdapter: (...a: unknown[]) => {
      mockResolveSessionAdapter(...a);
      return { name: String(a[0]), runSession: () => {} };
    },
    runAgentSession: (...a: unknown[]) => mockRunAgentSession(...a),
  };
});

// verify() shells out via promisify(execFile); make it resolve (checks pass).
vi.mock("node:child_process", () => ({
  execFile: (
    _cmd: string,
    _args: string[],
    optsOrCb: unknown,
    cb?: (err: unknown, res: { stdout: string; stderr: string }) => void
  ) => {
    const callback = typeof optsOrCb === "function" ? optsOrCb : cb;
    (callback as (e: unknown, r: { stdout: string; stderr: string }) => void)(null, {
      stdout: "",
      stderr: "",
    });
  },
}));

vi.mock("node:fs", () => ({
  existsSync: (...a: unknown[]) => mockExistsSync(...a),
  mkdirSync: (...a: unknown[]) => mockMkdirSync(...a),
  appendFileSync: (...a: unknown[]) => mockAppendFileSync(...a),
  readFileSync: (...a: unknown[]) => mockReadFileSync(...a),
}));

function fakeSession(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "s1",
    status: "completed",
    branchName: "agent/t1",
    prUrl: null,
    costUsd: 0.2,
    tokenUsage: { inputTokens: 0, outputTokens: 0 },
    durationMs: 1,
    numTurns: 5,
    resultText: "",
    errors: [],
    evaluation: { passed: true, confidence: 0.9, reasoning: "ok" },
    ...overrides,
  };
}

const task = {
  id: "t1",
  category: "bugfix",
  prompt: "fix it",
  fixtureRef: "services/reservations",
  rubric: { testsMustPass: true, typecheckMustPass: true, lintMustPass: false, judgeCriteria: [] },
  budget: { maxTurns: 50, maxCostUsd: 1 },
};

describe("agent eval command", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.exitCode = 0;
    mockExistsSync.mockReturnValue(true);
  });

  it("runs the suite and prints a report", async () => {
    mockLoadSuite.mockResolvedValue([task]);
    mockRunAgentSession.mockResolvedValue(fakeSession());

    await agentEvalCommand.parseAsync(["--task", "t1"], { from: "user" });

    const out = logSpy.mock.calls.flat().join("\n");
    expect(out).toContain("Eval Report");
    expect(out).toContain("t1");
    expect(out).toContain("Pass rate");
    expect(process.exitCode).toBe(0);
  });

  it("emits JSON with --json", async () => {
    mockLoadSuite.mockResolvedValue([task]);
    mockRunAgentSession.mockResolvedValue(fakeSession());

    await agentEvalCommand.parseAsync(["--json"], { from: "user" });

    const out = logSpy.mock.calls.flat().join("\n");
    const parsed = JSON.parse(out);
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.aggregate.total).toBe(1);
  });

  it("exits 1 when the suite directory cannot be loaded", async () => {
    mockLoadSuite.mockRejectedValue(new Error("no suite dir"));

    await agentEvalCommand.parseAsync([], { from: "user" });

    expect(process.exitCode).toBe(1);
    expect(errSpy.mock.calls.flat().join("\n")).toContain("no suite dir");
  });

  it("exits 1 when pass rate is below --threshold", async () => {
    mockLoadSuite.mockResolvedValue([task]);
    // Over budget → withinBudget false → task fails → pass rate 0
    mockRunAgentSession.mockResolvedValue(fakeSession({ costUsd: 99 }));

    await agentEvalCommand.parseAsync(["--threshold", "50"], { from: "user" });

    expect(process.exitCode).toBe(1);
  });

  it("still exits 1 via --threshold and records the entry for a genuine (non-zero-turn) low score", async () => {
    mockLoadSuite.mockResolvedValue([task]);
    // Genuine run: real turns/cost, but over budget → fails rubric → low score
    mockRunAgentSession.mockResolvedValue(fakeSession({ costUsd: 99, numTurns: 12 }));

    await agentEvalCommand.parseAsync(["--threshold", "50"], { from: "user" });

    expect(process.exitCode).toBe(1);
    expect(mockAppendFileSync).toHaveBeenCalledOnce();
  });

  describe("mixed suite (some but not all tasks did not run)", () => {
    const taskA = { ...task, id: "a", prompt: "fix a" };
    const taskB = { ...task, id: "b", prompt: "fix b" };
    const taskC = { ...task, id: "c", prompt: "fix c" };

    it("persists the report and excludes the non-run task from the aggregate, without a NO_RUN exit code", async () => {
      mockLoadSuite.mockResolvedValue([taskA, taskB, taskC]);
      mockRunAgentSession.mockImplementation(async (config: { taskDescription: string }) => {
        // "a" never ran: 0 turns / $0 cost, e.g. a broken fixtureRef.
        if (config.taskDescription === "fix a") return fakeSession({ numTurns: 0, costUsd: 0 });
        return fakeSession();
      });

      await agentEvalCommand.parseAsync([], { from: "user" });

      // Not the NO_RUN_EXIT_CODE (2) — a partially-genuine suite still persists.
      expect(process.exitCode).toBe(0);
      expect(mockAppendFileSync).toHaveBeenCalledOnce();

      const [, line] = mockAppendFileSync.mock.calls[0] as [string, string];
      const record = JSON.parse(line.trim());
      expect(record.tasks).toHaveLength(3);
      expect(record.nonRunCount).toBe(1);
      // Aggregate covers only the 2 genuine tasks, not diluted by the non-run one.
      expect(record.aggregate.total).toBe(2);
      expect(record.aggregate.passRate).toBe(1);

      const out = logSpy.mock.calls.flat().join("\n");
      expect(out).toContain("Excluded (did not run): 1");
    });
  });

  describe("no-credentials / non-run detection", () => {
    const originalApiKey = process.env["ANTHROPIC_API_KEY"];

    beforeEach(() => {
      delete process.env["ANTHROPIC_API_KEY"];
    });

    afterEach(() => {
      if (originalApiKey !== undefined) {
        process.env["ANTHROPIC_API_KEY"] = originalApiKey;
      }
    });

    it("exits non-zero (distinct from --threshold's exit 1), names the missing prerequisite, and does not persist when every task reports 0 turns / $0 cost", async () => {
      mockLoadSuite.mockResolvedValue([task]);
      mockRunAgentSession.mockResolvedValue(fakeSession({ numTurns: 0, costUsd: 0 }));

      await agentEvalCommand.parseAsync(["--threshold", "50"], { from: "user" });

      expect(process.exitCode).not.toBe(0);
      expect(process.exitCode).not.toBe(1);
      expect(mockAppendFileSync).not.toHaveBeenCalled();
      const errOut = errSpy.mock.calls.flat().join("\n");
      expect(errOut.toLowerCase()).toContain("anthropic_api_key");
    });
  });

  describe("--adapter selection", () => {
    it.each([["auto"], ["claude"], ["gemini"], ["opencode"]] as const)(
      "resolves the %s adapter and passes it to runAgentSession",
      async (adapter) => {
        mockLoadSuite.mockResolvedValue([task]);
        mockRunAgentSession.mockResolvedValue(fakeSession());

        await agentEvalCommand.parseAsync(["--adapter", adapter], { from: "user" });

        expect(mockResolveSessionAdapter).toHaveBeenCalledWith(adapter);
        expect(mockRunAgentSession).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ adapter: expect.objectContaining({ name: adapter }) })
        );
        expect(process.exitCode).toBe(0);
      }
    );

    it("defaults to the claude adapter, matching `mbe agent run`'s default", async () => {
      mockLoadSuite.mockResolvedValue([task]);
      mockRunAgentSession.mockResolvedValue(fakeSession());

      await agentEvalCommand.parseAsync([], { from: "user" });

      expect(mockResolveSessionAdapter).toHaveBeenCalledWith("claude");
    });

    it("rejects an invalid --adapter value without touching the resolver", async () => {
      mockLoadSuite.mockResolvedValue([task]);

      await agentEvalCommand.parseAsync(["--adapter", "bogus"], { from: "user" });

      expect(process.exitCode).toBe(1);
      expect(mockResolveSessionAdapter).not.toHaveBeenCalled();
      expect(mockRunAgentSession).not.toHaveBeenCalled();
      const errOut = errSpy.mock.calls.flat().join("\n");
      expect(errOut).toMatch(/invalid adapter/i);
    });
  });

  describe("gemini CLI-adapter path (#4208: real numTurns, cost still structurally absent)", () => {
    // Gemini's CliUsage never carries a cost figure (cli-usage-parser.ts:
    // "Gemini CLI's stats never carry a USD figure") — that is a permanent,
    // structural property of the Gemini CLI's own JSON output and out of
    // scope here. Prior to #4208, the shared CLI-subprocess session runner
    // (run-cli-adapter-session.ts) ALSO always reported numTurns: 0 for
    // gemini/opencode regardless of what actually happened, so a genuinely
    // successful gemini run was indistinguishable from a credential-less one:
    // both produced `{ costUsd: 0, numTurns: 0 }`. #4208 fixed numTurns to be
    // derived from real subprocess activity (see
    // packages/agent-core/src/adapters/cli-usage-parser.ts), so only the
    // genuine "nothing happened" case still looks like this — a real gemini
    // run now reports real turns even though costUsd stays 0.
    it("still reports a non-run when the gemini adapter genuinely never ran (no credentials — 0 turns, $0 cost)", async () => {
      mockLoadSuite.mockResolvedValue([task]);
      mockRunAgentSession.mockResolvedValue(fakeSession({ costUsd: 0, numTurns: 0 }));

      await agentEvalCommand.parseAsync(["--adapter", "gemini", "--max-cost-regression", "20"], {
        from: "user",
      });

      expect(process.exitCode).toBe(2);
      expect(mockAppendFileSync).not.toHaveBeenCalled();
    });

    it("scores a successful gemini run instead of treating it as a non-run, even though costUsd stays 0", async () => {
      mockLoadSuite.mockResolvedValue([task]);
      mockRunAgentSession.mockResolvedValue(fakeSession({ costUsd: 0, numTurns: 7 }));

      await agentEvalCommand.parseAsync(["--adapter", "gemini", "--max-cost-regression", "20"], {
        from: "user",
      });

      expect(process.exitCode).not.toBe(2);
      expect(mockAppendFileSync).toHaveBeenCalled();
    });
  });

  it("appends the EvalReport as JSONL after each run", async () => {
    mockLoadSuite.mockResolvedValue([task]);
    mockRunAgentSession.mockResolvedValue(fakeSession());

    await agentEvalCommand.parseAsync([], { from: "user" });

    expect(mockAppendFileSync).toHaveBeenCalledOnce();
    const [filePath, line] = mockAppendFileSync.mock.calls[0] as [string, string];
    expect(filePath).toMatch(/eval-reports\.jsonl$/);
    const record = JSON.parse(line.trim());
    expect(record.runId).toBeDefined();
    expect(record.aggregate).toBeDefined();
    expect(record.tasks).toHaveLength(1);
    expect(record.timestamp).toBeDefined();
  });

  it("creates the log directory when it does not exist", async () => {
    mockLoadSuite.mockResolvedValue([task]);
    mockRunAgentSession.mockResolvedValue(fakeSession());
    mockExistsSync.mockReturnValue(false);

    await agentEvalCommand.parseAsync([], { from: "user" });

    expect(mockMkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    expect(mockAppendFileSync).toHaveBeenCalledOnce();
  });

  it("prints calibration summary with --calibrate", async () => {
    mockLoadSuite.mockResolvedValue([task]);
    // costUsd 0.2, maxCostUsd 1 → withinBudget true → task passes
    mockRunAgentSession.mockResolvedValue(
      fakeSession({ evaluation: { passed: true, confidence: 0.9, reasoning: "ok" } })
    );

    await agentEvalCommand.parseAsync(["--calibrate"], { from: "user" });

    const out = logSpy.mock.calls.flat().join("\n");
    expect(out).toContain("Calibration Summary");
    expect(out).toContain("High confidence");
    expect(out).toContain("Med  confidence");
    expect(out).toContain("Low  confidence");
    expect(out).toContain("Tasks with self-eval: 1");
    expect(process.exitCode).toBe(0);
  });

  it("calibration summary omits 'without self-eval' line when all tasks have self-eval", async () => {
    mockLoadSuite.mockResolvedValue([task]);
    mockRunAgentSession.mockResolvedValue(
      fakeSession({ evaluation: { passed: true, confidence: 0.9, reasoning: "ok" } })
    );

    await agentEvalCommand.parseAsync(["--calibrate"], { from: "user" });

    const out = logSpy.mock.calls.flat().join("\n");
    expect(out).not.toContain("without self-eval");
  });

  it("resolves --suite cost to the cost eval suite directory", async () => {
    mockLoadSuite.mockResolvedValue([task]);
    mockRunAgentSession.mockResolvedValue(fakeSession());

    await agentEvalCommand.parseAsync(["--suite", "cost", "--task", "t1"], { from: "user" });

    expect(mockLoadSuite).toHaveBeenCalledWith(expect.stringContaining("eval-suite/cost"));
  });

  describe("--max-cost-regression", () => {
    it("exits 0 when cost is within threshold versus baseline", async () => {
      // baseline meanCostUsd = 0.10; current session costUsd = 0.11 (10% up, threshold 20%)
      // adapter: "claude" — the run below defaults to --adapter claude too, so
      // this is a same-adapter baseline (#4218 rework: baselines are scoped
      // per adapter).
      const baseline = {
        runId: "prev",
        adapter: "claude",
        tasks: [],
        aggregate: {
          total: 1,
          passRate: 1,
          meanScore: 1,
          meanCostUsd: 0.1,
          meanTurns: 5,
          stuckCount: 0,
        },
        timestamp: "2026-01-01T00:00:00.000Z",
      };
      mockReadFileSync.mockReturnValue(JSON.stringify(baseline) + "\n");
      mockLoadSuite.mockResolvedValue([task]);
      mockRunAgentSession.mockResolvedValue(fakeSession({ costUsd: 0.11 }));

      await agentEvalCommand.parseAsync(["--max-cost-regression", "20"], { from: "user" });

      expect(process.exitCode).toBe(0);
    });

    it("exits 1 when cost exceeds the regression threshold", async () => {
      // baseline meanCostUsd = 0.10; current session costUsd = 0.25 (150% up, threshold 20%)
      const baseline = {
        runId: "prev",
        adapter: "claude",
        tasks: [],
        aggregate: {
          total: 1,
          passRate: 1,
          meanScore: 1,
          meanCostUsd: 0.1,
          meanTurns: 5,
          stuckCount: 0,
        },
        timestamp: "2026-01-01T00:00:00.000Z",
      };
      mockReadFileSync.mockReturnValue(JSON.stringify(baseline) + "\n");
      mockLoadSuite.mockResolvedValue([task]);
      mockRunAgentSession.mockResolvedValue(fakeSession({ costUsd: 0.25 }));

      await agentEvalCommand.parseAsync(["--max-cost-regression", "20"], { from: "user" });

      expect(process.exitCode).toBe(1);
      const errOut = errSpy.mock.calls.flat().join("\n");
      expect(errOut).toMatch(/cost regression/i);
    });

    it("exits 0 when no baseline exists (first run)", async () => {
      // No prior eval-reports.jsonl
      mockReadFileSync.mockImplementation(() => {
        throw Object.assign(new Error("no such file"), { code: "ENOENT" });
      });
      mockLoadSuite.mockResolvedValue([task]);
      mockRunAgentSession.mockResolvedValue(fakeSession());

      await agentEvalCommand.parseAsync(["--max-cost-regression", "20"], { from: "user" });

      expect(process.exitCode).toBe(0);
    });

    it("exits 0 when eval-reports.jsonl is empty (no valid baseline)", async () => {
      mockReadFileSync.mockReturnValue("");
      mockLoadSuite.mockResolvedValue([task]);
      mockRunAgentSession.mockResolvedValue(fakeSession());

      await agentEvalCommand.parseAsync(["--max-cost-regression", "20"], { from: "user" });

      expect(process.exitCode).toBe(0);
    });
  });

  describe("cross-adapter baseline poisoning (#4218 rework)", () => {
    // Exercises the real persistReport -> loadCostBaseline round trip
    // through three genuine command invocations against a stateful fake
    // log file (appendFileSync/readFileSync share real content) — not a
    // canned baseline fixture. This is deliberately NOT shaped like the
    // reviewer-flagged tautological test on the original #4208 PR (which
    // stubbed runAgentSession and stayed green even with the fix reverted):
    // reverting the adapter-scoping fix in agent-eval.ts must turn this RED,
    // because it is the actual production loadCostBaseline/persistReport
    // code being exercised, not a re-assertion of a mocked baseline.
    it("does not let a $0 gemini report become claude's cost-regression baseline", async () => {
      let fakeLog = "";
      mockAppendFileSync.mockImplementation((_path: unknown, data: unknown) => {
        fakeLog += String(data);
      });
      mockReadFileSync.mockImplementation(() => fakeLog);
      mockLoadSuite.mockResolvedValue([task]);

      // 1. A genuine claude run establishes a real, non-zero baseline.
      mockRunAgentSession.mockResolvedValueOnce(fakeSession({ costUsd: 0.1, numTurns: 5 }));
      await agentEvalCommand.parseAsync(["--adapter", "claude"], { from: "user" });
      expect(process.exitCode).toBe(0);

      // 2. A genuine gemini run — real turns (#4208), structurally-$0 cost —
      // is no longer a non-run, so it persists and becomes the newest line
      // in the shared log file.
      mockRunAgentSession.mockResolvedValueOnce(fakeSession({ costUsd: 0, numTurns: 7 }));
      await agentEvalCommand.parseAsync(["--adapter", "gemini"], { from: "user" });
      expect(process.exitCode).toBe(0);

      // 3. claude's cost genuinely spikes. Unfixed: loadCostBaseline reads
      // the last line in the file regardless of adapter, i.e. gemini's $0
      // entry -> checkCostRegression(baseline === 0) short-circuits "no
      // regression" -> exit 0, hiding a real 4900% cost spike. Fixed: the
      // baseline is scoped to claude's own prior entry ($0.10), so the gate
      // fires.
      mockRunAgentSession.mockResolvedValueOnce(fakeSession({ costUsd: 5, numTurns: 5 }));
      await agentEvalCommand.parseAsync(
        ["--adapter", "claude", "--max-cost-regression", "20"],
        { from: "user" }
      );

      expect(process.exitCode).toBe(1);
      const errOut = errSpy.mock.calls.flat().join("\n");
      expect(errOut).toMatch(/cost regression/i);
    });
  });
});
