import { describe, it, expect } from "vitest";
import { collectMutationScore } from "../collect-mutation-score.mjs";

/**
 * Fixture: minimal Stryker mutation.json report shape (schema v1.0).
 *
 * The Stryker JSON report does NOT include a top-level `metrics` field —
 * that is computed by mutation-testing-elements (the HTML viewer) at render
 * time. The sensor collector computes the score from per-file mutant statuses,
 * replicating the formula used by the viewer:
 *
 *   mutationScore = killed / (killed + survived + timeout) * 100
 *
 * NoCoverage and Ignored mutants are excluded from the denominator (they
 * were never tested and are neutral to the quality signal).
 */

/** @type {import("../collect-mutation-score.mjs").MutationReportJson} */
const FIXTURE_REPORT = {
  schemaVersion: "1.0",
  thresholds: { high: 80, low: 60, break: null },
  projectRoot: "/repo",
  files: {
    "services/users/src/routes/users.ts": {
      language: "typescript",
      source: "// ...",
      mutants: [
        {
          id: "1",
          mutatorName: "BlockStatement",
          status: "Killed",
          location: { start: { line: 1, column: 0 }, end: { line: 2, column: 0 } },
        },
        {
          id: "2",
          mutatorName: "StringLiteral",
          status: "Survived",
          location: { start: { line: 3, column: 0 }, end: { line: 3, column: 10 } },
        },
        {
          id: "3",
          mutatorName: "ArrowFunction",
          status: "Killed",
          location: { start: { line: 5, column: 0 }, end: { line: 6, column: 0 } },
        },
        {
          id: "4",
          mutatorName: "ConditionalExpression",
          status: "Killed",
          location: { start: { line: 8, column: 0 }, end: { line: 8, column: 20 } },
        },
      ],
    },
    "services/users/src/services/user.ts": {
      language: "typescript",
      source: "// ...",
      mutants: [
        {
          id: "5",
          mutatorName: "BlockStatement",
          status: "Killed",
          location: { start: { line: 1, column: 0 }, end: { line: 2, column: 0 } },
        },
      ],
    },
  },
};

/** Score: 4 killed / (4 killed + 1 survived) = 80% */
const FIXTURE_REPORT_AT_THRESHOLD = FIXTURE_REPORT;

/** Score: 5 killed / (5 killed + 4 survived) = 55.56% */
const FIXTURE_BELOW_THRESHOLD = {
  ...FIXTURE_REPORT,
  files: {
    "services/users/src/routes/users.ts": {
      language: "typescript",
      source: "// ...",
      mutants: [
        {
          id: "1",
          mutatorName: "BlockStatement",
          status: "Killed",
          location: { start: { line: 1, column: 0 }, end: { line: 2, column: 0 } },
        },
        {
          id: "2",
          mutatorName: "BlockStatement",
          status: "Killed",
          location: { start: { line: 2, column: 0 }, end: { line: 3, column: 0 } },
        },
        {
          id: "3",
          mutatorName: "BlockStatement",
          status: "Killed",
          location: { start: { line: 3, column: 0 }, end: { line: 4, column: 0 } },
        },
        {
          id: "4",
          mutatorName: "BlockStatement",
          status: "Killed",
          location: { start: { line: 4, column: 0 }, end: { line: 5, column: 0 } },
        },
        {
          id: "5",
          mutatorName: "BlockStatement",
          status: "Killed",
          location: { start: { line: 5, column: 0 }, end: { line: 6, column: 0 } },
        },
        {
          id: "6",
          mutatorName: "StringLiteral",
          status: "Survived",
          location: { start: { line: 6, column: 0 }, end: { line: 6, column: 10 } },
        },
        {
          id: "7",
          mutatorName: "StringLiteral",
          status: "Survived",
          location: { start: { line: 7, column: 0 }, end: { line: 7, column: 10 } },
        },
        {
          id: "8",
          mutatorName: "StringLiteral",
          status: "Survived",
          location: { start: { line: 8, column: 0 }, end: { line: 8, column: 10 } },
        },
        {
          id: "9",
          mutatorName: "StringLiteral",
          status: "Survived",
          location: { start: { line: 9, column: 0 }, end: { line: 9, column: 10 } },
        },
      ],
    },
  },
};

/** Report with Timeout and NoCoverage mutants to verify exclusion logic */
const FIXTURE_WITH_TIMEOUT_AND_NO_COVERAGE = {
  ...FIXTURE_REPORT,
  files: {
    "services/users/src/routes/users.ts": {
      language: "typescript",
      source: "// ...",
      mutants: [
        {
          id: "1",
          mutatorName: "BlockStatement",
          status: "Killed",
          location: { start: { line: 1, column: 0 }, end: { line: 2, column: 0 } },
        },
        {
          id: "2",
          mutatorName: "BlockStatement",
          status: "Killed",
          location: { start: { line: 2, column: 0 }, end: { line: 3, column: 0 } },
        },
        {
          id: "3",
          mutatorName: "BlockStatement",
          status: "Killed",
          location: { start: { line: 3, column: 0 }, end: { line: 4, column: 0 } },
        },
        {
          id: "4",
          mutatorName: "BlockStatement",
          status: "Survived",
          location: { start: { line: 4, column: 0 }, end: { line: 5, column: 0 } },
        },
        {
          id: "5",
          mutatorName: "ConditionalExpression",
          status: "Timeout",
          location: { start: { line: 5, column: 0 }, end: { line: 5, column: 10 } },
        },
        {
          id: "6",
          mutatorName: "StringLiteral",
          status: "NoCoverage",
          location: { start: { line: 6, column: 0 }, end: { line: 6, column: 10 } },
        },
        {
          id: "7",
          mutatorName: "StringLiteral",
          status: "Ignored",
          location: { start: { line: 7, column: 0 }, end: { line: 7, column: 10 } },
        },
      ],
    },
  },
};

