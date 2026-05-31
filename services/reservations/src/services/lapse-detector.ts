export interface LapseResult {
  /** Average days between visits (0 if fewer than 2 visits). */
  avgFrequencyDays: number;
  /** Days since the most recent visit. */
  daysSinceLastVisit: number;
  /** True when daysSinceLastVisit > avgFrequencyDays * 2 and visitCount >= 3. */
  isLapsing: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pure lapse detection function.
 *
 * @param visitDates - ISO date strings of past visits (any order).
 * @returns LapseResult with avgFrequencyDays, daysSinceLastVisit, isLapsing.
 */
export function detectLapse(visitDates: string[]): LapseResult {
  const LAPSE_MIN_VISITS = 3;

  if (visitDates.length < LAPSE_MIN_VISITS) {
    return { avgFrequencyDays: 0, daysSinceLastVisit: 0, isLapsing: false };
  }

  const sorted = [...visitDates].map((d) => new Date(d).getTime()).sort((a, b) => a - b);

  // Average gap between consecutive visits
  let totalGap = 0;
  for (let i = 1; i < sorted.length; i++) {
    totalGap += sorted[i] - sorted[i - 1];
  }
  const avgFrequencyDays = totalGap / (sorted.length - 1) / DAY_MS;

  const daysSinceLastVisit = (Date.now() - sorted[sorted.length - 1]) / DAY_MS;

  const isLapsing = daysSinceLastVisit > avgFrequencyDays * 2;

  return { avgFrequencyDays, daysSinceLastVisit, isLapsing };
}
