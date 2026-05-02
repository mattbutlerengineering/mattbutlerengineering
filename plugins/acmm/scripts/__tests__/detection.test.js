import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { detect, detectAll } from "../detection.js";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "acmm-detect-"));
  return {
    root,
    file(rel, body = "") {
      const p = join(root, rel);
      mkdirSync(join(p, "..").endsWith("..") ? root : p.slice(0, p.lastIndexOf("/")), { recursive: true });
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
    detection: { type: "any-of", pattern: [".mcp.json", ".claude/mcp.json", ".cursor/mcp.json", "mcp.json"] },
  };
  assert.equal(detect(fx.root, c), true);
  fx.cleanup();
});

test("detect: mcp-server-config — no MCP config present", () => {
  const fx = fixture();
  const c = {
    id: "acmm:mcp-server-config",
    detection: { type: "any-of", pattern: [".mcp.json", ".claude/mcp.json", ".cursor/mcp.json", "mcp.json"] },
  };
  assert.equal(detect(fx.root, c), false);
  fx.cleanup();
});

test("detect: code-graph — llms.txt present", () => {
  const fx = fixture();
  fx.file("llms.txt", "# index");
  const c = {
    id: "acmm:code-graph",
    detection: { type: "any-of", pattern: [".vscode/settings.json", "tags", "TAGS", ".ctags", ".tree-sitter/", "llms.txt", "llms-full.txt"] },
  };
  assert.equal(detect(fx.root, c), true);
  fx.cleanup();
});

test("detect: code-graph — no code intelligence files present", () => {
  const fx = fixture();
  const c = {
    id: "acmm:code-graph",
    detection: { type: "any-of", pattern: [".vscode/settings.json", "tags", "TAGS", ".ctags", ".tree-sitter/", "llms.txt", "llms-full.txt"] },
  };
  assert.equal(detect(fx.root, c), false);
  fx.cleanup();
});

test("detectAll: returns set of detected ids only", () => {
  const fx = fixture();
  fx.file("README.md");
  fx.file("AGENTS.md");
  const criteria = [
    { id: "a", detection: { type: "path", pattern: "README.md" } },
    { id: "b", detection: { type: "path", pattern: "missing.md" } },
    { id: "c", detection: { type: "any-of", pattern: ["AGENTS.md", "x.md"] } },
  ];
  const result = detectAll(fx.root, criteria);
  assert.deepEqual([...result].sort(), ["a", "c"]);
  fx.cleanup();
});
