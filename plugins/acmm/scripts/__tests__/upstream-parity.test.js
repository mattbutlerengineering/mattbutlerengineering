/**
 * AC9 (#5851/#5853): upstream parity.
 *
 * Every upstream id (kubestellar/console @ 2005b199) must be present locally
 * with the same level/scannable, or be explicitly listed as dropped with a
 * reason. Every gating `acmm`-source id absent from upstream must be one of
 * the four evidence-backed local extensions from item 3 — nothing else may
 * gate the level without either upstream backing or a documented exception.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { ALL_CRITERIA } from "../sources/index.js";
import upstreamSnapshot from "../sources/upstream-snapshot.json" with { type: "json" };
import {
  DROPPED_UPSTREAM_IDS,
  LOCAL_GATING_EXTENSIONS,
  findUpstreamParityIssues,
} from "../sources/upstream-parity.js";

test("upstream snapshot has entries (sanity: fixture didn't come back empty)", () => {
  assert.ok(upstreamSnapshot.length > 50, `expected 80+ entries, got ${upstreamSnapshot.length}`);
});

test("every upstream id is present locally with matching level/scannable, or is a documented drop", () => {
  const issues = findUpstreamParityIssues(
    ALL_CRITERIA,
    upstreamSnapshot,
    DROPPED_UPSTREAM_IDS,
    LOCAL_GATING_EXTENSIONS
  );
  assert.deepEqual(issues, [], `parity issues:\n${issues.join("\n")}`);
});

test("aef:component-fabric was added and matches upstream exactly", () => {
  const local = ALL_CRITERIA.find((c) => c.id === "aef:component-fabric");
  assert.ok(local, "aef:component-fabric should exist");
  assert.equal(local.level, 4);
  assert.deepEqual(local.detection, {
    type: "any-of",
    pattern: [
      ".fabric/subsystems.yaml",
      ".fabric/components/",
      ".fabric/watch-patterns.yaml",
      "agents/fabric/",
    ],
  });
});

test("DROPPED_UPSTREAM_IDS only lists ids that were actually upstream", () => {
  const upstreamIds = new Set(upstreamSnapshot.map((e) => e.id));
  for (const id of Object.keys(DROPPED_UPSTREAM_IDS)) {
    assert.ok(upstreamIds.has(id), `${id} is listed as dropped but was never an upstream id`);
  }
});

test("LOCAL_GATING_EXTENSIONS ids are not in the upstream snapshot (they're genuine local extensions)", () => {
  const upstreamIds = new Set(upstreamSnapshot.map((e) => e.id));
  for (const id of LOCAL_GATING_EXTENSIONS) {
    assert.ok(!upstreamIds.has(id), `${id} is in LOCAL_GATING_EXTENSIONS but is actually upstream`);
  }
});

// ── findUpstreamParityIssues — unit tests on synthetic fixtures ─────────────

test("findUpstreamParityIssues: flags a missing, undropped upstream id", () => {
  const issues = findUpstreamParityIssues(
    [],
    [{ id: "acmm:x", level: 3, scannable: true }],
    {},
    []
  );
  assert.equal(issues.length, 1);
  assert.match(issues[0], /acmm:x/);
});

test("findUpstreamParityIssues: a documented drop is not flagged", () => {
  const issues = findUpstreamParityIssues(
    [],
    [{ id: "acmm:x", level: 3, scannable: true }],
    { "acmm:x": "removed, dead target" },
    []
  );
  assert.deepEqual(issues, []);
});

test("findUpstreamParityIssues: flags a level/scannable mismatch", () => {
  const issues = findUpstreamParityIssues(
    [{ id: "acmm:x", source: "acmm", level: 4, scannable: true }],
    [{ id: "acmm:x", level: 3, scannable: true }],
    {},
    []
  );
  assert.equal(issues.length, 1);
  assert.match(issues[0], /level mismatch/);
});

test("findUpstreamParityIssues: flags a gating acmm id absent from upstream and not an allowed extension", () => {
  const issues = findUpstreamParityIssues(
    [{ id: "acmm:invented", source: "acmm", level: 4 }],
    [],
    {},
    []
  );
  assert.equal(issues.length, 1);
  assert.match(issues[0], /LOCAL_GATING_EXTENSIONS/);
});

test("findUpstreamParityIssues: an allowed local extension is not flagged", () => {
  const issues = findUpstreamParityIssues(
    [{ id: "acmm:invented", source: "acmm", level: 4 }],
    [],
    {},
    ["acmm:invented"]
  );
  assert.deepEqual(issues, []);
});

test("findUpstreamParityIssues: a non-gating (scannable:false) local id is never flagged", () => {
  const issues = findUpstreamParityIssues(
    [{ id: "acmm:invented", source: "acmm", level: 4, scannable: false }],
    [],
    {},
    []
  );
  assert.deepEqual(issues, []);
});

test("findUpstreamParityIssues: a local: source id never gates and is never flagged", () => {
  const issues = findUpstreamParityIssues(
    [{ id: "local:invented", source: "local", level: 4 }],
    [],
    {},
    []
  );
  assert.deepEqual(issues, []);
});
