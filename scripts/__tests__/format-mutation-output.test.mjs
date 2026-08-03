import { describe, it, expect } from "vitest";
import { formatMutationOutputs } from "../format-mutation-output.mjs";

describe("formatMutationOutputs", () => {
  it("returns safe zeroed defaults when the score is unavailable", () => {
    const outputs = formatMutationOutputs({ available: false });
    expect(outputs).toEqual({
      available: false,
      score: 0,
      threshold: 80,
      passes: false,
      killed: 0,
      total: 0,
    });
  });

  it("returns safe zeroed defaults when result is null", () => {
    const outputs = formatMutationOutputs(null);
    expect(outputs.available).toBe(false);
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
