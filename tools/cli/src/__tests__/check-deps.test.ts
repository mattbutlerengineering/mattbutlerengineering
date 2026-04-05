import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { glob } from "glob";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock("glob", () => ({
  glob: vi.fn(),
}));

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockGlob = vi.mocked(glob);

describe("check-deps command", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    // Make findMonorepoRoot find a root with pnpm-workspace.yaml
    mockExistsSync.mockReturnValue(true);
  });

  async function runCheckDeps(): Promise<void> {
    const { checkDepsCommand } = await import("../commands/check-deps.js");
    await checkDepsCommand.parseAsync(["check-deps"], { from: "user" });
  }

  it("reports no mismatches when all versions are consistent", async () => {
    mockGlob.mockResolvedValue(["package.json", "packages/a/package.json"] as never);
    mockReadFileSync.mockImplementation((filePath: unknown) => {
      const path = String(filePath);
      if (path.includes("packages/a")) {
        return JSON.stringify({
          name: "@mbe/a",
          dependencies: { zod: "^3.22.0" },
        });
      }
      return JSON.stringify({
        name: "root",
        dependencies: { zod: "^3.22.0" },
      });
    });

    await runCheckDeps();
    const logOutput = logSpy.mock.calls.flat().join(" ");
    expect(logOutput).toContain("All external dependencies are consistent");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("detects version mismatches across packages", async () => {
    mockGlob.mockResolvedValue(["package.json", "packages/a/package.json"] as never);
    mockReadFileSync.mockImplementation((filePath: unknown) => {
      const path = String(filePath);
      if (path.includes("packages/a")) {
        return JSON.stringify({
          name: "@mbe/a",
          dependencies: { zod: "^3.21.0" },
        });
      }
      return JSON.stringify({
        name: "root",
        dependencies: { zod: "^3.22.0" },
      });
    });

    await runCheckDeps();
    expect(exitSpy).toHaveBeenCalledWith(1);
    const warnOutput = warnSpy.mock.calls.flat().join(" ");
    expect(warnOutput).toContain("zod");
    expect(warnOutput).toContain("^3.21.0");
    expect(warnOutput).toContain("^3.22.0");
  });

  it("skips workspace: and catalog: versions", async () => {
    mockGlob.mockResolvedValue(["package.json", "packages/a/package.json"] as never);
    mockReadFileSync.mockImplementation((filePath: unknown) => {
      const path = String(filePath);
      if (path.includes("packages/a")) {
        return JSON.stringify({
          name: "@mbe/a",
          dependencies: { "@mbe/types": "workspace:*", typescript: "catalog:" },
        });
      }
      return JSON.stringify({
        name: "root",
        dependencies: { "@mbe/types": "workspace:*", typescript: "catalog:" },
      });
    });

    await runCheckDeps();
    const logOutput = logSpy.mock.calls.flat().join(" ");
    expect(logOutput).toContain("All external dependencies are consistent");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("includes devDependencies in the check", async () => {
    mockGlob.mockResolvedValue(["packages/a/package.json", "packages/b/package.json"] as never);
    mockReadFileSync.mockImplementation((filePath: unknown) => {
      const path = String(filePath);
      if (path.includes("packages/a")) {
        return JSON.stringify({
          name: "@mbe/a",
          devDependencies: { vitest: "^1.0.0" },
        });
      }
      return JSON.stringify({
        name: "@mbe/b",
        devDependencies: { vitest: "^2.0.0" },
      });
    });

    await runCheckDeps();
    expect(exitSpy).toHaveBeenCalledWith(1);
    const warnOutput = warnSpy.mock.calls.flat().join(" ");
    expect(warnOutput).toContain("vitest");
  });

  it("handles packages with no dependencies gracefully", async () => {
    mockGlob.mockResolvedValue(["package.json"] as never);
    mockReadFileSync.mockReturnValue(JSON.stringify({ name: "root" }));

    await runCheckDeps();
    const logOutput = logSpy.mock.calls.flat().join(" ");
    expect(logOutput).toContain("All external dependencies are consistent");
  });
});
