import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process before imports
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";
import { SpawnAndCommitBase } from "../spawn-and-commit-base.js";
import type { AdapterConfig } from "../cli-adapter.js";

// ── Test double ──────────────────────────────────────────────────────

/** Concrete subclass that exercises the base via gemini-style args. */
class TestCliAdapter extends SpawnAndCommitBase {
  readonly name = "test-cli";
  protected readonly binary = "test-cli";
  protected readonly defaultError = "test-cli exited with non-zero status";

  protected buildArgs(task: string): string[] {
    return ["-p", task, "--yolo"];
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

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
      if (subcommand) {
        key = `git-${subcommand}`;
      }
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

// ── Tests ────────────────────────────────────────────────────────────

describe("SpawnAndCommitBase", () => {
  let adapter: TestCliAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new TestCliAdapter();
  });

  // ── isAvailable ───────────────────────────────────────────────────

  describe("isAvailable", () => {
    it("returns true when 'which <binary>' succeeds", async () => {
      setupExecFileMock({
        which: [{ stdout: "/usr/local/bin/test-cli\n" }],
      });

      const result = await adapter.isAvailable();

      expect(result).toBe(true);
      expect(execFile).toHaveBeenCalledWith("which", ["test-cli"], expect.any(Function));
    });

    it("returns false when 'which <binary>' fails", async () => {
      setupExecFileMock({
        which: [{ error: true, stderr: "test-cli not found" }],
      });

      const result = await adapter.isAvailable();

      expect(result).toBe(false);
    });
  });

  // ── run — spawning ────────────────────────────────────────────────

  describe("run — spawning", () => {
    it("passes buildArgs output to the binary", async () => {
      setupExecFileMock({
        "test-cli": [{ stdout: "Done!" }],
        "git-status": [{ stdout: "" }],
      });

      await adapter.run(makeConfig());

      const cliCall = vi.mocked(execFile).mock.calls.find((call) => call[0] === "test-cli");
      expect(cliCall).toBeDefined();
      expect(cliCall![1]).toEqual(["-p", "Fix the login bug in auth.ts", "--yolo"]);
      expect(cliCall![2]).toMatchObject({ cwd: "/tmp/worktree-abc123" });
    });

    it("returns success when binary exits with code 0", async () => {
      setupExecFileMock({
        "test-cli": [{ stdout: "All changes applied." }],
        "git-status": [{ stdout: "" }],
      });

      const result = await adapter.run(makeConfig());

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("returns failure when binary exits with non-zero code", async () => {
      setupExecFileMock({
        "test-cli": [{ error: true, stderr: "Something went wrong" }],
        "git-status": [{ stdout: "" }],
      });

      const result = await adapter.run(makeConfig());

      expect(result.success).toBe(false);
      expect(result.error).toBe("Something went wrong");
    });

    it("returns defaultError message when stderr is empty on failure", async () => {
      setupExecFileMock({
        "test-cli": [{ error: true, stderr: "" }],
        "git-status": [{ stdout: "" }],
      });

      const result = await adapter.run(makeConfig());

      expect(result.success).toBe(false);
      expect(result.error).toBe("test-cli exited with non-zero status");
    });

    it("sets timeout from config.timeoutMs", async () => {
      setupExecFileMock({
        "test-cli": [{ stdout: "" }],
        "git-status": [{ stdout: "" }],
      });

      await adapter.run(makeConfig({ timeoutMs: 30_000 }));

      const cliCall = vi.mocked(execFile).mock.calls.find((call) => call[0] === "test-cli");
      expect(cliCall![2]).toMatchObject({ timeout: 30_000 });
    });

    it("uses default 600s timeout when not specified", async () => {
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
  });

  // ── run — task truncation ─────────────────────────────────────────

  describe("task truncation", () => {
    it("truncates very long task descriptions to 8000 chars", async () => {
      const longTask = "A".repeat(10_000);

      setupExecFileMock({
        "test-cli": [{ stdout: "" }],
        "git-status": [{ stdout: "" }],
      });

      await adapter.run(makeConfig({ taskDescription: longTask }));

      const cliCall = vi.mocked(execFile).mock.calls.find((call) => call[0] === "test-cli");
      // The truncated task is passed to buildArgs, which puts it at index 1
      const passedTask = (cliCall![1] as string[])[1];
      expect(passedTask.length).toBeLessThanOrEqual(8_000);
      expect(passedTask).toMatch(/\.\.\.$/);
    });
  });

  // ── run — rate-limit detection ────────────────────────────────────

  describe("rate-limit detection", () => {
    const rateLimitCases = [
      { name: "rate limit in stdout", stdout: "Error: rate limit exceeded", stderr: "" },
      { name: "quota exceeded", stdout: "quota exceeded for project", stderr: "" },
      { name: "HTTP 429", stdout: "", stderr: "HTTP 429 Too Many Requests" },
      { name: "throttled", stdout: "Request was throttled", stderr: "" },
      { name: "too many requests", stdout: "too many requests, try again later", stderr: "" },
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

    it("does not flag rateLimited when output has no rate-limit patterns", async () => {
      setupExecFileMock({
        "test-cli": [{ stdout: "Successfully completed task." }],
        "git-status": [{ stdout: "" }],
      });

      const result = await adapter.run(makeConfig());

      expect(result.rateLimited).toBe(false);
    });
  });

  // ── run — change detection ────────────────────────────────────────

  describe("change detection", () => {
    it("detects changes via git status --porcelain", async () => {
      setupExecFileMock({
        "test-cli": [{ stdout: "Applied fix." }],
        "git-status": [{ stdout: " M src/auth.ts\n?? src/new-file.ts\n" }],
        "git-add": [{ stdout: "" }],
        "git-commit": [{ stdout: "" }],
      });

      const result = await adapter.run(makeConfig());

      expect(result.hasChanges).toBe(true);
    });

    it("reports no changes when git status is empty", async () => {
      setupExecFileMock({
        "test-cli": [{ stdout: "No changes needed." }],
        "git-status": [{ stdout: "" }],
      });

      const result = await adapter.run(makeConfig());

      expect(result.hasChanges).toBe(false);
    });

    it("commits changes when they exist", async () => {
      setupExecFileMock({
        "test-cli": [{ stdout: "Done." }],
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

    it("does not commit when there are no changes", async () => {
      setupExecFileMock({
        "test-cli": [{ stdout: "Nothing to do." }],
        "git-status": [{ stdout: "" }],
      });

      await adapter.run(makeConfig());

      const commitCall = vi
        .mocked(execFile)
        .mock.calls.find((call) => call[0] === "git" && (call[1] as string[]).includes("commit"));
      expect(commitCall).toBeUndefined();
    });

    it("handles git status failure gracefully (assumes no changes)", async () => {
      setupExecFileMock({
        "test-cli": [{ stdout: "Done." }],
        "git-status": [{ error: true, stderr: "not a git repo" }],
      });

      const result = await adapter.run(makeConfig());

      expect(result.hasChanges).toBe(false);
    });
  });

  // ── run — commit message ──────────────────────────────────────────

  describe("commit message", () => {
    it("builds commit message with feat: prefix from task", async () => {
      setupExecFileMock({
        "test-cli": [{ stdout: "Done." }],
        "git-status": [{ stdout: " M file.ts\n" }],
        "git-add": [{ stdout: "" }],
        "git-commit": [{ stdout: "" }],
      });

      await adapter.run(makeConfig({ taskDescription: "Fix the login bug" }));

      const commitCall = vi
        .mocked(execFile)
        .mock.calls.find((call) => call[0] === "git" && (call[1] as string[]).includes("commit"));
      const msgIdx = (commitCall![1] as string[]).indexOf("-m");
      const commitMsg = (commitCall![1] as string[])[msgIdx + 1];
      expect(commitMsg).toMatch(/^feat: /);
      expect(commitMsg).toContain("Fix the login bug");
    });

    it("truncates long task in commit message to 72 chars total", async () => {
      const longTask = "A".repeat(100);

      setupExecFileMock({
        "test-cli": [{ stdout: "Done." }],
        "git-status": [{ stdout: " M file.ts\n" }],
        "git-add": [{ stdout: "" }],
        "git-commit": [{ stdout: "" }],
      });

      await adapter.run(makeConfig({ taskDescription: longTask }));

      const commitCall = vi
        .mocked(execFile)
        .mock.calls.find((call) => call[0] === "git" && (call[1] as string[]).includes("commit"));
      const msgIdx = (commitCall![1] as string[]).indexOf("-m");
      const commitMsg = (commitCall![1] as string[])[msgIdx + 1];
      expect(commitMsg.length).toBeLessThanOrEqual(72);
    });
  });
});
