import { describe, test, expect, vi } from "vitest";
import {
  CLOUD_BOOTSTRAP_COMMANDS,
  runCloudSessionBootstrap,
  runMetricsDataPull,
  runMetricsDataPush,
  shouldBootstrapCloudSession,
} from "../cloud-session-bootstrap.mjs";

describe("shouldBootstrapCloudSession", () => {
  test("cloud session without node_modules → true", () => {
    expect(
      shouldBootstrapCloudSession({ env: { CLAUDE_CODE_REMOTE: "true" }, hasNodeModules: false })
    ).toBe(true);
  });

  test("cloud session with node_modules → false", () => {
    expect(
      shouldBootstrapCloudSession({ env: { CLAUDE_CODE_REMOTE: "true" }, hasNodeModules: true })
    ).toBe(false);
  });

  test("local session (var unset or not 'true') → false even without node_modules", () => {
    expect(shouldBootstrapCloudSession({ env: {}, hasNodeModules: false })).toBe(false);
    expect(
      shouldBootstrapCloudSession({ env: { CLAUDE_CODE_REMOTE: "false" }, hasNodeModules: false })
    ).toBe(false);
    expect(
      shouldBootstrapCloudSession({ env: { CLAUDE_CODE_REMOTE: "" }, hasNodeModules: false })
    ).toBe(false);
  });

  test("non-boolean hasNodeModules throws (fail closed)", () => {
    expect(() => shouldBootstrapCloudSession({ env: {}, hasNodeModules: undefined })).toThrow(
      TypeError
    );
  });
});

describe("runCloudSessionBootstrap", () => {
  const base = { repoRoot: "/repo", log: () => {} };

  test("local session spawns nothing", () => {
    const exec = vi.fn();
    const result = runCloudSessionBootstrap({ ...base, env: {}, exists: () => false, exec });
    expect(result).toEqual({ ran: false, ok: true });
    expect(exec).not.toHaveBeenCalled();
  });

  test("cloud session with node_modules spawns nothing", () => {
    const exec = vi.fn();
    const result = runCloudSessionBootstrap({
      ...base,
      env: { CLAUDE_CODE_REMOTE: "true" },
      exists: () => true,
      exec,
    });
    expect(result).toEqual({ ran: false, ok: true });
    expect(exec).not.toHaveBeenCalled();
  });

  test("cloud session without node_modules runs install then cli build in the repo root", () => {
    const exec = vi.fn();
    const result = runCloudSessionBootstrap({
      ...base,
      env: { CLAUDE_CODE_REMOTE: "true" },
      exists: () => false,
      exec,
    });
    expect(result).toEqual({ ran: true, ok: true });
    expect(exec.mock.calls.map(([cmd, args]) => [cmd, ...args].join(" "))).toEqual([
      "pnpm install --frozen-lockfile",
      "pnpm build --filter @mbe/cli...",
    ]);
    expect(exec.mock.calls.every(([, , opts]) => opts.cwd === "/repo")).toBe(true);
    expect(CLOUD_BOOTSTRAP_COMMANDS).toHaveLength(2);
  });

  test("a failing step is logged, stops the sequence, and does not throw", () => {
    const exec = vi.fn(() => {
      throw new Error("boom");
    });
    const log = vi.fn();
    const result = runCloudSessionBootstrap({
      repoRoot: "/repo",
      log,
      env: { CLAUDE_CODE_REMOTE: "true" },
      exists: () => false,
      exec,
    });
    expect(result).toEqual({ ran: true, ok: false });
    expect(exec).toHaveBeenCalledTimes(1);
    expect(log.mock.calls.at(-1)[0]).toContain("boom");
  });
});

describe("runMetricsDataPull", () => {
  test("pulls the metrics-data checkout in a cloud session", () => {
    const pull = vi.fn();
    expect(
      runMetricsDataPull({ env: { CLAUDE_CODE_REMOTE: "true" }, pull, log: () => {} })
    ).toEqual({ ran: true, ok: true });
    expect(pull).toHaveBeenCalledOnce();
  });

  test("does nothing in a local session", () => {
    const pull = vi.fn();
    expect(runMetricsDataPull({ env: {}, pull, log: () => {} })).toEqual({ ran: false, ok: true });
    expect(pull).not.toHaveBeenCalled();
  });

  test("logs and reports a failed pull without throwing", () => {
    const log = vi.fn();
    const pull = () => {
      throw new Error("couldn't find remote ref metrics-data");
    };
    expect(runMetricsDataPull({ env: { CLAUDE_CODE_REMOTE: "true" }, pull, log })).toEqual({
      ran: true,
      ok: false,
    });
    expect(log.mock.calls.flat().join("\n")).toMatch(/metrics-data\.mjs pull/);
  });
});

describe("runMetricsDataPush (Stop-hook safety net)", () => {
  test("pushes unpushed metric rows in a cloud session that has a checkout", () => {
    const push = vi.fn(() => ({ pushed: true, attempts: 1 }));
    expect(
      runMetricsDataPush({
        env: { CLAUDE_CODE_REMOTE: "true" },
        hasCheckout: true,
        push,
        log: () => {},
      })
    ).toEqual({ ran: true, ok: true });
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/^chore\(metrics\): cloud session /));
  });

  test("does nothing locally or without a checkout", () => {
    const push = vi.fn();
    expect(runMetricsDataPush({ env: {}, hasCheckout: true, push, log: () => {} }).ran).toBe(false);
    expect(
      runMetricsDataPush({
        env: { CLAUDE_CODE_REMOTE: "true" },
        hasCheckout: false,
        push,
        log: () => {},
      }).ran
    ).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  test("logs a failed push without throwing", () => {
    const log = vi.fn();
    const push = () => {
      throw new Error("rejected");
    };
    expect(
      runMetricsDataPush({ env: { CLAUDE_CODE_REMOTE: "true" }, hasCheckout: true, push, log })
    ).toEqual({ ran: true, ok: false });
    expect(log).toHaveBeenCalled();
  });
});
