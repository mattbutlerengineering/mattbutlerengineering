/**
 * Pure cost-regression predicate.
 *
 * Returns `true` when no regression is detected (safe to proceed),
 * `false` when the cost increase exceeds the threshold.
 *
 * @param current     Mean cost-per-task for the current run.
 * @param baseline    Mean cost-per-task from the most recent prior run,
 *                    or `null` when no prior run exists.
 * @param thresholdPct Maximum allowed % increase over baseline (e.g. 20 = 20%).
 */
export function checkCostRegression(
  current: number,
  baseline: number | null,
  thresholdPct: number
): boolean {
  if (baseline === null || baseline === 0) {
    return true;
  }
  const pctIncrease = ((current - baseline) / baseline) * 100;
  return pctIncrease <= thresholdPct;
}
