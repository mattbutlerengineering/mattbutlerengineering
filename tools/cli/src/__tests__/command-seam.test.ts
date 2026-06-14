/**
 * Tests for the defineCommand/CommandResult seam.
 *
 * These tests assert returned VALUES — no console/process.exit spies.
 * That is the whole point of the seam.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CommandResult } from "../command-seam.js";
import { defineCommand, runCommand } from "../command-seam.js";

// ── Mock config so auth checks are controllable ──────────────────────────────

vi.mock("conf", () => ({
  default: class MockConf {
    private store = new Map<string, unknown>();
    get(key: string) {
      return this.store.get(key);
    }
    set(key: string, value: unknown) {
      this.store.set(key, value);
    }
    delete(key: string) {
      this.store.delete(key);
    }
  },
}));

vi.mock("../config.js", () => ({
  isAuthenticated: vi.fn(() => false),
  getApiUrl: vi.fn(() => "http://localhost:3001"),
  getAccessToken: vi.fn(() => undefined),
}));

describe("CommandResult shape", () => {
  it("rows result carries row data and exit code 0 by default", () => {
    const result: CommandResult = { kind: "rows", rows: [{ id: "1", name: "Alice" }] };
    expect(result.kind).toBe("rows");
    expect((result as Extract<CommandResult, { kind: "rows" }>).rows).toHaveLength(1);
  });

  it("json result carries arbitrary data", () => {
    const result: CommandResult = { kind: "json", data: { status: "ok" } };
    expect(result.kind).toBe("json");
  });

  it("error result carries message and optional exitCode", () => {
    const result: CommandResult = { kind: "error", message: "Not logged in", exitCode: 1 };
    expect(result.kind).toBe("error");
    expect((result as Extract<CommandResult, { kind: "error" }>).exitCode).toBe(1);
  });
});

describe("defineCommand", () => {
  it("returns the run function unchanged when requiresAuth is false", async () => {
    const run = vi.fn().mockResolvedValue({ kind: "rows", rows: [] } as CommandResult);
    const cmd = defineCommand({ run });
    const result = await cmd({});
    expect(run).toHaveBeenCalledOnce();
    expect(result.kind).toBe("rows");
  });

  it("returns auth error without calling run when requiresAuth:true and not authenticated", async () => {
    const { isAuthenticated } = await import("../config.js");
    vi.mocked(isAuthenticated).mockReturnValue(false);

    const run = vi.fn().mockResolvedValue({ kind: "rows", rows: [] } as CommandResult);
    const cmd = defineCommand({ requiresAuth: true, run });
    const result = await cmd({});

    expect(run).not.toHaveBeenCalled();
    expect(result.kind).toBe("error");
    const err = result as Extract<CommandResult, { kind: "error" }>;
    expect(err.message).toContain("Not logged in");
    expect(err.exitCode).toBe(1);
  });

  it("delegates to run when requiresAuth:true and authenticated", async () => {
    const { isAuthenticated } = await import("../config.js");
    vi.mocked(isAuthenticated).mockReturnValue(true);

    const run = vi.fn().mockResolvedValue({ kind: "json", data: { ok: true } } as CommandResult);
    const cmd = defineCommand({ requiresAuth: true, run });
    const result = await cmd({});

    expect(run).toHaveBeenCalledOnce();
    expect(result.kind).toBe("json");
  });

  it("wraps thrown errors into error CommandResult", async () => {
    const run = vi.fn().mockRejectedValue(new Error("API failure"));
    const cmd = defineCommand({ run });
    const result = await cmd({});

    expect(result.kind).toBe("error");
    const err = result as Extract<CommandResult, { kind: "error" }>;
    expect(err.message).toContain("API failure");
    expect(err.exitCode).toBe(1);
  });
});

describe("runCommand", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
  });

  it("prints JSON and exits 0 for json result with --json flag", async () => {
    const result: CommandResult = { kind: "json", data: { status: "ok" } };
    await runCommand(result, { json: true });

    const out = logSpy.mock.calls.flat().join("\n");
    expect(JSON.parse(out)).toEqual({ status: "ok" });
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("prints rows table and exits 0 for rows result", async () => {
    const result: CommandResult = { kind: "rows", rows: [{ id: "u1", email: "a@b.com" }] };
    await runCommand(result, {});

    const out = logSpy.mock.calls.flat().join("\n");
    expect(out).toContain("u1");
    expect(out).toContain("a@b.com");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("prints rows as JSON when --json flag set", async () => {
    const result: CommandResult = { kind: "rows", rows: [{ id: "u1" }] };
    await runCommand(result, { json: true });

    const out = logSpy.mock.calls.flat().join("\n");
    const parsed = JSON.parse(out);
    expect(parsed).toEqual([{ id: "u1" }]);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("prints error and calls process.exit(1) for error result", async () => {
    const result: CommandResult = { kind: "error", message: "Something broke", exitCode: 1 };
    await runCommand(result, {});

    const err = errorSpy.mock.calls.flat().join("\n");
    expect(err).toContain("Something broke");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("respects custom exitCode in error result", async () => {
    const result: CommandResult = { kind: "error", message: "bad request", exitCode: 2 };
    await runCommand(result, {});

    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it("suppresses ANSI colors when NO_COLOR env var is set", async () => {
    process.env.NO_COLOR = "1";
    const result: CommandResult = { kind: "error", message: "no color test", exitCode: 1 };
    await runCommand(result, {});

    const err = errorSpy.mock.calls.flat().join("\n");
    // Should not contain ESC color codes (ESC = char code 27)
    expect(err).not.toContain(`${String.fromCharCode(27)}[`);
    delete process.env.NO_COLOR;
  });
});
