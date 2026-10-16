import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getSessionDiff } from "../session-diff.js";

let dir: string;
const sh = (...args: string[]): string => execFileSync("git", args, { cwd: dir, encoding: "utf8" });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "session-diff-"));
  sh("init", "-q", "-b", "main");
  sh("config", "user.email", "t@t.t");
  sh("config", "user.name", "t");
  sh("config", "commit.gpgsign", "false");
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src/a.ts"), "export const a = 1;\n");
  sh("add", ".");
  sh("commit", "-q", "-m", "base");
  sh("checkout", "-q", "-b", "agent/x");
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("getSessionDiff", () => {
  it("is empty (captured, not undefined) when the agent changed nothing", async () => {
    expect(await getSessionDiff(dir, "main")).toBe("");
  });

  it("includes a production change committed mid-session even when the last commit is tests only", async () => {
    writeFileSync(join(dir, "src/a.ts"), "export const a = 2;\n");
    sh("commit", "-q", "-am", "prod");
    writeFileSync(join(dir, "src/a.test.ts"), "// test\n");
    sh("add", ".");
    sh("commit", "-q", "-m", "tests");
    const diff = await getSessionDiff(dir, "main");
    expect(diff).toContain("src/a.ts");
    expect(diff).toContain("+export const a = 2;");
    expect(diff).toContain("src/a.test.ts");
  });

  it("includes uncommitted and untracked changes", async () => {
    writeFileSync(join(dir, "src/a.ts"), "export const a = 3;\n");
    writeFileSync(join(dir, "src/new.ts"), "export const n = 1;\n");
    const diff = await getSessionDiff(dir, "main");
    expect(diff).toContain("+export const a = 3;");
    expect(diff).toContain("src/new.ts");
  });

  it("returns undefined (could not capture) when git fails", async () => {
    expect(await getSessionDiff(dir, "no-such-branch")).toBeUndefined();
    expect(await getSessionDiff(join(dir, "missing"), "main")).toBeUndefined();
  });
});
