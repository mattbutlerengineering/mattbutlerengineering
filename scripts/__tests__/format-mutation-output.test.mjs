import { describe, it, expect } from "vitest";
import { formatMutationOutputs } from "../format-mutation-output.mjs";

describe("formatMutationOutputs", () => {
  it("emits score=n/a rather than 0 when there is no measurement", () => {
    // `score: 0` was the #5614 defect at the workflow boundary: it rendered
    // into the tracking issue as "**Score:** 0%", indistinguishable from a
    // real 0% and unactionable.
    const outputs = formatMutationOutputs({ available: false, state: "report-missing" });
    expect(outputs).toEqual({
      available: false,
      state: "report-missing",
      score: "n/a",
      threshold: 80,
      passes: false,
      killed: 0,
      total: 0,
    });
  });

  it("propagates the harness-broken state so the workflow can say what broke", () => {
    const outputs = formatMutationOutputs({ available: false, state: "harness-broken" });
    expect(outputs.state).toBe("harness-broken");
    expect(outputs.score).toBe("n/a");
  });

  it("returns safe defaults when result is null", () => {
    const outputs = formatMutationOutputs(null);
    expect(outputs.available).toBe(false);
    expect(outputs.state).toBe("report-missing");
  });

  it("maps an available, passing result through unchanged", () => {
    const outputs = formatMutationOutputs({
      available: true,
      mutation_score: 82.5,
      threshold: 80,
      passes_threshold: true,
      killed: 33,
      total_mutants: 40,
    });
    expect(outputs).toEqual({
      available: true,
      state: "scored",
      score: 82.5,
      threshold: 80,
      passes: true,
      killed: 33,
      total: 40,
    });
  });

  it("maps an available, failing result through unchanged", () => {
    const outputs = formatMutationOutputs({
      available: true,
      mutation_score: 55.56,
      threshold: 80,
      passes_threshold: false,
      killed: 5,
      total_mutants: 9,
    });
    expect(outputs.passes).toBe(false);
    expect(outputs.score).toBe(55.56);
  });
});
