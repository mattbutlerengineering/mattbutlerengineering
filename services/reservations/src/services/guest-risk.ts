export type GuestRiskScore = "trusted" | "standard" | "risky";

export interface GuestRiskOptions {
  /** Number of no-shows that triggers "risky" classification. Default: 2 */
  riskyThreshold?: number;
}

const DECAY_THRESHOLD_MONTHS = 12;
const DECAY_FACTOR = 0.5;
const DEFAULT_RISKY_THRESHOLD = 2;

/**
 * Pure function: computes guest risk score from no-show history.
 *
 * - "trusted"  — 0 no-shows (effective)
 * - "standard" — 1 to threshold-1 no-shows (effective)
 * - "risky"    — threshold+ no-shows (effective)
 *
 * Decay rule: if lastNoShowDate is older than 12 months, all no-shows
 * are weighted at 50% (e.g. 2 no-shows → 1.0 effective count).
 */
export function computeGuestRisk(
  noShowCount: number,
  _totalReservations: number,
  lastNoShowDate: Date | null,
  options: GuestRiskOptions = {}
): GuestRiskScore {
  const threshold = options.riskyThreshold ?? DEFAULT_RISKY_THRESHOLD;

  const effectiveCount = applyDecay(noShowCount, lastNoShowDate);

  if (effectiveCount === 0) return "trusted";
  if (effectiveCount < threshold) return "standard";
  return "risky";
}

function applyDecay(noShowCount: number, lastNoShowDate: Date | null): number {
  if (noShowCount === 0 || lastNoShowDate === null) return noShowCount;

  const now = new Date();
  const decayCutoff = new Date(now);
  decayCutoff.setMonth(decayCutoff.getMonth() - DECAY_THRESHOLD_MONTHS);

  if (lastNoShowDate < decayCutoff) {
    return noShowCount * DECAY_FACTOR;
  }

  return noShowCount;
}
