/**
 * Venue-level effect policy — the ONE place "suppress all outbound effects
 * for venue X" is expressed (architecture.md `VenueEffectPolicySource`).
 *
 * The composition root (`buildApp`) picks the source; `planEffects` is the
 * only reader of a policy value. `outbound: "suppressed"` drops every guest
 * message and reminder job a transition would set off. It never touches
 * money (deposit capture/refund live inside the domain writes, unchanged) and
 * never touches live SSE events (staff-internal, not outbound).
 */
export interface VenueEffectPolicy {
  outbound: "live" | "suppressed";
}

export type VenueEffectPolicySource = (venueId: string) => Promise<VenueEffectPolicy>;

const LIVE: VenueEffectPolicy = Object.freeze({ outbound: "live" });

/** Production source: every venue's outbound effects are live. */
export const allOutboundLive: VenueEffectPolicySource = async () => LIVE;
