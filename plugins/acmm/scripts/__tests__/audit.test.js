/**
 * Tests for audit.js's pure exported functions — the CLI body itself runs
 * only under `if (process.argv[1] === __filename)`, so importing this module
 * never shells out to `gh`/`git`, reads repo state, or writes files (#5852).
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { checkGhAvailable, shouldWriteState } from "../audit.js";

describe("checkGhAvailable", () => {
  test("true when the probe succeeds", () => {
    assert.equal(checkGhAvailable({ execFn: () => "logged in" }), true);
  });

  test("false when the binary is missing (ENOENT)", () => {
    const execFn = () => {
      const err = new Error("spawn gh ENOENT");
      err.code = "ENOENT";
      throw err;
    };
    assert.equal(checkGhAvailable({ execFn }), false);
  });

  test("false when gh auth status fails", () => {
    const execFn = () => {
      throw new Error("You are not logged into any GitHub hosts");
    };
    assert.equal(checkGhAvailable({ execFn }), false);
  });

  test("probes with `gh auth status`", () => {
    let seenArgs;
    checkGhAvailable({
      execFn: (bin, args) => {
        seenArgs = [bin, ...args];
        return "";
      },
    });
    assert.deepEqual(seenArgs, ["gh", "auth", "status"]);
  });
});

describe("shouldWriteState — AC9 state write policy", () => {
  const BASE_PRIOR = {
    currentLevel: 6,
    detectedIds: ["a", "b", "c"],
    checks: { a: { passed: true } },
    issuesCreated: { x: 1 },
    lastRun: "2026-09-27T00:00:00Z", // 1 day before NOW
  };
  const NOW = new Date("2026-09-28T00:00:00Z");

  test("no write when nothing changed and prior run is recent", () => {
    const next = { ...BASE_PRIOR };
    assert.equal(shouldWriteState(BASE_PRIOR, next, { now: NOW }), false);
  });

  test("write when currentLevel changed", () => {
    const next = { ...BASE_PRIOR, currentLevel: 5 };
    assert.equal(shouldWriteState(BASE_PRIOR, next, { now: NOW }), true);
  });

  test("write when the detectedIds set changed (added)", () => {
    const next = { ...BASE_PRIOR, detectedIds: ["a", "b", "c", "d"] };
    assert.equal(shouldWriteState(BASE_PRIOR, next, { now: NOW }), true);
  });

  test("write when the detectedIds set changed (removed)", () => {
    const next = { ...BASE_PRIOR, detectedIds: ["a", "b"] };
    assert.equal(shouldWriteState(BASE_PRIOR, next, { now: NOW }), true);
  });

  test("no write when detectedIds set is the same but reordered", () => {
    const next = { ...BASE_PRIOR, detectedIds: ["c", "a", "b"] };
    assert.equal(shouldWriteState(BASE_PRIOR, next, { now: NOW }), false);
  });

  test("write when the per-criterion verdict map changed", () => {
    const next = { ...BASE_PRIOR, checks: { a: { passed: false } } };
    assert.equal(shouldWriteState(BASE_PRIOR, next, { now: NOW }), true);
  });

  test("write when issuesCreated changed", () => {
    const next = { ...BASE_PRIOR, issuesCreated: { x: 1, y: 2 } };
    assert.equal(shouldWriteState(BASE_PRIOR, next, { now: NOW }), true);
  });

  test("write on the weekly heartbeat even with zero changes (prior.lastRun > 6 days old)", () => {
    const prior = { ...BASE_PRIOR, lastRun: "2026-09-21T00:00:00Z" }; // 7 days before NOW
    const next = { ...prior };
    assert.equal(shouldWriteState(prior, next, { now: NOW }), true);
  });

  test("no write at exactly the 6-day heartbeat boundary", () => {
    const prior = { ...BASE_PRIOR, lastRun: "2026-09-22T00:00:00Z" }; // 6 days before NOW
    const next = { ...prior };
    assert.equal(shouldWriteState(prior, next, { now: NOW }), false);
  });

  test("write when prior.lastRun is missing entirely (first run)", () => {
    const prior = { ...BASE_PRIOR, lastRun: "" };
    const next = { ...prior };
    assert.equal(shouldWriteState(prior, next, { now: NOW }), true);
  });

  test("a custom heartbeatMaxAgeDays is honored", () => {
    const prior = { ...BASE_PRIOR, lastRun: "2026-09-26T00:00:00Z" }; // 2 days before NOW
    const next = { ...prior };
    assert.equal(shouldWriteState(prior, next, { now: NOW, heartbeatMaxAgeDays: 1 }), true);
  });
});
