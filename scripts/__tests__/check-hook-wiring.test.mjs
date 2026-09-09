/**
 * Regression test for #3607: a file in .claude/hooks/ that is never wired
 * anywhere reads as active protection (executable, commented, sometimes
 * self-describing as "wired via settings.json") but never runs. See
 * scripts/check-hook-wiring.mjs for the full rationale.
 */

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { findOrphanedHooks, formatOrphanFinding, buildFailMessage } from "../check-hook-wiring.mjs";

/** Builds a throwaway repo root with the given files, returns its path. */
function makeFixture({ hooks = {}, settings = "{}", workflows = {} }) {
  const root = mkdtempSync(join(tmpdir(), "hook-wiring-"));

  const hooksDir = join(root, ".claude", "hooks");
  mkdirSync(hooksDir, { recursive: true });
  for (const [name, content] of Object.entries(hooks)) {
    writeFileSync(join(hooksDir, name), content);
  }

  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, ".claude", "settings.json"), settings);

  if (Object.keys(workflows).length > 0) {
    const workflowsDir = join(root, ".github", "workflows");
    mkdirSync(workflowsDir, { recursive: true });
    for (const [name, content] of Object.entries(workflows)) {
      writeFileSync(join(workflowsDir, name), content);
    }
  }

  return root;
}

describe("findOrphanedHooks", () => {
  let root;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("flags a hook that is never referenced anywhere (RED case)", () => {
    root = makeFixture({
      hooks: { "dummy-orphan.sh": "#!/usr/bin/env bash\necho hi\n" },
      settings: "{}",
    });

    expect(findOrphanedHooks(root)).toEqual(["dummy-orphan.sh"]);
  });

  it("does not flag a hook wired in .claude/settings.json", () => {
    root = makeFixture({
      hooks: { "wired.sh": "#!/usr/bin/env bash\necho hi\n" },
      settings: JSON.stringify({ hooks: { Stop: [{ command: "bash .claude/hooks/wired.sh" }] } }),
    });

    expect(findOrphanedHooks(root)).toEqual([]);
  });

  it("does not flag a hook invoked from a .github/workflows/*.yml file", () => {
    root = makeFixture({
      hooks: { "ci-only.sh": "#!/usr/bin/env bash\necho hi\n" },
      settings: "{}",
      workflows: {
        "example.yml": "jobs:\n  x:\n    steps:\n      - run: bash .claude/hooks/ci-only.sh\n",
      },
    });

    expect(findOrphanedHooks(root)).toEqual([]);
  });

  it("does not flag a helper script invoked from another hook script", () => {
    root = makeFixture({
      hooks: {
        "wired.sh": "#!/usr/bin/env bash\nbash .claude/hooks/helper.sh\n",
        "helper.sh": "#!/usr/bin/env bash\necho helping\n",
      },
      settings: JSON.stringify({ hooks: { Stop: [{ command: "bash .claude/hooks/wired.sh" }] } }),
    });

    expect(findOrphanedHooks(root)).toEqual([]);
  });

  it("does not flag a hook listed in the allowlist", () => {
    root = makeFixture({
      hooks: { "intentionally-unwired.sh": "#!/usr/bin/env bash\necho hi\n" },
      settings: "{}",
    });

    expect(
      findOrphanedHooks(root, { "intentionally-unwired.sh": "kept for reference only" })
    ).toEqual([]);
  });

  it("does not count a hook's own self-mention as external wiring", () => {
    root = makeFixture({
      hooks: {
        "self-describing.sh":
          "#!/usr/bin/env bash\n# self-describing.sh — not actually wired anywhere.\necho hi\n",
      },
      settings: "{}",
    });

    expect(findOrphanedHooks(root)).toEqual(["self-describing.sh"]);
  });

  it("returns [] when .claude/hooks/ does not exist", () => {
    root = mkdtempSync(join(tmpdir(), "hook-wiring-"));
    expect(findOrphanedHooks(root)).toEqual([]);
  });

  it("flags a hook whose filename is a bare substring of an already-wired hook's filename", () => {
    // Reproduces the PR #3753 review finding: "archive.sh" is unwired, but
    // ".claude/hooks/session-archive.sh" (a real, wired hook) contains
    // "archive.sh" as a substring, so naive `text.includes(file)` matching
    // false-passed it. This is the exact "sits in the tree, reads as
    // protected, never runs" failure mode the check exists to catch.
    root = makeFixture({
      hooks: {
        "archive.sh": "#!/usr/bin/env bash\necho hi\n",
        "session-archive.sh": "#!/usr/bin/env bash\necho hi\n",
      },
      settings: JSON.stringify({
        hooks: {
          Stop: [{ command: 'bash "$CLAUDE_PROJECT_DIR/.claude/hooks/session-archive.sh"' }],
        },
      }),
    });

    expect(findOrphanedHooks(root)).toEqual(["archive.sh"]);
  });

  it("does not flag a hook wired via the real $CLAUDE_PROJECT_DIR-prefixed invocation style", () => {
    // settings.json never invokes hooks with a bare ".claude/hooks/foo.sh"
    // prefix — every real entry prefixes it with the $CLAUDE_PROJECT_DIR
    // shell variable, e.g. `bash "$CLAUDE_PROJECT_DIR/.claude/hooks/regen-llms.sh"`.
    // A path-bounded match must still recognize this as wiring.
    root = makeFixture({
      hooks: { "regen-llms.sh": "#!/usr/bin/env bash\necho hi\n" },
      settings: JSON.stringify({
        hooks: {
          PostToolUse: [
            { command: 'bash "$CLAUDE_PROJECT_DIR/.claude/hooks/regen-llms.sh" "$FILE"' },
          ],
        },
      }),
    });

    expect(findOrphanedHooks(root)).toEqual([]);
  });

  it("has zero orphaned hooks in the real repo tree", () => {
    // The CI-enforcing assertion: every real .claude/hooks/* file must be
    // wired (or allowlisted) on the current tree, not just in fixtures.
    expect(findOrphanedHooks()).toEqual([]);
  });
});

describe("the real repository — repo-audit wiring (#4628)", () => {
  it("repo-audit runs this check, so a regression fails CI instead of sitting unnoticed", () => {
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf-8"));

    expect(pkg.scripts["repo-audit"]).toContain("check-hook-wiring.mjs");
  });
});

describe("failure message", () => {
  it("names the offending hook", () => {
    expect(formatOrphanFinding("dummy-orphan.sh")).toBe(".claude/hooks/dummy-orphan.sh");
  });

  it("states the three ways to satisfy the check", () => {
    const message = buildFailMessage(["dummy-orphan.sh"]);

    expect(message).toContain("1. Be wired in .claude/settings.json");
    expect(message).toContain("2. Be invoked from a .github/workflows/*.yml file");
    expect(message).toContain("3. Be listed in ALLOWLIST");
  });
});
