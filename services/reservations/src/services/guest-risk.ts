export type GuestRiskLevel = "trusted" | "standard" | "risky";

export interface NoShowRecord {
  reservationDate: Date;
}

const TWELVE_MONTHS_MS = 12 * 30 * 24 * 60 * 60 * 1000; // ~365 days

/**
 * Compute guest risk level based on no-show history.
 *
 * - No-shows older than 12 months count as 0.5 (weight decay).
 * - 0 weighted no-shows → "trusted"
 * - weighted >= autoDepositThreshold → "risky"
 * - otherwise → "standard"
 */
export function computeGuestRisk(
  noShows: NoShowRecord[],
  totalReservations: number,
  autoDepositThreshold: number = 2
): GuestRiskLevel {
  if (totalReservations === 0 || noShows.length === 0) {
    return "trusted";
  }

  const now = Date.now();
  const weightedNoShows = noShows.reduce((sum, record) => {
    const ageMs = now - record.reservationDate.getTime();
    const weight = ageMs > TWELVE_MONTHS_MS ? 0.5 : 1.0;
    return sum + weight;
  }, 0);

  if (weightedNoShows === 0) return "trusted";
  if (weightedNoShows >= autoDepositThreshold) return "risky";
  return "standard";
}
