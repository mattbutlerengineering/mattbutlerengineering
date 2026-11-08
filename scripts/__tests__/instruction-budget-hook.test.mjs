/**
 * The edit-time instruction-budget guard (#8463).
 *
 * `scripts/check-instruction-budget.mjs` only runs in CI's docs-only lane, so
 * an agent that appends a bullet to `.claude/rules/gotchas.md` or `CLAUDE.md`
 * learns about an overflow a CI round later (#8392, #8397), then compresses
 * by hand under time pressure — which has already dropped a sibling entry's
 * clause (#8399/#8400). This module is the edit-time half: it reuses
 * `BUDGET_BYTES` from the CI script so the two cannot drift, and runs only
 * when the edited file is actually one of the two budgeted files.
 */

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readFileSync,
  chmodSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, delimiter } from "node:path";
import { fileURLToPath } from "node:url";

import {
  toRepoRelativePath,
  checkBudgetedFile,
  formatBudgetMessage,
} from "../instruction-budget-hook.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("toRepoRelativePath", () => {
  const identity = (p) => p;

  it("converts an absolute path under the repo to a repo-relative one", () => {
    expect(toRepoRelativePath("/repo/CLAUDE.md", "/repo", identity)).toBe("CLAUDE.md");
  });

  it("leaves an already-relative path untouched", () => {
    expect(toRepoRelativePath("CLAUDE.md", "/repo", identity)).toBe("CLAUDE.md");
  });

  it("returns the input unchanged when the path escapes the repo", () => {
    expect(toRepoRelativePath("/etc/hosts", "/repo", identity)).toBe("/etc/hosts");
  });

  it("returns the input unchanged when the repo root is unknown", () => {
    expect(toRepoRelativePath("/repo/CLAUDE.md", "", identity)).toBe("/repo/CLAUDE.md");
  });
});

/** A throwaway git repo holding CLAUDE.md and .claude/rules/gotchas.md of the given sizes. */
function fixture({ claude, gotchas }) {
  const root = mkdtempSync(join(tmpdir(), "instr-budget-hook-"));
  mkdirSync(join(root, ".claude/rules"), { recursive: true });
  writeFileSync(join(root, "CLAUDE.md"), "x".repeat(claude));
  writeFileSync(join(root, ".claude/rules/gotchas.md"), "x".repeat(gotchas));
  return root;
}

