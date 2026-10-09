import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";
import { OmpCliAdapter } from "../omp-adapter.js";
import type { AdapterConfig } from "../../cli-adapter.js";

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
    const idx = Math.min(callCounts[key]! - 1, responseList.length - 1);
    const response = responseList[idx]!;

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

describe("OmpCliAdapter", () => {
  let adapter: OmpCliAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new OmpCliAdapter();
  });

  it("has name 'omp'", () => {
    expect(adapter.name).toBe("omp");
  });

  it("returns true when 'which omp' succeeds", async () => {
    setupExecFileMock({ which: [{ stdout: "/opt/homebrew/bin/omp\n" }] });

    await expect(adapter.isAvailable()).resolves.toBe(true);
    expect(execFile).toHaveBeenCalledWith("which", ["omp"], expect.any(Function));
  });

  it("spawns omp headless in the worktree and auto-approves tools", async () => {
    setupExecFileMock({
      omp: [{ stdout: JSON.stringify({ type: "agent_settled", aborted: false }) }],
      "git-status": [{ stdout: "" }],
    });

    await adapter.run(makeConfig());

    const call = vi.mocked(execFile).mock.calls.find((c) => c[0] === "omp");
    expect(call).toBeDefined();
    expect(call![1]).toEqual([
      "-p",
      "--mode",
      "json",
      "--auto-approve",
      "--no-session",
      "--",
      "Fix the login bug in auth.ts",
    ]);
    expect(call![2]).toMatchObject({ cwd: "/tmp/worktree-abc123" });
  });

  it("forwards an omp model id", async () => {
    setupExecFileMock({ omp: [{ stdout: "" }], "git-status": [{ stdout: "" }] });

    await adapter.run(makeConfig({ model: "openai/gpt-5.2" }));

    const call = vi.mocked(execFile).mock.calls.find((c) => c[0] === "omp");
    expect(call![1]).toEqual([
      "-p",
      "--mode",
      "json",
      "--auto-approve",
      "--no-session",
      "--model",
      "openai/gpt-5.2",
      "--",
      "Fix the login bug in auth.ts",
    ]);
  });

  it("does not forward a Claude router model id to omp --model", async () => {
    setupExecFileMock({ omp: [{ stdout: "" }], "git-status": [{ stdout: "" }] });

    await adapter.run(makeConfig({ model: "claude-sonnet-5" }));

    const args = vi.mocked(execFile).mock.calls.find((c) => c[0] === "omp")![1] as string[];
    expect(args).not.toContain("--model");
    expect(args).not.toContain("claude-sonnet-5");
  });

  it("reads cost, tokens, and turns from the JSONL stream", async () => {
    const stdout = [
      JSON.stringify({ type: "session", version: 3, id: "s1" }),
      JSON.stringify({ type: "turn_end", message: { role: "assistant" }, toolResults: [] }),
      JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          usage: {
            input: 100,
            output: 20,
            cacheRead: 50,
            cacheWrite: 0,
            cost: { total: 0.004 },
          },
        },
      }),
    ].join("\n");
    setupExecFileMock({
      omp: [{ stdout }],
      "git-status": [{ stdout: "" }],
    });

    const result = await adapter.run(makeConfig());

    expect(result.success).toBe(true);
    expect(result.costUsd).toBe(0.004);
    expect(result.numTurns).toBe(1);
    expect(result.tokenUsage).toEqual({ inputTokens: 150, outputTokens: 20 });
  });

  it("recovers the final retry error when omp exits non-zero", async () => {
    const stdout = JSON.stringify({
      type: "auto_retry_end",
      success: false,
      finalError: "not logged in",
    });
    setupExecFileMock({
      omp: [{ error: true, stdout, stderr: "" }],
      "git-status": [{ stdout: "" }],
    });

    const result = await adapter.run(makeConfig());

    expect(result.success).toBe(false);
    expect(result.error).toBe("not logged in");
  });
});
