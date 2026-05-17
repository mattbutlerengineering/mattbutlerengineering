import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

const mockExistsSync = vi.mocked(existsSync);
const mockExecSync = vi.mocked(execSync);

describe("compound command", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    vi.spyOn(process, "cwd").mockReturnValue("/repo");
    // findMonorepoRoot: return true for pnpm-workspace.yaml check
    mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith("pnpm-workspace.yaml"));
  });

  async function runCompound(): Promise<void> {
    const { compoundCommand } = await import("../commands/compound.js");
    await compoundCommand.parseAsync([], { from: "user" });
  }

  it("prints no recommendations when diff contains no recognized patterns", async () => {
    mockExecSync.mockReturnValue("some-other-change.txt\n" as never);

    await runCompound();

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Starting Compounding Phase");
    expect(output).toContain("No obvious compounding tasks found");
  });

  it("detects empty diff and prints message about committing work", async () => {
    mockExecSync.mockReturnValue("" as never);

    await runCompound();

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("No changes detected");
  });

  it("detects new package change in diff", async () => {
    mockExecSync.mockReturnValue('+  "name": "@mbe/new-pkg"\npackage.json\n' as never);

    await runCompound();

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("New internal package detected");
  });

  it("detects new API route in diff", async () => {
    mockExecSync.mockReturnValue(
      "services/users/routes/users.ts\n+  fastify.get('/users', handler)\n" as never
    );

    await runCompound();

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("New API endpoints detected");
  });

  it("detects ADR change in diff", async () => {
    mockExecSync.mockReturnValue("ADR-001.md\n+status: active\n" as never);

    await runCompound();

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("New architectural decision established");
  });

  it("detects UI pattern change in diff", async () => {
    mockExecSync.mockReturnValue(
      "packages/rialto/src/Button.ts\n+export function Button\n" as never
    );

    await runCompound();

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("New design system component detected");
  });

  it("handles execSync error gracefully", async () => {
    mockExecSync.mockImplementation(() => {
      throw new Error("git failed");
    });

    await runCompound();

    const errOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errOutput).toContain("git failed");
  });

  it("shows compounding knowledge reminder at end", async () => {
    mockExecSync.mockReturnValue("some-change.md\n" as never);

    await runCompound();

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("A task is not done until the knowledge gained has been codified");
  });
});

describe("compound – findMonorepoRoot fallback", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    vi.spyOn(process, "cwd").mockReturnValue("/repo");
    mockExecSync.mockReturnValue("" as never);
  });

  it("falls back to cwd when pnpm-workspace.yaml is never found", async () => {
    mockExistsSync.mockReturnValue(false);

    const { compoundCommand } = await import("../commands/compound.js");
    await compoundCommand.parseAsync(["lint"], { from: "user" });

    // Should still run without crashing
    expect(mockExecSync).toHaveBeenCalled();
  });
});

describe("compound – uncovered branches", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    vi.spyOn(process, "cwd").mockReturnValue("/repo");
    mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith("pnpm-workspace.yaml"));
  });

  it("handles package.json in diff but without matching name patterns (false branch of OR)", async () => {
    // diff includes "package.json" but not '+  "name":' or '+    "@mbe/'
    // This hits the false branch of the inner OR expression on line 46
    mockExecSync.mockReturnValue('package.json\n-  "version": "1.0.0"\n' as never);

    const { compoundCommand } = await import("../commands/compound.js");
    await compoundCommand.parseAsync([], { from: "user" });

    const output = vi.mocked(console.log).mock.calls.flat().join("\n");
    expect(output).toContain("No obvious compounding tasks found");
  });

  it("handles non-Error exception thrown by execSync (String branch)", async () => {
    // Throw a non-Error value to exercise the String(error) branch in the catch
    mockExecSync.mockImplementation(() => {
       
      throw "plain string error from execSync";
    });

    const { compoundCommand } = await import("../commands/compound.js");
    await compoundCommand.parseAsync([], { from: "user" });

    const errOutput = vi.mocked(console.error).mock.calls.flat().join("\n");
    expect(errOutput).toContain("plain string error from execSync");
  });
});
