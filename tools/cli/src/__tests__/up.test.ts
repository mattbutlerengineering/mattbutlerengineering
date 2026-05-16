import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import { execSync, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
}));

const mockExistsSync = vi.mocked(existsSync);
const mockExecSync = vi.mocked(execSync);
const mockSpawn = vi.mocked(spawn);

function makeFakeProcess(closeCode: number = 0): Partial<ChildProcess> {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const proc = {
    on(event: string, cb: (...args: unknown[]) => void) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
      if (event === "close") {
        Promise.resolve().then(() => cb(closeCode));
      }
      return proc;
    },
  };
  return proc as unknown as Partial<ChildProcess>;
}

describe("up command", () => {
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

    // Default: workspace found, no seed scripts
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      return path.endsWith("pnpm-workspace.yaml");
    });

    mockExecSync.mockReturnValue("" as never);
    mockSpawn.mockReturnValue(makeFakeProcess(0) as ChildProcess);
  });

  async function runUp(args: string[] = []): Promise<void> {
    const { upCommand } = await import("../commands/up.js");
    await upCommand.parseAsync(args, { from: "user" });
  }

  it("exits when docker is not available", async () => {
    mockExecSync.mockImplementation((cmd: unknown) => {
      if (String(cmd).includes("docker --version")) {
        throw new Error("docker not found");
      }
      return "" as never;
    });

    await runUp();

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errOutput).toContain("Docker is not installed");
  });

  it("runs full stack when docker is available", async () => {
    mockExecSync.mockReturnValue("Docker version 24.0.0" as never);

    await runUp();

    // Should have called docker-compose
    const execCalls = mockExecSync.mock.calls.map(([cmd]) => String(cmd));
    expect(execCalls.some((cmd) => cmd.includes("docker compose"))).toBe(true);
    // Should have spawned pnpm dev
    expect(mockSpawn).toHaveBeenCalledWith("pnpm", ["dev"], expect.any(Object));
  });

  it("skips infra when --skip-infra is passed", async () => {
    mockExecSync.mockReturnValue("Docker version 24.0.0" as never);

    await runUp(["--skip-infra"]);

    const execCalls = mockExecSync.mock.calls.map(([cmd]) => String(cmd));
    expect(execCalls.some((cmd) => cmd.includes("docker compose"))).toBe(false);
  });

  it("skips database setup when --skip-db is passed", async () => {
    mockExecSync.mockReturnValue("Docker version 24.0.0" as never);

    await runUp(["--skip-db", "--skip-infra"]);

    const execCalls = mockExecSync.mock.calls.map(([cmd]) => String(cmd));
    expect(execCalls.some((cmd) => cmd.includes("db:push"))).toBe(false);
  });

  it("runs db:seed when seed script exists", async () => {
    mockExecSync.mockReturnValue("Docker version 24.0.0" as never);
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith("pnpm-workspace.yaml")) return true;
      if (path.includes("scripts/seed.js")) return true;
      return false;
    });

    await runUp();

    const execCalls = mockExecSync.mock.calls.map(([cmd]) => String(cmd));
    expect(execCalls.some((cmd) => cmd.includes("db:seed"))).toBe(true);
  });

  it("exits with 1 and logs error when bootstrapping throws non-docker error", async () => {
    mockExecSync.mockImplementation((cmd: unknown) => {
      const c = String(cmd);
      if (c.includes("docker --version")) return "Docker 24.0.0" as never;
      if (c.includes("env:init")) throw new Error("env init failed");
      return "" as never;
    });

    await runUp();

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errOutput).toContain("Bootstrapping failed");
    expect(errOutput).toContain("env init failed");
  });

  it("continues when db:seed fails", async () => {
    mockExecSync.mockImplementation((cmd: unknown) => {
      const c = String(cmd);
      if (c.includes("db:seed")) throw new Error("seed failed");
      return "" as never;
    });
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith("pnpm-workspace.yaml")) return true;
      if (path.includes("scripts/seed.js")) return true;
      return false;
    });

    await runUp();

    // Should still have spawned pnpm dev
    expect(mockSpawn).toHaveBeenCalled();
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("No db:seed script found");
  });
});
