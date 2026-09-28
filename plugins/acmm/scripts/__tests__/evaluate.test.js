/**
 * Tests for the evaluate() verdict seam.
 *
 * evaluate(criterion, cwd, opts) -> { verdict, evidence }
 * Verdicts: 'pass' | 'hollow' | 'stale' | 'unverifiable'
 *
 * Mapping from prior behavior:
 *   - detected (any type)                          → pass
 *   - active type, file present, gh degraded       → unverifiable
 *   - active type, file present, no recent run     → stale
 *   - path/any-of/grep not detected                → pass is absent (verdict absent/undetected)
 *   - substance check fails on a detected criterion → hollow
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { evaluate } from "../evaluate.js";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "acmm-eval-"));
  return {
    root,
    file(rel, body = "") {
      const p = join(root, rel);
      const dir = p.slice(0, p.lastIndexOf("/"));
      mkdirSync(dir, { recursive: true });
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

// ── path type ───────────────────────────────────────────────────────────────

test("evaluate: path — file present → pass", () => {
  const fx = fixture();
  fx.file("README.md", "# hello");
  const c = { id: "x", detection: { type: "path", pattern: "README.md" } };
  const result = evaluate(c, fx.root);
  assert.equal(result.verdict, "pass");
  assert.ok(result.evidence, "evidence should be non-empty");
  fx.cleanup();
});

test("evaluate: path — file missing → not-found (verdict is falsy/absent)", () => {
  const fx = fixture();
  const c = { id: "x", detection: { type: "path", pattern: "missing.md" } };
  const result = evaluate(c, fx.root);
  assert.notEqual(result.verdict, "pass");
  assert.ok(result.evidence);
  fx.cleanup();
});

// ── any-of type ─────────────────────────────────────────────────────────────

test("evaluate: any-of — one present → pass", () => {
  const fx = fixture();
  fx.file("AGENTS.md");
  const c = {
    id: "x",
    detection: { type: "any-of", pattern: ["CLAUDE.md", "AGENTS.md"] },
  };
  const result = evaluate(c, fx.root);
  assert.equal(result.verdict, "pass");
  fx.cleanup();
});

test("evaluate: any-of — none present → not pass", () => {
  const fx = fixture();
  const c = {
    id: "x",
    detection: { type: "any-of", pattern: ["a.md", "b.md"] },
  };
  const result = evaluate(c, fx.root);
  assert.notEqual(result.verdict, "pass");
  fx.cleanup();
});

// ── grep type ────────────────────────────────────────────────────────────────

test("evaluate: grep — file contains pattern → pass", () => {
  const fx = fixture();
  fx.file("vitest.config.ts", "coverage: { threshold: { lines: 80 } }");
  const c = {
    id: "x",
    detection: {
      type: "grep",
      pattern: { file: "vitest.config.ts", contains: "threshold" },
    },
  };
  const result = evaluate(c, fx.root);
  assert.equal(result.verdict, "pass");
  fx.cleanup();
});

test("evaluate: grep — file missing → not pass", () => {
  const fx = fixture();
  const c = {
    id: "x",
    detection: {
      type: "grep",
      pattern: { file: "vitest.config.ts", contains: "threshold" },
    },
  };
  const result = evaluate(c, fx.root);
  assert.notEqual(result.verdict, "pass");
  fx.cleanup();
});

test("evaluate: grep — file present but no match → not pass", () => {
  const fx = fixture();
  fx.file("vitest.config.ts", "// no coverage config");
  const c = {
    id: "x",
    detection: {
      type: "grep",
      pattern: { file: "vitest.config.ts", contains: "threshold" },
    },
  };
  const result = evaluate(c, fx.root);
  assert.notEqual(result.verdict, "pass");
  fx.cleanup();
});

// ── active type ──────────────────────────────────────────────────────────────

test("evaluate: active — file present + recent run → pass", () => {
  const fx = fixture();
  fx.dir(".github/workflows");
  fx.file(".github/workflows/ci.yml", "on: push");
  const c = {
    id: "x",
    detection: { type: "active", pattern: ".github/workflows/ci.yml", maxAgeDays: 7 },
  };
  const recentRun = JSON.stringify([
    {
      conclusion: "success",
      updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ]);
  const result = evaluate(c, fx.root, { execFileSyncFn: () => recentRun });
  assert.equal(result.verdict, "pass");
  fx.cleanup();
});

test("evaluate: active — file present, no recent run → stale", () => {
  const fx = fixture();
  fx.dir(".github/workflows");
  fx.file(".github/workflows/ci.yml", "on: push");
  const c = {
    id: "x",
    detection: { type: "active", pattern: ".github/workflows/ci.yml", maxAgeDays: 7 },
  };
  const staleRun = JSON.stringify([
    {
      conclusion: "success",
      updatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ]);
  const result = evaluate(c, fx.root, { execFileSyncFn: () => staleRun });
  assert.equal(result.verdict, "stale");
  assert.ok(result.evidence);
  fx.cleanup();
});

test("evaluate: active — file present, gh degraded → unverifiable", () => {
  const fx = fixture();
  fx.dir(".github/workflows");
  fx.file(".github/workflows/ci.yml", "on: push");
  const c = {
    id: "x",
    detection: { type: "active", pattern: ".github/workflows/ci.yml", maxAgeDays: 7 },
  };
  const result = evaluate(c, fx.root, {
    execFileSyncFn: () => {
      throw new Error("gh: command not found");
    },
  });
  assert.equal(result.verdict, "unverifiable");
  assert.ok(result.evidence);
  fx.cleanup();
});

test("evaluate: active — file missing → not pass", () => {
  const fx = fixture();
  const c = {
    id: "x",
    detection: { type: "active", pattern: ".github/workflows/missing.yml", maxAgeDays: 7 },
  };
  const result = evaluate(c, fx.root);
  assert.notEqual(result.verdict, "pass");
  assert.notEqual(result.verdict, "stale");
  assert.notEqual(result.verdict, "unverifiable");
  fx.cleanup();
});

// ── substance checks (hollow verdict) ───────────────────────────────────────

test("evaluate: substance — detected criterion with passing substance → pass (not hollow)", () => {
  const fx = fixture();
  // fullsend:test-coverage needs a file with coverage threshold
  fx.file("vitest.config.ts", "coverage: { threshold: { lines: 80 } }");
  const c = {
    id: "fullsend:test-coverage",
    detection: { type: "grep", pattern: { file: "vitest.config.ts", contains: "threshold" } },
  };
  const result = evaluate(c, fx.root);
  assert.equal(result.verdict, "pass");
  fx.cleanup();
});

test("evaluate: substance — detected criterion with failing substance → hollow", () => {
  const fx = fixture();
  // acmm:correction-capture needs feeds_back_into frontmatter in a file
  // We create a file at a path that substance checker would look at, but with no valid content
  fx.dir(".claude/memory");
  fx.file(".claude/memory/corrections.md", "# empty\n");
  const c = {
    id: "acmm:correction-capture",
    detection: { type: "path", pattern: ".claude/memory/" },
  };
  const result = evaluate(c, fx.root);
  // File is detected (path exists) but substance check should fail → hollow
  assert.equal(result.verdict, "hollow");
  // evidence is the detection evidence (not substance failure)
  assert.ok(
    result.evidence.includes(".claude/memory"),
    `evidence should mention detected path, got: ${result.evidence}`
  );
  // substanceEvidence carries the substance failure reason
  assert.ok(
    typeof result.substanceEvidence === "string" && result.substanceEvidence.length > 0,
    "substanceEvidence should be non-empty for hollow verdict"
  );
  fx.cleanup();
});

// ── evidence is always populated ────────────────────────────────────────────

// ── `check` detection type (#5851/#5853 AC5) ────────────────────────────────

test("evaluate: check type — passed:true → pass verdict", () => {
  const fx = fixture();
  const criterion = {
    id: "x",
    detection: { type: "check", pattern: "irrelevant" },
    check: () => ({ passed: true, evidence: "3 things found" }),
  };
  const result = evaluate(criterion, fx.root);
  assert.equal(result.verdict, "pass");
  assert.equal(result.evidence, "3 things found");
  fx.cleanup();
});

test("evaluate: check type — passed:false → not-found verdict", () => {
  const fx = fixture();
  const criterion = {
    id: "x",
    detection: { type: "check", pattern: "irrelevant" },
    check: () => ({ passed: false, evidence: "nothing found" }),
  };
  const result = evaluate(criterion, fx.root);
  assert.equal(result.verdict, "not-found");
  assert.equal(result.evidence, "nothing found");
  fx.cleanup();
});

test("evaluate: check type — passed:null → unverifiable verdict, never a silent pass", () => {
  const fx = fixture();
  const criterion = {
    id: "x",
    detection: { type: "check", pattern: "irrelevant" },
    check: () => ({ passed: null, evidence: "gh CLI unavailable" }),
  };
  const result = evaluate(criterion, fx.root);
  assert.equal(result.verdict, "unverifiable");
  assert.equal(result.evidence, "gh CLI unavailable");
  fx.cleanup();
});

test("evaluate: check type — never falls through to a workflow lookup", () => {
  // Regression: meta:threshold-tuning etc. used to be `type: 'active'` with a
  // non-github: pattern, so `isWorkflowActive` tried `gh run list
  // --workflow=metrics/x.jsonl` and always got "could not find any
  // workflows" → unverifiable forever, and check() never ran. With `type:
  // 'check'`, check() must run unconditionally, with no gh call at all.
  const fx = fixture();
  let checkCalled = false;
  const criterion = {
    id: "meta:example",
    detection: { type: "check", pattern: "metrics/example.jsonl" },
    check: () => {
      checkCalled = true;
      return { passed: true, evidence: "ran directly" };
    },
  };
  const result = evaluate(criterion, fx.root, {
    execFileSyncFn: () => {
      throw new Error("gh should never be invoked for a check-type criterion");
    },
  });
  assert.ok(checkCalled, "check() should have run");
  assert.equal(result.verdict, "pass");
  fx.cleanup();
});

test("evaluate: evidence is always a non-empty string", () => {
  const types = [
    { detection: { type: "path", pattern: "missing.md" } },
    { detection: { type: "any-of", pattern: ["a.md", "b.md"] } },
    { detection: { type: "grep", pattern: { file: "f.ts", contains: "x" } } },
  ];
  const fx = fixture();
  for (const c of types) {
    const result = evaluate({ id: "t", ...c }, fx.root);
    assert.ok(
      typeof result.evidence === "string" && result.evidence.length > 0,
      `evidence must be non-empty string for type ${c.detection.type}`
    );
  }
  fx.cleanup();
});
