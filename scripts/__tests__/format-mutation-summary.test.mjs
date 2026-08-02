import { describe, it, expect } from "vitest";
import { formatMutationSummary } from "../format-mutation-summary.mjs";

const PASSING_SCORE = {
  available: true,
  mutation_score: 98.89,
  threshold: 80,
  passes_threshold: true,
  killed: 89,
  total_mutants: 382,
};

const FAILING_SCORE = {
  available: true,
  mutation_score: 55.56,
  threshold: 80,
  passes_threshold: false,
  killed: 5,
  total_mutants: 9,
};

describe("formatMutationSummary", () => {
  it("reports no report produced when score is unavailable", () => {
    const md = formatMutationSummary({ scoreResult: { available: false } });
    expect(md).toContain("❌ No report produced");
  });

  it("includes score, threshold, and PASS status when passing", () => {
    const md = formatMutationSummary({ scoreResult: PASSING_SCORE });
    expect(md).toContain("**Mutation Score:** 98.89%");
    expect(md).toContain("**Target:** > 80%");
    expect(md).toContain("✅ PASS");
    expect(md).toContain("89/382");
  });

  it("shows BELOW TARGET status when failing", () => {
    const md = formatMutationSummary({ scoreResult: FAILING_SCORE });
    expect(md).toContain("⚠️ BELOW TARGET");
  });

  it("lists top surviving mutants when present", () => {
    const md = formatMutationSummary({
      scoreResult: FAILING_SCORE,
      survivedMutants: [
        { file: "services/users/src/routes/users.ts", line: 18, mutator: "OptionalChaining" },
      ],
    });
    expect(md).toContain("### Top Surviving Mutants");
    expect(md).toContain("services/users/src/routes/users.ts:18");
    expect(md).toContain("OptionalChaining");
  });

  it("omits the surviving-mutants section when the list is empty", () => {
    const md = formatMutationSummary({ scoreResult: PASSING_SCORE, survivedMutants: [] });
    expect(md).not.toContain("Top Surviving Mutants");
  });

  it("includes the run link when provided", () => {
    const md = formatMutationSummary({
      scoreResult: PASSING_SCORE,
      runUrl: "https://example.com/run/1",
    });
    expect(md).toContain("[Artifacts](https://example.com/run/1)");
  });
});
