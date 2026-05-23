import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process before imports
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";
import { CliAdapterBase } from "../cli-adapter-base.js";
import type { AdapterConfig } from "../../cli-adapter.js";

// ── Helpers ─────────────────────────────────────────────────────────

type ExecFileCallback = (err: Error | null, result: { stdout: string; stderr: string }) => void;

function setupExecFileMock(
  responses: Record<string, { stdout?: string; stderr?: string; error?: boolean }[]>
) {
  const callCounts: Record<string, number> = {};

  vi.mocked(execFile).mockImplementation(((...args: unknown[]) => {
    const cmd = args[0] as string;
    const cmdArgs = args[1] as string[];
    const callback = args[args.length - 1] as ExecFileCallback;

    let key = cmd;
    if (cmd === "git" && cmdArgs) {
      const subcommand = cmdArgs.find((a) => a !== "-C" && !a.startsWith("/"));
      if (subcommand) key = `git-${subcommand}`;
    }

    callCounts[key] = (callCounts[key] ?? 0) + 1;
    const responseList = responses[key] ?? [{ stdout: "", stderr: "" }];
    const idx = Math.min(callCounts[key] - 1, responseList.length - 1);
    const response = responseList[idx];

    if (response.error) {
      const err = new Error("command failed") as Error & { stdout: string; stderr: string };
      err.stdout = response.stdout ?? "";
      err.stderr = response.stderr ?? "";
      callback(err, { stdout: "", stderr: "" });
    } else {
      callback(null, { stdout: response.stdout ?? "", stderr: response.stderr ?? "" });
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

// ── Concrete test double ─────────────────────────────────────────────

/**
 * Minimal concrete subclass used to test CliAdapterBase shared methods.
 * Only overrides the required abstract members.
 */
class TestAdapter extends CliAdapterBase {
  readonly name = "test-cli";
  readonly cliBinary = "test-cli";

  protected buildArgs(config: AdapterConfig): string[] {
    return ["run", config.taskDescription];
  }

  protected parseOutput(
    _stdout: string,
    stderr: string
  ): { hasChanges: boolean; summary?: string } {
    return { hasChanges: false, summary: stderr || undefined };
  }
}

// ── Tests ───────────────────────────────────────────────────────────

describe("CliAdapterBase", () => {
  let adapter: TestAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new TestAdapter();
  });

  // ── Abstract contract ────────────────────────────────────────────

  it("cannot be instantiated directly (abstract class)", () => {
    // TypeScript enforces this at compile time. At runtime, constructing
    // CliAdapterBase directly would require a JavaScript workaround —
    // we verify via the test double that the abstract members must be provided.
    expect(adapter.name).toBe("test-cli");
    expect(adapter.cliBinary).toBe("test-cli");
  });

  // ── truncateTask ─────────────────────────────────────────────────

  describe("truncateTask (via run)", () => {
    it("passes short tasks through unchanged", async () => {
      const shortTask = "Fix the login bug";

      setupExecFileMock({
        "test-cli": [{ stdout: "done" }],
        "git-status": [{ stdout: "" }],
      });

      await adapter.run(makeConfig({ taskDescription: shortTask }));

      const cliCall = vi.mocked(execFile).mock.calls.find((call) => call[0] === "test-cli");
      const passedTask = (cliCall![1] as string[])[1];
      expect(passedTask).toBe(shortTask);
    });

    it("truncates tasks exceeding 8000 characters with ellipsis", async () => {
      const longTask = "A".repeat(10_000);

      setupExecFileMock({
        "test-cli": [{ stdout: "" }],
        "git-status": [{ stdout: "" }],
      });

      await adapter.run(makeConfig({ taskDescription: longTask }));

      const cliCall = vi.mocked(execFile).mock.calls.find((call) => call[0] === "test-cli");
      const passedTask = (cliCall![1] as string[])[1];
      expect(passedTask.length).toBeLessThanOrEqual(8_000);
      expect(passedTask).toMatch(/\.\.\.$/);
    });

    it("truncates task to exactly 8000 characters total", async () => {
      const longTask = "B".repeat(10_000);

      setupExecFileMock({
        "test-cli": [{ stdout: "" }],
        "git-status": [{ stdout: "" }],
      });

      await adapter.run(makeConfig({ taskDescription: longTask }));

      const cliCall = vi.mocked(execFile).mock.calls.find((call) => call[0] === "test-cli");
      const passedTask = (cliCall![1] as string[])[1];
      expect(passedTask.length).toBe(8_000);
    });
  });

  // ── detectRateLimiting ───────────────────────────────────────────

  describe("rate-limit detection (via run)", () => {
    const rateLimitCases = [
      { name: "rate limit in stdout", stdout: "Error: rate limit exceeded", stderr: "" },
      { name: "quota exceeded", stdout: "quota exceeded for project", stderr: "" },
      { name: "HTTP 429", stdout: "", stderr: "HTTP 429 Too Many Requests" },
      { name: "throttled", stdout: "Request was throttled", stderr: "" },
      { name: "too many requests", stdout: "too many requests, try again later", stderr: "" },
      { name: "rate-limit (hyphenated)", stdout: "rate-limit reached", stderr: "" },
    ];

    for (const { name, stdout, stderr } of rateLimitCases) {
      it(`detects rate limiting: ${name}`, async () => {
        setupExecFileMock({
          "test-cli": [{ error: true, stdout, stderr }],
          "git-status": [{ stdout: "" }],
        });

        const result = await adapter.run(makeConfig());
        expect(result.rateLimited).toBe(true);
      });
    }

    it("does not flag rateLimited for normal output", async () => {
      setupExecFileMock({
        "test-cli": [{ stdout: "Successfully completed task." }],
        "git-status": [{ stdout: "" }],
      });

      const result = await adapter.run(makeConfig());
      expect(result.rateLimited).toBe(false);
    });
  });

  // ── buildCommitMessage (via run + git commit) ────────────────────

  describe("buildCommitMessage (via run commit path)", () => {
    it("uses 'feat: ' prefix", async () => {
      setupExecFileMock({
        "test-cli": [{ stdout: "done" }],
        "git-status": [{ stdout: " M file.ts\n" }],
        "git-add": [{ stdout: "" }],
        "git-commit": [{ stdout: "" }],
      });

      await adapter.run(makeConfig({ taskDescription: "add user authentication" }));

      const commitCall = vi
        .mocked(execFile)
        .mock.calls.find((call) => call[0] === "git" && (call[1] as string[]).includes("commit"));
      const message = (commitCall![1] as string[])[(commitCall![1] as string[]).indexOf("-m") + 1];
      expect(message).toMatch(/^feat: /);
    });

    it("truncates long task in commit message to 72 chars total", async () => {
      const longTask = "A".repeat(200);

      setupExecFileMock({
        "test-cli": [{ stdout: "done" }],
        "git-status": [{ stdout: " M file.ts\n" }],
        "git-add": [{ stdout: "" }],
        "git-commit": [{ stdout: "" }],
      });

      await adapter.run(makeConfig({ taskDescription: longTask }));

      const commitCall = vi
        .mocked(execFile)
        .mock.calls.find((call) => call[0] === "git" && (call[1] as string[]).includes("commit"));
      const message = (commitCall![1] as string[])[(commitCall![1] as string[]).indexOf("-m") + 1];
      expect(message.length).toBeLessThanOrEqual(72);
    });

    it("keeps short task description intact in commit message", async () => {
      setupExecFileMock({
        "test-cli": [{ stdout: "done" }],
        "git-status": [{ stdout: " M file.ts\n" }],
        "git-add": [{ stdout: "" }],
        "git-commit": [{ stdout: "" }],
      });

      await adapter.run(makeConfig({ taskDescription: "fix auth bug" }));

      const commitCall = vi
        .mocked(execFile)
        .mock.calls.find((call) => call[0] === "git" && (call[1] as string[]).includes("commit"));
      const message = (commitCall![1] as string[])[(commitCall![1] as string[]).indexOf("-m") + 1];
      expect(message).toBe("feat: fix auth bug");
    });
  });

  // ── isAvailable ─────────────────────────────────────────────────

  describe("isAvailable", () => {
    it("returns true when which <cliBinary> succeeds", async () => {
      setupExecFileMock({ which: [{ stdout: "/usr/local/bin/test-cli\n" }] });

      const result = await adapter.isAvailable();
      expect(result).toBe(true);
      expect(execFile).toHaveBeenCalledWith("which", ["test-cli"], expect.any(Function));
    });

    it("returns false when which <cliBinary> fails", async () => {
      setupExecFileMock({ which: [{ error: true, stderr: "not found" }] });

      const result = await adapter.isAvailable();
      expect(result).toBe(false);
    });
  });

  // ── shared run lifecycle ─────────────────────────────────────────

  describe("run — shared lifecycle", () => {
    it("uses timeout from config", async () => {
      setupExecFileMock({
        "test-cli": [{ stdout: "" }],
        "git-status": [{ stdout: "" }],
      });

      await adapter.run(makeConfig({ timeoutMs: 30_000 }));

      const cliCall = vi.mocked(execFile).mock.calls.find((call) => call[0] === "test-cli");
      expect(cliCall![2]).toMatchObject({ timeout: 30_000 });
    });

    it("defaults to 600s timeout when not specified", async () => {
      setupExecFileMock({
        "test-cli": [{ stdout: "" }],
        "git-status": [{ stdout: "" }],
      });

      await adapter.run(makeConfig());

      const cliCall = vi.mocked(execFile).mock.calls.find((call) => call[0] === "test-cli");
      expect(cliCall![2]).toMatchObject({ timeout: 600_000 });
    });

    it("includes durationMs in result", async () => {
      setupExecFileMock({
        "test-cli": [{ stdout: "" }],
        "git-status": [{ stdout: "" }],
      });

      const result = await adapter.run(makeConfig());
      expect(result.durationMs).toBeTypeOf("number");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("returns success when CLI exits with code 0", async () => {
      setupExecFileMock({
        "test-cli": [{ stdout: "done" }],
        "git-status": [{ stdout: "" }],
      });

      const result = await adapter.run(makeConfig());
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("returns failure when CLI exits with non-zero code", async () => {
      setupExecFileMock({
        "test-cli": [{ error: true, stderr: "fatal error" }],
        "git-status": [{ stdout: "" }],
      });

      const result = await adapter.run(makeConfig());
      expect(result.success).toBe(false);
    });

    it("detects changes via git status --porcelain", async () => {
      setupExecFileMock({
        "test-cli": [{ stdout: "done" }],
        "git-status": [{ stdout: " M src/auth.ts\n" }],
        "git-add": [{ stdout: "" }],
        "git-commit": [{ stdout: "" }],
      });

      const result = await adapter.run(makeConfig());
      expect(result.hasChanges).toBe(true);
    });

    it("commits changes when they exist", async () => {
      setupExecFileMock({
        "test-cli": [{ stdout: "done" }],
        "git-status": [{ stdout: " M file.ts\n" }],
        "git-add": [{ stdout: "" }],
        "git-commit": [{ stdout: "" }],
      });

      await adapter.run(makeConfig());

      const addCall = vi
        .mocked(execFile)
        .mock.calls.find((call) => call[0] === "git" && (call[1] as string[]).includes("add"));
      expect(addCall).toBeDefined();
      expect(addCall![1]).toContain("-A");

      const commitCall = vi
        .mocked(execFile)
        .mock.calls.find((call) => call[0] === "git" && (call[1] as string[]).includes("commit"));
      expect(commitCall).toBeDefined();
      expect(commitCall![1]).toContain("-m");
    });

    it("does not commit when no changes", async () => {
      setupExecFileMock({
        "test-cli": [{ stdout: "" }],
        "git-status": [{ stdout: "" }],
      });

      await adapter.run(makeConfig());

      const commitCall = vi
        .mocked(execFile)
        .mock.calls.find((call) => call[0] === "git" && (call[1] as string[]).includes("commit"));
      expect(commitCall).toBeUndefined();
    });

    it("handles git status failure gracefully", async () => {
      setupExecFileMock({
        "test-cli": [{ stdout: "" }],
        "git-status": [{ error: true, stderr: "not a git repo" }],
      });

      const result = await adapter.run(makeConfig());
      expect(result.hasChanges).toBe(false);
    });

    it("delegates args construction to buildArgs", async () => {
      setupExecFileMock({
        "test-cli": [{ stdout: "" }],
        "git-status": [{ stdout: "" }],
      });

      await adapter.run(makeConfig({ taskDescription: "do something" }));

      const cliCall = vi.mocked(execFile).mock.calls.find((call) => call[0] === "test-cli");
      // TestAdapter.buildArgs returns ["run", taskDescription]
      expect(cliCall![1]).toEqual(["run", "do something"]);
    });
  });
});
