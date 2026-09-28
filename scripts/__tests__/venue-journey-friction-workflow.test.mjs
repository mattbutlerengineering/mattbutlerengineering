import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const FILE_ISSUES = readFileSync(resolve(ROOT, "scripts/venue-journey/file-issues.mjs"), "utf8");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/venue-journey.yml"), "utf8");

/**
 * Decision (2026-09-23, closes #3547): stop posting soft friction to the
 * rolling "[Journey] venue-journey friction log" issue — 60+ comments on one
 * issue nobody re-read. The friction section already lands in every run's
 * job summary via buildJobSummary() (report.mjs); this only removes the
 * second, GitHub-issue copy of the same data.
 *
 * Hard-failure/blocked reporting (buildFailureIssue/buildBlockedIssue, `gh
 * issue create`/`comment`) is a DIFFERENT, unrelated code path and must stay
 * loud — these tests only assert the friction-issue path is gone, not that
 * issue filing in general is gone.
 *
 * Textual parsing, matching the precedent in auto-label-workflow.test.mjs /
 * drift-fix-workflow.test.mjs — nothing in scripts/ depends on a YAML parser,
 * and file-issues.mjs runs `main()` as a top-level side effect on import, so
 * asserting on source text (rather than importing and mocking `gh`) is the
 * cheaper, established way to pin this.
 */
describe("scripts/venue-journey/file-issues.mjs", () => {
  it("does not file or comment-bump the rolling friction-log issue", () => {
    expect(FILE_ISSUES).not.toMatch(/FRICTION_ISSUE_TITLE/);
    expect(FILE_ISSUES).not.toMatch(/friction log/i);
  });

  it("still writes the per-run job summary, which carries the friction section", () => {
    expect(FILE_ISSUES).toMatch(/writeSummary\(buildJobSummary\(report\)\)/);
  });

  it("still files or bumps an issue for a hard failure or blocked step", () => {
    expect(FILE_ISSUES).toMatch(/buildFailureIssue\(report\)\s*\?\?\s*buildBlockedIssue\(report\)/);
    expect(FILE_ISSUES).toMatch(/fileOrBump\(/);
  });
});

describe(".github/workflows/venue-journey.yml", () => {
  it("keeps `issues: write` — still needed for hard-failure/blocked issue filing", () => {
    expect(WORKFLOW).toMatch(/issues:\s*write/);
  });
});
