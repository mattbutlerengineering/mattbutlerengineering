/**
 * Single source of copy for every session-lapse surface: the blocking
 * `SessionExpiredGate` (a lapsed access token) and the non-blocking
 * `DashboardLayout` refresh-failure banner (a failed silent refresh).
 * PRD criterion 5 requires one voice — same noun, same promise, same verb
 * on the action button — across both moments.
 */
export const SESSION_LAPSE_COPY = Object.freeze({
  heading: "Your session ended",
  body: "Sign back in to pick up where you left off — this page is preserved.",
  refreshFailedLead: "Your session couldn't renew and will end soon.",
  action: "Sign back in",
  actionBusy: "Heading to sign-in",
});
