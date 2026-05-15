import { describe, it, expect, vi, beforeEach } from "vitest";
import { orchestrateVerification } from "./verification-orchestrator.js";
import { runVerification } from "./worktree-manager.js";
import { storeVerificationLog, emitEvent } from "./utils.js";

vi.mock("./worktree-manager.js", () => ({
  runVerification: vi.fn(),
}));

vi.mock("./utils.js", () => ({
  storeVerificationLog: vi.fn(),
  emitEvent: vi.fn(),
}));

describe("orchestrateVerification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns passed=true when all checks pass", async () => {
    vi.mocked(runVerification).mockResolvedValue({
      passed: true,
      lintOk: true,
      typecheckOk: true,
      testsOk: true,
      lintOutput: "lint ok",
      typecheckOutput: "tc ok",
      testOutput: "tests ok",
    });
    vi.mocked(storeVerificationLog).mockResolvedValue("/path/to/log");

    const result = await orchestrateVerification("/path/to/worktree");

    expect(result.passed).toBe(true);
    expect(result.logPath).toBe("/path/to/log");
    expect(emitEvent).toHaveBeenCalledWith(
      undefined,
      "session:verification",
      expect.objectContaining({
        message: expect.stringContaining("Verification passed"),
      })
    );
  });

  it("returns passed=false when checks fail", async () => {
    vi.mocked(runVerification).mockResolvedValue({
      passed: false,
      lintOk: false,
      typecheckOk: false,
      testsOk: false,
      lintOutput: "lint fail",
      typecheckOutput: "tc fail",
      testOutput: "tests fail",
    });

    const result = await orchestrateVerification("/path/to/worktree");

    expect(result.passed).toBe(false);
    expect(result.error).toContain("lint:");
    expect(result.error).toContain("typecheck:");
    expect(result.error).toContain("tests:");
    expect(emitEvent).toHaveBeenCalledWith(
      undefined,
      "session:verification",
      expect.objectContaining({
        message: expect.stringContaining("Verification failed"),
      })
    );
  });

  it("handles partial failures", async () => {
    vi.mocked(runVerification).mockResolvedValue({
      passed: false,
      lintOk: true,
      typecheckOk: false,
      testsOk: true,
      lintOutput: "lint ok",
      typecheckOutput: "tc fail",
      testOutput: "tests ok",
    });

    const result = await orchestrateVerification("/path/to/worktree");

    expect(result.passed).toBe(false);
    expect(result.error).toContain("typecheck: tc fail");
    expect(result.error).not.toContain("lint:");
    expect(result.error).not.toContain("tests:");
  });
});
