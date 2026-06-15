/**
 * Tests for badge.js — fresh/stale badge rendering and updateBadge behavior.
 *
 * Fresh state (lastRun <= 7 days ago): normal level-colored badge
 * Stale state (lastRun > 7 days ago): grey badge with audit date
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { badgeMarkdown, staleBadgeMarkdown, updateBadge } from "../outputs/badge.js";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "acmm-badge-"));
  return {
    root,
    readme(content) {
      writeFileSync(join(root, "README.md"), content, "utf-8");
    },
    readReadme() {
      return readFileSync(join(root, "README.md"), "utf-8");
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

const FRESH_NOW = new Date("2026-06-14T12:00:00.000Z");
const FRESH_LAST_RUN = new Date("2026-06-10T12:00:00.000Z").toISOString(); // 4 days ago
const STALE_LAST_RUN = new Date("2026-05-27T12:00:00.000Z").toISOString(); // 18 days ago

// ── badgeMarkdown ────────────────────────────────────────────────────────────

test("badgeMarkdown: level 6 produces gold badge", () => {
  const md = badgeMarkdown(6);
  assert.ok(md.includes("ACMM-Level%206"), "should mention level 6");
  assert.ok(md.includes("d4a030"), "level 6 should be gold");
  assert.ok(md.startsWith("[!["), "should be markdown image link");
});

test("badgeMarkdown: level 0 produces not-scored badge", () => {
  const md = badgeMarkdown(0);
  assert.ok(md.includes("not%20scored"), "level 0 should say not scored");
});

// ── staleBadgeMarkdown ───────────────────────────────────────────────────────

test("staleBadgeMarkdown: produces grey badge", () => {
  const md = staleBadgeMarkdown(6, "2026-05-27");
  assert.ok(md.includes("9e9e9e"), "stale badge should use grey color");
});

test("staleBadgeMarkdown: includes audit date in label", () => {
  const md = staleBadgeMarkdown(6, "2026-05-27");
  assert.ok(md.includes("2026"), "stale badge should include the year");
  assert.ok(md.includes("05"), "stale badge should include the month");
});

test("staleBadgeMarkdown: links to docs/acmm.md", () => {
  const md = staleBadgeMarkdown(6, "2026-05-27");
  assert.ok(md.includes("docs/acmm.md"), "stale badge should link to docs/acmm.md");
});

test("staleBadgeMarkdown: is different from fresh badgeMarkdown for same level", () => {
  const fresh = badgeMarkdown(6);
  const stale = staleBadgeMarkdown(6, "2026-05-27");
  assert.notEqual(fresh, stale, "stale badge must differ from fresh badge");
});

// ── updateBadge with freshness ───────────────────────────────────────────────

test("updateBadge: fresh state emits normal badge (fenced)", () => {
  const fx = fixture();
  fx.readme("before\n<!-- acmm:begin -->old badge<!-- acmm:end -->\nafter");
  const result = updateBadge(fx.root, 6, { lastRun: FRESH_LAST_RUN }, FRESH_NOW);
  assert.equal(result, "updated");
  const content = fx.readReadme();
  assert.ok(content.includes("d4a030"), "fresh state should use level color (gold for L6)");
  assert.ok(!content.includes("9e9e9e"), "fresh state should not use grey");
  fx.cleanup();
});

test("updateBadge: stale state emits grey badge (fenced)", () => {
  const fx = fixture();
  fx.readme("before\n<!-- acmm:begin -->old badge<!-- acmm:end -->\nafter");
  const result = updateBadge(fx.root, 6, { lastRun: STALE_LAST_RUN }, FRESH_NOW);
  assert.equal(result, "updated");
  const content = fx.readReadme();
  assert.ok(content.includes("9e9e9e"), "stale state should use grey color");
  assert.ok(!content.includes("d4a030"), "stale state should not use level color");
  fx.cleanup();
});

test("updateBadge: stale badge contains audit date", () => {
  const fx = fixture();
  fx.readme("before\n<!-- acmm:begin -->old badge<!-- acmm:end -->\nafter");
  updateBadge(fx.root, 6, { lastRun: STALE_LAST_RUN }, FRESH_NOW);
  const content = fx.readReadme();
  // Date from STALE_LAST_RUN is 2026-05-27
  assert.ok(content.includes("2026"), "stale badge should include the year");
  fx.cleanup();
});

test("updateBadge: fresh badge already matching returns no-change", () => {
  const fx = fixture();
  const freshBadge = badgeMarkdown(6);
  fx.readme(`before\n<!-- acmm:begin -->${freshBadge}<!-- acmm:end -->\nafter`);
  const result = updateBadge(fx.root, 6, { lastRun: FRESH_LAST_RUN }, FRESH_NOW);
  assert.equal(result, "no-change");
  fx.cleanup();
});

test("updateBadge: stale badge already matching returns no-change", () => {
  const fx = fixture();
  const staleBadge = staleBadgeMarkdown(6, "2026-05-27");
  fx.readme(`before\n<!-- acmm:begin -->${staleBadge}<!-- acmm:end -->\nafter`);
  const result = updateBadge(fx.root, 6, { lastRun: STALE_LAST_RUN }, FRESH_NOW);
  assert.equal(result, "no-change");
  fx.cleanup();
});

test("updateBadge: empty lastRun treats state as stale", () => {
  const fx = fixture();
  fx.readme("before\n<!-- acmm:begin -->old badge<!-- acmm:end -->\nafter");
  const result = updateBadge(fx.root, 6, { lastRun: "" }, FRESH_NOW);
  assert.equal(result, "updated");
  const content = fx.readReadme();
  assert.ok(content.includes("9e9e9e"), "missing lastRun should produce grey stale badge");
  fx.cleanup();
});

test("updateBadge: no-readme returned when README.md missing", () => {
  const fx = fixture();
  const result = updateBadge(fx.root, 6, { lastRun: FRESH_LAST_RUN }, FRESH_NOW);
  assert.equal(result, "no-readme");
  fx.cleanup();
});

test("updateBadge: no-fence returned when README has no fences or badge", () => {
  const fx = fixture();
  fx.readme("# Some readme with no badge");
  const result = updateBadge(fx.root, 6, { lastRun: FRESH_LAST_RUN }, FRESH_NOW);
  assert.equal(result, "no-fence");
  fx.cleanup();
});

test("updateBadge: backwards compat — called with no state treats as stale", () => {
  const fx = fixture();
  fx.readme("before\n<!-- acmm:begin -->old badge<!-- acmm:end -->\nafter");
  // Call with old 2-arg signature (no state, no now)
  const result = updateBadge(fx.root, 4);
  assert.equal(result, "updated");
  const content = fx.readReadme();
  // Without state, no lastRun = stale
  assert.ok(content.includes("9e9e9e"), "no state should produce grey stale badge");
  fx.cleanup();
});
