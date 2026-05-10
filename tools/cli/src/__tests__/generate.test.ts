import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, writeFileSync } from "node:fs";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

const mockExistsSync = vi.mocked(existsSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

describe("generate command", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit called with ${code}`);
    });
    vi.spyOn(process, "cwd").mockReturnValue("/repo");

    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path === "/repo/pnpm-workspace.yaml") return true;
      if (path === "/repo/services/users/src/routes") return true;
      return false;
    });
  });

  async function runGenerate(args: string[]): Promise<void> {
    const { generateCommand } = await import("../commands/generate.js");
    await generateCommand.parseAsync(["node", "mbe", ...args]);
  }

  describe("component", () => {
    it("scaffolds a new component", async () => {
      await runGenerate(["component", "MyButton", "--target", "packages/rialto/src/components"]);
      expect(mockWriteFileSync).toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Component generated successfully"));
    });
  });

  describe("route", () => {
    it("scaffolds a new route", async () => {
      await runGenerate(["route", "Auth", "--service", "users"]);
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining("auth.ts"),
        expect.stringContaining("AuthRoutes"),
        "utf8"
      );
    });
  });
});
