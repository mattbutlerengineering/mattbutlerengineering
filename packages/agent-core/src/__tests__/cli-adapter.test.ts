/**
 * Characterization tests for cli-adapter.ts (interface contract) and the
 * concrete adapters that implement AgentAdapter.
 *
 * Tests pin:
 *  - AdapterConfig / AdapterResult shape via usage in concrete implementations
 *  - Each supported adapter's name and command/args construction
 *  - ClaudeAdapter availability logic (env-var gated)
 *  - Unknown-adapter / all-unavailable error path via FailoverRouter
 *
 * No real CLIs are spawned — child_process is mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock child_process before any adapter imports
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

// Mock session-runner (used by ClaudeAdapter.run) to avoid pulling in the full SDK
vi.mock("../session-runner.js", () => ({
  runSession: vi.fn(),
}));

import { execFile } from "node:child_process";
import type { AgentAdapter, AdapterConfig, AdapterResult } from "../cli-adapter.js";
import { GeminiCliAdapter } from "../adapters/gemini-adapter.js";
import { OpenCodeAdapter } from "../adapters/opencode-adapter.js";
import { ClaudeAdapter } from "../adapters/claude-adapter.js";
import { FailoverRouter, AllAdaptersUnavailableError } from "../failover-router.js";

// ── Helpers ───────────────────────────────────────────────────────────

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
    taskDescription: "Fix the auth bug",
    worktreePath: "/tmp/worktree-test",
    repoPath: "/tmp/repo",
    baseBranch: "main",
    ...overrides,
  };
}

function makeResult(overrides: Partial<AdapterResult> = {}): AdapterResult {
  return {
    success: true,
    hasChanges: false,
    rateLimited: false,
    durationMs: 42,
    ...overrides,
  };
}

// ── AgentAdapter interface contract ───────────────────────────────────

describe("AgentAdapter interface — contract shape", () => {
  it("GeminiCliAdapter satisfies AgentAdapter", () => {
    const adapter: AgentAdapter = new GeminiCliAdapter();
    expect(typeof adapter.name).toBe("string");
    expect(typeof adapter.isAvailable).toBe("function");
    expect(typeof adapter.run).toBe("function");
  });

  it("OpenCodeAdapter satisfies AgentAdapter", () => {
    const adapter: AgentAdapter = new OpenCodeAdapter();
    expect(typeof adapter.name).toBe("string");
    expect(typeof adapter.isAvailable).toBe("function");
    expect(typeof adapter.run).toBe("function");
  });

  it("ClaudeAdapter satisfies AgentAdapter", () => {
    const adapter: AgentAdapter = new ClaudeAdapter();
    expect(typeof adapter.name).toBe("string");
    expect(typeof adapter.isAvailable).toBe("function");
    expect(typeof adapter.run).toBe("function");
  });
});

// ── AdapterResult shape ───────────────────────────────────────────────

describe("AdapterResult — shape from concrete adapter", () => {
  let adapter: GeminiCliAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new GeminiCliAdapter();
  });

  it("result has all required fields: success, hasChanges, rateLimited, durationMs", async () => {
    setupExecFileMock({
      gemini: [{ stdout: "done" }],
      "git-status": [{ stdout: "" }],
    });

    const result = await adapter.run(makeConfig());

    expect(result).toMatchObject({
      success: expect.any(Boolean),
      hasChanges: expect.any(Boolean),
      rateLimited: expect.any(Boolean),
      durationMs: expect.any(Number),
    } satisfies Record<keyof AdapterResult, unknown>);
  });

  it("result.error is undefined on success", async () => {
    setupExecFileMock({
      gemini: [{ stdout: "done" }],
      "git-status": [{ stdout: "" }],
    });

    const result = await adapter.run(makeConfig());
    expect(result.error).toBeUndefined();
  });

  it("result.error is a string on failure", async () => {
    setupExecFileMock({
      gemini: [{ error: true, stderr: "gemini crashed" }],
      "git-status": [{ stdout: "" }],
    });

    const result = await adapter.run(makeConfig());
    expect(result.error).toBeTypeOf("string");
  });
});

// ── Adapter selection — names ─────────────────────────────────────────

describe("adapter names (selection keys)", () => {
  it("GeminiCliAdapter.name === 'gemini'", () => {
    expect(new GeminiCliAdapter().name).toBe("gemini");
  });

  it("OpenCodeAdapter.name === 'opencode'", () => {
    expect(new OpenCodeAdapter().name).toBe("opencode");
  });

  it("ClaudeAdapter.name === 'claude'", () => {
    expect(new ClaudeAdapter().name).toBe("claude");
  });
});

// ── GeminiCliAdapter — argument construction ──────────────────────────

describe("GeminiCliAdapter — argument construction", () => {
  let adapter: GeminiCliAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new GeminiCliAdapter();
  });

  it("constructs args as [-p, taskDescription, --yolo]", async () => {
    setupExecFileMock({
      gemini: [{ stdout: "" }],
      "git-status": [{ stdout: "" }],
    });

    await adapter.run(makeConfig({ taskDescription: "add feature X" }));

    const call = vi.mocked(execFile).mock.calls.find((c) => c[0] === "gemini");
    expect(call).toBeDefined();
    expect(call![1]).toEqual(["-p", "add feature X", "--yolo"]);
  });

  it("invokes 'gemini' binary", async () => {
    setupExecFileMock({
      gemini: [{ stdout: "" }],
      "git-status": [{ stdout: "" }],
    });

    await adapter.run(makeConfig());

    const call = vi.mocked(execFile).mock.calls.find((c) => c[0] === "gemini");
    expect(call).toBeDefined();
    expect(call![0]).toBe("gemini");
  });

  it("passes worktreePath as cwd", async () => {
    setupExecFileMock({
      gemini: [{ stdout: "" }],
      "git-status": [{ stdout: "" }],
    });

    await adapter.run(makeConfig({ worktreePath: "/tmp/my-worktree" }));

    const call = vi.mocked(execFile).mock.calls.find((c) => c[0] === "gemini");
    expect(call![2]).toMatchObject({ cwd: "/tmp/my-worktree" });
  });

  it("checks availability via 'which gemini'", async () => {
    setupExecFileMock({ which: [{ stdout: "/usr/bin/gemini" }] });
    const available = await adapter.isAvailable();
    expect(available).toBe(true);
    expect(execFile).toHaveBeenCalledWith("which", ["gemini"], expect.any(Function));
  });
});

// ── OpenCodeAdapter — argument construction ───────────────────────────

describe("OpenCodeAdapter — argument construction", () => {
  let adapter: OpenCodeAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new OpenCodeAdapter();
  });

  it("constructs args as [run, taskDescription]", async () => {
    setupExecFileMock({
      opencode: [{ stdout: "" }],
      "git-status": [{ stdout: "" }],
    });

    await adapter.run(makeConfig({ taskDescription: "refactor auth module" }));

    const call = vi.mocked(execFile).mock.calls.find((c) => c[0] === "opencode");
    expect(call).toBeDefined();
    expect(call![1]).toEqual(["run", "refactor auth module"]);
  });

  it("invokes 'opencode' binary", async () => {
    setupExecFileMock({
      opencode: [{ stdout: "" }],
      "git-status": [{ stdout: "" }],
    });

    await adapter.run(makeConfig());

    const call = vi.mocked(execFile).mock.calls.find((c) => c[0] === "opencode");
    expect(call).toBeDefined();
    expect(call![0]).toBe("opencode");
  });

  it("passes worktreePath as cwd", async () => {
    setupExecFileMock({
      opencode: [{ stdout: "" }],
      "git-status": [{ stdout: "" }],
    });

    await adapter.run(makeConfig({ worktreePath: "/tmp/opencode-tree" }));

    const call = vi.mocked(execFile).mock.calls.find((c) => c[0] === "opencode");
    expect(call![2]).toMatchObject({ cwd: "/tmp/opencode-tree" });
  });

  it("checks availability via 'which opencode'", async () => {
    setupExecFileMock({ which: [{ stdout: "/usr/bin/opencode" }] });
    const available = await adapter.isAvailable();
    expect(available).toBe(true);
    expect(execFile).toHaveBeenCalledWith("which", ["opencode"], expect.any(Function));
  });
});

// ── ClaudeAdapter — availability ──────────────────────────────────────

describe("ClaudeAdapter — availability", () => {
  const ORIGINAL_KEY = process.env["ANTHROPIC_API_KEY"];

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) {
      delete process.env["ANTHROPIC_API_KEY"];
    } else {
      process.env["ANTHROPIC_API_KEY"] = ORIGINAL_KEY;
    }
  });

  it("isAvailable returns true when ANTHROPIC_API_KEY is set", async () => {
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test-key";
    const adapter = new ClaudeAdapter();
    expect(await adapter.isAvailable()).toBe(true);
  });

  it("isAvailable returns false when ANTHROPIC_API_KEY is missing", async () => {
    delete process.env["ANTHROPIC_API_KEY"];
    const adapter = new ClaudeAdapter();
    expect(await adapter.isAvailable()).toBe(false);
  });

  it("isAvailable returns false when ANTHROPIC_API_KEY is empty string", async () => {
    process.env["ANTHROPIC_API_KEY"] = "";
    const adapter = new ClaudeAdapter();
    expect(await adapter.isAvailable()).toBe(false);
  });
});

// ── Unknown adapter / all-unavailable error path ──────────────────────

describe("unknown adapter / all adapters unavailable — error path", () => {
  it("FailoverRouter throws AllAdaptersUnavailableError when all adapters unavailable", async () => {
    const unavailableAdapter: AgentAdapter = {
      name: "unavailable-adapter",
      isAvailable: vi.fn().mockResolvedValue(false),
      run: vi.fn().mockResolvedValue(makeResult()),
    };

    const router = new FailoverRouter([unavailableAdapter]);

    await expect(router.route(makeConfig())).rejects.toThrow(AllAdaptersUnavailableError);
  });

  it("AllAdaptersUnavailableError is an Error subclass", async () => {
    const unavailableAdapter: AgentAdapter = {
      name: "gone",
      isAvailable: vi.fn().mockResolvedValue(false),
      run: vi.fn().mockResolvedValue(makeResult()),
    };

    const router = new FailoverRouter([unavailableAdapter]);

    let caught: unknown;
    try {
      await router.route(makeConfig());
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught).toBeInstanceOf(AllAdaptersUnavailableError);
  });

  it("FailoverRouter routes to the first available adapter when multiple are configured", async () => {
    const first: AgentAdapter = {
      name: "first",
      isAvailable: vi.fn().mockResolvedValue(true),
      run: vi.fn().mockResolvedValue(makeResult({ success: true })),
    };
    const second: AgentAdapter = {
      name: "second",
      isAvailable: vi.fn().mockResolvedValue(true),
      run: vi.fn().mockResolvedValue(makeResult({ success: true })),
    };

    const router = new FailoverRouter([first, second]);
    await router.route(makeConfig());

    // First adapter should be used; second should not be called
    expect(first.run).toHaveBeenCalledOnce();
    expect(second.run).not.toHaveBeenCalled();
  });

  it("FailoverRouter falls over to next adapter when first is unavailable", async () => {
    const unavailable: AgentAdapter = {
      name: "unavailable",
      isAvailable: vi.fn().mockResolvedValue(false),
      run: vi.fn(),
    };
    const available: AgentAdapter = {
      name: "available",
      isAvailable: vi.fn().mockResolvedValue(true),
      run: vi.fn().mockResolvedValue(makeResult({ success: true })),
    };

    const router = new FailoverRouter([unavailable, available]);
    await router.route(makeConfig());

    expect(unavailable.run).not.toHaveBeenCalled();
    expect(available.run).toHaveBeenCalledOnce();
  });
});
