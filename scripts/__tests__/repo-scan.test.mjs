import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("walkFiles (shared repo-scan helper)", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "repo-scan-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("walks nested directories and returns absolute file paths", async () => {
    fs.mkdirSync(path.join(tmpDir, "src", "nested"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "src", "a.ts"), "");
    fs.writeFileSync(path.join(tmpDir, "src", "nested", "b.ts"), "");

    const { walkFiles } = await import("../lib/repo-scan.mjs");
    const files = walkFiles(tmpDir);

    expect(files).toContain(path.join(tmpDir, "src", "a.ts"));
    expect(files).toContain(path.join(tmpDir, "src", "nested", "b.ts"));
  });

  test("skips default ignored directories (node_modules, dist, .git)", async () => {
    fs.mkdirSync(path.join(tmpDir, "node_modules", "pkg"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "dist"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, ".git"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "node_modules", "pkg", "a.ts"), "");
    fs.writeFileSync(path.join(tmpDir, "dist", "b.ts"), "");
    fs.writeFileSync(path.join(tmpDir, ".git", "c.ts"), "");
    fs.writeFileSync(path.join(tmpDir, "kept.ts"), "");

    const { walkFiles } = await import("../lib/repo-scan.mjs");
    const files = walkFiles(tmpDir);

    expect(files).toEqual([path.join(tmpDir, "kept.ts")]);
  });

  test("applies a custom match predicate", async () => {
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "src", "a.ts"), "");
    fs.writeFileSync(path.join(tmpDir, "src", "a.test.ts"), "");

    const { walkFiles } = await import("../lib/repo-scan.mjs");
    const files = walkFiles(tmpDir, { match: (name) => !name.includes(".test.") });

    expect(files).toEqual([path.join(tmpDir, "src", "a.ts")]);
  });

  test("accepts a custom ignoreDirs set that overrides the default", async () => {
    fs.mkdirSync(path.join(tmpDir, "coverage"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "coverage", "report.ts"), "");

    const { walkFiles } = await import("../lib/repo-scan.mjs");
    const files = walkFiles(tmpDir, { ignoreDirs: new Set() });

    expect(files).toContain(path.join(tmpDir, "coverage", "report.ts"));
  });

  test("returns an empty array for a directory with no matches", async () => {
    const { walkFiles } = await import("../lib/repo-scan.mjs");
    const files = walkFiles(tmpDir);

    expect(files).toEqual([]);
  });

  test("skips a nested git worktree (.git FILE pointing into worktrees/) and warns", async () => {
    // Fixture reproduces #3884: a directory whose `.git` is a FILE (not a
    // directory) containing `gitdir: .../worktrees/<name>` — the actual
    // on-disk shape of a nested `git worktree add`, as distinct from a
    // regular checkout where `.git` is always a directory.
    const nested = path.join(tmpDir, "mainchk");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(
      path.join(nested, ".git"),
      `gitdir: ${path.join(tmpDir, ".git", "worktrees", "mainchk")}\n`
    );
    fs.writeFileSync(path.join(nested, "duplicate.ts"), "");
    fs.writeFileSync(path.join(tmpDir, "real.ts"), "");

    const { walkFiles } = await import("../lib/repo-scan.mjs");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const files = walkFiles(tmpDir);

    expect(files).toEqual([path.join(tmpDir, "real.ts")]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("skipping nested git worktree at mainchk")
    );
    warnSpy.mockRestore();
  });

  test("does NOT skip a directory whose .git is a regular directory", async () => {
    // A regular checkout's own `.git` is a directory, not a file — must
    // never be mistaken for a nested worktree.
    const repo = path.join(tmpDir, "some-repo");
    fs.mkdirSync(path.join(repo, ".git"), { recursive: true });
    fs.writeFileSync(path.join(repo, ".git", "HEAD"), "ref: refs/heads/main\n");
    fs.writeFileSync(path.join(repo, "kept.ts"), "");

    const { walkFiles } = await import("../lib/repo-scan.mjs");
    const files = walkFiles(tmpDir);

    expect(files).toEqual([path.join(repo, "kept.ts")]);
  });
});
