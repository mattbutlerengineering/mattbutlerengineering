import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { setImmediate as nextTurn } from "node:timers/promises";
import { spawn, spawnSync } from "node:child_process";

// regen.mjs's isClean() and the llms-txt per-package check both shell out
// via spawnSync — mock it so tests control staleness without touching the
// real git tree or spawning `mbe pack`.
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}));

const mockSpawn = vi.mocked(spawn);
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

  // #3635 swapped the llms-txt git-diff check FOR the source→output check
  // rather than unioning them, which reopened the opposite false negative:
  // a committed llms output that is stale relative to its source is invisible
  // once anything has already written the correct bytes to disk, because
  // `mbe pack --check` compares the generator against the FILE, not the commit.
  //
  // ci.yml's "Verify generated artifacts are in sync" step does exactly that:
  //   pnpm regen          # writes the correct output to disk
  //   pnpm regen --check  # re-derives from source, compares to the file it just wrote
  //
  // so the llms half of that gate could never fail. Measured: #5574 merged as
  // `1c721c9c8` with `apps/hospitality/llms-full.txt` regenerated but the ROOT
  // `llms-full.txt` stale, and both that push and `11461c11d` after it were
  // CI-Gate green. It was only corrected when a later PR (#5576) happened to
  // regen it. Both signals are now required.
  it("exits 1 when a committed llms output is dirty in git even though pack --check passes", async () => {
    mockSpawnSync.mockImplementation((cmd, args) => {
      // Every source→output check passes: the bytes on disk are correct,
      // because something regenerated them a moment ago.
      if (cmd === "pnpm") return { status: 0 };
      // But the root llms-full.txt does not match what is committed.
      if (cmd === "git" && args.some((a) => String(a) === "llms-full.txt")) {
        return { status: 1 };
      }
      return { status: 0 };
    });

    const runCheck = await loadRunCheck();
    runCheck();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy.mock.calls.flat().join("\n")).toContain("llms-txt");
  });

  it("does not double-count: one message when a package is stale by BOTH signals", async () => {
    mockSpawnSync.mockReturnValue({ status: 1 });

    const runCheck = await loadRunCheck();
    runCheck();

    expect(exitSpy).toHaveBeenCalledWith(1);
    const out = errorSpy.mock.calls.flat().join("\n");
    expect(out.match(/\[llms-txt\]/g) ?? []).toHaveLength(1);
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

  // `--git-only` is for callers that ran `pnpm regen` immediately before the
  // check (ci.yml's Build job, .husky/pre-push's full path). Right after a
  // regen, `mbe pack --check` compares the derived output to bytes that were
  // just derived the same way, so it cannot fail — while re-deriving every
  // package (root `.` alone is ~90s on a CI runner). Only the git signal
  // carries information there.
  describe("with gitOnly", () => {
    it("never re-derives llms packages via `mbe pack --check`", async () => {
      mockSpawnSync.mockReturnValue({ status: 0 });

      const runCheck = await loadRunCheck();
      runCheck({ gitOnly: true });

      const packCalls = mockSpawnSync.mock.calls.filter(
        ([cmd, args]) => cmd === "pnpm" && args.includes("pack")
      );
      expect(packCalls).toHaveLength(0);
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it("still exits 1 when a committed llms output differs in git", async () => {
      mockSpawnSync.mockImplementation((cmd, args) =>
        cmd === "git" && args.some((a) => String(a) === "llms-full.txt")
          ? { status: 1 }
          : { status: 0 }
      );

      const runCheck = await loadRunCheck();
      runCheck({ gitOnly: true });

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errorSpy.mock.calls.flat().join("\n")).toContain("committed output differs");
    });
  });
});

// `mbe pack` reads only `.ts` sources and writes only its own package's
// llms.txt/llms-full.txt, so packs are independent. Run one at a time, the
// ~28 small packs (~2-4s each, mostly pnpm+tsx startup) queued behind the
// root `.` pack (~99s), which made llms-txt ~200s of the Build job's
// "Verify generated artifacts" step on run 37480517290.
describe("regen llms packs", () => {
  /** A fake child process whose exit the test controls. */
  function fakeChild() {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    return child;
  }

  let children;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    mockSpawnSync.mockReset().mockReturnValue({ status: 0 });
    mockSpawn.mockReset();
    children = [];
    mockSpawn.mockImplementation(() => {
      const child = fakeChild();
      children.push(child);
      return child;
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  const settle = () => nextTurn();

  /** Exit every running pack (and those the pool starts next) with exitCode(child). */
  async function closeAll(exitCode) {
    for (;;) {
      await settle();
      const running = children.filter((c) => !c.closed);
      if (running.length === 0) return;
      for (const c of running) {
        c.closed = true;
        c.emit("close", exitCode(c));
      }
    }
  }

  it("runs several packs at once, starting with the root pack", async () => {
    const { runRegen } = await import("../regen.mjs");
    const done = runRegen();
    await settle();

    expect(children.length).toBeGreaterThan(1);
    expect(mockSpawn.mock.calls[0][1]).toEqual(["--filter", "@mbe/cli", "start", "pack", "."]);

    await closeAll(() => 0);
    await done;

    const { llmsPackages } = await import("../regen-manifest.mjs");
    const packed = mockSpawn.mock.calls.map(([, args]) => args.at(-1));
    expect(packed.sort()).toEqual([...llmsPackages()].sort());
  });

  it("rejects naming the package when a pack fails", async () => {
    const { runRegen } = await import("../regen.mjs");
    const done = runRegen();
    const outcome = expect(done).rejects.toThrow("1 package(s) failed");

    await closeAll((c) => (c === children[0] ? 1 : 0));
    await outcome;
  });
});
