/**
 * Pure utility functions for waitlist management.
 */

/**
 * Calculates the next position for a new waitlist entry.
 */
export function calculatePosition(existingCount: number): number {
  return existingCount + 1;
}

/**
 * Estimates wait time based on queue position and average table turn time.
 */
export function estimateWaitMinutes(position: number, avgTurnTimeMinutes: number): number {
  return position * avgTurnTimeMinutes;
}

/**
 * Reassigns positions 1..N in order for the given entries.
 * Entries are processed in their original array order.
 */
export function recalculatePositions(
  entries: { id: string; position: number }[]
): { id: string; position: number }[] {
  return entries.map((entry, index) => ({
    id: entry.id,
    position: index + 1,
  }));
}
