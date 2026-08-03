import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  METRICS,
  DURABLE_OUTSIDE,
  EXTERNAL,
  durableManifest,
  renderDurableGitignoreBlock,
  extractDurableGitignoreBlock,
  resolvePath,
} from "../metrics-store.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---------------------------------------------------------------------------
// The manifest — one declaration the .gitignore block and the drift assertions
// below are both derived from.
// ---------------------------------------------------------------------------

describe("durableManifest()", () => {
  it("returns the union of durable METRICS, DURABLE_OUTSIDE and EXTERNAL as sorted repo-relative paths", () => {
    const manifest = durableManifest();

    const expected = [
      ...Object.values(METRICS)
        .filter((m) => m.durable)
        .map((m) => `metrics/${m.file}`),
      ...Object.keys(DURABLE_OUTSIDE),
      ...Object.keys(EXTERNAL).map((f) => `metrics/${f}`),
    ].sort();

    expect(manifest).toEqual(expected);
  });

  it("is sorted and free of duplicates", () => {
    const manifest = durableManifest();
    expect(manifest).toEqual([...manifest].sort());
    expect(new Set(manifest).size).toBe(manifest.length);
  });

  it("carries a stated reason for every path declared outside the METRICS registry", () => {
    for (const reason of [...Object.values(DURABLE_OUTSIDE), ...Object.values(EXTERNAL)]) {
      expect(reason).toEqual(expect.any(String));
      expect(reason.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Drift check 1 — .gitignore is derived, not hand-maintained.
// ---------------------------------------------------------------------------

describe(".gitignore durable block", () => {
  const gitignore = readFileSync(join(ROOT, ".gitignore"), "utf-8");

  it("matches the block rendered from durableManifest()", () => {
    expect(extractDurableGitignoreBlock(gitignore)).toBe(renderDurableGitignoreBlock());
  });

  it("negates every durable path that lives under a wholesale-ignored root", () => {
    const block = extractDurableGitignoreBlock(gitignore) ?? "";
    for (const path of durableManifest()) {
      if (!path.startsWith("metrics/") && !path.startsWith(".claude/improvement-loop/")) continue;
      expect(block).toContain(`!/${path}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Drift check 2 — the assertion that catches the real bug. A path can be
// declared durable, appear in the .gitignore block, and still never have been
// committed (`.claude/improvement-loop/revert-log.md` was exactly this: written
// by a workflow, `git add`ed by that workflow, and silently discarded because
// nothing re-included it — 0 commits, ever).
// ---------------------------------------------------------------------------

describe("the verification log lives under metrics/", () => {
  it("resolves via the registry, not a hardcoded .claude path", () => {
    expect(resolvePath("verifications", { root: "/tmp/x" })).toBe(
      join("/tmp/x", "metrics", "verifications.jsonl")
    );
  });

  it("leaves no script pointing at the gitignored .claude/improvement-loop copy", () => {
    let hits = "";
    try {
      // Both terms on one line — the shape of the three hardcoded call sites
      // this replaced: resolve(ROOT, ".claude", "improvement-loop",
      // "verifications.jsonl"). `git grep -l` exits 1 when nothing matches.
      hits = execFileSync(
        "git",
        ["grep", "-l", "-e", "improvement-loop", "--and", "-e", "verifications", "--", "scripts"],
        { cwd: ROOT, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }
      ).trim();
    } catch (err) {
      if (err.status !== 1) throw err;
    }
    expect(hits.split("\n").filter(Boolean)).toEqual([]);
  });
});

describe("durable paths are tracked by git", () => {
  it("has every manifest path in the index", () => {
    const untracked = durableManifest().filter((path) => {
      try {
        execFileSync("git", ["ls-files", "--error-unmatch", "--", path], {
          cwd: ROOT,
          stdio: "pipe",
        });
        return false;
      } catch {
        return true;
      }
    });

    expect(untracked).toEqual([]);
  });
});
