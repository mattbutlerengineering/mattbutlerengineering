import { describe, it, expect, vi, beforeEach } from "vitest";
import { spawnSync } from "node:child_process";

// regen.mjs's isClean() and the llms-txt per-package check both shell out
// via spawnSync — mock it so tests control staleness without touching the
// real git tree or spawning `mbe pack`.
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

  it("exits 0 when every family and llms package is clean", async () => {
    mockSpawnSync.mockReturnValue({ status: 0 });

    const runCheck = await loadRunCheck();
    runCheck();

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(logSpy.mock.calls.flat().join("\n")).toContain("up to date");
  });

  // Regression test for #3635: `regen --check` used to only `git diff` the
  // committed llms.txt/llms-full.txt files. A source edit that nobody has
  // run `mbe pack` for yet leaves those files untouched in the working
  // tree (isClean/git-diff reports "clean"), so the old check false-negatived
  // on exactly this case.
  it("exits 1 and names llms-txt when a package's source was edited but its committed llms.txt is untouched", async () => {
    mockSpawnSync.mockImplementation((cmd, args) => {
      if (cmd === "git") return { status: 0 }; // committed outputs unmodified in git
      if (cmd === "pnpm" && args.includes("pack") && args.includes("packages/rialto")) {
        return { status: 1 }; // `mbe pack packages/rialto --check` reports drift
      }
      return { status: 0 };
    });

    const runCheck = await loadRunCheck();
    runCheck();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy.mock.calls.flat().join("\n")).toContain("llms-txt");
  });

  it("exits 1 the same way for a deleted source file (pack --check reports the package stale)", async () => {
    mockSpawnSync.mockImplementation((cmd, args) => {
      if (cmd === "git") return { status: 0 };
      if (cmd === "pnpm" && args.includes("pack") && args.includes("packages/auth")) {
        return { status: 1 };
      }
      return { status: 0 };
    });

    const runCheck = await loadRunCheck();
    runCheck();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy.mock.calls.flat().join("\n")).toContain("llms-txt");
  });

  it("still flags a non-llms family via its git-diff fallback", async () => {
    mockSpawnSync.mockImplementation((cmd, args) => {
      if (cmd === "git" && args.some((a) => String(a).includes("generated-schemas.ts"))) {
        return { status: 1 }; // dirty in git
      }
      return { status: 0 };
    });

    const runCheck = await loadRunCheck();
    runCheck();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy.mock.calls.flat().join("\n")).toContain("rialto-catalog-schemas");
  });
});
