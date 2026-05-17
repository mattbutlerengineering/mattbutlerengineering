import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process before imports
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";
import { OpenCodeAdapter } from "../opencode-adapter.js";
import type { AdapterConfig } from "../cli-adapter.js";

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

describe("OpenCodeAdapter", () => {
  let adapter: OpenCodeAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new OpenCodeAdapter();
  });

  // ── name ────────────────────────────────────────────────────────

  it("has name 'opencode'", () => {
    expect(adapter.name).toBe("opencode");
  });

  // ── isAvailable ─────────────────────────────────────────────────

  describe("isAvailable", () => {
    it("returns true when 'which opencode' succeeds", async () => {
      setupExecFileMock({
        which: [{ stdout: "/Users/mbutler/.opencode/bin/opencode\n" }],
      });

      const result = await adapter.isAvailable();

      expect(result).toBe(true);
      expect(execFile).toHaveBeenCalledWith("which", ["opencode"], expect.any(Function));
    });

    it("returns false when 'which opencode' fails", async () => {
      setupExecFileMock({
        which: [{ error: true, stderr: "opencode not found" }],
      });

      const result = await adapter.isAvailable();

      expect(result).toBe(false);
    });
  });

  // ── run — command construction ──────────────────────────────────

  describe("run", () => {
    it("builds correct opencode command arguments with run subcommand", async () => {
      setupExecFileMock({
        opencode: [{ stdout: "Done!" }],
        "git-status": [{ stdout: "" }], // no changes
      });

      await adapter.run(makeConfig());

      // Verify opencode was called with correct args
      const opencodeCall = vi.mocked(execFile).mock.calls.find((call) => call[0] === "opencode");
      expect(opencodeCall).toBeDefined();
      expect(opencodeCall![1]).toEqual(["run", "Fix the login bug in auth.ts"]);
      // Verify cwd is set to worktreePath
      expect(opencodeCall![2]).toMatchObject({
        cwd: "/tmp/worktree-abc123",
      });
    });

    it("returns success when opencode exits with code 0", async () => {
      setupExecFileMock({
        opencode: [{ stdout: "All changes applied." }],
        "git-status": [{ stdout: "" }],
      });

      const result = await adapter.run(makeConfig());

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("returns failure when opencode exits with non-zero code", async () => {
      setupExecFileMock({
        opencode: [{ error: true, stderr: "Something went wrong" }],
        "git-status": [{ stdout: "" }],
      });

      const result = await adapter.run(makeConfig());

      expect(result.success).toBe(false);
      expect(result.error).toBe("Something went wrong");
    });

    it("returns generic error message when stderr is empty on failure", async () => {
      setupExecFileMock({
        opencode: [{ error: true, stderr: "" }],
        "git-status": [{ stdout: "" }],
      });

      const result = await adapter.run(makeConfig());

      expect(result.success).toBe(false);
      expect(result.error).toBe("OpenCode CLI exited with non-zero status");
    });

    it("sets timeout from config.timeoutMs", async () => {
      setupExecFileMock({
        opencode: [{ stdout: "" }],
        "git-status": [{ stdout: "" }],
      });

      await adapter.run(makeConfig({ timeoutMs: 30_000 }));

      const opencodeCall = vi.mocked(execFile).mock.calls.find((call) => call[0] === "opencode");
      expect(opencodeCall![2]).toMatchObject({ timeout: 30_000 });
    });

    it("uses default 600s timeout when not specified", async () => {
      setupExecFileMock({
        opencode: [{ stdout: "" }],
        "git-status": [{ stdout: "" }],
      });

      await adapter.run(makeConfig());

      const opencodeCall = vi.mocked(execFile).mock.calls.find((call) => call[0] === "opencode");
      expect(opencodeCall![2]).toMatchObject({ timeout: 600_000 });
    });

    it("includes durationMs in result", async () => {
      setupExecFileMock({
        opencode: [{ stdout: "" }],
        "git-status": [{ stdout: "" }],
      });

      const result = await adapter.run(makeConfig());

      expect(result.durationMs).toBeTypeOf("number");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ── run — rate-limit detection ──────────────────────────────────

  describe("rate-limit detection", () => {
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
          opencode: [{ error: true, stdout, stderr }],
          "git-status": [{ stdout: "" }],
        });

        const result = await adapter.run(makeConfig());

        expect(result.rateLimited).toBe(true);
      });
    }

    it("does not flag rateLimited when output has no rate-limit patterns", async () => {
      setupExecFileMock({
        opencode: [{ stdout: "Successfully completed task." }],
        "git-status": [{ stdout: "" }],
      });

      const result = await adapter.run(makeConfig());

      expect(result.rateLimited).toBe(false);
    });
  });

  // ── run — change detection ──────────────────────────────────────

  describe("change detection", () => {
    it("detects changes via git status --porcelain", async () => {
      setupExecFileMock({
        opencode: [{ stdout: "Applied fix." }],
        "git-status": [{ stdout: " M src/auth.ts\n?? src/new-file.ts\n" }],
        "git-add": [{ stdout: "" }],
        "git-commit": [{ stdout: "" }],
      });

      const result = await adapter.run(makeConfig());

      expect(result.hasChanges).toBe(true);
    });

    it("reports no changes when git status is empty", async () => {
      setupExecFileMock({
        opencode: [{ stdout: "No changes needed." }],
        "git-status": [{ stdout: "" }],
      });

      const result = await adapter.run(makeConfig());

      expect(result.hasChanges).toBe(false);
    });

    it("commits changes when they exist", async () => {
      setupExecFileMock({
        opencode: [{ stdout: "Done." }],
        "git-status": [{ stdout: " M file.ts\n" }],
        "git-add": [{ stdout: "" }],
        "git-commit": [{ stdout: "" }],
      });

      await adapter.run(makeConfig());

      // Verify git add -A was called
      const addCall = vi
        .mocked(execFile)
        .mock.calls.find((call) => call[0] === "git" && (call[1] as string[]).includes("add"));
      expect(addCall).toBeDefined();
      expect(addCall![1]).toContain("-A");

      // Verify git commit was called with a message
      const commitCall = vi
        .mocked(execFile)
        .mock.calls.find((call) => call[0] === "git" && (call[1] as string[]).includes("commit"));
      expect(commitCall).toBeDefined();
      expect(commitCall![1]).toContain("-m");
    });

    it("does not commit when there are no changes", async () => {
      setupExecFileMock({
        opencode: [{ stdout: "Nothing to do." }],
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
        opencode: [{ stdout: "Done." }],
        "git-status": [{ error: true, stderr: "not a git repo" }],
      });

      const result = await adapter.run(makeConfig());

      expect(result.hasChanges).toBe(false);
    });
  });

  // ── run — task truncation ───────────────────────────────────────

  describe("task truncation", () => {
    it("truncates very long task descriptions", async () => {
      const longTask = "A".repeat(10_000);

      setupExecFileMock({
        opencode: [{ stdout: "" }],
        "git-status": [{ stdout: "" }],
      });

      await adapter.run(makeConfig({ taskDescription: longTask }));

      const opencodeCall = vi.mocked(execFile).mock.calls.find((call) => call[0] === "opencode");
      const passedTask = (opencodeCall![1] as string[])[1];
      expect(passedTask.length).toBeLessThanOrEqual(8_000);
      expect(passedTask).toMatch(/\.\.\.$/);
    });
  });
});
