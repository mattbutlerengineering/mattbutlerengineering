import { describe, it, expect, vi } from "vitest";
import { createExecRunner, type ExecRunner } from "./exec-runner.js";

describe("createExecRunner", () => {
  it("returns trimmed stdout on success", () => {
    const mockRunner: ExecRunner = vi.fn().mockReturnValue("  result output  ");
    const run = createExecRunner({ runner: mockRunner });
    expect(run("gh", ["issue", "list"])).toBe("result output");
    expect(mockRunner).toHaveBeenCalledWith("gh", ["issue", "list"], {
      encoding: "utf-8",
      timeout: 15_000,
    });
  });

  it("uses custom timeout when provided", () => {
    const mockRunner: ExecRunner = vi.fn().mockReturnValue("ok");
    const run = createExecRunner({ runner: mockRunner, timeoutMs: 30_000 });
    run("gh", ["pr", "view", "1"]);
    expect(mockRunner).toHaveBeenCalledWith("gh", ["pr", "view", "1"], {
      encoding: "utf-8",
      timeout: 30_000,
    });
  });

  it("throws GhCommandError with original message on failure", () => {
    const mockRunner: ExecRunner = vi.fn().mockImplementation(() => {
      throw new Error("Process exited with code 1");
    });
    const run = createExecRunner({ runner: mockRunner });
    expect(() => run("gh", ["issue", "view", "999"])).toThrow("Process exited with code 1");
  });

  it("rethrows non-Error throws as-is", () => {
    const mockRunner: ExecRunner = vi.fn().mockImplementation(() => {
      throw "string error";
    });
    const run = createExecRunner({ runner: mockRunner });
    expect(() => run("gh", ["run", "list"])).toThrow("string error");
  });
});
