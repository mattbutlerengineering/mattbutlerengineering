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

describe("prime command", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "cwd").mockReturnValue("/repo");
    mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith("pnpm-workspace.yaml"));
    mockExecSync.mockReturnValue("" as never);
  });

  async function runPrime(directive: string): Promise<void> {
    const { primeCommand } = await import("../commands/prime.js");
    await primeCommand.parseAsync([directive], { from: "user" });
  }

  it("primes user-related packages for 'user' directive", async () => {
    await runPrime("Fix the user login page");

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining("services/users"),
      expect.any(Object)
    );
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Context primed");
  });

  it("primes reservations for 'reservation' keyword", async () => {
    await runPrime("Fix the table reservation flow");

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining("services/reservations"),
      expect.any(Object)
    );
  });

  it("primes agent service for 'agent' keyword", async () => {
    await runPrime("Debug agent session issue");

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining("services/agent"),
      expect.any(Object)
    );
  });

  it("primes rialto package for 'component' keyword", async () => {
    await runPrime("Build a new UI component");

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining("packages/rialto"),
      expect.any(Object)
    );
  });

  it("primes auth package for 'auth' keyword", async () => {
    await runPrime("Improve auth flow");

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining("packages/auth"),
      expect.any(Object)
    );
  });

  it("primes api-client package for 'api' keyword", async () => {
    await runPrime("Fix the API client");

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining("packages/api-client"),
      expect.any(Object)
    );
  });

  it("falls back to all core services when no keyword matches", async () => {
    await runPrime("Do something generic");

    const calls = mockExecSync.mock.calls.map(([cmd]) => String(cmd));
    expect(calls.some((cmd) => cmd.includes("services/users"))).toBe(true);
    expect(calls.some((cmd) => cmd.includes("services/agent"))).toBe(true);
    expect(calls.some((cmd) => cmd.includes("services/reservations"))).toBe(true);

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("No specific packages identified");
  });

  it("handles pack failure gracefully", async () => {
    mockExecSync.mockImplementation(() => {
      throw new Error("pack failed");
    });

    await runPrime("Fix the user service");

    const errOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errOutput).toContain("Failed to pack");
  });

  it("prints priming completion message", async () => {
    await runPrime("Fix the user service");

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Context primed");
    expect(output).toContain("fresh semantic skeletons");
  });
});
