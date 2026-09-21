/**
 * Normalizes a collectMutationScore() result into flat values safe to write
 * to $GITHUB_OUTPUT.
 *
 * Exists so the mutation-testing workflow computes the score exactly once
 * (via the already-tested collectMutationScore()) and every consumer step
 * — job summary, PR comment, threshold check, failure issue — reads the
 * same values instead of each re-parsing reports/mutation/mutation.json
 * with `.metrics.mutationScore`, a field Stryker's JSON reporter never
 * writes (see collect-mutation-score.mjs for why).
 *
 * `score` is the string `"n/a"` — never the number 0 — whenever there is no
 * measurement. Emitting 0 was the #5614 defect at this exact boundary: the
 * failure-issue step interpolates this value straight into "**Score:** 0%",
 * which reads as a real, catastrophic mutation score and sent readers off to
 * write tests for mutants their suite already kills. A non-numeric value
 * cannot be mistaken for a measurement, and `state` says which non-measurement
 * it was so the workflow can report the right failure.
 *
 * @param {ReturnType<typeof import("./collect-mutation-score.mjs").collectMutationScore>|null|undefined} result
 * @returns {{available: boolean, state: string, score: number|"n/a", threshold: number, passes: boolean, killed: number, total: number}}
 */
export function formatMutationOutputs(result) {
  if (!result?.available) {
    return {
      available: false,
      state: result?.state ?? "report-missing",
      score: "n/a",
      threshold: 80,
      passes: false,
      killed: 0,
      total: 0,
    };
  }

  return {
    available: true,
    state: result.state ?? "scored",
    score: result.mutation_score,
    threshold: result.threshold,
    passes: result.passes_threshold,
    killed: result.killed,
    total: result.total_mutants,
  };
}
