import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

const mockExistsSync = vi.mocked(existsSync);
const mockSpawn = vi.mocked(spawn);

function makeFakeProcess(closeCode: number = 0): Partial<ChildProcess> {
  const proc = {
    on(event: string, cb: (...args: unknown[]) => void) {
      if (event === "close") {
        Promise.resolve().then(() => cb(closeCode));
      }
      return proc;
    },
  };
  return proc as unknown as Partial<ChildProcess>;
}

describe("visual command", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    vi.spyOn(process, "cwd").mockReturnValue("/repo");
    mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith("pnpm-workspace.yaml"));
    mockSpawn.mockReturnValue(makeFakeProcess(0) as ChildProcess);
  });

  async function runVisual(args: string[] = []): Promise<void> {
    const { visualCommand } = await import("../commands/visual.js");
    await visualCommand.parseAsync(args, { from: "user" });
  }

  it("runs playwright tests without filter", async () => {
    await runVisual();

    expect(mockSpawn).toHaveBeenCalledWith(
      "pnpm",
      expect.arrayContaining(["playwright", "test", "e2e/visual.spec.ts"]),
      expect.any(Object)
    );

    const args = mockSpawn.mock.calls[0][1] as string[];
    expect(args).not.toContain("-g");
    expect(args).not.toContain("--update-snapshots");
  });

  it("adds -g filter when a filter argument is provided", async () => {
    await runVisual(["button"]);

    const args = mockSpawn.mock.calls[0][1] as string[];
    expect(args).toContain("-g");
    expect(args).toContain("button");
  });

  it("adds --update-snapshots when -u flag is passed", async () => {
    await runVisual(["-u"]);

    const args = mockSpawn.mock.calls[0][1] as string[];
    expect(args).toContain("--update-snapshots");
  });

  it("shows success message when tests pass", async () => {
    await runVisual();

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Visual tests passed");
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("shows failure message when tests fail", async () => {
    mockSpawn.mockReturnValue(makeFakeProcess(1) as ChildProcess);

    await runVisual();

    const errOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errOutput).toContain("Visual tests failed");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
