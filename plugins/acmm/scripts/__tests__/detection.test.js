import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { detect, detectAll, isWorkflowActive } from "../detection.js";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "acmm-detect-"));
  return {
    root,
    file(rel, body = "") {
      const p = join(root, rel);
      mkdirSync(join(p, "..").endsWith("..") ? root : p.slice(0, p.lastIndexOf("/")), {
        recursive: true,
      });
      writeFileSync(p, body);
    },
    dir(rel) {
      mkdirSync(join(root, rel), { recursive: true });
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test("detect: path type — file present", () => {
  const fx = fixture();
  fx.file("README.md", "# hello");
  const c = { id: "x", detection: { type: "path", pattern: "README.md" } };
  assert.equal(detect(fx.root, c), true);
  fx.cleanup();
});

test("detect: path type — file missing", () => {
  const fx = fixture();
  const c = { id: "x", detection: { type: "path", pattern: "does-not-exist.md" } };
  assert.equal(detect(fx.root, c), false);
  fx.cleanup();
});

test("detect: path type — trailing slash requires directory", () => {
  const fx = fixture();
  fx.dir(".claude");
  const dirCriterion = { id: "x", detection: { type: "path", pattern: ".claude/" } };
  assert.equal(detect(fx.root, dirCriterion), true);

  // A file with the same name should NOT satisfy a dir-typed pattern.
  const fx2 = fixture();
  fx2.file("foo");
  const dirCriterion2 = { id: "y", detection: { type: "path", pattern: "foo/" } };
  assert.equal(detect(fx2.root, dirCriterion2), false);
  fx.cleanup();
  fx2.cleanup();
});

test("detect: any-of — first present satisfies", () => {
  const fx = fixture();
  fx.file("AGENTS.md");
  const c = {
    id: "x",
    detection: { type: "any-of", pattern: ["CLAUDE.md", "AGENTS.md", ".cursorrules"] },
  };
  assert.equal(detect(fx.root, c), true);
  fx.cleanup();
});

test("detect: any-of — none present fails", () => {
  const fx = fixture();
  const c = {
    id: "x",
    detection: { type: "any-of", pattern: ["a.md", "b.md", "c.md"] },
  };
  assert.equal(detect(fx.root, c), false);
  fx.cleanup();
});

test("detect: glob type throws (not implemented)", () => {
  const fx = fixture();
  const c = { id: "x", detection: { type: "glob", pattern: "**/*.md" } };
  assert.throws(() => detect(fx.root, c), /glob.*not implemented/i);
  fx.cleanup();
});

test("detect: mcp-server-config — .mcp.json present", () => {
  const fx = fixture();
  fx.file(".mcp.json", "{}");
  const c = {
    id: "acmm:mcp-server-config",
    detection: {
      type: "any-of",
      pattern: [".mcp.json", ".claude/mcp.json", ".cursor/mcp.json", "mcp.json"],
    },
  };
  assert.equal(detect(fx.root, c), true);
  fx.cleanup();
});

test("detect: mcp-server-config — no MCP config present", () => {
  const fx = fixture();
  const c = {
    id: "acmm:mcp-server-config",
    detection: {
      type: "any-of",
      pattern: [".mcp.json", ".claude/mcp.json", ".cursor/mcp.json", "mcp.json"],
    },
  };
  assert.equal(detect(fx.root, c), false);
  fx.cleanup();
});

test("detect: code-graph — llms.txt present", () => {
  const fx = fixture();
  fx.file("llms.txt", "# index");
  const c = {
    id: "acmm:code-graph",
    detection: {
      type: "any-of",
      pattern: [
        ".vscode/settings.json",
        "tags",
        "TAGS",
        ".ctags",
        ".tree-sitter/",
        "llms.txt",
        "llms-full.txt",
        "tsconfig.json",
        ".clangd",
        "pyrightconfig.json",
        ".claude/plugins/",
      ],
    },
  };
  assert.equal(detect(fx.root, c), true);
  fx.cleanup();
});

test("detect: code-graph — tsconfig.json present (TypeScript LSP)", () => {
  const fx = fixture();
  fx.file("tsconfig.json", '{"compilerOptions":{}}');
  const c = {
    id: "acmm:code-graph",
    detection: {
      type: "any-of",
      pattern: [
        ".vscode/settings.json",
        "tags",
        "TAGS",
        ".ctags",
        ".tree-sitter/",
        "llms.txt",
        "llms-full.txt",
        "tsconfig.json",
        ".clangd",
        "pyrightconfig.json",
        ".claude/plugins/",
      ],
    },
  };
  assert.equal(detect(fx.root, c), true);
  fx.cleanup();
});

test("detect: code-graph — .claude/plugins/ directory present (tree-sitter via plugin)", () => {
  const fx = fixture();
  fx.dir(".claude/plugins");
  const c = {
    id: "acmm:code-graph",
    detection: {
      type: "any-of",
      pattern: [
        ".vscode/settings.json",
        "tags",
        "TAGS",
        ".ctags",
        ".tree-sitter/",
        "llms.txt",
        "llms-full.txt",
        "tsconfig.json",
        ".clangd",
        "pyrightconfig.json",
        ".claude/plugins/",
      ],
    },
  };
  assert.equal(detect(fx.root, c), true);
  fx.cleanup();
});

test("detect: code-graph — no code intelligence files present", () => {
  const fx = fixture();
  const c = {
    id: "acmm:code-graph",
    detection: {
      type: "any-of",
      pattern: [
        ".vscode/settings.json",
        "tags",
        "TAGS",
        ".ctags",
        ".tree-sitter/",
        "llms.txt",
        "llms-full.txt",
        "tsconfig.json",
        ".clangd",
        "pyrightconfig.json",
        ".claude/plugins/",
      ],
    },
  };
  assert.equal(detect(fx.root, c), false);
  fx.cleanup();
});

test("detectAll: returns detected set and meta map", () => {
  const fx = fixture();
  fx.file("README.md");
  fx.file("AGENTS.md");
  const criteria = [
    { id: "a", detection: { type: "path", pattern: "README.md" } },
    { id: "b", detection: { type: "path", pattern: "missing.md" } },
    { id: "c", detection: { type: "any-of", pattern: ["AGENTS.md", "x.md"] } },
  ];
  const result = detectAll(fx.root, criteria);
  assert.deepEqual([...result.detected].sort(), ["a", "c"]);
  // non-active criteria produce no meta entries
  assert.equal(result.meta.size, 0);
  fx.cleanup();
});

// ── active detection type tests ────────────────────────────

test("isWorkflowActive: returns degraded when gh CLI is unavailable", () => {
  // Use a temp dir that's not a git repo — gh will fail
  const fx = fixture();
  const result = isWorkflowActive(fx.root, "nonexistent.yml", 7);
  assert.equal(result.active, null);
  assert.equal(result.degraded, true);
  assert.ok(result.reason.includes("gh CLI unavailable"));
  fx.cleanup();
});

test("detect: active type — file missing → false", () => {
  const fx = fixture();
  const c = {
    id: "x",
    detection: { type: "active", pattern: "workflow.yml", maxAgeDays: 7 },
  };
  assert.equal(detect(fx.root, c), false);
  fx.cleanup();
});

test("detect: active type — file exists, gh unavailable → true (degraded)", () => {
  // In a temp dir that's not a git repo, gh will fail → graceful degradation
  const fx = fixture();
  fx.file("workflow.yml", "name: test");
  const c = {
    id: "x",
    detection: { type: "active", pattern: "workflow.yml", maxAgeDays: 7 },
  };
  // gh will error in temp dir (not a repo) → degraded → returns true
  assert.equal(detect(fx.root, c), true);
  fx.cleanup();
});

test("detect: active type — gh unavailable, file missing → false", () => {
  const fx = fixture();
  const c = {
    id: "x",
    detection: { type: "active", pattern: "does-not-exist.yml", maxAgeDays: 7 },
  };
  assert.equal(detect(fx.root, c), false);
  fx.cleanup();
});

test("detect: active type — array pattern, first file missing second exists, gh degraded → true", () => {
  const fx = fixture();
  fx.file("b.yml", "name: b");
  const c = {
    id: "x",
    detection: { type: "active", pattern: ["a.yml", "b.yml"], maxAgeDays: 7 },
  };
  // b.yml exists, gh will degrade → true
  assert.equal(detect(fx.root, c), true);
  fx.cleanup();
});

test("detectAll: active type — meta includes degraded status", () => {
  const fx = fixture();
  fx.file("workflow.yml", "name: test");
  const criteria = [
    { id: "active-one", detection: { type: "active", pattern: "workflow.yml", maxAgeDays: 7 } },
    { id: "active-missing", detection: { type: "active", pattern: "missing.yml", maxAgeDays: 7 } },
  ];
  const result = detectAll(fx.root, criteria);
  // workflow.yml exists, gh fails → degraded → detected
  assert.ok(result.detected.has("active-one"));
  assert.ok(!result.detected.has("active-missing"));
  // meta should have entries for both active criteria
  assert.equal(result.meta.get("active-one").status, "degraded");
  assert.equal(result.meta.get("active-missing").status, "missing");
  fx.cleanup();
});

// ── active detection type ────────────────────────────────────────────

function recentRunOutput(daysAgo = 1) {
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return JSON.stringify([{ conclusion: "success", updatedAt: d.toISOString() }]);
}

function staleRunOutput(daysAgo) {
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return JSON.stringify([{ conclusion: "success", updatedAt: d.toISOString() }]);
}

test("detect: active type — file present AND recent gh run → true", () => {
  const fx = fixture();
  fx.dir(".github/workflows");
  fx.file(".github/workflows/auto-issue.yml", "on: schedule");

  const criterion = {
    id: "acmm:auto-issue-gen",
    detection: { type: "active", pattern: ".github/workflows/auto-issue.yml", maxAgeDays: 7 },
  };

  const mockExecFileSync = () => recentRunOutput(1);
  assert.equal(detect(fx.root, criterion, { execFileSyncFn: mockExecFileSync }), true);
  fx.cleanup();
});

test("detect: active type — file missing → false (no gh call needed)", () => {
  const fx = fixture();

  const criterion = {
    id: "acmm:auto-issue-gen",
    detection: { type: "active", pattern: ".github/workflows/auto-issue.yml", maxAgeDays: 7 },
  };

  let ghCalled = false;
  const mockExecFileSync = () => {
    ghCalled = true;
    return recentRunOutput(1);
  };
  assert.equal(detect(fx.root, criterion, { execFileSyncFn: mockExecFileSync }), false);
  assert.equal(ghCalled, false, "gh should not be called when file is absent");
  fx.cleanup();
});

test("detect: active type — file present but no recent run → false", () => {
  const fx = fixture();
  fx.dir(".github/workflows");
  fx.file(".github/workflows/auto-issue.yml", "on: schedule");

  const criterion = {
    id: "acmm:auto-issue-gen",
    detection: { type: "active", pattern: ".github/workflows/auto-issue.yml", maxAgeDays: 7 },
  };

  // Run was 10 days ago, maxAgeDays is 7
  const mockExecFileSync = () => staleRunOutput(10);
  assert.equal(detect(fx.root, criterion, { execFileSyncFn: mockExecFileSync }), false);
  fx.cleanup();
});

test("detect: active type — gh CLI unavailable → fallback to file presence (true)", () => {
  const fx = fixture();
  fx.dir(".github/workflows");
  fx.file(".github/workflows/auto-issue.yml", "on: schedule");

  const criterion = {
    id: "acmm:auto-issue-gen",
    detection: { type: "active", pattern: ".github/workflows/auto-issue.yml", maxAgeDays: 7 },
  };

  const mockExecFileSync = () => {
    throw new Error("gh: command not found");
  };
  // Should fall back to file-presence → true (with stderr warning)
  assert.equal(detect(fx.root, criterion, { execFileSyncFn: mockExecFileSync }), true);
  fx.cleanup();
});

test("detect: active type — gh returns empty runs array → false", () => {
  const fx = fixture();
  fx.dir(".github/workflows");
  fx.file(".github/workflows/auto-rollback.yml", "on: workflow_run");

  const criterion = {
    id: "acmm:auto-rollback",
    detection: { type: "active", pattern: ".github/workflows/auto-rollback.yml", maxAgeDays: 365 },
  };

  const mockExecFileSync = () => JSON.stringify([]);
  assert.equal(detect(fx.root, criterion, { execFileSyncFn: mockExecFileSync }), false);
  fx.cleanup();
});
