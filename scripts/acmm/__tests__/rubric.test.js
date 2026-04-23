/**
 * Structural invariants for the ACMM rubric.
 * Runs with Node's built-in test runner:  node --test scripts/acmm/__tests__/
 */

import test from "node:test";
import assert from "node:assert/strict";
import { CHECKS, computeLevel, byDimension } from "../rubric.js";

test("rubric: every check has well-formed id/dimension/level/remedy", () => {
  const DIMENSIONS = new Set(["Instructions", "Measurement", "Feedback", "Gating"]);
  for (const c of CHECKS) {
    assert.match(c.id, /^[IMFG]\d\.\d+$/, `bad id: ${c.id}`);
    assert.ok(DIMENSIONS.has(c.dimension), `bad dimension for ${c.id}: ${c.dimension}`);
    assert.ok([1, 2, 3, 4, 5].includes(c.level), `bad level for ${c.id}: ${c.level}`);
    assert.ok(c.description.length > 10, `description too short for ${c.id}`);
    assert.ok(c.remedy.length > 20, `remedy too short for ${c.id}`);

    // Prefix matches dimension
    const prefixMap = { Instructions: "I", Measurement: "M", Feedback: "F", Gating: "G" };
    assert.equal(c.id[0], prefixMap[c.dimension], `id prefix ${c.id[0]} does not match dimension ${c.dimension}`);

    // Level digit matches level field
    assert.equal(parseInt(c.id[1], 10), c.level, `id level digit does not match level field for ${c.id}`);
  }
});

test("rubric: every id is unique", () => {
  const seen = new Set();
  for (const c of CHECKS) {
    assert.ok(!seen.has(c.id), `duplicate id: ${c.id}`);
    seen.add(c.id);
  }
});

test("rubric: at least one check exists at every level × dimension", () => {
  const grouped = byDimension();
  for (const dim of ["Instructions", "Measurement", "Feedback", "Gating"]) {
    const levels = new Set(grouped[dim].map((c) => c.level));
    for (const L of [1, 2, 3, 4, 5]) {
      assert.ok(levels.has(L), `${dim} has no check at level ${L}`);
    }
  }
});

test("computeLevel: all-pass → L5", () => {
  const passed = Object.fromEntries(CHECKS.map((c) => [c.id, true]));
  assert.equal(computeLevel(passed), 5);
});

test("computeLevel: one L3 fail caps at L2 even with L5 perfect", () => {
  const passed = Object.fromEntries(CHECKS.map((c) => [c.id, true]));
  const firstL3 = CHECKS.find((c) => c.level === 3);
  passed[firstL3.id] = false;
  assert.equal(computeLevel(passed), 2);
});

test("computeLevel: all-fail → 0", () => {
  const passed = Object.fromEntries(CHECKS.map((c) => [c.id, false]));
  assert.equal(computeLevel(passed), 0);
});
