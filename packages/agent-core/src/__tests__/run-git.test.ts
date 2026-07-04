import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";
import { runGit, GitCommandError, DEFAULT_GIT_TIMEOUT_MS } from "../run-git.js";

/** Configure the promisified execFile mock to succeed with the given stdout. */
function mockGitSuccess(stdout: string): void {
  vi.mocked(execFile).mockImplementation(((...args: unknown[]) => {
    const callback = args[args.length - 1] as (err: null, result: { stdout: string }) => void;
    callback(null, { stdout });
    return {} as ReturnType<typeof execFile>;
  }) as typeof execFile);
}

/** Configure the promisified execFile mock to fail with the given error shape. */
function mockGitFailure(err: {
  message: string;
  code?: number;
  stderr?: string;
  killed?: boolean;
}): void {
  vi.mocked(execFile).mockImplementation(((...args: unknown[]) => {
    const callback = args[args.length - 1] as (err: unknown) => void;
    callback(err);
    return {} as ReturnType<typeof execFile>;
  }) as typeof execFile);
}

describe("runGit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes the arg array straight through to execFile (never a shell string)", async () => {
    mockGitSuccess("  main  ");

    await runGit(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: "/repo" });

    const call = vi.mocked(execFile).mock.calls[0];
    expect(call[0]).toBe("git");
    expect(call[1]).toEqual(["rev-parse", "--abbrev-ref", "HEAD"]);
  });

  it("passes an argv element containing shell metacharacters through untouched (no interpolation)", async () => {
    mockGitSuccess("");
    const maliciousBranch = "evil; rm -rf / #";

    await runGit(["branch", "-D", "--", maliciousBranch], { cwd: "/repo" });

    const call = vi.mocked(execFile).mock.calls[0];
    // The dangerous string must arrive as a single argv element, not be
    // concatenated into a shell command string that a shell would parse.
    expect(call[1]).toEqual(["branch", "-D", "--", maliciousBranch]);
    expect(typeof call[1]).not.toBe("string");
  });

  it("returns trimmed stdout on success", async () => {
    mockGitSuccess("  abc123  \n");

    const result = await runGit(["rev-parse", "HEAD"]);

    expect(result).toBe("abc123");
  });

  it("passes cwd through to execFile options", async () => {
    mockGitSuccess("");

    await runGit(["status"], { cwd: "/some/worktree" });

    const call = vi.mocked(execFile).mock.calls[0];
    const opts = call[2] as { cwd?: string };
    expect(opts.cwd).toBe("/some/worktree");
  });

  it("defaults the timeout to DEFAULT_GIT_TIMEOUT_MS", async () => {
    mockGitSuccess("");

    await runGit(["status"]);

    const call = vi.mocked(execFile).mock.calls[0];
    const opts = call[2] as { timeout?: number };
    expect(opts.timeout).toBe(DEFAULT_GIT_TIMEOUT_MS);
  });

  it("enforces a custom timeout when provided", async () => {
    mockGitSuccess("");

    await runGit(["status"], { timeoutMs: 5_000 });

    const call = vi.mocked(execFile).mock.calls[0];
    const opts = call[2] as { timeout?: number };
    expect(opts.timeout).toBe(5_000);
  });

  it("throws a typed GitCommandError on subprocess failure", async () => {
    mockGitFailure({ message: "Command failed", code: 128, stderr: "fatal: not a git repository" });

    await expect(runGit(["status"])).rejects.toBeInstanceOf(GitCommandError);
  });

  it("captures exit code and stderr on the typed error", async () => {
    mockGitFailure({ message: "Command failed", code: 128, stderr: "fatal: bad revision" });

    const error = await runGit(["rev-parse", "nonexistent"]).catch((e) => e as GitCommandError);

    expect(error).toBeInstanceOf(GitCommandError);
    expect(error.exitCode).toBe(128);
    expect(error.stderr).toBe("fatal: bad revision");
    expect(error.args).toEqual(["rev-parse", "nonexistent"]);
    expect(error.message).toContain("git rev-parse nonexistent failed");
  });

  it("surfaces a timeout as a typed error", async () => {
    mockGitFailure({ message: "Command timed out", killed: true });

    const error = await runGit(["fetch"], { timeoutMs: 1 }).catch((e) => e as GitCommandError);

    expect(error).toBeInstanceOf(GitCommandError);
    expect(error.message.toLowerCase()).toContain("timed out");
  });
});
