/**
 * Navigation state a hub row's action carries, so a view opened from the hub knows the entry
 * before it is the hub and can close by going back to it, rather than adding a second hub entry.
 * A view loaded any other way (its address typed or bookmarked, a Venue Setup link) has no such
 * state and replaces its own entry with the hub's. Pure: no React, no router.
 */
export const OPENED_FROM_HUB = { openedFrom: "hub" } as const;

/** Whether a location's state says it was opened from a hub row. */
export function wasOpenedFromHub(state: unknown): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    "openedFrom" in state &&
    state.openedFrom === "hub"
  );
}
