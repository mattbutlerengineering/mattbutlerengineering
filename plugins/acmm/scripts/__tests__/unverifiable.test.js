/**
 * Tests for unverifiable verdict behavior — #2023.
 *
 * Unverifiable = active-type criterion: file present but gh CLI unavailable/errored.
 * Unverifiable criteria must NOT count toward level threshold math and must be
 * EXCLUDED from the denominator. The report must list them in their own section.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { evaluate, verdictCounts } from "../evaluate.js";
import { evaluateWithInheritance } from "../inheritance.js";
import { writeReport } from "../outputs/report.js";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "acmm-unverifiable-"));
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

// ── verdictCounts: unverifiable must NOT count ───────────────────────────────

describe("verdictCounts: unverifiable excluded from level math", () => {
  test("unverifiable verdict does NOT count toward level math", () => {
    assert.equal(verdictCounts("unverifiable"), false);
  });

  test("pass verdict still counts", () => {
    assert.equal(verdictCounts("pass"), true);
  });

  test("hollow still does not count", () => {
    assert.equal(verdictCounts("hollow"), false);
  });

  test("stale still does not count", () => {
    assert.equal(verdictCounts("stale"), false);
  });

  test("not-found still does not count", () => {
    assert.equal(verdictCounts("not-found"), false);
  });
});

// ── evaluate: unverifiable when gh fails ─────────────────────────────────────

describe("evaluate: active criterion yields unverifiable when gh unavailable", () => {
  test("gh throws → verdict is unverifiable, not pass", () => {
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
    assert.notEqual(result.verdict, "pass");
    assert.ok(result.evidence, "evidence must be populated");
    fx.cleanup();
  });

  test("gh timeout → verdict is unverifiable, not pass", () => {
    const fx = fixture();
    fx.dir(".github/workflows");
    fx.file(".github/workflows/ci.yml", "on: push");
    const c = {
      id: "x",
      detection: { type: "active", pattern: ".github/workflows/ci.yml", maxAgeDays: 7 },
    };
    const result = evaluate(c, fx.root, {
      execFileSyncFn: () => {
        const err = new Error("Command timed out after 5000ms");
        err.status = 124;
        throw err;
      },
    });
    assert.equal(result.verdict, "unverifiable");
    assert.ok(result.evidence.length > 0, "evidence must be non-empty");
    fx.cleanup();
  });
});

// ── evaluateWithInheritance: unverifiable not added to detectedIds ────────────

describe("evaluateWithInheritance: unverifiable excluded from detectedIds", () => {
  test("unverifiable criteria not in detectedIds", () => {
    const fx = fixture();
    fx.dir(".github/workflows");
    fx.file(".github/workflows/ci.yml", "on: push");

    const criteria = [
      {
        id: "active-criterion",
        detection: { type: "active", pattern: ".github/workflows/ci.yml", maxAgeDays: 7 },
      },
    ];

    const acmmConfig = { inherit: false, globalPaths: [], localOnly: [] };
    const opts = {
      execFileSyncFn: () => {
        throw new Error("gh: command not found");
      },
    };

    const { detectedIds, criterionVerdicts } = evaluateWithInheritance(
      criteria,
      fx.root,
      fx.root,
      acmmConfig,
      opts
    );

    assert.equal(
      detectedIds.has("active-criterion"),
      false,
      "unverifiable must not be in detectedIds"
    );
    assert.equal(criterionVerdicts.get("active-criterion").verdict, "unverifiable");
    fx.cleanup();
  });

  test("unverifiable criteria tracked in separate unverifiableIds set", () => {
    const fx = fixture();
    fx.dir(".github/workflows");
    fx.file(".github/workflows/ci.yml", "on: push");

    const criteria = [
      {
        id: "active-criterion",
        detection: { type: "active", pattern: ".github/workflows/ci.yml", maxAgeDays: 7 },
      },
    ];

    const acmmConfig = { inherit: false, globalPaths: [], localOnly: [] };
    const opts = {
      execFileSyncFn: () => {
        throw new Error("gh: command not found");
      },
    };

    const result = evaluateWithInheritance(criteria, fx.root, fx.root, acmmConfig, opts);

    assert.ok("unverifiableIds" in result, "result must include unverifiableIds");
    assert.equal(
      result.unverifiableIds.has("active-criterion"),
      true,
      "unverifiable must be in unverifiableIds"
    );
    fx.cleanup();
  });
});

// ── report: unverifiable section ─────────────────────────────────────────────

describe("writeReport: unverifiable section", () => {
  test("report contains unverifiable section when there are unverifiable criteria", () => {
    const fx = fixture();

    const state = {
      detectedIds: ["acmm:claude-md"],
      history: [],
      behavioral: null,
      lastRun: new Date().toISOString(),
      currentLevel: 2,
      levelName: "Instructed",
      role: "Rule-writer",
    };

    const unverifiableCriteria = [
      {
        id: "acmm:ci-active",
        reason: "gh: command not found",
      },
    ];

    const computation = {
      level: 2,
      levelName: "Instructed",
      role: "Rule-writer",
      characteristic: "",
      antiPattern: "",
      nextTransitionTrigger: null,
      detectedByLevel: { 2: 1, 3: 0, 4: 0, 5: 0, 6: 0 },
      requiredByLevel: { 2: 3, 3: 5, 4: 14, 5: 16, 6: 8 },
      missingForNextLevel: [],
      prerequisites: { met: 0, total: 0 },
      crossCutting: {
        learning: { met: 0, total: 0 },
        traceability: { met: 0, total: 0 },
      },
      behavioralGates: [],
    };

    const reportPath = writeReport(fx.root, {
      state,
      criteria: [],
      sources: [],
      computation,
      diff: null,
      hollowCriteria: [],
      unverifiableCriteria,
    });

    const content = readFileSync(reportPath, "utf-8");
    assert.ok(
      content.includes("Unverifiable") || content.includes("unverifiable"),
      "report should contain an unverifiable section"
    );
    assert.ok(
      content.includes("acmm:ci-active"),
      "report should list the unverifiable criterion ID"
    );
    assert.ok(
      content.includes("gh: command not found"),
      "report should include the reason (gh failure)"
    );

    fx.cleanup();
  });

  test("report does NOT contain unverifiable section when there are none", () => {
    const fx = fixture();

    const state = {
      detectedIds: [],
      history: [],
      behavioral: null,
      lastRun: new Date().toISOString(),
      currentLevel: 1,
      levelName: "Assisted / Ad Hoc",
      role: "Executor",
    };

    const computation = {
      level: 1,
      levelName: "Assisted / Ad Hoc",
      role: "Executor",
      characteristic: "",
      antiPattern: "",
      nextTransitionTrigger: null,
      detectedByLevel: { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
      requiredByLevel: { 2: 3, 3: 5, 4: 14, 5: 16, 6: 8 },
      missingForNextLevel: [],
      prerequisites: { met: 0, total: 0 },
      crossCutting: {
        learning: { met: 0, total: 0 },
        traceability: { met: 0, total: 0 },
      },
      behavioralGates: [],
    };

    const reportPath = writeReport(fx.root, {
      state,
      criteria: [],
      sources: [],
      computation,
      diff: null,
      hollowCriteria: [],
      unverifiableCriteria: [],
    });

    const content = readFileSync(reportPath, "utf-8");
    assert.ok(
      !content.includes("## Unverifiable"),
      "report should NOT contain unverifiable section when none exist"
    );

    fx.cleanup();
  });

  test("header shows criteria count excluding unverifiable from denominator", () => {
    const fx = fixture();

    // 3 total criteria, 1 unverifiable → denominator should be 2, not 3
    const state = {
      detectedIds: ["acmm:claude-md"],
      history: [],
      behavioral: null,
      lastRun: new Date().toISOString(),
      currentLevel: 2,
      levelName: "Instructed",
      role: "Rule-writer",
    };

    const criteria = [
      {
        id: "acmm:claude-md",
        level: 2,
        source: "acmm",
        category: "c",
        name: "n",
        description: "d",
        detection: { type: "path", pattern: "CLAUDE.md" },
      },
      {
        id: "acmm:agents-md",
        level: 2,
        source: "acmm",
        category: "c",
        name: "n",
        description: "d",
        detection: { type: "path", pattern: "AGENTS.md" },
      },
      {
        id: "acmm:ci-active",
        level: 3,
        source: "acmm",
        category: "c",
        name: "n",
        description: "d",
        detection: { type: "active", pattern: ".github/workflows/ci.yml" },
      },
    ];

    const unverifiableCriteria = [{ id: "acmm:ci-active", reason: "gh: command not found" }];

    const computation = {
      level: 2,
      levelName: "Instructed",
      role: "Rule-writer",
      characteristic: "",
      antiPattern: "",
      nextTransitionTrigger: null,
      detectedByLevel: { 2: 1, 3: 0, 4: 0, 5: 0, 6: 0 },
      requiredByLevel: { 2: 3, 3: 5, 4: 14, 5: 16, 6: 8 },
      missingForNextLevel: [],
      prerequisites: { met: 0, total: 0 },
      crossCutting: {
        learning: { met: 0, total: 0 },
        traceability: { met: 0, total: 0 },
      },
      behavioralGates: [],
    };

    const reportPath = writeReport(fx.root, {
      state,
      criteria,
      sources: [],
      computation,
      diff: null,
      hollowCriteria: [],
      unverifiableCriteria,
    });

    const content = readFileSync(reportPath, "utf-8");
    // denominator should be 2 (3 total - 1 unverifiable), not 3
    assert.ok(
      content.includes("1/2 criteria"),
      `report header should show 1/2 (excluding unverifiable from denominator), got: ${content.slice(0, 300)}`
    );

    fx.cleanup();
  });
});
