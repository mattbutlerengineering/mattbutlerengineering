import type { TFunction } from "i18next";

/**
 * Single source of copy for every session-lapse surface: the blocking
 * `SessionExpiredGate` (a lapsed access token) and the non-blocking
 * `DashboardLayout` refresh-failure banner (a failed silent refresh).
 * PRD criterion 5 requires one voice — same noun, same promise, same verb
 * on the action button — across both moments.
 */
export function getSessionLapseCopy(t: TFunction) {
  return Object.freeze({
    heading: t("auth.sessionLapse.heading"),
    body: t("auth.sessionLapse.body"),
    refreshFailedLead: t("auth.sessionLapse.refreshFailedLead"),
    action: t("auth.sessionLapse.action"),
    actionBusy: t("auth.sessionLapse.actionBusy"),
  });
}
