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

  // Presence alone no longer settles it: the container image ships a pre-baked
  // `node_modules`, so an unstated provenance has to repair, not trust.
  test("cloud session with node_modules but no stated provenance → true", () => {
    expect(
      shouldBootstrapCloudSession({ env: { CLAUDE_CODE_REMOTE: "true" }, hasNodeModules: true })
    ).toBe(true);
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

  test("cloud session whose node_modules was installed from another lockfile -> true", () => {
    expect(
      shouldBootstrapCloudSession({
        env: { CLAUDE_CODE_REMOTE: "true" },
        hasNodeModules: true,
        installedLockfileMatches: false,
      })
    ).toBe(true);
  });

  test("cloud session installed from this checkout's lockfile -> false", () => {
    expect(
      shouldBootstrapCloudSession({
        env: { CLAUDE_CODE_REMOTE: "true" },
        hasNodeModules: true,
        installedLockfileMatches: true,
      })
    ).toBe(false);
  });

  test("unknown provenance repairs rather than trusting the tree", () => {
    expect(
      shouldBootstrapCloudSession({
        env: { CLAUDE_CODE_REMOTE: "true" },
        hasNodeModules: true,
        installedLockfileMatches: undefined,
      })
    ).toBe(true);
  });

  test("local session is still a no-op even on a lockfile mismatch", () => {
    expect(
      shouldBootstrapCloudSession({
        env: {},
        hasNodeModules: true,
        installedLockfileMatches: false,
      })
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

  test("cloud session installed from this checkout's lockfile spawns nothing", () => {
    const exec = vi.fn();
    const result = runCloudSessionBootstrap({
      ...base,
      env: { CLAUDE_CODE_REMOTE: "true" },
      exists: () => true,
      readText: () => "lockfile-A",
      exec,
    });
    expect(result).toEqual({ ran: false, ok: true });
    expect(exec).not.toHaveBeenCalled();
  });

  // #8169 gated the install on `node_modules` being absent. The container
  // image ships a pre-baked `node_modules`, so a cloud session whose checkout
  // moved past the image skipped the install and ran its gates against a stale
  // tree: `pnpm lint` and `pnpm typecheck` both failed with 13 TS2307s in
  // `services/agent`, whose `@modelcontextprotocol/sdk` dependency arrived in
  // 01373cd (#9734) after the image was baked.
  test("cloud session with a stale pre-baked node_modules installs and builds", () => {
    const exec = vi.fn();
    const log = vi.fn();
    const result = runCloudSessionBootstrap({
      ...base,
      log,
      env: { CLAUDE_CODE_REMOTE: "true" },
      exists: () => true,
      readText: (path) => (path.includes("node_modules") ? "lockfile-OLD" : "lockfile-NEW"),
      exec,
    });
    expect(result).toEqual({ ran: true, ok: true });
    expect(exec.mock.calls.map(([cmd, args]) => [cmd, ...args].join(" "))).toEqual([
      "pnpm install --frozen-lockfile",
      "pnpm build --filter @mbe/cli...",
    ]);
    expect(log.mock.calls[0][0]).toContain("lockfile");
  });

  test("an unreadable last-install lockfile repairs rather than trusting the tree", () => {
    const exec = vi.fn();
    const result = runCloudSessionBootstrap({
      ...base,
      env: { CLAUDE_CODE_REMOTE: "true" },
      exists: () => true,
      readText: () => {
        throw new Error("ENOENT");
      },
      exec,
    });
    expect(result).toEqual({ ran: true, ok: true });
    expect(exec).toHaveBeenCalledTimes(2);
  });

  test("cloud session without node_modules runs install then cli build in the repo root", () => {
    const exec = vi.fn();
    const result = runCloudSessionBootstrap({
      ...base,
      env: { CLAUDE_CODE_REMOTE: "true" },
      exists: () => false,
      readText: () => "unused",
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
