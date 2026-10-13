/**
 * The one definition of a guest's segment. The Guests-page segment counts (server) and the
 * guest badges (client) both derive from these rules so they always describe the same guests.
 *
 * VIP    = carries a `vip` tag (any case) OR has VIP_VISIT_THRESHOLD+ visits.
 * Repeat = not VIP, REPEAT_VISIT_THRESHOLD+ visits.
 * New    = everything else (fewer than REPEAT_VISIT_THRESHOLD visits).
 */

export const VIP_TAG = "vip";
export const VIP_VISIT_THRESHOLD = 10;
export const REPEAT_VISIT_THRESHOLD = 2;

export type GuestSegmentName = "VIP" | "Repeat" | "New";

/** True when any tag is `vip` (case-insensitive). */
export function hasVipTag(tags: readonly string[] | null | undefined): boolean {
  return (tags ?? []).some((tag) => tag.toLowerCase() === VIP_TAG);
}

export function classifyGuestSegment(
  visitCount: number,
  tags: readonly string[] | null | undefined
): GuestSegmentName {
  if (hasVipTag(tags) || visitCount >= VIP_VISIT_THRESHOLD) return "VIP";
  if (visitCount >= REPEAT_VISIT_THRESHOLD) return "Repeat";
  return "New";
}
