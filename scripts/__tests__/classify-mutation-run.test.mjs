import { describe, it, expect } from "vitest";
import { classifyMutationRun } from "../classify-mutation-run.mjs";

/**
 * The real shape that broke run 35622179696: Stryker produced a complete,
 * parseable report in which every graded mutant is `Survived` with
 * `testsCompleted: 0` — the vitest runner executed no tests per mutant, so
 * nothing could possibly have been killed.
 */
const HARNESS_BROKEN_REPORT = {
  schemaVersion: "1.0",
  thresholds: { high: 80, low: 60, break: null },
  files: {
    "services/users/src/routes/health.ts": {
      language: "typescript",
      source: "// ...",
      mutants: [
        {
          id: "0",
          mutatorName: "BlockStatement",
          status: "Survived",
          testsCompleted: 0,
          coveredBy: ["1", "2", "3"],
          location: { start: { line: 5, column: 68 }, end: { line: 14, column: 2 } },
        },
        {
          id: "1",
          mutatorName: "ConditionalExpression",
          status: "Survived",
          testsCompleted: 0,
          coveredBy: ["1", "2"],
          location: { start: { line: 25, column: 7 }, end: { line: 25, column: 43 } },
        },
        {
          id: "2",
          mutatorName: "StringLiteral",
          status: "Ignored",
          location: { start: { line: 30, column: 0 }, end: { line: 30, column: 8 } },
        },
      ],
    },
  },
};

/** Builds a single-file report from a list of mutant partials. */
function reportOf(mutants) {
  return {
    schemaVersion: "1.0",
    thresholds: { high: 80, low: 60, break: null },
    files: {
      "services/users/src/services/user.ts": {
        language: "typescript",
        source: "// ...",
        mutants: mutants.map((mutant, index) => ({
          id: String(index),
          mutatorName: "BlockStatement",
          location: { start: { line: 1, column: 0 }, end: { line: 2, column: 0 } },
          ...mutant,
        })),
      },
    },
  };
}

describe("classifyMutationRun", () => {
  it("returns harness-broken when every graded mutant survived with zero tests completed", () => {
    expect(classifyMutationRun(HARNESS_BROKEN_REPORT)).toBe("harness-broken");
  });

  it("returns report-missing for null, undefined, and a report with no files key", () => {
    expect(classifyMutationRun(null)).toBe("report-missing");
    expect(classifyMutationRun(undefined)).toBe("report-missing");
    expect(classifyMutationRun({ schemaVersion: "1.0" })).toBe("report-missing");
  });

  it("returns report-empty when no mutant is gradeable", () => {
    expect(classifyMutationRun({ schemaVersion: "1.0", files: {} })).toBe("report-empty");
    expect(classifyMutationRun(reportOf([]))).toBe("report-empty");
    expect(classifyMutationRun(reportOf([{ status: "Ignored" }, { status: "NoCoverage" }]))).toBe(
      "report-empty"
    );
  });

  it("returns scored for a normal run", () => {
    expect(
      classifyMutationRun(
        reportOf([
          { status: "Killed", testsCompleted: 12 },
          { status: "Survived", testsCompleted: 12 },
        ])
      )
    ).toBe("scored");
  });

  it("treats a single kill as proof the harness ran, even with no testsCompleted field", () => {
    // `testsCompleted` is optional in the report schema; a Killed mutant is
    // positive evidence a test ran and failed, so it outranks a missing field.
    expect(classifyMutationRun(reportOf([{ status: "Killed" }, { status: "Survived" }]))).toBe(
      "scored"
    );
    expect(classifyMutationRun(reportOf([{ status: "Timeout" }, { status: "Survived" }]))).toBe(
      "scored"
    );
  });

  it("returns scored for a genuine 0% — all survived, but tests demonstrably ran", () => {
    // The distinguishing evidence is testsCompleted, not the score. A suite
    // that runs and asserts nothing is a real finding and must stay reportable.
    expect(
      classifyMutationRun(
        reportOf([
          { status: "Survived", testsCompleted: 40 },
          { status: "Survived", testsCompleted: 40 },
        ])
      )
    ).toBe("scored");
  });

  it("never reclassifies a run that killed anything, so a real score cannot be masked", () => {
    // harness-broken is only reachable when the score would be 0% anyway.
    expect(classifyMutationRun(reportOf([{ status: "Killed", testsCompleted: 0 }]))).toBe("scored");
  });
});
