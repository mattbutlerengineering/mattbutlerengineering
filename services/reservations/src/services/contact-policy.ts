import type { CommunicationPreference } from "@mbe/types";

/**
 * The single owner of "may we message this guest, and on which channel".
 *
 * Two orthogonal concerns live here so they cannot drift apart across the
 * notification call sites (win-back, booking reminders/cancellations/mods,
 * post-visit thank-yous):
 *   1. Channel resolution — the single "no stored preference → email-only"
 *      fallback.
 *   2. Consent — whether a message of a given class may be sent to a guest
 *      given their unsubscribe/marketing-opt-out state.
 */

/**
 * Whether a message is a transactional service message (booking confirmation,
 * reminder, cancellation, modification) or a marketing/lifecycle message
 * (win-back, post-visit thank-you). The consent boundary differs by class.
 */
export type MessageClass = "transactional" | "marketing";

/** The minimal guest contact state the policy reasons about. */
export interface ContactState {
  /**
   * True when the guest has opted out of marketing/lifecycle email. Unset
   * (undefined) is treated as still-subscribed.
   */
  unsubscribed: boolean;
  /**
   * The guest's stored channel preference; null/undefined (or omitted) when
   * never set. Only consulted for marketing consent (transactional_only opts
   * out); callers that only carry the unsubscribe flag may omit it.
   */
  communicationPreference?: CommunicationPreference | null;
}

/**
 * Resolves the effective channel preference. A guest with no stored preference
 * is treated as email-only. This is the ONLY place that fallback lives —
 * every notification path routes through it.
 */
export function resolveChannel(
  preference: CommunicationPreference | null | undefined
): CommunicationPreference {
  return preference ?? "email_only";
}

/**
 * Consent gate: may we send a message of `messageClass` to this guest?
 *
 * - Transactional messages are always allowed — the guest asked for them by
 *   booking, and they are not marketing.
 * - Marketing is blocked when the guest is unsubscribed (the compliance
 *   boundary this module exists to enforce) OR when their stored preference is
 *   `transactional_only` (a marketing opt-out expressed via preference).
 */
export function canContact(state: ContactState, messageClass: MessageClass): boolean {
  if (messageClass === "transactional") {
    return true;
  }
  if (state.unsubscribed) {
    return false;
  }
  return resolveChannel(state.communicationPreference) !== "transactional_only";
}
