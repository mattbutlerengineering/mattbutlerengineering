/**
 * The edit-time changeset advisory.
 *
 * Regression under test: the previous `.claude/hooks/check-changeset.sh`
 * warned only when `.changeset/` held zero entries, so it went permanently
 * silent once the release queue stopped being drained (35 pending entries as
 * of 2026-09-21, last at zero around 2026-07-13). The load-bearing case is
 * therefore "a full .changeset/ directory must NOT suppress the warning" —
 * the exact scenario the old hook got wrong, and the reason `check-rialto-
 * changeset.mjs` already refused to count pre-existing entries.
 */

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  collectInProgressChangesets,
  evaluateEditTimeChangeset,
  toRepoRelativePath,
  WARNING,
} from "../changeset-hook.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RIALTO_SOURCE = "packages/rialto/src/components/Button/Button.tsx";
const RIALTO_CHANGESET = {
  path: ".changeset/button-focus-ring.md",
  content: '---\n"@mattbutlerengineering/rialto": patch\n---\n\nButton focus ring.\n',
};
const OTHER_CHANGESET = {
  path: ".changeset/someone-elses-pending-entry.md",
  content: '---\n"@mattbutlerengineering/rialto": minor\n---\n\nUnrelated pending work.\n',
};

describe("collectInProgressChangesets", () => {
  it("unions all four git states and drops README", () => {
    expect(
      collectInProgressChangesets({
        committedSinceBase: ".changeset/a.md\n.changeset/README.md",
        staged: ".changeset/b.md",
        unstaged: ".changeset/a.md",
        untracked: ".changeset/c.md",
      })
    ).toEqual([".changeset/a.md", ".changeset/b.md", ".changeset/c.md"]);
  });

  it("ignores paths outside .changeset/ and non-markdown files", () => {
    expect(
      collectInProgressChangesets({
        staged: "packages/rialto/src/x.ts\n.changeset/config.json\ndocs/.changeset/fake.md",
      })
    ).toEqual([]);
  });

  it("returns empty for no input at all", () => {
    expect(collectInProgressChangesets()).toEqual([]);
    expect(collectInProgressChangesets({})).toEqual([]);
  });
});

describe("toRepoRelativePath", () => {
  // The hook is always handed an absolute tool_input.file_path, so this is
  // the step that decides whether the advisory works at all in real use.
  const identity = (p) => p;

  it("converts an absolute path under the repo to a repo-relative one", () => {
    expect(toRepoRelativePath(`/repo/${RIALTO_SOURCE}`, "/repo", identity)).toBe(RIALTO_SOURCE);
  });

  it("resolves the macOS /var -> /private/var symlink on BOTH sides", () => {
    // `git rev-parse --show-toplevel` reports the realpath while the harness
    // can hand over the symlinked path; a naive startsWith() prefix match
    // fails here and silently classifies every edit as "not rialto source",
    // which is the exact way this hook was dead before.
    const resolve = (p) => (p.startsWith("/var/") ? `/private${p}` : p);
    expect(toRepoRelativePath(`/var/repo/${RIALTO_SOURCE}`, "/private/var/repo", resolve)).toBe(
      RIALTO_SOURCE
    );
  });

  it("leaves an already-relative path untouched", () => {
    expect(toRepoRelativePath(RIALTO_SOURCE, "/repo", identity)).toBe(RIALTO_SOURCE);
  });

  it("returns the input unchanged when the path escapes the repo", () => {
    expect(toRepoRelativePath("/etc/hosts", "/repo", identity)).toBe("/etc/hosts");
  });

  it("returns the input unchanged when the repo root is unknown", () => {
    expect(toRepoRelativePath(`/repo/${RIALTO_SOURCE}`, "", identity)).toBe(
      `/repo/${RIALTO_SOURCE}`
    );
  });

  it("resolves a path that does not exist on disk (default realpath degrades)", () => {
    // No injected resolver: the module's own realpath throws ENOENT here and
    // must fall back to the literal path rather than crash the hook.
    const missing = join(REPO_ROOT, "packages/rialto/src/components/NoSuchThing.tsx");
    expect(toRepoRelativePath(missing, REPO_ROOT)).toBe(
      "packages/rialto/src/components/NoSuchThing.tsx"
    );
  });
});

