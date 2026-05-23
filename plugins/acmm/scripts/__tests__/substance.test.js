import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { substanceCheckers, runSubstanceChecks } from "../substance.js";

function makeTmpDir() {
  return mkdtempSync(join(tmpdir(), "substance-test-"));
}

describe("reflection substance checker", () => {
  const checker = substanceCheckers["acmm:correction-capture"];

  test("passes when frontmatter has feeds_back_into and body > 50 chars", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "reflection.md");
    writeFileSync(
      filePath,
      [
        "---",
        "feeds_back_into: CLAUDE.md",
        "---",
        "",
        "This is a substantive reflection body that contains enough content to pass the minimum character threshold for validation.",
      ].join("\n")
    );
    const result = checker([filePath], dir);
    assert.equal(result.passed, true);
    rmSync(dir, { recursive: true });
  });

  test("fails when frontmatter missing feeds_back_into", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "reflection.md");
    writeFileSync(
      filePath,
      [
        "---",
        "title: some reflection",
        "---",
        "",
        "This is a substantive reflection body that contains enough content to pass the minimum character threshold for validation.",
      ].join("\n")
    );
    const result = checker([filePath], dir);
    assert.equal(result.passed, false);
    rmSync(dir, { recursive: true });
  });

  test("fails when body is too short", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "reflection.md");
    writeFileSync(filePath, ["---", "feeds_back_into: CLAUDE.md", "---", "", "Short."].join("\n"));
    const result = checker([filePath], dir);
    assert.equal(result.passed, false);
    rmSync(dir, { recursive: true });
  });

  test("fails for empty file", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "reflection.md");
    writeFileSync(filePath, "");
    const result = checker([filePath], dir);
    assert.equal(result.passed, false);
    rmSync(dir, { recursive: true });
  });
});

describe("skill substance checker", () => {
  const checker = substanceCheckers["acmm:simple-skills"];

  test("passes for non-stub skill with trigger and >100 chars instruction", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "SKILL.md");
    writeFileSync(
      filePath,
      [
        "---",
        "name: my-skill",
        "description: Does something useful when triggered by user request",
        "---",
        "",
        "# My Skill",
        "",
        "This skill provides a detailed workflow for completing a common task. It includes multiple steps that guide the agent through the process from start to finish with clear checkpoints.",
      ].join("\n")
    );
    const result = checker([filePath], dir);
    assert.equal(result.passed, true);
    rmSync(dir, { recursive: true });
  });

  test("fails for stub skill with <100 chars instruction", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "SKILL.md");
    writeFileSync(
      filePath,
      ["---", "name: stub-skill", "description: placeholder", "---", "", "# TODO", "", "TBD"].join(
        "\n"
      )
    );
    const result = checker([filePath], dir);
    assert.equal(result.passed, false);
    rmSync(dir, { recursive: true });
  });

  test("fails for empty skill file", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "SKILL.md");
    writeFileSync(filePath, "");
    const result = checker([filePath], dir);
    assert.equal(result.passed, false);
    rmSync(dir, { recursive: true });
  });
});

describe("feedback loop substance checker", () => {
  const checker = substanceCheckers["acmm:feedback-loops"];

  test("passes when log has entries from last 30 days", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "log.md");
    const recentDate = new Date().toISOString().split("T")[0];
    writeFileSync(filePath, `## ${recentDate}\n\nSome feedback loop entry with content.\n`);
    const result = checker([filePath], dir);
    assert.equal(result.passed, true);
    rmSync(dir, { recursive: true });
  });

  test("fails when log entries are stale (>30 days)", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "log.md");
    writeFileSync(filePath, "## 2024-01-01\n\nOld entry.\n");
    const result = checker([filePath], dir);
    assert.equal(result.passed, false);
    rmSync(dir, { recursive: true });
  });

  test("fails for empty log file", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "log.md");
    writeFileSync(filePath, "");
    const result = checker([filePath], dir);
    assert.equal(result.passed, false);
    rmSync(dir, { recursive: true });
  });

  test("repo CLAUDE.md has a recent feedback-loop entry (within last 30 days)", () => {
    const repoRoot = resolve(join(import.meta.dirname, "../../../../"));
    const claudeMd = join(repoRoot, "CLAUDE.md");
    const result = checker([claudeMd], repoRoot);
    assert.equal(
      result.passed,
      true,
      `CLAUDE.md substance check failed: ${result.evidence} — add a dated feedback-loop entry`
    );
  });
});

