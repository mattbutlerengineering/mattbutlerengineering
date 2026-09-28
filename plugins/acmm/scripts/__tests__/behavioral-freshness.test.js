import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  ageInDays,
  classifyBehavioralFreshness,
  freshBehavioralReading,
  describeBehavioralAge,
} from "../behavioral-freshness.js";
import { computeLevel } from "../computeLevel.js";

const NOW = new Date("2026-09-28T12:00:00Z");

describe("ageInDays", () => {
  test("computes whole days since measured_at", () => {
    assert.equal(ageInDays("2026-09-20T12:00:00Z", NOW), 8);
  });

  test("returns null for a missing or unparseable timestamp", () => {
    assert.equal(ageInDays(undefined, NOW), null);
    assert.equal(ageInDays("not-a-date", NOW), null);
  });
});

describe("classifyBehavioralFreshness", () => {
  test("absent reading is stale with no age", () => {
    assert.deepEqual(classifyBehavioralFreshness(null, { now: NOW }), {
      stale: true,
      ageDays: null,
    });
  });

  test("a reading exactly at the 7-day boundary is fresh (not stale)", () => {
    const reading = { measured_at: "2026-09-21T12:00:00Z" }; // 7 days ago
    const r = classifyBehavioralFreshness(reading, { now: NOW });
    assert.equal(r.ageDays, 7);
    assert.equal(r.stale, false);
  });

  test("AC3: prior flake 8 days old + gh unavailable -> stale (unverifiable)", () => {
    const reading = { rate_30d: 0.02, measured_at: "2026-09-20T12:00:00Z" }; // 8 days ago
    const r = classifyBehavioralFreshness(reading, { now: NOW });
    assert.equal(r.ageDays, 8);
    assert.equal(r.stale, true);
  });

  test("AC3 end-to-end: a stale flake reading actually blocks the L3 gate through computeLevel (review item 5)", () => {
    // A LOW flake rate (0.02, well under the 20% threshold) that would pass
    // the gate outright if read as live — the point is that staleness alone
    // must block it, independent of what the number says.
    const reading = { rate_30d: 0.02, sample_size: 40, measured_at: "2026-09-20T12:00:00Z" }; // 8 days ago
    const fresh = freshBehavioralReading(reading, { now: NOW });
    assert.equal(fresh, null, "a stale reading is carried into computeLevel as MISSING");

    const detectedIds = new Set([
      "acmm:claude-md",
      "acmm:pr-acceptance-metric",
      "acmm:pr-review-rubric",
      "acmm:quality-dashboard",
      "acmm:ci-matrix",
      "acmm:instruction-sync-gate",
    ]);
    const result = computeLevel(detectedIds, { flake: fresh }, { strict: true });
    const flakeGate = result.behavioralGates.find((g) => g.name === "ci-flake-rate");
    assert.equal(flakeGate.dataAvailable, false, "a stale reading must not read as live data");
    assert.equal(flakeGate.unverifiable, true);
    assert.equal(result.level, 2, "strict mode blocks L3 on a gate fed only a stale reading");
  });

  test("a custom maxAgeDays is honored", () => {
    const reading = { measured_at: "2026-09-20T12:00:00Z" }; // 8 days ago
    const r = classifyBehavioralFreshness(reading, { now: NOW, maxAgeDays: 10 });
    assert.equal(r.stale, false);
  });

  test("an unparseable measured_at fails closed to stale, never fresh", () => {
    const r = classifyBehavioralFreshness({ measured_at: "garbage" }, { now: NOW });
    assert.equal(r.stale, true);
    assert.equal(r.ageDays, null);
  });
});

describe("freshBehavioralReading", () => {
  test("returns the reading unchanged when fresh", () => {
    const reading = { rate_30d: 0.02, measured_at: "2026-09-27T12:00:00Z" };
    assert.equal(freshBehavioralReading(reading, { now: NOW }), reading);
  });

  test("returns null when stale — so computeLevel's gates see MISSING data, not a live number", () => {
    const reading = { rate_30d: 0.9, measured_at: "2026-09-01T12:00:00Z" };
    assert.equal(freshBehavioralReading(reading, { now: NOW }), null);
  });

  test("returns null for an absent reading", () => {
    assert.equal(freshBehavioralReading(null, { now: NOW }), null);
  });
});

describe("describeBehavioralAge", () => {
  test("no reading", () => {
    assert.equal(describeBehavioralAge("flake", null, { now: NOW }), "flake: no reading");
  });

  test("fresh reading shows its age", () => {
    const reading = { measured_at: "2026-09-27T12:00:00Z" };
    assert.equal(describeBehavioralAge("flake", reading, { now: NOW }), "flake: fresh (1d old)");
  });

  test("stale reading names itself and shows the measured date", () => {
    const reading = { measured_at: "2026-09-20T12:00:00Z" };
    const msg = describeBehavioralAge("flake", reading, { now: NOW });
    assert.match(msg, /STALE/);
    assert.match(msg, /8d old/);
    assert.match(msg, /2026-09-20/);
  });
});
