import { describe, it, expect, vi } from "vitest";
import { createShellRunner, type ShellRunner } from "./shell-runner.js";

describe("createShellRunner", () => {
  it("returns trimmed stdout on success", () => {
    const mockRunner: ShellRunner = vi.fn().mockReturnValue("  result output  ");
    const run = createShellRunner({ runner: mockRunner });

    expect(run("gh run list")).toBe("result output");
    expect(mockRunner).toHaveBeenCalledWith("gh run list", {
      encoding: "utf-8",
      timeout: 15_000,
    });
  });

  it("applies default 15s timeout", () => {
    const mockRunner: ShellRunner = vi.fn().mockReturnValue("ok");
    const run = createShellRunner({ runner: mockRunner });

    run("gh pr list");
    expect(mockRunner).toHaveBeenCalledWith("gh pr list", {
      encoding: "utf-8",
      timeout: 15_000,
    });
  });

  it("uses custom timeout when provided", () => {
    const mockRunner: ShellRunner = vi.fn().mockReturnValue("ok");
    const run = createShellRunner({ runner: mockRunner, timeoutMs: 30_000 });

    run("pulumi stack output --json");
    expect(mockRunner).toHaveBeenCalledWith("pulumi stack output --json", {
      encoding: "utf-8",
      timeout: 30_000,
    });
  });

  it("returns error-envelope JSON string when runner throws an Error", () => {
    const mockRunner: ShellRunner = vi.fn().mockImplementation(() => {
      throw new Error("gh: command not found");
    });
    const run = createShellRunner({ runner: mockRunner });

    const result = run("gh run list");
    const parsed = JSON.parse(result) as { error: string; message: string };

    expect(parsed.error).toBeDefined();
    expect(parsed.message).toBe("gh: command not found");
  });

  it("returns error-envelope JSON string when runner throws a non-Error", () => {
    const mockRunner: ShellRunner = vi.fn().mockImplementation(() => {
      throw "unexpected string error";
    });
    const run = createShellRunner({ runner: mockRunner });

    const result = run("doctl apps list");
    const parsed = JSON.parse(result) as { error: string; message: string };

    expect(parsed.error).toBeDefined();
    expect(parsed.message).toBe("unexpected string error");
  });

  it("error envelope uses the label passed as errorLabel", () => {
    const mockRunner: ShellRunner = vi.fn().mockImplementation(() => {
      throw new Error("fail");
    });
    const run = createShellRunner({ runner: mockRunner, errorLabel: "Failed to get CI status" });

    const result = run("gh run list");
    const parsed = JSON.parse(result) as { error: string; message: string };

    expect(parsed.error).toBe("Failed to get CI status");
  });

  it("error envelope falls back to generic label when errorLabel omitted", () => {
    const mockRunner: ShellRunner = vi.fn().mockImplementation(() => {
      throw new Error("fail");
    });
    const run = createShellRunner({ runner: mockRunner });

    const result = run("gh run list");
    const parsed = JSON.parse(result) as { error: string; message: string };

    expect(typeof parsed.error).toBe("string");
    expect(parsed.error.length).toBeGreaterThan(0);
  });
});
