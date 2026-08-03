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
 * @param {ReturnType<typeof import("./collect-mutation-score.mjs").collectMutationScore>|null|undefined} result
 * @returns {{available: boolean, score: number, threshold: number, passes: boolean, killed: number, total: number}}
 */
export function formatMutationOutputs(result) {
  if (!result?.available) {
    return { available: false, score: 0, threshold: 80, passes: false, killed: 0, total: 0 };
  }

  return {
    available: true,
    score: result.mutation_score,
    threshold: result.threshold,
    passes: result.passes_threshold,
    killed: result.killed,
    total: result.total_mutants,
  };
}
