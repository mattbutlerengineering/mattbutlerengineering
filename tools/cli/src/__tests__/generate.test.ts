import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

const mockExistsSync = vi.mocked(existsSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

// Throw on process.exit so that execution actually stops after an error
class ExitError extends Error {
  constructor(public code: number) {
    super(`process.exit(${code})`);
  }
}

describe("generate command", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new ExitError(code ?? 0);
    }) as never);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Default: pnpm-workspace.yaml exists at cwd (so findMonorepoRoot returns cwd)
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      return path.endsWith("pnpm-workspace.yaml");
    });
  });

  async function runGenerate(args: string[]): Promise<void> {
    const { generateCommand } = await import("../commands/generate.js");
    await generateCommand.parseAsync(args, { from: "user" });
  }

  // ── component subcommand ────────────────────────────────────────────────

  describe("component subcommand", () => {
    it("generates all four component files when target directory does not exist", async () => {
      // pnpm-workspace.yaml exists; target dir does NOT exist
      mockExistsSync.mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith("pnpm-workspace.yaml")) return true;
        return false; // component dir does not exist
      });

      await runGenerate(["component", "Button", "--target", "packages/rialto/src/components"]);

      expect(mockWriteFileSync).toHaveBeenCalledTimes(4);

      const writtenPaths = mockWriteFileSync.mock.calls.map((c) => String(c[0]));
      expect(writtenPaths.some((p) => p.endsWith("Button.tsx"))).toBe(true);
      expect(writtenPaths.some((p) => p.endsWith("Button.module.css"))).toBe(true);
      expect(writtenPaths.some((p) => p.endsWith("Button.test.tsx"))).toBe(true);
      expect(writtenPaths.some((p) => p.endsWith("index.ts"))).toBe(true);

      const logOutput = logSpy.mock.calls.flat().join("\n");
      expect(logOutput).toContain("generated successfully");
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it("exits with error when --target is omitted", async () => {
      await expect(runGenerate(["component", "Button"])).rejects.toThrow(ExitError);
      expect(exitSpy).toHaveBeenCalledWith(1);
      const errOutput = errorSpy.mock.calls.flat().join("\n");
      expect(errOutput).toContain("--target");
    });

    it("exits with error when the target directory already exists", async () => {
      mockExistsSync.mockImplementation(() => {
        // pnpm-workspace.yaml exists AND so does the target directory
        return true;
      });

      await expect(
        runGenerate(["component", "Button", "--target", "packages/rialto/src/components"])
      ).rejects.toThrow(ExitError);

      expect(exitSpy).toHaveBeenCalledWith(1);
      const errOutput = errorSpy.mock.calls.flat().join("\n");
      expect(errOutput).toContain("already exists");
    });

    it("generates TSX file with correct component template content", async () => {
      mockExistsSync.mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith("pnpm-workspace.yaml")) return true;
        return false;
      });

      await runGenerate(["component", "Card", "--target", "packages/rialto/src/components"]);

      const tsxCall = mockWriteFileSync.mock.calls.find((c) => String(c[0]).endsWith("Card.tsx"));
      expect(tsxCall).toBeDefined();
      const content = String(tsxCall![1]);
      expect(content).toContain("export interface CardProps");
      expect(content).toContain("export function Card");
      expect(content).toContain("Card.module.css");
    });

    it("generates test file with correct content", async () => {
      mockExistsSync.mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith("pnpm-workspace.yaml")) return true;
        return false;
      });

      await runGenerate(["component", "Badge", "--target", "packages/rialto/src/components"]);

      const testCall = mockWriteFileSync.mock.calls.find((c) =>
        String(c[0]).endsWith("Badge.test.tsx")
      );
      expect(testCall).toBeDefined();
      const content = String(testCall![1]);
      expect(content).toContain('describe("Badge"');
      expect(content).toContain("render(<Badge>");
    });

    it("creates parent directories via mkdirSync", async () => {
      mockExistsSync.mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith("pnpm-workspace.yaml")) return true;
        return false;
      });

      await runGenerate(["component", "MyComp", "--target", "packages/rialto/src/components"]);

      expect(mockMkdirSync).toHaveBeenCalled();
      const firstCall = mockMkdirSync.mock.calls[0];
      expect(firstCall[1]).toEqual({ recursive: true });
    });
  });

  // ── route subcommand ─────────────────────────────────────────────────────

  describe("route subcommand", () => {
    it("exits with error when --service is omitted", async () => {
      await expect(runGenerate(["route", "bookings"])).rejects.toThrow(ExitError);
      expect(exitSpy).toHaveBeenCalledWith(1);
      const errOutput = errorSpy.mock.calls.flat().join("\n");
      expect(errOutput).toContain("--service");
    });

    it("exits with error when service routes directory does not exist", async () => {
      mockExistsSync.mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith("pnpm-workspace.yaml")) return true;
        return false; // routes dir not found
      });

      await expect(runGenerate(["route", "bookings", "--service", "reservations"])).rejects.toThrow(
        ExitError
      );

      expect(exitSpy).toHaveBeenCalledWith(1);
      const errOutput = errorSpy.mock.calls.flat().join("\n");
      expect(errOutput).toContain("not found");
    });

    it("generates a route file when service routes directory exists", async () => {
      mockExistsSync.mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith("pnpm-workspace.yaml")) return true;
        if (path.includes("services/reservations/src/routes") && !path.endsWith(".ts")) return true;
        return false; // route file does not yet exist
      });

      await runGenerate(["route", "Bookings", "--service", "reservations"]);

      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      const content = String(mockWriteFileSync.mock.calls[0][1]);
      expect(content).toContain("BookingsRoutes");
      expect(content).toContain("FastifyInstance");

      const logOutput = logSpy.mock.calls.flat().join("\n");
      expect(logOutput).toContain("Route generated");
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it("exits with error when the route file already exists", async () => {
      mockExistsSync.mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith("pnpm-workspace.yaml")) return true;
        // routes dir exists AND the route file exists
        if (path.includes("services/reservations")) return true;
        return false;
      });

      await expect(runGenerate(["route", "Bookings", "--service", "reservations"])).rejects.toThrow(
        ExitError
      );

      expect(exitSpy).toHaveBeenCalledWith(1);
      const errOutput = errorSpy.mock.calls.flat().join("\n");
      expect(errOutput).toContain("already exists");
    });

    it("generates route with lowercase URL slug (no camelCase)", async () => {
      mockExistsSync.mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith("pnpm-workspace.yaml")) return true;
        if (path.includes("services/users/src/routes") && !path.endsWith(".ts")) return true;
        return false;
      });

      await runGenerate(["route", "UserProfile", "--service", "users"]);

      const content = String(mockWriteFileSync.mock.calls[0][1]);
      // The slug replaces camelCase separations with the regex — check it has a path
      expect(content).toMatch(/fastify\.get\("\/[a-z-]+"/);
    });

    it("reminds developer to register route in app.ts", async () => {
      mockExistsSync.mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith("pnpm-workspace.yaml")) return true;
        if (path.includes("services/users/src/routes") && !path.endsWith(".ts")) return true;
        return false;
      });

      await runGenerate(["route", "Auth", "--service", "users"]);

      const logOutput = logSpy.mock.calls.flat().join("\n");
      expect(logOutput).toContain("app.ts");
    });
  });
});
