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

describe("mcp command", () => {
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
    mockSpawn.mockReturnValue(makeFakeProcess(0) as ChildProcess);
  });

  async function runMcpStart(): Promise<void> {
    const { mcpCommand } = await import("../commands/mcp.js");
    await mcpCommand.commands[0].parseAsync([], { from: "user" });
  }

  it("exits with error when mcp-server package directory does not exist", async () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      // workspace found but no mcp-server dir
      return path.endsWith("pnpm-workspace.yaml");
    });

    await runMcpStart();

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errOutput).toContain("MCP server package not found");
  });

  it("spawns pnpm start in the mcp-server directory when package exists", async () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith("pnpm-workspace.yaml")) return true;
      if (path.includes("packages/mcp-server")) return true;
      return false;
    });

    await runMcpStart();

    expect(mockSpawn).toHaveBeenCalledWith(
      "pnpm",
      ["start"],
      expect.objectContaining({ cwd: expect.stringContaining("packages/mcp-server") })
    );
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Starting MBE Infra MCP Server");
  });

  it("exits with the server close code when server exits", async () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith("pnpm-workspace.yaml")) return true;
      if (path.includes("packages/mcp-server")) return true;
      return false;
    });
    mockSpawn.mockReturnValue(makeFakeProcess(2) as ChildProcess);

    await runMcpStart();

    expect(exitSpy).toHaveBeenCalledWith(2);
  });
});
