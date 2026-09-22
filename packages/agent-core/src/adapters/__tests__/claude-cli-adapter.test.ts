import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process before imports
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";
import { ClaudeCliAdapter } from "../claude-cli-adapter.js";
import type { AdapterConfig } from "../../cli-adapter.js";

// ── Helpers ─────────────────────────────────────────────────────────

type ExecFileCallback = (err: Error | null, result: { stdout: string; stderr: string }) => void;

/**
 * Configure the execFile mock to respond differently based on the command.
 * Each entry maps a command name to its response.
 */
function setupExecFileMock(
  responses: Record<
    string,
    { stdout?: string; stderr?: string; error?: boolean; callIndex?: number }[]
  >
) {
  const callCounts: Record<string, number> = {};

  vi.mocked(execFile).mockImplementation(((...args: unknown[]) => {
    const cmd = args[0] as string;
    const cmdArgs = args[1] as string[];
    const callback = args[args.length - 1] as ExecFileCallback;

    // Derive a lookup key: use "git-status" for `git -C ... status --porcelain`,
    // "git-add" for `git -C ... add`, "git-commit" for `git -C ... commit`
    let key = cmd;
    if (cmd === "git" && cmdArgs) {
      const subcommand = cmdArgs.find((a) => a !== "-C" && !a.startsWith("/"));
      if (subcommand) {
        key = `git-${subcommand}`;
      }
    }

    callCounts[key] = (callCounts[key] ?? 0) + 1;
    const responseList = responses[key] ?? [{ stdout: "", stderr: "" }];
    const idx = Math.min(callCounts[key] - 1, responseList.length - 1);
    const response = responseList[idx];

    if (response.error) {
      const err = new Error("command failed") as Error & {
        stdout: string;
        stderr: string;
      };
      err.stdout = response.stdout ?? "";
      err.stderr = response.stderr ?? "";
      callback(err, { stdout: "", stderr: "" });
    } else {
      callback(null, {
        stdout: response.stdout ?? "",
        stderr: response.stderr ?? "",
      });
    }

    return {} as ReturnType<typeof execFile>;
  }) as typeof execFile);
}

