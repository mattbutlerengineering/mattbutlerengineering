import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";
import { GrokCliAdapter } from "../grok-adapter.js";
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

describe("GrokCliAdapter", () => {
  let adapter: GrokCliAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new GrokCliAdapter();
  });

  it("has name 'grok'", () => {
    expect(adapter.name).toBe("grok");
  });

  it("returns true when 'which grok' succeeds", async () => {
    setupExecFileMock({ which: [{ stdout: "/Users/mbutler/.grok/bin/grok\n" }] });

    await expect(adapter.isAvailable()).resolves.toBe(true);
    expect(execFile).toHaveBeenCalledWith("which", ["grok"], expect.any(Function));
  });

  it("spawns grok headless in the worktree and auto-approves tools", async () => {
    setupExecFileMock({
      grok: [{ stdout: JSON.stringify({ text: "Done." }) }],
      "git-status": [{ stdout: "" }],
    });

    await adapter.run(makeConfig());

    const call = vi.mocked(execFile).mock.calls.find((c) => c[0] === "grok");
    expect(call).toBeDefined();
    expect(call![1]).toEqual([
      "-p",
      "Fix the login bug in auth.ts",
      "--output-format",
      "json",
      "--always-approve",
    ]);
    expect(call![2]).toMatchObject({ cwd: "/tmp/worktree-abc123" });
  });

  it("forwards a grok model id and maxTurns", async () => {
    setupExecFileMock({ grok: [{ stdout: "" }], "git-status": [{ stdout: "" }] });

    await adapter.run(makeConfig({ model: "grok-4.6", maxTurns: 12 }));

    const call = vi.mocked(execFile).mock.calls.find((c) => c[0] === "grok");
    expect(call![1]).toEqual([
      "-p",
      "Fix the login bug in auth.ts",
      "--output-format",
      "json",
      "--always-approve",
      "--max-turns",
      "12",
      "-m",
      "grok-4.6",
    ]);
  });

  it("does not forward a Claude model id to grok -m", async () => {
    setupExecFileMock({ grok: [{ stdout: "" }], "git-status": [{ stdout: "" }] });

    await adapter.run(makeConfig({ model: "claude-sonnet-5" }));

    const args = vi.mocked(execFile).mock.calls.find((c) => c[0] === "grok")![1] as string[];
    expect(args).not.toContain("-m");
    expect(args).not.toContain("claude-sonnet-5");
  });

  it("reads cost, tokens, and turns from the JSON blob", async () => {
    setupExecFileMock({
      grok: [
        {
          stdout: JSON.stringify({
            text: "Done.",
            num_turns: 3,
            usage: { input_tokens: 100, cache_read_input_tokens: 50, output_tokens: 20 },
            total_cost_usd: 0.004,
          }),
        },
      ],
      "git-status": [{ stdout: "" }],
    });

    const result = await adapter.run(makeConfig());

    expect(result.success).toBe(true);
    expect(result.costUsd).toBe(0.004);
    expect(result.numTurns).toBe(3);
    expect(result.tokenUsage).toEqual({ inputTokens: 150, outputTokens: 20 });
  });

  it("recovers the JSON error message when grok exits non-zero", async () => {
    setupExecFileMock({
      grok: [
        {
          error: true,
          stdout: JSON.stringify({ type: "error", message: "Couldn't start session" }),
          stderr: "",
        },
      ],
      "git-status": [{ stdout: "" }],
    });

    const result = await adapter.run(makeConfig());

    expect(result.success).toBe(false);
    expect(result.error).toBe("Couldn't start session");
  });
});
