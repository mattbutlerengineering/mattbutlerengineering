import { describe, test, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("agent-core-build-freshness", () => {
  describe("classifyBuildFreshness", () => {
    test("#3989 repro: src modified after dist was built is NOT trusted", async () => {
      const { classifyBuildFreshness } = await import("../agent-core-build-freshness.mjs");

      // Mirrors PR #3988: pr-risk-classifier.ts gained a mapping (src
      // touched) but dist/pr-risk-classifier.js still predates it.
      const distBuiltAtMs = Date.parse("2026-08-08T10:00:00Z");
      const srcTouchedAtMs = Date.parse("2026-08-08T11:17:00Z"); // 77 min later

      const result = classifyBuildFreshness({
        newestSrcMtimeMs: srcTouchedAtMs,
        newestDistMtimeMs: distBuiltAtMs,
      });

      expect(result.trusted).toBe(false);
      expect(result.state).toBe("stale");
    });

    test("dist newer than every src file is trusted", async () => {
      const { classifyBuildFreshness } = await import("../agent-core-build-freshness.mjs");

      const result = classifyBuildFreshness({
        newestSrcMtimeMs: Date.parse("2026-08-08T10:00:00Z"),
        newestDistMtimeMs: Date.parse("2026-08-08T10:05:00Z"),
      });

      expect(result.trusted).toBe(true);
      expect(result.state).toBe("fresh");
    });

    test("dist and src at the exact same mtime is trusted (not strictly stale)", async () => {
      const { classifyBuildFreshness } = await import("../agent-core-build-freshness.mjs");

      const sameMs = Date.parse("2026-08-08T10:00:00Z");

      const result = classifyBuildFreshness({
        newestSrcMtimeMs: sameMs,
        newestDistMtimeMs: sameMs,
      });

      expect(result.trusted).toBe(true);
      expect(result.state).toBe("fresh");
    });

    test("missing dist (fresh worktree, never built) fails closed", async () => {
      const { classifyBuildFreshness } = await import("../agent-core-build-freshness.mjs");

      const result = classifyBuildFreshness({
        newestSrcMtimeMs: Date.parse("2026-08-08T10:00:00Z"),
        newestDistMtimeMs: null,
      });

      expect(result.trusted).toBe(false);
      expect(result.state).toBe("missing");
    });

    test("undeterminable src mtime fails closed rather than trusting an existing dist", async () => {
      const { classifyBuildFreshness } = await import("../agent-core-build-freshness.mjs");

      const result = classifyBuildFreshness({
        newestSrcMtimeMs: null,
        newestDistMtimeMs: Date.parse("2026-08-08T10:00:00Z"),
      });

      expect(result.trusted).toBe(false);
      expect(result.state).toBe("unknown");
    });
  });

  describe("newestMtimeMsUnder", () => {
    test("returns null when the directory does not exist", async () => {
      const { newestMtimeMsUnder } = await import("../agent-core-build-freshness.mjs");

      const result = newestMtimeMsUnder("/nonexistent/does-not-exist-3989", {
        readdirSync: () => {
          throw new Error("ENOENT");
        },
      });

      expect(result).toBeNull();
    });

    test("finds the newest mtime across nested files via injected fs", async () => {
      const { newestMtimeMsUnder } = await import("../agent-core-build-freshness.mjs");

      // Fake tree:
      //   root/
      //     a.ts        (mtime 100)
      //     nested/
      //       b.ts       (mtime 300)
      //       c.ts       (mtime 200)
      const tree = {
        "/root": [
          { name: "a.ts", isDirectory: () => false, isFile: () => true },
          { name: "nested", isDirectory: () => true, isFile: () => false },
        ],
        "/root/nested": [
          { name: "b.ts", isDirectory: () => false, isFile: () => true },
          { name: "c.ts", isDirectory: () => false, isFile: () => true },
        ],
      };
      const mtimes = {
        "/root/a.ts": 100,
        "/root/nested/b.ts": 300,
        "/root/nested/c.ts": 200,
      };

      const result = newestMtimeMsUnder("/root", {
        readdirSync: (dir) => {
          if (!(dir in tree)) throw new Error(`unexpected dir ${dir}`);
          return tree[dir];
        },
        statSync: (file) => ({ mtimeMs: mtimes[file] }),
      });

      expect(result).toBe(300);
    });

    test("real filesystem: detects a source file touched after the build output (no mocks)", async () => {
      // AC2: a test that asserts a stale/mismatched build is detected —
      // exercised against real files and real fs calls, not just injected
      // fakes, mirroring the actual PR #3988 mechanism.
      const { newestMtimeMsUnder, classifyBuildFreshness } =
        await import("../agent-core-build-freshness.mjs");

      const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-core-freshness-"));
      const srcDir = path.join(root, "src");
      const distDir = path.join(root, "dist");
      fs.mkdirSync(srcDir);
      fs.mkdirSync(distDir);

      try {
        const distFile = path.join(distDir, "pr-risk-classifier.js");
        const srcFile = path.join(srcDir, "pr-risk-classifier.ts");
        fs.writeFileSync(distFile, "// stale build");
        fs.writeFileSync(srcFile, "// new mapping added");

        const distBuiltAt = new Date("2026-08-08T10:00:00Z");
        const srcTouchedAt = new Date("2026-08-08T11:17:00Z");
        fs.utimesSync(distFile, distBuiltAt, distBuiltAt);
        fs.utimesSync(srcFile, srcTouchedAt, srcTouchedAt);

        const newestSrcMtimeMs = newestMtimeMsUnder(srcDir);
        const newestDistMtimeMs = newestMtimeMsUnder(distDir);
        const result = classifyBuildFreshness({ newestSrcMtimeMs, newestDistMtimeMs });

        expect(result.trusted).toBe(false);
        expect(result.state).toBe("stale");
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  });

  describe("assessAgentCoreBuildFreshness", () => {
    test("combines injected src/dist scans through classifyBuildFreshness", async () => {
      const { assessAgentCoreBuildFreshness } = await import("../agent-core-build-freshness.mjs");

      const files = {
        "/src": [{ name: "a.ts", isDirectory: () => false, isFile: () => true }],
        "/dist": [{ name: "a.js", isDirectory: () => false, isFile: () => true }],
      };
      const mtimes = { "/src/a.ts": 500, "/dist/a.js": 100 };

      const result = assessAgentCoreBuildFreshness({
        srcDir: "/src",
        distDir: "/dist",
        readdirSync: (dir) => files[dir],
        statSync: (file) => ({ mtimeMs: mtimes[file] }),
      });

      expect(result.trusted).toBe(false);
      expect(result.state).toBe("stale");
      expect(result.newestSrcMtimeMs).toBe(500);
      expect(result.newestDistMtimeMs).toBe(100);
    });
  });

  describe("ensureFreshAgentCoreBuild — AC1: cannot classify against a stale dist without rebuilding or failing closed", () => {
    test("already-fresh dist skips the rebuild entirely", async () => {
      const { ensureFreshAgentCoreBuild } = await import("../agent-core-build-freshness.mjs");

      const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-core-freshness-fresh-"));
      const srcDir = path.join(root, "src");
      const distDir = path.join(root, "dist");
      fs.mkdirSync(srcDir);
      fs.mkdirSync(distDir);

      try {
        fs.writeFileSync(path.join(srcDir, "a.ts"), "x");
        fs.writeFileSync(path.join(distDir, "a.js"), "x");
        const srcAt = new Date("2026-08-08T10:00:00Z");
        const distAt = new Date("2026-08-08T10:05:00Z");
        fs.utimesSync(path.join(srcDir, "a.ts"), srcAt, srcAt);
        fs.utimesSync(path.join(distDir, "a.js"), distAt, distAt);

        let execCalled = false;
        const result = ensureFreshAgentCoreBuild({
          srcDir,
          distDir,
          exec: () => {
            execCalled = true;
          },
        });

        expect(result.trusted).toBe(true);
        expect(result.rebuildAttempted).toBe(false);
        expect(execCalled).toBe(false);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    test("stale dist triggers exactly one rebuild attempt, then re-assesses", async () => {
      const { ensureFreshAgentCoreBuild } = await import("../agent-core-build-freshness.mjs");

      const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-core-freshness-rebuild-"));
      const srcDir = path.join(root, "src");
      const distDir = path.join(root, "dist");
      fs.mkdirSync(srcDir);
      fs.mkdirSync(distDir);

      try {
        const srcFile = path.join(srcDir, "a.ts");
        const distFile = path.join(distDir, "a.js");
        fs.writeFileSync(srcFile, "x");
        fs.writeFileSync(distFile, "x");
        const staleDistAt = new Date("2026-08-08T09:00:00Z");
        const srcAt = new Date("2026-08-08T10:00:00Z");
        fs.utimesSync(distFile, staleDistAt, staleDistAt);
        fs.utimesSync(srcFile, srcAt, srcAt);

        let execCallCount = 0;
        const result = ensureFreshAgentCoreBuild({
          srcDir,
          distDir,
          // Simulate a real `pnpm build` by touching dist forward in time.
          exec: () => {
            execCallCount += 1;
            const rebuiltAt = new Date("2026-08-08T11:00:00Z");
            fs.utimesSync(distFile, rebuiltAt, rebuiltAt);
          },
        });

        expect(execCallCount).toBe(1);
        expect(result.rebuildAttempted).toBe(true);
        expect(result.rebuildSucceeded).toBe(true);
        expect(result.trusted).toBe(true);
        expect(result.state).toBe("fresh");
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    test("a failed rebuild (e.g. build error) still fails closed instead of throwing", async () => {
      const { ensureFreshAgentCoreBuild } = await import("../agent-core-build-freshness.mjs");

      const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-core-freshness-failed-"));
      const srcDir = path.join(root, "src");
      const distDir = path.join(root, "dist"); // never created -> "missing"

      try {
        fs.mkdirSync(srcDir);
        fs.writeFileSync(path.join(srcDir, "a.ts"), "x");

        const result = ensureFreshAgentCoreBuild({
          srcDir,
          distDir,
          exec: () => {
            throw new Error("tsc: build failed");
          },
        });

        expect(result.trusted).toBe(false);
        expect(result.rebuildAttempted).toBe(true);
        expect(result.rebuildSucceeded).toBe(false);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

    test("dist that stays stale even after a rebuild attempt still fails closed (never crashes)", async () => {
      const { ensureFreshAgentCoreBuild } = await import("../agent-core-build-freshness.mjs");

      const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-core-freshness-still-stale-"));
      const srcDir = path.join(root, "src");
      const distDir = path.join(root, "dist");
      fs.mkdirSync(srcDir);
      fs.mkdirSync(distDir);

      try {
        const srcFile = path.join(srcDir, "a.ts");
        const distFile = path.join(distDir, "a.js");
        fs.writeFileSync(srcFile, "x");
        fs.writeFileSync(distFile, "x");
        const distAt = new Date("2026-08-08T09:00:00Z");
        const srcAt = new Date("2026-08-08T10:00:00Z");
        fs.utimesSync(distFile, distAt, distAt);
        fs.utimesSync(srcFile, srcAt, srcAt);

        // exec "succeeds" (no throw) but never actually touches dist —
        // e.g. a no-op build script — so re-assessment still finds it stale.
        const result = ensureFreshAgentCoreBuild({ srcDir, distDir, exec: () => {} });

        expect(result.trusted).toBe(false);
        expect(result.state).toBe("stale");
        expect(result.rebuildAttempted).toBe(true);
        expect(result.rebuildSucceeded).toBe(true);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  });
});
