import type { NotificationDispatcher } from "../notifications/index.js";
import { buildManageUrl } from "../notifications/manage-url.js";
import type { ClosureNoticeDeps } from "./closure-notice.js";
import { loadNoticeOutcome, loadRebookSlots, recordDeliveries } from "./closure-notice-store.js";

/**
 * The production wiring of CLOSURE_NOTICE: the Prisma-backed store, the one
 * NotificationDispatcher for delivery, and a fresh manage token per link built
 * through `buildManageUrl` (the only place a manage URL is made).
 */
export function createClosureNoticeDeps(input: {
  dispatcher: Pick<NotificationDispatcher, "sendClosureEmail" | "sendClosureSms" | "smsEnabled">;
  generateManageToken(reservationId: string, guestEmail: string): string;
  manageBaseUrl: string;
  logger: ClosureNoticeDeps["logger"];
  now?: () => Date;
}): ClosureNoticeDeps {
  const now = input.now ?? (() => new Date());
  return {
    load: loadNoticeOutcome,
    offers: (o) => loadRebookSlots(o, now()),
    // The signed email is checked on the manage page; a phone-only guest has none.
    manageUrl: (o, rebook) =>
      buildManageUrl(
        input.manageBaseUrl,
        input.generateManageToken(o.reservationId, o.guestEmail ?? ""),
        rebook
      ),
    record: recordDeliveries,
    sendEmail: (m) => input.dispatcher.sendClosureEmail(m),
    sendSms: (m) => input.dispatcher.sendClosureSms(m),
    smsEnabled: input.dispatcher.smsEnabled,
    logger: input.logger,
  };
}