describe("collectMutationScore", () => {
  it("returns available: false when reportJson is null", () => {
    const result = collectMutationScore(null);
    expect(result.available).toBe(false);
  });

  it("returns available: false when reportJson is undefined", () => {
    const result = collectMutationScore(undefined);
    expect(result.available).toBe(false);
  });

  it("returns available: false when files field is missing", () => {
    const result = collectMutationScore({ schemaVersion: "1.0" });
    expect(result.available).toBe(false);
  });

  it("returns available: false when files is empty", () => {
    const result = collectMutationScore({ schemaVersion: "1.0", files: {} });
    expect(result.available).toBe(false);
  });

  it("returns available: false when all mutants have NoCoverage/Ignored status (denominator is zero)", () => {
    const report = {
      ...FIXTURE_REPORT,
      files: {
        "f.ts": {
          language: "typescript",
          source: "",
          mutants: [
            {
              id: "1",
              mutatorName: "BlockStatement",
              status: "NoCoverage",
              location: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
            },
          ],
        },
      },
    };
    const result = collectMutationScore(report);
    expect(result.available).toBe(false);
  });

  it("computes mutation score from file mutants (4 killed + 1 survived = 80%)", () => {
    const result = collectMutationScore(FIXTURE_REPORT_AT_THRESHOLD);
    expect(result.available).toBe(true);
    expect(result.mutation_score).toBe(80);
    expect(result.killed).toBe(4);
    expect(result.survived).toBe(1);
    expect(result.total_mutants).toBe(5);
  });

  it("rounds mutation score to 2 decimal places", () => {
    const result = collectMutationScore(FIXTURE_BELOW_THRESHOLD);
    expect(result.available).toBe(true);
    // 5/9 = 55.555... → rounds to 55.56
    expect(result.mutation_score).toBe(55.56);
  });

  it("includes passes_threshold: true when score >= 80", () => {
    const result = collectMutationScore(FIXTURE_REPORT_AT_THRESHOLD);
    expect(result.passes_threshold).toBe(true);
  });

  it("includes passes_threshold: false when score < 80", () => {
    const result = collectMutationScore(FIXTURE_BELOW_THRESHOLD);
    expect(result.passes_threshold).toBe(false);
  });

  it("includes threshold from report thresholds.high when present", () => {
    const result = collectMutationScore(FIXTURE_REPORT);
    expect(result.threshold).toBe(80);
  });

  it("defaults threshold to 80 when thresholds is missing", () => {
    const reportWithoutThresholds = { ...FIXTURE_REPORT, thresholds: undefined };
    const result = collectMutationScore(reportWithoutThresholds);
    expect(result.threshold).toBe(80);
  });

  it("includes Timeout mutants in denominator (they drag down score)", () => {
    const result = collectMutationScore(FIXTURE_WITH_TIMEOUT_AND_NO_COVERAGE);
    // 3 killed / (3 killed + 1 survived + 1 timeout) = 3/5 = 60%
    expect(result.available).toBe(true);
    expect(result.mutation_score).toBe(60);
    expect(result.timeout).toBe(1);
  });

  it("excludes NoCoverage and Ignored from denominator", () => {
    const result = collectMutationScore(FIXTURE_WITH_TIMEOUT_AND_NO_COVERAGE);
    // NoCoverage=1, Ignored=1 are NOT in denominator
    // total_mutants includes them all: 3+1+1+1+1 = 7
    expect(result.total_mutants).toBe(7);
    expect(result.no_coverage).toBe(1);
  });

  it("includes last_run ISO timestamp", () => {
    const now = new Date("2026-06-21T04:00:00Z");
    const result = collectMutationScore(FIXTURE_REPORT, now);
    expect(result.last_run).toBe("2026-06-21T04:00:00.000Z");
  });

  it("uses current time when now is not provided", () => {
    const before = new Date();
    const result = collectMutationScore(FIXTURE_REPORT);
    const after = new Date();
    const lastRun = new Date(result.last_run);
    expect(lastRun >= before).toBe(true);
    expect(lastRun <= after).toBe(true);
  });

  it("aggregates mutants across multiple files", () => {
    const result = collectMutationScore(FIXTURE_REPORT);
    // 4 killed in users.ts + 1 killed in user.ts = 5 killed, 1 survived
    expect(result.killed).toBe(4);
    expect(result.survived).toBe(1);
  });
});
