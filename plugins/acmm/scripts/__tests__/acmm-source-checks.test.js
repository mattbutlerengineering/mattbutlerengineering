/**
 * #5876 review fix 2: the `check()` functions added to sources/acmm.js for
 * #5851/#5853 (checkCiStepActive via checkInstructionSyncGate /
 * checkInstructionRotDetection, checkAutoIssueGen, checkMultiPerspectiveReview,
 * checkEvidenceAntipatterns) had zero test coverage — mutation testing could
 * flip any branch in them silently. Three of these gate the level.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  checkInstructionSyncGate,
  checkInstructionRotDetection,
  checkAutoIssueGen,
  checkMultiPerspectiveReview,
  checkEvidenceAntipatterns,
} from "../sources/acmm.js";
import { detect } from "../detection.js";
import { ALL_CRITERIA } from "../sources/index.js";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "acmm-source-checks-"));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function writeCiYml(root, content) {
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });
  writeFileSync(join(root, ".github", "workflows", "ci.yml"), content, "utf-8");
}

const SUCCESSFUL_RUN_JSON = JSON.stringify([
  { conclusion: "success", updatedAt: new Date().toISOString() },
]);

describe("checkInstructionSyncGate / checkInstructionRotDetection (checkCiStepActive)", () => {
  test("acmm:instruction-sync-gate and acmm:instruction-rot-detection are wired to these functions", () => {
    const syncGate = ALL_CRITERIA.find((c) => c.id === "acmm:instruction-sync-gate");
    const rotDetection = ALL_CRITERIA.find((c) => c.id === "acmm:instruction-rot-detection");
    assert.equal(syncGate.detection.type, "check");
    assert.equal(syncGate.check, checkInstructionSyncGate);
    assert.equal(rotDetection.detection.type, "check");
    assert.equal(rotDetection.check, checkInstructionRotDetection);
  });

  test("ci.yml lacking the step fails without ever calling gh", () => {
    const { root, cleanup } = fixture();
    writeCiYml(root, "name: CI\njobs:\n  test:\n    steps: []\n");
    let called = false;
    const result = checkInstructionSyncGate(root, {
      execFileSyncFn: () => {
        called = true;
        return SUCCESSFUL_RUN_JSON;
      },
    });
    assert.equal(result.passed, false);
    assert.match(result.evidence, /does not contain/);
    assert.equal(called, false, "gh must not be called when the step text is absent");
    cleanup();
  });

  test("step present and gh degraded returns unverifiable, never a pass", () => {
    const { root, cleanup } = fixture();
    writeCiYml(root, "steps:\n  - run: pnpm regen --check\n");
    const result = checkInstructionSyncGate(root, {
      execFileSyncFn: () => {
        throw new Error("gh: command not found");
      },
    });
    assert.equal(result.passed, null);
    cleanup();
  });

  test("step present and gh reports a recent success passes", () => {
    const { root, cleanup } = fixture();
    writeCiYml(root, "steps:\n  - run: node scripts/detect-instruction-rot.mjs\n");
    const result = checkInstructionRotDetection(root, {
      execFileSyncFn: () => SUCCESSFUL_RUN_JSON,
    });
    assert.equal(result.passed, true);
    cleanup();
  });

  // Mutation-kill (#5876 re-review): a successful run outside the 7-day
  // window must NOT count as active — the only other "recent success" test
  // above used `new Date().toISOString()` (0 days old), so a mutant widening
  // or dropping the maxAgeDays cutoff comparison in isWorkflowActive would
  // have passed every existing test undetected.
  test("a successful run 8 days old exceeds the 7-day window and fails", () => {
    const { root, cleanup } = fixture();
    writeCiYml(root, "steps:\n  - run: pnpm regen --check\n");
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const result = checkInstructionSyncGate(root, {
      execFileSyncFn: () => JSON.stringify([{ conclusion: "success", updatedAt: eightDaysAgo }]),
    });
    assert.equal(result.passed, false);
    cleanup();
  });

  test("scopes the gh run query to --branch=main by default", () => {
    const { root, cleanup } = fixture();
    writeCiYml(root, "steps:\n  - run: pnpm regen --check\n");
    let capturedArgs;
    checkInstructionSyncGate(root, {
      execFileSyncFn: (_cmd, args) => {
        capturedArgs = args;
        return SUCCESSFUL_RUN_JSON;
      },
    });
    assert.ok(
      capturedArgs.includes("--branch=main"),
      `expected --branch=main in ${JSON.stringify(capturedArgs)}`
    );
    cleanup();
  });
});

describe("checkAutoIssueGen", () => {
  const labelArgIndex = (args) => args.indexOf("--label") + 1;

  test("acmm:auto-issue-gen is wired to this function", () => {
    const criterion = ALL_CRITERIA.find((c) => c.id === "acmm:auto-issue-gen");
    assert.equal(criterion.detection.type, "check");
    assert.equal(criterion.check, checkAutoIssueGen);
  });

  test("all three label queries throwing returns unverifiable", () => {
    const result = checkAutoIssueGen("/repo", {
      execFileSyncFn: () => {
        throw new Error("gh: command not found");
      },
    });
    assert.equal(result.passed, null);
    assert.match(result.evidence, /gh CLI unavailable/);
  });

  test("a recent issue on any of the three labels passes", () => {
    const result = checkAutoIssueGen("/repo", {
      execFileSyncFn: (_cmd, args) => {
        const label = args[labelArgIndex(args)];
        if (label === "sentry") {
          return JSON.stringify([{ number: 1, createdAt: new Date().toISOString() }]);
        }
        return JSON.stringify([]);
      },
    });
    assert.equal(result.passed, true);
  });

  test("zero recent issues across all labels fails (not unverifiable)", () => {
    const result = checkAutoIssueGen("/repo", {
      execFileSyncFn: () => JSON.stringify([]),
    });
    assert.equal(result.passed, false);
  });

  // Mutation-kill (#5876 re-review): an issue that exists but is well outside
  // the 30-day window must NOT count as "recent" — a mutant that replaces
  // `getTime() >= cutoff` with `true` passed every test above (they only ever
  // supplied either a fresh createdAt or an empty list, never an old one).
  test("an issue that exists but is 2+ years old does not count as recent", () => {
    const result = checkAutoIssueGen("/repo", {
      execFileSyncFn: () => JSON.stringify([{ number: 99, createdAt: "2024-01-01T00:00:00Z" }]),
    });
    assert.equal(result.passed, false);
  });

  test("one label failing but another succeeding still evaluates (not unverifiable)", () => {
    const result = checkAutoIssueGen("/repo", {
      execFileSyncFn: (_cmd, args) => {
        const label = args[labelArgIndex(args)];
        if (label === "sentry") throw new Error("rate limited");
        if (label === "audit") {
          return JSON.stringify([{ number: 2, createdAt: new Date().toISOString() }]);
        }
        return JSON.stringify([]);
      },
    });
    assert.equal(result.passed, true);
  });
});

describe("checkMultiPerspectiveReview", () => {
  test("fewer than 2 reviewer files fails", () => {
    const { root, cleanup } = fixture();
    mkdirSync(join(root, ".claude", "agents"), { recursive: true });
    writeFileSync(join(root, ".claude", "agents", "solo-reviewer.md"), "# reviewer", "utf-8");
    const result = checkMultiPerspectiveReview(root);
    assert.equal(result.passed, false);
    assert.match(result.evidence, /only 1/);
    cleanup();
  });

  test("2 or more reviewer files passes", () => {
    const { root, cleanup } = fixture();
    mkdirSync(join(root, ".claude", "agents"), { recursive: true });
    writeFileSync(join(root, ".claude", "agents", "adr-reviewer.md"), "# r", "utf-8");
    writeFileSync(join(root, ".claude", "agents", "stripe-reviewer.md"), "# r", "utf-8");
    const result = checkMultiPerspectiveReview(root);
    assert.equal(result.passed, true);
    cleanup();
  });

  test("missing .claude/agents/ fails", () => {
    const { root, cleanup } = fixture();
    const result = checkMultiPerspectiveReview(root);
    assert.equal(result.passed, false);
    cleanup();
  });
});

describe("checkEvidenceAntipatterns", () => {
  test("fewer than 15 distinct issue citations fails", () => {
    const { root, cleanup } = fixture();
    mkdirSync(join(root, ".claude", "rules"), { recursive: true });
    const body = Array.from({ length: 5 }, (_, i) => `see #${1000 + i}`).join(" ");
    writeFileSync(join(root, ".claude", "rules", "gotchas.md"), body, "utf-8");
    const result = checkEvidenceAntipatterns(root);
    assert.equal(result.passed, false);
    cleanup();
  });

  test("15 or more distinct issue citations passes", () => {
    const { root, cleanup } = fixture();
    mkdirSync(join(root, ".claude", "rules"), { recursive: true });
    const body = Array.from({ length: 15 }, (_, i) => `see #${1000 + i}`).join(" ");
    writeFileSync(join(root, ".claude", "rules", "gotchas.md"), body, "utf-8");
    const result = checkEvidenceAntipatterns(root);
    assert.equal(result.passed, true);
    cleanup();
  });

  test("missing gotchas.md fails", () => {
    const { root, cleanup } = fixture();
    const result = checkEvidenceAntipatterns(root);
    assert.equal(result.passed, false);
    cleanup();
  });
});

describe("acmm:idempotent-workflows detection", () => {
  // Regression (#5876 review): CLAUDE.md:189 already states this rule
  // ("Trust live output ... re-run source-of-truth checks ... instead of
  // recalling earlier summaries from conversation history"), but the
  // criterion grepped AGENTS.md, not CLAUDE.md, so it failed honestly for
  // the wrong reason — the rule existed, just not where it looked.
  const criterion = ALL_CRITERIA.find((c) => c.id === "acmm:idempotent-workflows");

  test("criterion is defined and greps CLAUDE.md", () => {
    assert.ok(criterion, "acmm:idempotent-workflows must exist");
    assert.equal(criterion.detection.type, "grep");
    assert.equal(criterion.detection.pattern.file, "CLAUDE.md");
  });

  test("detects the real committed rule text", () => {
    const { root, cleanup } = fixture();
    writeFileSync(
      join(root, "CLAUDE.md"),
      "**Key principle:** Trust live output. For any actionable decision " +
        "(which issues to close, what to build next), re-run source-of-truth " +
        "checks (e.g., `node plugins/acmm/scripts/audit.js`) instead of " +
        "recalling earlier summaries from conversation history.",
      "utf-8"
    );
    assert.equal(detect(root, criterion), true);
    cleanup();
  });

  test("fails honestly when no such rule is present", () => {
    const { root, cleanup } = fixture();
    writeFileSync(join(root, "CLAUDE.md"), "# CLAUDE.md\n\nSome other content.\n", "utf-8");
    assert.equal(detect(root, criterion), false);
    cleanup();
  });
});
