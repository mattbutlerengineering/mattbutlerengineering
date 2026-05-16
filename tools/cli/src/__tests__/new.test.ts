import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
}));

const mockExistsSync = vi.mocked(existsSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockReaddirSync = vi.mocked(readdirSync);

describe("new command", () => {
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

    // Default: workspace found, app dir does not exist, apps dir exists
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith("pnpm-workspace.yaml")) return true;
      if (path.endsWith("/repo/apps")) return true;
      return false;
    });
    mockReaddirSync.mockReturnValue([] as never);
  });

  async function runNew(args: string[]): Promise<void> {
    const { newCommand } = await import("../commands/new.js");
    await newCommand.parseAsync(args, { from: "user" });
  }

  it("rejects invalid app names", async () => {
    await runNew(["Invalid-Name"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errOutput).toContain("invalid");
  });

  it("rejects names that start with numbers", async () => {
    await runNew(["123app"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("exits when app directory already exists", async () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith("pnpm-workspace.yaml")) return true;
      if (path.includes("apps/my-app")) return true;
      return false;
    });

    await runNew(["my-app"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errOutput).toContain("already exists");
  });

  it("scaffolds a new app with correct files", async () => {
    await runNew(["my-new-app"]);

    expect(exitSpy).not.toHaveBeenCalled();
    expect(mockWriteFileSync).toHaveBeenCalled();
    expect(mockMkdirSync).toHaveBeenCalled();

    // Check that package.json was written
    const packageJsonCall = mockWriteFileSync.mock.calls.find(
      ([path]) => String(path).endsWith("package.json") && String(path).includes("my-new-app")
    );
    expect(packageJsonCall).toBeDefined();
    expect(String(packageJsonCall![1])).toContain("@mbe/my-new-app");

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Scaffolded apps/my-new-app/");
  });

  it("uses provided --port option", async () => {
    await runNew(["my-app", "--port", "4000"]);

    expect(exitSpy).not.toHaveBeenCalled();
    const viteConfigCall = mockWriteFileSync.mock.calls.find(
      ([path]) => String(path).endsWith("vite.config.ts")
    );
    expect(viteConfigCall).toBeDefined();
    expect(String(viteConfigCall![1])).toContain("4000");
  });

  it("rejects invalid port values", async () => {
    await runNew(["my-app", "--port", "99999"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errOutput).toContain("Invalid port");
  });

  it("auto-detects next available port from existing vite configs", async () => {
    const { readFileSync } = await import("node:fs");
    const mockReadFileSync = vi.mocked(readFileSync);

    mockReaddirSync.mockReturnValue([
      { name: "existing-app", isDirectory: () => true },
    ] as never);
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith("pnpm-workspace.yaml")) return true;
      if (path.endsWith("apps")) return true;
      if (path.endsWith("vite.config.ts")) return true;
      return false;
    });
    mockReadFileSync.mockReturnValue("port: 3005" as never);

    await runNew(["new-app"]);

    expect(exitSpy).not.toHaveBeenCalled();
    // Port 3005 is taken, so 3006 should be used
    const viteConfigCall = mockWriteFileSync.mock.calls.find(
      ([path]) => String(path).endsWith("vite.config.ts")
    );
    expect(viteConfigCall).toBeDefined();
    expect(String(viteConfigCall![1])).toContain("3006");
  });
});
