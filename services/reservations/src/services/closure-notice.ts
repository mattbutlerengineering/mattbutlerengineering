import type { CommunicationPreference } from "@mbe/types";
import type { ClosureNoticePayload, JobContext } from "../jobs/index.js";
import {
  buildClosureEmail,
  buildClosureSms,
  offerLabel,
  type ClosureNoticeContent,
  type ClosureNoticeKind,
} from "../notifications/closure-content.js";
import type { ClosureEmailInput } from "../notifications/port.js";
import type { ClosureSmsInput } from "../notifications/sms-port.js";
import { closureNoticeChannels, type NoticeChannel } from "./contact-policy.js";
import { runWithVenueContext } from "./venue-context-store.js";

/**
 * CLOSURE_NOTICE: render and deliver one guest's closure notice, then write
 * each channel's status back onto the `ClosureOutcome`
 * (docs/features/venue-availability/architecture.md § Closure notifications).
 *
 * Runs inside `runWithVenueContext(payload.venueId, …)`: a BullMQ consumer has
 * no request, so without it every RLS-scoped read here returns zero rows
 * (ADR-026 §3.3 item 7).
 */

export type DeliveryStatus = "sent" | "failed" | "skipped";
export type ChannelStatuses = Partial<Record<NoticeChannel, DeliveryStatus>>;
/** `ClosureOutcome.deliveries`; `reopen` holds the opt-in reopen notice's own statuses. */
export type Deliveries = ChannelStatuses & { reopen?: ChannelStatuses };

export interface NoticeOutcome {
  outcomeId: string;
  venueId: string;
  reservationId: string;
  action: "cancel" | "move" | "keep_notify" | "keep_silent";
  deliveries: Deliveries;
  /** The guest rebooked after the cancel. */
  rebooked: boolean;
  /** Venue-local service date the closure affects, "YYYY-MM-DD". */
  closureDate: string;
  message: string | null;
  /** The reservation's start as it stands now (the new time, for a move). */
  startTime: Date;
  partySize: number;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  preference: CommunicationPreference | null;
  refund: { amountCents: number; currency: string } | null;
  venueName: string;
  timezone: string;
}

export interface ClosureNoticeDeps {
  load(outcomeId: string): Promise<NoticeOutcome | null>;
  /** Open rebook times, computed now so they are still open when the message goes out. */
  offers(outcome: NoticeOutcome): Promise<Date[]>;
  /** The guest's manage link (a fresh token), with an optional one-tap rebook slot. */
  manageUrl(outcome: NoticeOutcome, rebook?: string): string;
  record(outcomeId: string, deliveries: Deliveries): Promise<void>;
  sendEmail(input: ClosureEmailInput): Promise<void>;
  sendSms(input: ClosureSmsInput): Promise<void>;
  smsEnabled: boolean;
  logger: { warn(details: object, msg: string): void };
}

const KIND_OF_ACTION: Record<NoticeOutcome["action"], ClosureNoticeKind | null> = {
  cancel: "cancelled",
  move: "moved",
  keep_notify: "kept",
  keep_silent: null,
};

/** Guests the call list is for: told, but with no confirmed delivery and no rebooking. */
export function isOnCallList(
  o: Pick<NoticeOutcome, "action" | "deliveries" | "rebooked">
): boolean {
  if (o.action === "keep_silent" || o.rebooked) return false;
  return o.deliveries.email !== "sent" && o.deliveries.sms !== "sent";
}

async function contentFor(
  o: NoticeOutcome,
  kind: ClosureNoticeKind,
  deps: ClosureNoticeDeps
): Promise<ClosureNoticeContent> {
  let slots: Date[] = [];
  if (kind === "cancelled") {
    try {
      slots = await deps.offers(o);
    } catch (error) {
      // The notice must still go out: link the full picker instead of offers.
      deps.logger.warn({ err: error, outcomeId: o.outcomeId }, "closure rebook offers failed");
    }
  }
  return {
    kind,
    venueName: o.venueName,
    guestName: o.guestName,
    closureDate: o.closureDate,
    startTime: o.startTime.toISOString(),
    timezone: o.timezone,
    partySize: o.partySize,
    message: o.message,
    refund: kind === "cancelled" ? o.refund : null,
    manageUrl: deps.manageUrl(o),
    offers: slots.map((s) => ({
      label: offerLabel(s, o.timezone),
      url: deps.manageUrl(o, s.toISOString()),
    })),
  };
}

async function send(
  channel: NoticeChannel,
  o: NoticeOutcome,
  content: ClosureNoticeContent,
  deps: ClosureNoticeDeps
): Promise<void> {
  if (channel === "email") {
    const { subject, html } = buildClosureEmail(content);
    return deps.sendEmail({ to: o.guestEmail!, subject, html });
  }
  return deps.sendSms({ to: o.guestPhone!, body: buildClosureSms(content) });
}

export function createClosureNoticeHandler(deps: ClosureNoticeDeps) {
  async function deliver(payload: ClosureNoticePayload, ctx: JobContext): Promise<void> {
    const o = await deps.load(payload.outcomeId);
    if (!o) return;
    const reopened = payload.variant === "reopened";
    // A reopen notice goes only to guests the closure cancelled.
    const kind = reopened ? (o.action === "cancel" ? "reopened" : null) : KIND_OF_ACTION[o.action];
    if (!kind) return;

    const prior: ChannelStatuses = (reopened ? o.deliveries.reopen : o.deliveries) ?? {};
    const contacts = {
      hasEmail: Boolean(o.guestEmail?.trim()),
      hasSms: deps.smsEnabled && Boolean(o.guestPhone?.trim()),
    };
    const chosen = closureNoticeChannels(o.preference, contacts, payload.urgent ?? false);
    const todo = chosen.filter((c) => prior[c] !== "sent");
    const next: ChannelStatuses = { ...prior };
    for (const c of ["email", "sms"] as const) {
      if (!chosen.includes(c) && prior[c] !== "sent") next[c] = "skipped";
    }

    const content = todo.length > 0 ? await contentFor(o, kind, deps) : null;
    const results = await Promise.allSettled(todo.map((c) => send(c, o, content!, deps)));
    const failures: unknown[] = [];
    todo.forEach((channel, i) => {
      const result = results[i]!;
      if (result.status === "fulfilled") next[channel] = "sent";
      else {
        failures.push(result.reason);
        // Only the last attempt may call a channel failed; earlier ones retry.
        if (ctx.isFinalAttempt) next[channel] = "failed";
      }
    });

    await deps.record(
      o.outcomeId,
      reopened
        ? { ...o.deliveries, reopen: next }
        : { ...next, ...(o.deliveries.reopen ? { reopen: o.deliveries.reopen } : {}) }
    );
    if (failures.length > 0) throw failures[0];
  }

  return (payload: ClosureNoticePayload, ctx: JobContext): Promise<void> =>
    runWithVenueContext(payload.venueId, () => deliver(payload, ctx));
}