describe("test coverage substance checker", () => {
  const checker = substanceCheckers["fullsend:test-coverage"];

  test("passes when coverage config has recognizable threshold", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "vitest.config.ts");
    writeFileSync(
      filePath,
      "export default { test: { coverage: { thresholds: { lines: 80, branches: 70 } } } }"
    );
    const result = checker([filePath], dir);
    assert.equal(result.passed, true);
    rmSync(dir, { recursive: true });
  });

  test("fails when file has no threshold values", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "vitest.config.ts");
    writeFileSync(filePath, "export default { test: {} }");
    const result = checker([filePath], dir);
    assert.equal(result.passed, false);
    rmSync(dir, { recursive: true });
  });
});

describe("runbook substance checker", () => {
  const checker = substanceCheckers["fullsend:observability-runbook"];

  test("passes when runbook references real service names", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "runbook.md");
    writeFileSync(
      filePath,
      "# Runbook\n\nCheck the /api/v1/users/health endpoint.\nRestart the users-service pod.\nMonitor Grafana dashboard.\n"
    );
    const result = checker([filePath], dir);
    assert.equal(result.passed, true);
    rmSync(dir, { recursive: true });
  });

  test("passes when runbook directory contains files with operational indicators", () => {
    const dir = makeTmpDir();
    const runbooksDir = join(dir, "runbooks");
    mkdirSync(runbooksDir, { recursive: true });
    writeFileSync(
      join(runbooksDir, "services-unhealthy.md"),
      "# Runbook: API Services Unhealthy\n\nCheck /api/v1/users/health endpoint.\ndoctl apps logs $DO_APP_ID --type run\n"
    );
    writeFileSync(
      join(runbooksDir, "ci-unhealthy.md"),
      "# Runbook: CI Unhealthy\n\nMonitor dashboard for alerts.\nRollback: gh run rerun <id>\n"
    );
    // Pass the directory path itself (as runSubstanceChecks would when pattern is "docs/runbooks/")
    const result = checker([runbooksDir], dir);
    assert.equal(result.passed, true);
    rmSync(dir, { recursive: true });
  });

  test("fails when runbook is a stub without operational references", () => {
    const dir = makeTmpDir();
    const filePath = join(dir, "runbook.md");
    writeFileSync(filePath, "# Runbook\n\nTODO: fill in later\n");
    const result = checker([filePath], dir);
    assert.equal(result.passed, false);
    rmSync(dir, { recursive: true });
  });
});

describe("runSubstanceChecks", () => {
  test("returns substantive=true for criteria with passing checker", () => {
    const dir = makeTmpDir();
    const skillDir = join(dir, "skills", "test");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      [
        "---",
        "name: test-skill",
        "description: A well-described skill for testing purposes",
        "---",
        "",
        "# Test Skill",
        "",
        "This skill provides a comprehensive workflow for testing. It includes validation steps, error handling guidance, and detailed instructions that go well beyond a simple stub.",
      ].join("\n")
    );

    const detectedIds = new Set(["acmm:simple-skills"]);
    const criteria = [
      {
        id: "acmm:simple-skills",
        detection: { type: "any-of", pattern: [join(skillDir, "SKILL.md")] },
      },
    ];

    const results = runSubstanceChecks(detectedIds, criteria, dir);
    assert.equal(results["acmm:simple-skills"].substantive, true);
    rmSync(dir, { recursive: true });
  });

  test("returns substantive=false for criteria with failing checker", () => {
    const dir = makeTmpDir();
    const skillDir = join(dir, "skills", "test");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "stub");

    const detectedIds = new Set(["acmm:simple-skills"]);
    const criteria = [
      {
        id: "acmm:simple-skills",
        detection: { type: "any-of", pattern: [join(skillDir, "SKILL.md")] },
      },
    ];

    const results = runSubstanceChecks(detectedIds, criteria, dir);
    assert.equal(results["acmm:simple-skills"].substantive, false);
    rmSync(dir, { recursive: true });
  });

  test("returns substantive=null for criteria without checker", () => {
    const detectedIds = new Set(["acmm:some-other-criterion"]);
    const criteria = [
      {
        id: "acmm:some-other-criterion",
        detection: { type: "path", pattern: "some/file" },
      },
    ];

    const results = runSubstanceChecks(detectedIds, criteria, "/tmp");
    assert.equal(results["acmm:some-other-criterion"].substantive, null);
  });

  test("skips substance check for undetected criteria", () => {
    const detectedIds = new Set();
    const criteria = [
      {
        id: "acmm:simple-skills",
        detection: { type: "any-of", pattern: ["skills/"] },
      },
    ];

    const results = runSubstanceChecks(detectedIds, criteria, "/tmp");
    assert.equal(results["acmm:simple-skills"], undefined);
  });
});