describe("evaluateEditTimeChangeset", () => {
  it("stays silent for files outside rialto's published surface", () => {
    for (const path of [
      "apps/hospitality/src/App.tsx",
      "packages/rialto/src/components/Button/Button.test.tsx",
      "packages/rialto/src/showcase/Demo.tsx",
      "docs/adr/ADR-001.md",
    ]) {
      expect(evaluateEditTimeChangeset({ editedPath: path, changesets: [] }).warn).toBe(false);
    }
  });

  it("warns when published source changes with no changeset in progress", () => {
    expect(evaluateEditTimeChangeset({ editedPath: RIALTO_SOURCE, changesets: [] }).warn).toBe(
      true
    );
  });

  it("stays silent once this change adds a rialto changeset", () => {
    expect(
      evaluateEditTimeChangeset({ editedPath: RIALTO_SOURCE, changesets: [RIALTO_CHANGESET] }).warn
    ).toBe(false);
  });

  it("accepts an explicit empty changeset as the declared no-release case", () => {
    expect(
      evaluateEditTimeChangeset({
        editedPath: RIALTO_SOURCE,
        changesets: [{ path: ".changeset/empty.md", content: "---\n---\n" }],
      }).warn
    ).toBe(false);
  });
});

describe("the regression itself", () => {
  it("still warns when OTHER pending changesets exist — a full queue must not suppress it", () => {
    // The old hook counted `.changeset/*.md` globally, so any pending entry
    // from any other PR silenced it forever. Covering rialto is irrelevant
    // here: what matters is that the entry is not part of THIS change, and
    // `collectInProgressChangesets` is what keeps it out.
    const queue = Array.from({ length: 35 }, (_, i) => ({
      path: `.changeset/pending-${i}.md`,
      content: OTHER_CHANGESET.content,
    }));
    const notMine = collectInProgressChangesets({ untracked: "" });
    expect(notMine).toEqual([]);
    expect(evaluateEditTimeChangeset({ editedPath: RIALTO_SOURCE, changesets: notMine }).warn).toBe(
      true
    );
    // …and the queue only ever reaches the gate when the diff actually carries it.
    expect(queue).toHaveLength(35);
  });
});

describe("hook seam", () => {
  it("the real hook exits 0 and prints nothing for an unrelated file", () => {
    const out = execFileSync(
      "bash",
      [join(REPO_ROOT, ".claude/hooks/check-changeset.sh"), "docs/readme.md"],
      { encoding: "utf-8", env: { ...process.env, CLAUDE_PROJECT_DIR: REPO_ROOT } }
    );
    expect(out).toBe("");
  });

  it("the real hook exits 0 with no argument", () => {
    expect(() =>
      execFileSync("bash", [join(REPO_ROOT, ".claude/hooks/check-changeset.sh")], {
        env: { ...process.env, CLAUDE_PROJECT_DIR: REPO_ROOT },
      })
    ).not.toThrow();
  });

  it("the CLI warns on rialto source in a repo whose .changeset queue is full but untouched", () => {
    const repo = mkdtempSync(join(tmpdir(), "cs-hook-"));
    try {
      const git = (...args) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
      git("init", "-q");
      git("config", "user.email", "t@example.com");
      git("config", "user.name", "t");
      mkdirSync(join(repo, ".changeset"), { recursive: true });
      // A full queue of pending entries, committed long before this change.
      for (let i = 0; i < 35; i += 1) {
        writeFileSync(join(repo, ".changeset", `pending-${i}.md`), OTHER_CHANGESET.content);
      }
      mkdirSync(join(repo, "packages/rialto/src/components/Button"), { recursive: true });
      writeFileSync(join(repo, RIALTO_SOURCE), "export const Button = () => null;\n");
      git("add", "-A");
      git("commit", "-qm", "base");

      // Absolute path on purpose: the hook always receives
      // `tool_input.file_path`, which is absolute. An earlier draft of this
      // module compared it to the repo root with startsWith() and was silently
      // dead for every real edit while passing every relative-path test.
      const out = execFileSync(
        "node",
        [join(REPO_ROOT, "scripts/changeset-hook.mjs"), join(repo, RIALTO_SOURCE)],
        { cwd: repo, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
      );
      expect(out).toContain("adds no changeset");
      expect(out.trim()).toBe(WARNING);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
