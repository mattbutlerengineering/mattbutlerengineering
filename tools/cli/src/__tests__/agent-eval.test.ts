import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type * as AgentCore from "@mbe/agent-core";

const mockLoadSuite = vi.fn();
const mockRunAgentSession = vi.fn();
const mockResolveSessionAdapter = vi.fn();
const mockAppendFileSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockRemoveWorktree = vi.fn();
// Every execFile call the verifier makes: (cmd, args, opts) → an Error to
// reject with, or null to resolve. Reset to "always resolve" in beforeEach.
const mockExecFile = vi.fn<(cmd: string, args: string[], opts: unknown) => Error | null>();

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
    removeWorktree: (...a: unknown[]) => mockRemoveWorktree(...a),
  };
});

// The fixture verifier shells out via promisify(execFile); route every call
// through mockExecFile (default: resolve, so checks pass).
vi.mock("node:child_process", () => ({
  execFile: (
    cmd: string,
    args: string[],
    optsOrCb: unknown,
    cb?: (err: unknown, res: { stdout: string; stderr: string }) => void
  ) => {
    const opts = typeof optsOrCb === "function" ? undefined : optsOrCb;
    const callback = typeof optsOrCb === "function" ? optsOrCb : cb;
    const err = mockExecFile(cmd, args, opts);
    (callback as (e: unknown, r: { stdout: string; stderr: string }) => void)(err ?? null, {
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
    worktreePath: "/repo/.agent-worktrees/t1",
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
    mockExecFile.mockImplementation(() => null);
    mockRemoveWorktree.mockResolvedValue(undefined);
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
    it.each([["auto"], ["claude"], ["opencode"], ["grok"], ["omp"]] as const)(
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

  describe("CLI-adapter non-run detection", () => {
    // `{ costUsd: 0, numTurns: 0 }` is a non-run. Turns with a $0 cost are a
    // scored run — the cost figure can be absent or zero without meaning the
    // suite never started.
    it("still reports a non-run when the opencode adapter genuinely never ran (0 turns, $0 cost)", async () => {
      mockLoadSuite.mockResolvedValue([task]);
      mockRunAgentSession.mockResolvedValue(fakeSession({ costUsd: 0, numTurns: 0 }));

      await agentEvalCommand.parseAsync(["--adapter", "opencode", "--max-cost-regression", "20"], {
        from: "user",
      });

      expect(process.exitCode).toBe(2);
      expect(mockAppendFileSync).not.toHaveBeenCalled();
    });

    it("scores a successful opencode run instead of treating it as a non-run, even though costUsd stays 0", async () => {
      mockLoadSuite.mockResolvedValue([task]);
      mockRunAgentSession.mockResolvedValue(fakeSession({ costUsd: 0, numTurns: 7 }));

      await agentEvalCommand.parseAsync(["--adapter", "opencode", "--max-cost-regression", "20"], {
        from: "user",
      });

      expect(process.exitCode).not.toBe(2);
      expect(mockAppendFileSync).toHaveBeenCalled();
    });
  });

  describe("claude-cli cost basis (api-equivalent — the budget's cost arm does not apply)", () => {
    // `claude-cli` runs on a subscription login but its JSON result still
    // reports `total_cost_usd` at API prices, inflated on turn 1 by the
    // repo's cached CLAUDE.md/rules context (~$1.37 measured against a $0.50
    // task budget). The figure is real but not billed, so scoring it against
    // `maxCostUsd` would fail every task from its first turn. The basis is
    // decided once per run by `costBasisForAdapter` (agent-core) and applied
    // through `isWithinBudget`; the reported figure is kept in the row.
    it("scores an over-cost, within-turns claude-cli run as within budget, keeps the figure, and labels the row", async () => {
      mockLoadSuite.mockResolvedValue([task]);
      // costUsd 1.37 > maxCostUsd 1 — fails the cost arm under `billed`.
      mockRunAgentSession.mockResolvedValue(fakeSession({ costUsd: 1.37, numTurns: 5 }));

      await agentEvalCommand.parseAsync(["--adapter", "claude-cli", "--threshold", "50"], {
        from: "user",
      });

      expect(process.exitCode).toBe(0);
      expect(mockAppendFileSync).toHaveBeenCalledOnce();
      const [, line] = mockAppendFileSync.mock.calls[0] as [string, string];
      const record = JSON.parse(line.trim());
      expect(record.adapter).toBe("claude-cli");
      expect(record.costBasis).toBe("api-equivalent");
      expect(record.tasks[0].deterministic.withinBudget).toBe(true);
      // Not zeroed — the per-adapter cost trend (--max-cost-regression) stays meaningful.
      expect(record.tasks[0].costUsd).toBe(1.37);
    });

    it("labels an omp row as api-equivalent and does not fail the cost arm", async () => {
      mockLoadSuite.mockResolvedValue([task]);
      mockRunAgentSession.mockResolvedValue(fakeSession({ costUsd: 1.37, numTurns: 5 }));

      await agentEvalCommand.parseAsync(["--adapter", "omp", "--threshold", "50"], {
        from: "user",
      });

      expect(process.exitCode).toBe(0);
      const [, line] = mockAppendFileSync.mock.calls[0] as [string, string];
      const record = JSON.parse(line.trim());
      expect(record.adapter).toBe("omp");
      expect(record.costBasis).toBe("api-equivalent");
      expect(record.tasks[0].deterministic.withinBudget).toBe(true);
      expect(record.tasks[0].costUsd).toBe(1.37);
    });

    it("still fails the turns arm under claude-cli", async () => {
      mockLoadSuite.mockResolvedValue([task]);
      // numTurns 51 > maxTurns 50.
      mockRunAgentSession.mockResolvedValue(fakeSession({ costUsd: 1.37, numTurns: 51 }));

      await agentEvalCommand.parseAsync(["--adapter", "claude-cli"], { from: "user" });

      expect(mockAppendFileSync).toHaveBeenCalledOnce();
      const [, line] = mockAppendFileSync.mock.calls[0] as [string, string];
      const record = JSON.parse(line.trim());
      expect(record.tasks[0].deterministic.withinBudget).toBe(false);
    });

    it("labels a default-adapter (SDK) row as billed", async () => {
      mockLoadSuite.mockResolvedValue([task]);
      mockRunAgentSession.mockResolvedValue(fakeSession());

      await agentEvalCommand.parseAsync([], { from: "user" });

      const [, line] = mockAppendFileSync.mock.calls[0] as [string, string];
      const record = JSON.parse(line.trim());
      expect(record.adapter).toBe("claude");
      expect(record.costBasis).toBe("billed");
    });
  });

  describe("claude-cli diagnostics", () => {
    it("names the CLI prerequisite (not ANTHROPIC_API_KEY) and does not persist when every task reports 0 turns / $0 under claude-cli", async () => {
      mockLoadSuite.mockResolvedValue([task]);
      mockRunAgentSession.mockResolvedValue(fakeSession({ costUsd: 0, numTurns: 0 }));

      await agentEvalCommand.parseAsync(["--adapter", "claude-cli"], { from: "user" });

      expect(process.exitCode).toBe(2);
      expect(mockAppendFileSync).not.toHaveBeenCalled();
      const errOut = errSpy.mock.calls.flat().join("\n");
      expect(errOut).toContain("No task produced any usage via the claude-cli adapter");
      expect(errOut).toContain("subscription login");
      expect(errOut).not.toContain("refused to start");
    });

    // noRunMessage v2 (amendment 2026-09-29): say only what is distinguishable.
    it("quotes the sessions' own errors instead of guessing a cause when a claude-cli non-run reported one", async () => {
      mockLoadSuite.mockResolvedValue([task]);
      mockRunAgentSession.mockResolvedValue(
        fakeSession({
          numTurns: 0,
          costUsd: 0,
          errors: ["Claude CLI exited with non-zero status"],
        })
      );

      await agentEvalCommand.parseAsync(["--adapter", "claude-cli"], { from: "user" });

      expect(process.exitCode).toBe(2);
      expect(mockAppendFileSync).not.toHaveBeenCalled();
      const errOut = errSpy.mock.calls.flat().join("\n");
      expect(errOut).toContain("The sessions reported — ");
      expect(errOut).toContain("t1: Claude CLI exited with non-zero status");
      expect(errOut).not.toContain("subscription login");
      expect(errOut).not.toContain("refused to start");
    });

    it("appends the sessions' errors to today's sentence for a non-claude-cli non-run", async () => {
      mockLoadSuite.mockResolvedValue([task]);
      mockRunAgentSession.mockResolvedValue(
        fakeSession({ numTurns: 0, costUsd: 0, errors: ["opencode: 401 Unauthorized"] })
      );

      await agentEvalCommand.parseAsync(["--adapter", "opencode"], { from: "user" });

      expect(process.exitCode).toBe(2);
      const errOut = errSpy.mock.calls.flat().join("\n");
      expect(errOut).toContain(
        'No task executed: every task reported 0 turns and $0.00 cost via the "opencode" adapter. This is not a scored regression — the suite never ran. The sessions reported — t1: opencode: 401 Unauthorized'
      );
    });

    it("scores a claude-cli task that ran and then failed a post-dispatch step as a row, never a non-run (Verify F1.2)", async () => {
      mockLoadSuite.mockResolvedValue([task]);
      mockRunAgentSession.mockResolvedValue(
        fakeSession({
          status: "failed",
          numTurns: 15,
          costUsd: 0.6,
          errors: ["git commit -m … failed"],
        })
      );

      await agentEvalCommand.parseAsync(["--adapter", "claude-cli"], { from: "user" });

      expect(process.exitCode).toBe(0);
      expect(mockAppendFileSync).toHaveBeenCalledOnce();
      const [, line] = mockAppendFileSync.mock.calls[0] as [string, string];
      const record = JSON.parse(line.trim());
      expect(record.costBasis).toBe("api-equivalent");
      expect(record.nonRunCount).toBe(0);
      expect(record.tasks[0].turns).toBe(15);
      expect(record.tasks[0].costUsd).toBe(0.6);
      expect(record.tasks[0].sessionErrors).toEqual(["git commit -m … failed"]);
      const out = logSpy.mock.calls.flat().join("\n");
      expect(out).toContain("    session errors: git commit -m … failed");
      expect(out).not.toContain("Excluded (did not run)");
    });

    it("prints the cost-basis line for a scored claude-cli run so a $1.37 task beside a $0.50 budget is not read as a bug", async () => {
      mockLoadSuite.mockResolvedValue([task]);
      mockRunAgentSession.mockResolvedValue(fakeSession({ costUsd: 1.37, numTurns: 5 }));

      await agentEvalCommand.parseAsync(["--adapter", "claude-cli"], { from: "user" });

      const out = logSpy.mock.calls.flat().join("\n");
      expect(out).toContain("Cost basis: api-equivalent");
      expect(out).toContain("budget cost arm not applied");
    });

    it("prints no cost-basis line for a scored default-adapter (billed) run", async () => {
      mockLoadSuite.mockResolvedValue([task]);
      mockRunAgentSession.mockResolvedValue(fakeSession());

      await agentEvalCommand.parseAsync([], { from: "user" });

      const out = logSpy.mock.calls.flat().join("\n");
      expect(out).not.toContain("Cost basis:");
    });
  });

  describe("eval fixture verifier (runs the fixture scripts inside the kept eval worktree)", () => {
    const WT = "/repo/.agent-worktrees/t1";
    const turbo = (script: string) => [
      "turbo",
      "run",
      script,
      "--filter=./services/reservations",
      "--output-logs=errors-only",
    ];
    const pnpmCalls = () =>
      mockExecFile.mock.calls.filter(([cmd]) => cmd === "pnpm") as [
        string,
        string[],
        { cwd?: string; timeout?: number },
      ][];
    async function runJson(): Promise<{ deterministic: Record<string, boolean> }> {
      await agentEvalCommand.parseAsync(["--json"], { from: "user" });
      const parsed = JSON.parse(logSpy.mock.calls.flat().join("\n"));
      return parsed.tasks[0];
    }
    function failWith(match: (args: string[]) => boolean, text: string) {
      mockExecFile.mockImplementation((_cmd, args) => {
        if (!match(args)) return null;
        return Object.assign(new Error("Command failed"), { stdout: text, stderr: "" });
      });
    }

    it("(a) never checks out the agent branch in the caller's repo", async () => {
      mockLoadSuite.mockResolvedValue([task]);
      mockRunAgentSession.mockResolvedValue(fakeSession());

      await agentEvalCommand.parseAsync([], { from: "user" });

      expect(mockExecFile.mock.calls.some(([, args]) => args.includes("checkout"))).toBe(false);
    });

    it("(b) installs once per task in the worktree (300 s), then runs each script through turbo there (600 s)", async () => {
      mockLoadSuite.mockResolvedValue([task]);
      mockRunAgentSession.mockResolvedValue(fakeSession());

      await agentEvalCommand.parseAsync([], { from: "user" });

      const calls = pnpmCalls();
      expect(calls.map(([, args]) => args)).toEqual([
        ["install", "--frozen-lockfile"],
        turbo("test"),
        turbo("typecheck"),
      ]);
      expect(calls[0]?.[2]).toMatchObject({ cwd: WT, timeout: 300_000 });
      expect(calls[1]?.[2]).toMatchObject({ cwd: WT, timeout: 600_000 });
      expect(calls[2]?.[2]).toMatchObject({ cwd: WT, timeout: 600_000 });
      expect(calls.some(([, args]) => args[0] === "--filter")).toBe(false);
    });

    it("(b) installs once per task, each in its own worktree", async () => {
      mockLoadSuite.mockResolvedValue([task, { ...task, id: "t2" }]);
      mockRunAgentSession
        .mockResolvedValueOnce(fakeSession())
        .mockResolvedValueOnce(fakeSession({ worktreePath: "/repo/.agent-worktrees/t2" }));

      await agentEvalCommand.parseAsync([], { from: "user" });

      const installs = pnpmCalls().filter(([, args]) => args[0] === "install");
      expect(installs.map(([, , opts]) => opts.cwd)).toEqual([WT, "/repo/.agent-worktrees/t2"]);
    });

    it("(c) an install failure scores every script false, does not throw, and names the step", async () => {
      mockLoadSuite.mockResolvedValue([task]);
      mockRunAgentSession.mockResolvedValue(fakeSession());
      failWith((args) => args[0] === "install", "ERR_PNPM_OUTDATED_LOCKFILE");

      const row = await runJson();

      expect(row.deterministic.testsPass).toBe(false);
      expect(row.deterministic.typecheckPass).toBe(false);
      expect(pnpmCalls().filter(([, args]) => args[0] === "turbo")).toHaveLength(0);
      const errOut = errSpy.mock.calls.flat().join("\n");
      expect(errOut).toContain(`t1: install failed in ${WT} — `);
      expect(errOut).toContain("ERR_PNPM_OUTDATED_LOCKFILE");
    });

    it("(c) one failing script scores only that check false and prints its last 20 lines", async () => {
      mockLoadSuite.mockResolvedValue([task]);
      mockRunAgentSession.mockResolvedValue(fakeSession());
      const lines = Array.from({ length: 25 }, (_, i) => `line ${i + 1}`).join("\n");
      failWith((args) => args[2] === "test", lines);

      const row = await runJson();

      expect(row.deterministic.testsPass).toBe(false);
      expect(row.deterministic.typecheckPass).toBe(true);
      const errOut = errSpy.mock.calls.flat().join("\n");
      expect(errOut).toContain(`t1: test failed in ${WT} — `);
      expect(errOut).toContain("line 25");
      expect(errOut).toContain("line 6");
      expect(errOut).not.toMatch(/line 5\b/);
    });

    it("(d) no worktreePath scores every rubric check false without running pnpm, in one stderr line", async () => {
      mockLoadSuite.mockResolvedValue([task]);
      mockRunAgentSession.mockResolvedValue(
        fakeSession({ worktreePath: undefined, status: "failed", errors: ["worktree add failed"] })
      );

      const row = await runJson();

      expect(row.deterministic.testsPass).toBe(false);
      expect(row.deterministic.typecheckPass).toBe(false);
      expect(mockExecFile).not.toHaveBeenCalled();
      const t1Lines = errSpy.mock.calls.flat().filter((l: unknown) => String(l).startsWith("t1:"));
      expect(t1Lines).toHaveLength(1);
      expect(t1Lines[0]).toContain("failed");
      expect(t1Lines[0]).toContain("worktree add failed");
      expect(mockRemoveWorktree).not.toHaveBeenCalled();
    });

    it("(e) removes the worktree of a succeeded session, swallowing a removal failure", async () => {
      mockLoadSuite.mockResolvedValue([task]);
      mockRunAgentSession.mockResolvedValue(fakeSession({ status: "succeeded" }));
      mockRemoveWorktree.mockRejectedValue(new Error("worktree locked"));

      await agentEvalCommand.parseAsync([], { from: "user" });

      expect(mockRemoveWorktree).toHaveBeenCalledOnce();
      expect(mockRemoveWorktree).toHaveBeenCalledWith(process.cwd(), WT);
      expect(process.exitCode).toBe(0);
      expect(errSpy.mock.calls.flat().join("\n")).not.toContain("worktree kept for inspection");
    });

    it("(e) keeps the worktree of a failed session and prints its path", async () => {
      mockLoadSuite.mockResolvedValue([task]);
      mockRunAgentSession.mockResolvedValue(fakeSession({ status: "failed", numTurns: 5 }));

      await agentEvalCommand.parseAsync([], { from: "user" });

      expect(mockRemoveWorktree).not.toHaveBeenCalled();
      const all = [...logSpy.mock.calls, ...errSpy.mock.calls].flat().join("\n");
      expect(all).toContain(`t1: worktree kept for inspection at ${WT}`);
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
    it("does not let a $0 opencode report become claude's cost-regression baseline", async () => {
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

      // 2. An opencode run with real turns and a $0 cost persists and becomes
      // the newest line in the shared log file.
      mockRunAgentSession.mockResolvedValueOnce(fakeSession({ costUsd: 0, numTurns: 7 }));
      await agentEvalCommand.parseAsync(["--adapter", "opencode"], { from: "user" });
      expect(process.exitCode).toBe(0);

      // 3. claude's cost genuinely spikes. Unfixed: loadCostBaseline reads
      // the last line in the file regardless of adapter, i.e. opencode's $0
      // entry -> checkCostRegression(baseline === 0) short-circuits "no
      // regression" -> exit 0, hiding a real 4900% cost spike. Fixed: the
      // baseline is scoped to claude's own prior entry ($0.10), so the gate
      // fires.
      mockRunAgentSession.mockResolvedValueOnce(fakeSession({ costUsd: 5, numTurns: 5 }));
      await agentEvalCommand.parseAsync(["--adapter", "claude", "--max-cost-regression", "20"], {
        from: "user",
      });

      expect(process.exitCode).toBe(1);
      const errOut = errSpy.mock.calls.flat().join("\n");
      expect(errOut).toMatch(/cost regression/i);
    });
  });
});