describe("checkBudgetedFile", () => {
  it("returns null for a file that is not budgeted at all", () => {
    const root = fixture({ claude: 100, gotchas: 100 });
    try {
      expect(checkBudgetedFile(root, "docs/readme.md")).toBeNull();
      expect(checkBudgetedFile(root, "packages/rialto/src/Button.tsx")).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns null for a budgeted file that is under its limit", () => {
    const root = fixture({ claude: 100, gotchas: 100 });
    try {
      expect(checkBudgetedFile(root, "CLAUDE.md")).toBeNull();
      expect(checkBudgetedFile(root, ".claude/rules/gotchas.md")).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports a violation for a budgeted file over its limit", () => {
    const root = fixture({ claude: 9_050, gotchas: 100 });
    try {
      expect(checkBudgetedFile(root, "CLAUDE.md")).toEqual({
        relativePath: "CLAUDE.md",
        size: 9_050,
        limit: 9_000,
        over: 50,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails open (returns null) when the budgeted file cannot be read", () => {
    const root = fixture({ claude: 100, gotchas: 100 });
    try {
      rmSync(join(root, "CLAUDE.md"));
      expect(checkBudgetedFile(root, "CLAUDE.md")).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("formatBudgetMessage", () => {
  it("names the file, its size, and its limit", () => {
    const message = formatBudgetMessage({
      relativePath: "CLAUDE.md",
      size: 9_050,
      limit: 9_000,
      over: 50,
    });
    expect(message).toContain("CLAUDE.md");
    expect(message).toContain("9050");
    expect(message).toContain("9000");
  });
});

describe("hook seam", () => {
  const hookPath = join(REPO_ROOT, ".claude/hooks/check-instruction-budget.sh");

  it("the real hook exits 0 and prints nothing for an unrelated file", () => {
    const out = execFileSync("bash", [hookPath, "docs/readme.md"], {
      encoding: "utf-8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: REPO_ROOT },
    });
    expect(out).toBe("");
  });

  it("the real hook exits 0 with no argument", () => {
    expect(() =>
      execFileSync("bash", [hookPath], { env: { ...process.env, CLAUDE_PROJECT_DIR: REPO_ROOT } })
    ).not.toThrow();
  });

  /**
   * AC2 ("no node spawn beyond hook-input.mjs" for every other file) is
   * about what the hook DOES, not just what it prints — a version that
   * spawned node and let the node script decide to stay silent would still
   * pass the "prints nothing" assertions above while failing this one. A
   * fake `node` shim on PATH makes the spawn itself observable: it never
   * runs for an unrelated file, so the marker it would have written never
   * appears. Only a real `git` call (resolving the repo root) is allowed
   * before the bash-level filter rules a file in or out.
   */
  function withFakeNode(markerName) {
    const binDir = mkdtempSync(join(tmpdir(), "ib-hook-fakebin-"));
    const marker = join(binDir, markerName);
    writeFileSync(join(binDir, "node"), `#!/bin/sh\ntouch "${marker}"\nexit 1\n`);
    chmodSync(join(binDir, "node"), 0o755);
    return {
      marker,
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: REPO_ROOT,
        PATH: `${binDir}${delimiter}${process.env.PATH}`,
      },
      cleanup: () => rmSync(binDir, { recursive: true, force: true }),
    };
  }

  it("never spawns node for a file unrelated to either budgeted path", () => {
    const { marker, env, cleanup } = withFakeNode("node-was-called-unrelated");
    try {
      const out = execFileSync("bash", [hookPath, join(REPO_ROOT, "README.md")], {
        encoding: "utf-8",
        env,
      });
      expect(out).toBe("");
      expect(existsSync(marker)).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("never spawns node for a NESTED, non-root CLAUDE.md (the repo has 20+)", () => {
    // packages/rialto/CLAUDE.md matches a naive "*/CLAUDE.md" basename
    // filter but is not the budgeted root CLAUDE.md — the precise
    // repo-relative check in the wrapper must exclude it before node runs.
    const { marker, env, cleanup } = withFakeNode("node-was-called-nested");
    try {
      const out = execFileSync("bash", [hookPath, join(REPO_ROOT, "packages/rialto/CLAUDE.md")], {
        encoding: "utf-8",
        env,
      });
      expect(out).toBe("");
      expect(existsSync(marker)).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("exits 0 silently for an under-budget gotchas.md edit in a throwaway repo", () => {
    const repo = mkdtempSync(join(tmpdir(), "ib-hook-under-"));
    try {
      const git = (...args) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
      git("init", "-q");
      git("config", "user.email", "t@example.com");
      git("config", "user.name", "t");
      mkdirSync(join(repo, ".claude/rules"), { recursive: true });
      writeFileSync(join(repo, ".claude/rules/gotchas.md"), "# Known gotchas\n");
      git("add", "-A");
      git("commit", "-qm", "base");

      const out = execFileSync(
        "node",
        [
          join(REPO_ROOT, "scripts/instruction-budget-hook.mjs"),
          join(repo, ".claude/rules/gotchas.md"),
        ],
        { cwd: repo, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
      );
      expect(out).toBe("");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("exits 2 and reports file/size/limit for an over-budget gotchas.md edit", () => {
    const repo = mkdtempSync(join(tmpdir(), "ib-hook-over-"));
    try {
      const git = (...args) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
      git("init", "-q");
      git("config", "user.email", "t@example.com");
      git("config", "user.name", "t");
      mkdirSync(join(repo, ".claude/rules"), { recursive: true });
      writeFileSync(join(repo, ".claude/rules/gotchas.md"), "x".repeat(22_100));
      git("add", "-A");
      git("commit", "-qm", "base");

      let threw = null;
      let stdout = "";
      try {
        execFileSync(
          "node",
          [
            join(REPO_ROOT, "scripts/instruction-budget-hook.mjs"),
            join(repo, ".claude/rules/gotchas.md"),
          ],
          { cwd: repo, encoding: "utf-8" }
        );
      } catch (error) {
        threw = error;
        stdout = error.stdout?.toString() ?? "";
      }
      expect(threw).not.toBeNull();
      expect(threw.status).toBe(2);
      expect(stdout).toContain(".claude/rules/gotchas.md");
      expect(stdout).toContain("22100");
      expect(stdout).toContain("22000");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("the real hook (shell wrapper) exits 2 and forwards the message to stderr", () => {
    // Exercises the actual seam wired into settings.json end to end: the
    // wrapper must resolve a root that actually contains
    // scripts/instruction-budget-hook.mjs (its own repo, not the edited
    // file's unrelated throwaway tree), then re-forward the node script's
    // stdout message onto its own stderr. A standalone throwaway repo (no
    // scripts/ of its own) would make the wrapper exit 0 before ever
    // running node — this fixture copies in the two files it needs instead.
    const repo = mkdtempSync(join(tmpdir(), "ib-hook-wrapper-over-"));
    try {
      const git = (...args) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
      git("init", "-q");
      git("config", "user.email", "t@example.com");
      git("config", "user.name", "t");
      mkdirSync(join(repo, ".claude/rules"), { recursive: true });
      mkdirSync(join(repo, "scripts/lib"), { recursive: true });
      writeFileSync(join(repo, ".claude/rules/gotchas.md"), "x".repeat(22_100));
      for (const rel of [
        "scripts/check-instruction-budget.mjs",
        "scripts/instruction-budget-hook.mjs",
        "scripts/lib/fitness-check.mjs",
      ]) {
        writeFileSync(join(repo, rel), readFileSync(join(REPO_ROOT, rel)));
      }
      git("add", "-A");
      git("commit", "-qm", "base");

      let threw = null;
      let stderr = "";
      let stdout = "";
      try {
        execFileSync("bash", [hookPath, join(repo, ".claude/rules/gotchas.md")], {
          encoding: "utf-8",
          env: { ...process.env, CLAUDE_PROJECT_DIR: REPO_ROOT },
        });
      } catch (error) {
        threw = error;
        stderr = error.stderr?.toString() ?? "";
        stdout = error.stdout?.toString() ?? "";
      }
      expect(threw).not.toBeNull();
      expect(threw.status).toBe(2);
      expect(stdout).toBe("");
      expect(stderr).toContain(".claude/rules/gotchas.md");
      expect(stderr).toContain("22100");
      expect(stderr).toContain("22000");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
