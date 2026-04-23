/**
 * Fixture-based check tests. Build temp directories, run each check, assert outcome.
 *   node --test scripts/acmm/__tests__/checks.test.js
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RUNNERS } from "../checks.js";

/**
 * Build a fixture directory from a plain {path → content} map. Returns cwd.
 * @param {Record<string, string>} files
 */
function buildFixture(files) {
  const root = mkdtempSync(join(tmpdir(), "acmm-fixture-"));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, body, "utf-8");
  }
  return root;
}

test("I1.1 passes when README.md exists", async () => {
  const root = buildFixture({ "README.md": "# hi" });
  try {
    const r = await RUNNERS["I1.1"](root);
    assert.equal(r.passed, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("I1.1 fails on bare dir", async () => {
  const root = buildFixture({});
  try {
    const r = await RUNNERS["I1.1"](root);
    assert.equal(r.passed, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("I2.1 fails on CLAUDE.md <500 chars", async () => {
  const root = buildFixture({ "CLAUDE.md": "# short" });
  try {
    const r = await RUNNERS["I2.1"](root);
    assert.equal(r.passed, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("I2.1 passes on CLAUDE.md >500 chars", async () => {
  const root = buildFixture({ "CLAUDE.md": "x".repeat(600) });
  try {
    const r = await RUNNERS["I2.1"](root);
    assert.equal(r.passed, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("M2.1 requires all three scripts", async () => {
  const only2 = buildFixture({
    "package.json": JSON.stringify({ scripts: { test: "x", typecheck: "y" } }),
  });
  const all3 = buildFixture({
    "package.json": JSON.stringify({ scripts: { test: "x", typecheck: "y", lint: "z" } }),
  });
  try {
    assert.equal((await RUNNERS["M2.1"](only2)).passed, false);
    assert.equal((await RUNNERS["M2.1"](all3)).passed, true);
  } finally {
    rmSync(only2, { recursive: true, force: true });
    rmSync(all3, { recursive: true, force: true });
  }
});

test("I3.1 counts scoped CLAUDE.md files across packages/services/apps", async () => {
  const root = buildFixture({
    "packages/a/CLAUDE.md": "hi",
    "packages/b/CLAUDE.md": "hi",
    "services/c/CLAUDE.md": "hi",
    "apps/d/package.json": "{}",      // no CLAUDE.md here
  });
  try {
    const r = await RUNNERS["I3.1"](root);
    assert.equal(r.passed, true, r.evidence);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("I3.3 counts skills plus agents", async () => {
  const root = buildFixture({
    ".claude/skills/a/SKILL.md": "",
    ".claude/skills/b/SKILL.md": "",
    ".claude/agents/code-reviewer.md": "",
  });
  try {
    const r = await RUNNERS["I3.3"](root);
    assert.equal(r.passed, true, r.evidence);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("G3.1 passes when CODEOWNERS exists in .github/", async () => {
  const root = buildFixture({ ".github/CODEOWNERS": "* @owner" });
  try {
    const r = await RUNNERS["G3.1"](root);
    assert.equal(r.passed, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("G4.1 passes when a destructive-ops script exists", async () => {
  const root = buildFixture({ "scripts/check-destructive-migrations.js": "// guard" });
  try {
    const r = await RUNNERS["G4.1"](root);
    assert.equal(r.passed, true, r.evidence);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("F3.1 passes when pre-commit runs >=2 gates", async () => {
  const root = buildFixture({
    ".husky/pre-commit": "pnpm lint\npnpm typecheck\n",
  });
  try {
    const r = await RUNNERS["F3.1"](root);
    assert.equal(r.passed, true, r.evidence);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("F3.1 fails when pre-commit runs only one gate", async () => {
  const root = buildFixture({
    ".husky/pre-commit": "pnpm lint\n",
  });
  try {
    const r = await RUNNERS["F3.1"](root);
    assert.equal(r.passed, false, r.evidence);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("M5.1 passes with 6+ dated entries spanning 5+ weeks", async () => {
  const log = [
    "## 2026-01-01", "## 2026-01-08", "## 2026-01-15",
    "## 2026-01-22", "## 2026-01-29", "## 2026-02-05",
  ].join("\n");
  const root = buildFixture({ ".claude/improvement-loop/log.md": log });
  try {
    const r = await RUNNERS["M5.1"](root);
    assert.equal(r.passed, true, r.evidence);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("M5.1 fails with sparse history (5 entries)", async () => {
  const log = [
    "## 2026-01-01", "## 2026-01-08", "## 2026-01-15",
    "## 2026-01-22", "## 2026-01-29",
  ].join("\n");
  const root = buildFixture({ ".claude/improvement-loop/log.md": log });
  try {
    const r = await RUNNERS["M5.1"](root);
    assert.equal(r.passed, false, r.evidence);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
