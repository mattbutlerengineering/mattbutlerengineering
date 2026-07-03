import { describe, test, expect, vi, afterEach } from "vitest";

describe("runCheck (shared fitness-check reporter)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns 0 and logs the default PASS message when findings is empty", async () => {
    const { runCheck } = await import("../lib/fitness-check.mjs");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const code = runCheck({ name: "widget sync", findings: [] });

    expect(code).toBe(0);
    expect(logSpy).toHaveBeenCalledWith("PASS: widget sync");
  });

  test("returns 1 and logs the default FAIL message when findings is non-empty", async () => {
    const { runCheck } = await import("../lib/fitness-check.mjs");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const code = runCheck({ name: "widget sync", findings: ["a", "b"] });

    expect(code).toBe(1);
    expect(logSpy).toHaveBeenCalledWith("FAIL: widget sync — 2 issue(s) found:");
  });

  test("prints each finding via formatFinding when provided", async () => {
    const { runCheck } = await import("../lib/fitness-check.mjs");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const code = runCheck({
      name: "widget sync",
      findings: [{ id: 1 }, { id: 2 }],
      formatFinding: (f) => `finding #${f.id}`,
    });

    expect(code).toBe(1);
    expect(logSpy).toHaveBeenCalledWith("  finding #1");
    expect(logSpy).toHaveBeenCalledWith("  finding #2");
  });

  test("does not print per-finding lines when formatFinding is omitted", async () => {
    const { runCheck } = await import("../lib/fitness-check.mjs");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    runCheck({ name: "widget sync", findings: [{ id: 1 }] });

    for (const call of logSpy.mock.calls) {
      expect(call[0]).not.toMatch(/^ {2}/);
    }
  });

  test("honors custom passMessage and failMessage overrides", async () => {
    const { runCheck } = await import("../lib/fitness-check.mjs");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    runCheck({ name: "widget sync", findings: [], passMessage: "All good." });
    expect(logSpy).toHaveBeenCalledWith("All good.");

    runCheck({ name: "widget sync", findings: [1], failMessage: "Uh oh." });
    expect(logSpy).toHaveBeenCalledWith("Uh oh.");
  });
});
