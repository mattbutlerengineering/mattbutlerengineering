import { test, expect, describe, beforeEach, afterEach, vi } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Built at runtime so this file itself carries no literal magic-timeout hit.
const HIT = (ms) => `set${"Timeout"}(fn, ${ms});\n`;

describe("check-ai-antipatterns git-tracked scope", () => {
  let repo;

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), "ai-antipatterns-git-"));
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  function git(...args) {
    execFileSync("git", args, { cwd: repo, stdio: "ignore" });
  }

  test("counts tracked files only, not gitignored untracked ones", async () => {
    git("init", "-q");
    fs.mkdirSync(path.join(repo, "src"), { recursive: true });
    fs.mkdirSync(path.join(repo, "scratch"), { recursive: true });
    fs.writeFileSync(path.join(repo, ".gitignore"), "scratch/\n");
    fs.writeFileSync(path.join(repo, "src", "tracked.ts"), HIT(3000));
    fs.writeFileSync(path.join(repo, "scratch", "ignored.ts"), HIT(4000) + HIT(5000));
    git("add", ".gitignore", "src/tracked.ts");
    const { scanForPattern } = await import("../check-ai-antipatterns.mjs");
    expect(scanForPattern(repo, "magicTimeouts")).toBe(1);
  });

  test("still honours the shared ignore-dir list for tracked files", async () => {
    git("init", "-q");
    fs.mkdirSync(path.join(repo, "generated"), { recursive: true });
    fs.writeFileSync(path.join(repo, "generated", "g.ts"), HIT(3000));
    git("add", "generated/g.ts");
    const { scanForPattern } = await import("../check-ai-antipatterns.mjs");
    expect(scanForPattern(repo, "magicTimeouts")).toBe(0);
  });

  test("falls back to the filesystem walk, with a stderr note, outside a git repo", async () => {
    fs.writeFileSync(path.join(repo, "a.ts"), HIT(3000));
    const { scanForPattern } = await import("../check-ai-antipatterns.mjs");
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(scanForPattern(repo, "magicTimeouts")).toBe(1);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("git ls-files unavailable"));
    spy.mockRestore();
  });
});
