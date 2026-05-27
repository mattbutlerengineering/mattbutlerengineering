import type { SmsPort } from "@mbe/notifications";
import { waitlistService } from "./waitlist.js";

const CLAIM_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/** Formats a waitlist-added SMS. */
export function buildAddedSms(position: number, estimatedMinutes: number): string {
  return `You're #${position}, est. ${estimatedMinutes} min wait. We'll text when your table is ready.`;
}

/** Formats a position-update SMS. */
export function buildPositionUpdateSms(position: number, estimatedMinutes: number): string {
  return `Update: you're now #${position}, est. ${estimatedMinutes} min.`;
}

/** Formats the table-ready SMS. */
export function buildTableReadySms(): string {
  return "Your table is ready! Please check in within 5 minutes.";
}

/** Estimate wait minutes: 15 min per position ahead. */
export function estimateWaitMinutes(position: number): number {
  return Math.max(0, (position - 1) * 15);
}

/**
 * Sends an SMS notification. Logs on failure — never throws.
 */
export async function sendWaitlistSms(
  sms: SmsPort,
  to: string,
  body: string,
  logger: { error: (msg: string, err: unknown) => void }
): Promise<void> {
  try {
    await sms.sendSms(to, body);
  } catch (err) {
    logger.error("SMS send failed (non-blocking)", err);
  }
}

/**
 * Schedules a 5-minute claim window for a notified entry.
 * After 5 min, if still NOTIFIED: mark EXPIRED and notify next party.
 */
export function scheduleClaimWindow(
  entryId: string,
  sms: SmsPort | null,
  logger: { error: (msg: string, err: unknown) => void }
): void {
  setTimeout(() => {
    void expireIfUnclaimed(entryId, sms, logger);
  }, CLAIM_WINDOW_MS);
}

async function expireIfUnclaimed(
  entryId: string,
  sms: SmsPort | null,
  logger: { error: (msg: string, err: unknown) => void }
): Promise<void> {
  const entry = await waitlistService.getById(entryId);
  if (!entry || entry.status !== "NOTIFIED") return;

  const expired = await waitlistService.updateStatus(entryId, "EXPIRED");
  if (!expired) return;

  // Notify next party in queue (if any)
  const next = await waitlistService.getNext(expired.venueId);
  if (next && sms) {
    const body = buildTableReadySms();
    await sendWaitlistSms(sms, next.guestPhone, body, logger);
    await waitlistService.updateStatus(next.id, "NOTIFIED");
    scheduleClaimWindow(next.id, sms, logger);
  }
}