function makeConfig(overrides: Partial<AdapterConfig> = {}): AdapterConfig {
  return {
    taskDescription: "Fix the login bug in auth.ts",
    worktreePath: "/tmp/worktree-abc123",
    repoPath: "/tmp/repo",
    baseBranch: "main",
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("ClaudeCliAdapter", () => {
  let adapter: ClaudeCliAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new ClaudeCliAdapter();
  });

  // ── name ────────────────────────────────────────────────────────

  it("has name 'claude-cli' — distinct from the SDK-backed 'claude' adapter", () => {
    expect(adapter.name).toBe("claude-cli");
  });

  // ── isAvailable ─────────────────────────────────────────────────

  describe("isAvailable", () => {
    it("returns true when 'which claude' succeeds", async () => {
      setupExecFileMock({
        which: [{ stdout: "/usr/local/bin/claude\n" }],
      });

      const result = await adapter.isAvailable();

      expect(result).toBe(true);
      expect(execFile).toHaveBeenCalledWith("which", ["claude"], expect.any(Function));
    });

    it("returns false when 'which claude' fails", async () => {
      setupExecFileMock({
        which: [{ error: true, stderr: "claude not found" }],
      });

      const result = await adapter.isAvailable();

      expect(result).toBe(false);
    });
  });

  // ── run — command construction ──────────────────────────────────

  describe("run", () => {
    it("builds the headless invocation: -p <task> --output-format json --permission-mode bypassPermissions", async () => {
      setupExecFileMock({
        claude: [{ stdout: "" }],
        "git-status": [{ stdout: "" }], // no changes
      });

      await adapter.run(makeConfig());

      const claudeCall = vi.mocked(execFile).mock.calls.find((call) => call[0] === "claude");
      expect(claudeCall).toBeDefined();
      expect(claudeCall![1]).toEqual([
        "-p",
        "Fix the login bug in auth.ts",
        "--output-format",
        "json",
        "--permission-mode",
        "bypassPermissions",
      ]);
      expect(claudeCall![2]).toMatchObject({
        cwd: "/tmp/worktree-abc123",
      });
    });

    it("adds --model when config.model is set", async () => {
      setupExecFileMock({
        claude: [{ stdout: "" }],
        "git-status": [{ stdout: "" }],
      });

      await adapter.run(makeConfig({ model: "claude-sonnet-5" }));

      const claudeCall = vi.mocked(execFile).mock.calls.find((call) => call[0] === "claude");
      expect(claudeCall![1]).toContain("--model");
      expect(claudeCall![1]).toContain("claude-sonnet-5");
    });

    it("adds --max-turns when config.maxTurns is set", async () => {
      setupExecFileMock({
        claude: [{ stdout: "" }],
        "git-status": [{ stdout: "" }],
      });

      await adapter.run(makeConfig({ maxTurns: 5 }));

      const claudeCall = vi.mocked(execFile).mock.calls.find((call) => call[0] === "claude");
      expect(claudeCall![1]).toContain("--max-turns");
      expect(claudeCall![1]).toContain("5");
    });

    it("returns success when claude exits with code 0", async () => {
      setupExecFileMock({
        claude: [{ stdout: JSON.stringify({ is_error: false, result: "Done." }) }],
        "git-status": [{ stdout: "" }],
      });

      const result = await adapter.run(makeConfig());

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("returns failure when claude exits with non-zero code", async () => {
      setupExecFileMock({
        claude: [{ error: true, stderr: "Something went wrong" }],
        "git-status": [{ stdout: "" }],
      });

      const result = await adapter.run(makeConfig());

      expect(result.success).toBe(false);
      expect(result.error).toBe("Something went wrong");
    });

    it("returns generic error message when stderr is empty on failure", async () => {
      setupExecFileMock({
        claude: [{ error: true, stderr: "" }],
        "git-status": [{ stdout: "" }],
      });

      const result = await adapter.run(makeConfig());

      expect(result.success).toBe(false);
      expect(result.error).toBe("Claude CLI exited with non-zero status");
    });

    it("sets timeout from config.timeoutMs", async () => {
      setupExecFileMock({
        claude: [{ stdout: "" }],
        "git-status": [{ stdout: "" }],
      });

      await adapter.run(makeConfig({ timeoutMs: 30_000 }));

      const claudeCall = vi.mocked(execFile).mock.calls.find((call) => call[0] === "claude");
      expect(claudeCall![2]).toMatchObject({ timeout: 30_000 });
    });

    it("uses default 600s timeout when not specified", async () => {
      setupExecFileMock({
        claude: [{ stdout: "" }],
        "git-status": [{ stdout: "" }],
      });

      await adapter.run(makeConfig());

      const claudeCall = vi.mocked(execFile).mock.calls.find((call) => call[0] === "claude");
      expect(claudeCall![2]).toMatchObject({ timeout: 600_000 });
    });
  });

  // ── run — cost/token usage ───────────────────────────────────────

  describe("cost/token usage", () => {
    it("parses cost, turns, and tokens from the measured `--output-format json` shape", async () => {
      const stdout = JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        result: "ok",
        session_id: "abc",
        total_cost_usd: 0.193839,
        num_turns: 1,
        usage: {
          input_tokens: 1200,
          output_tokens: 340,
          cache_creation_input_tokens: 500,
          cache_read_input_tokens: 100,
        },
      });

      setupExecFileMock({
        claude: [{ stdout }],
        "git-status": [{ stdout: "" }],
      });

      const result = await adapter.run(makeConfig());

      expect(result.costUsd).toBeCloseTo(0.193839, 6);
      expect(result.numTurns).toBe(1);
      expect(result.tokenUsage).toEqual({ inputTokens: 1200, outputTokens: 340 });
    });

    it("degrades to no usage (not a bogus $0) for malformed/non-JSON stdout", async () => {
      setupExecFileMock({
        claude: [{ stdout: "not json at all" }],
        "git-status": [{ stdout: "" }],
      });

      const result = await adapter.run(makeConfig());

      expect(result.costUsd).toBeUndefined();
      expect(result.numTurns).toBeUndefined();
      expect(result.tokenUsage).toBeUndefined();
    });
  });

  // ── run — soft-error extraction from JSON stdout ─────────────────

  describe("soft-error extraction on failure", () => {
    it("surfaces the result text when is_error is true and claude exits non-zero", async () => {
      const jsonStdout = JSON.stringify({
        type: "result",
        subtype: "error_during_execution",
        is_error: true,
        result: "Agent stopped: unexpected tool failure.",
        session_id: "abc",
      });

      setupExecFileMock({
        claude: [{ error: true, stdout: jsonStdout, stderr: "" }],
        "git-status": [{ stdout: "" }],
      });

      const result = await adapter.run(makeConfig());

      expect(result.success).toBe(false);
      expect(result.error).toBe("Agent stopped: unexpected tool failure.");
    });

    it("falls back to stderr when claude's stdout is not JSON", async () => {
      setupExecFileMock({
        claude: [{ error: true, stdout: "not json output", stderr: "Something went wrong" }],
        "git-status": [{ stdout: "" }],
      });

      const result = await adapter.run(makeConfig());

      expect(result.success).toBe(false);
      expect(result.error).toBe("Something went wrong");
    });
  });

  // ── run — change detection ──────────────────────────────────────

  describe("change detection", () => {
    it("detects changes via git status --porcelain and commits", async () => {
      setupExecFileMock({
        claude: [{ stdout: JSON.stringify({ is_error: false, result: "Applied fix." }) }],
        "git-status": [{ stdout: " M src/auth.ts\n" }],
        "git-add": [{ stdout: "" }],
        "git-commit": [{ stdout: "" }],
      });

      const result = await adapter.run(makeConfig());

      expect(result.hasChanges).toBe(true);
    });

    it("reports no changes when git status is empty", async () => {
      setupExecFileMock({
        claude: [{ stdout: JSON.stringify({ is_error: false, result: "No changes." }) }],
        "git-status": [{ stdout: "" }],
      });

      const result = await adapter.run(makeConfig());

      expect(result.hasChanges).toBe(false);
    });
  });
});
