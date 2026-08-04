/**
 * Detection diff — compares this run's detected criteria against the prior
 * saved state.
 *
 * A criterion that is `unverifiable` THIS run (gh CLI absent/erroring, #2023)
 * must never appear in `removed`: its status is unknown, not confirmed false.
 * Reporting it as "regressed" — or filing a GitHub issue for it under
 * `--apply` — would be a false positive caused by the running environment,
 * not a real change in the codebase (#3719).
 */

/**
 * @param {{
 *   priorIds: Set<string>,
 *   detectedIds: Set<string>,
 *   unverifiableIds: Set<string>,
 *   isFirstRun: boolean,
 *   currentLevel: number,
 *   priorLevel: number,
 * }} args
 * @returns {null | { added: string[], removed: string[], levelDelta: number, countDelta: number, priorLevel: number, priorCount: number }}
 */
export function computeDetectionDiff({
  priorIds,
  detectedIds,
  unverifiableIds,
  isFirstRun,
  currentLevel,
  priorLevel,
}) {
  if (isFirstRun) return null;
  return {
    added: [...detectedIds].filter((id) => !priorIds.has(id)).sort(),
    removed: [...priorIds].filter((id) => !detectedIds.has(id) && !unverifiableIds.has(id)).sort(),
    levelDelta: currentLevel - priorLevel,
    countDelta: detectedIds.size - priorIds.size,
    priorLevel,
    priorCount: priorIds.size,
  };
}
