import { describe, it, expect, vi, beforeEach } from "vitest";
import { spawnSync } from "node:child_process";

// regen.mjs's isClean() and generator runs shell out via spawnSync — mock it
// so tests control staleness without touching the real git tree.
vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

const mockSpawnSync = vi.mocked(spawnSync);

describe("regen --check", () => {
  let logSpy;
  let errorSpy;
  let exitSpy;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    mockSpawnSync.mockReset();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
  });

  async function loadRunCheck() {
    const mod = await import("../regen.mjs");
    return mod.runCheck;
  }

  it("exits 0 when every family is clean", async () => {
    mockSpawnSync.mockReturnValue({ status: 0 });

    const runCheck = await loadRunCheck();
    runCheck();

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(logSpy.mock.calls.flat().join("\n")).toContain("up to date");
  });

  it("flags a family whose committed output is dirty in git", async () => {
    mockSpawnSync.mockImplementation((cmd, args) => {
      if (cmd === "git" && args.some((a) => String(a).includes("generated-schemas.ts"))) {
        return { status: 1 }; // dirty in git
      }
      return { status: 0 };
    });

    const runCheck = await loadRunCheck();
    runCheck();

    expect(exitSpy).toHaveBeenCalledWith(1);
    const out = errorSpy.mock.calls.flat().join("\n");
    expect(out).toContain("rialto-catalog-schemas");
    expect(out).toContain("pnpm --filter @mbe/rialto-catalog generate");
  });

  it("never shells out to `mbe pack`", async () => {
    mockSpawnSync.mockReturnValue({ status: 0 });

    const runCheck = await loadRunCheck();
    runCheck();

    const packCalls = mockSpawnSync.mock.calls.filter(
      ([cmd, args]) => cmd === "pnpm" && args.includes("pack")
    );
    expect(packCalls).toHaveLength(0);
  });
});

describe("regen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    mockSpawnSync.mockReset();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("runs every manifest family's generator command once", async () => {
    mockSpawnSync.mockReturnValue({ status: 0 });
    const { FAMILIES } = await import("../regen-manifest.mjs");
    const { runRegen } = await import("../regen.mjs");

    runRegen();

    expect(mockSpawnSync).toHaveBeenCalledTimes(FAMILIES.length);
  });

  it("throws naming the family when a generator fails", async () => {
    mockSpawnSync.mockReturnValue({ status: 2 });
    const { FAMILIES } = await import("../regen-manifest.mjs");
    const { runRegen } = await import("../regen.mjs");

    expect(() => runRegen()).toThrow(`[${FAMILIES[0].id}] generator exited with code 2`);
  });
});
