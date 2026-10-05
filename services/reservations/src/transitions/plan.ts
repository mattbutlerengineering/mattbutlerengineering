/**
 * The effects table: the ONLY place that decides what a reservation
 * transition sets off — which guest messages, which reminder-job operations,
 * which live SSE events — in what order, with what timing and failure mode
 * (architecture.md "`planEffects`: the effects table").
 *
 * Pure: a transition fact and the venue's effect policy go in, an ordered list
 * of effects comes out as data. No Fastify, Prisma, Stripe, BullMQ or
 * EventEmitter. Money never appears here — deposit capture/refund stays inside
 * the domain writes (`cancelReservationWithDeposit`, `recordNoShow`), byte for
 * byte, per the 2026-10-04 ruling "money unchanged".
 */
import { JOB_TYPES } from "@mbe/jobs";
import type { ReminderPayload } from "@mbe/jobs";
import type { Reservation, Table, UpdateReservationRequest } from "@mbe/types";
import type {
  CancelInitiator,
  Effect,
  GuestMessage,
  JobOp,
  LiveEvent,
  PlannedEffect,
  ReminderJobType,
} from "./ports.js";
import type { VenueEffectPolicy } from "./venue-policy.js";

export type CancelDoor = "staff-patch" | "staff-delete" | "guest-manage";
export type HoldDoor = "public-booking" | "staff-hold" | "public-hold";

export type TransitionFact =
  | {
      kind: "cancelled";
      door: CancelDoor;
      /** The reservation as it was before the cancel — what the guest is told about. */
      reservation: Reservation;
      /** The committed CANCELLED row — what live clients receive. */
      updated: Reservation;
      manageToken: string;
      initiator: CancelInitiator;
    }
  | { kind: "no-show"; reservation: Reservation }
  | {
      kind: "staff-updated";
      before: Reservation;
      after: Reservation;
      patch: UpdateReservationRequest;
    }
  | {
      kind: "guest-modified";
      before: Reservation;
      after: Reservation;
      manageToken: string;
      timeChanged: boolean;
    }
  | {
      kind: "hold-confirmed";
      door: HoldDoor;
      reservation: Reservation;
      manageToken?: string;
    }
  | {
      kind: "created";
      door: "walk-in" | "staff-create";
      reservation: Reservation;
      table?: Table;
    }
  | { kind: "attendance-confirmed"; reservation: Reservation };

const DAY_MS = 24 * 60 * 60 * 1000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/** Each reminder and how long before the start it fires. */
const REMINDERS: readonly { jobType: ReminderJobType; leadMs: number }[] = [
  { jobType: JOB_TYPES.BOOKING_REMINDER, leadMs: DAY_MS },
  { jobType: JOB_TYPES.DAY_OF_REMINDER, leadMs: TWO_HOURS_MS },
];

export function reminderJobId(jobType: string, reservationId: string): string {
  return `${jobType}:${reservationId}`;
}

// ─── Effect builders ─────────────────────────────────────────────────────────

const awaited = (effect: Effect, onFailure: PlannedEffect["onFailure"]): PlannedEffect => ({
  effect,
  timing: "await",
  onFailure,
});

const background = (effect: Effect, onFailure: PlannedEffect["onFailure"]): PlannedEffect => ({
  effect,
  timing: "background",
  onFailure,
});

const live = (event: LiveEvent): PlannedEffect => awaited({ port: "events", event }, "log");

const message = (m: GuestMessage): Effect => ({
  port: "messaging",
  message: m,
});

const job = (op: JobOp): Effect => ({ port: "jobs", op });

function reservationEvent(
  type: "reservation:created" | "reservation:updated" | "reservation:cancelled" | "hold:confirmed",
  reservation: Reservation
): LiveEvent {
  return { type, venueId: reservation.venueId ?? "", data: reservation };
}

function cancelReminders(reservationId: string): JobOp[] {
  return REMINDERS.map(({ jobType }) => ({
    op: "cancel" as const,
    jobId: reminderJobId(jobType, reservationId),
  }));
}

/**
 * Reminder jobs for `reservation` relative to `now` — 24h and 2h before the
 * start, each only if that moment is still in the future, and none at all
 * without a venue (the job worker needs one). Unchanged from
 * `booking-notifications.ts`.
 *
 * `replace-if-present` (D8) replaces a reminder only where one exists, and
 * cancels — never creates — one whose moment has already passed.
 */
function reminderOps(
  reservation: Reservation,
  now: Date,
  mode: "schedule" | "replace-if-present"
): JobOp[] {
  const { id, venueId, startTime } = reservation;
  if (!venueId) return [];
  const payload: ReminderPayload = { reservationId: id, venueId };
  const untilStart = new Date(startTime).getTime() - now.getTime();
  return REMINDERS.flatMap(({ jobType, leadMs }): JobOp[] => {
    const jobId = reminderJobId(jobType, id);
    const delayMs = untilStart - leadMs;
    if (delayMs > 0) return [{ op: mode, jobType, jobId, delayMs, payload }];
    return mode === "replace-if-present" ? [{ op: "cancel", jobId }] : [];
  });
}

/** The booking-confirmation email followed by its reminders, one background chain. */
function confirmationChain(
  reservation: Reservation,
  manageToken: string,
  now: Date
): PlannedEffect[] {
  return [
    background(message({ kind: "booking-confirmation", reservation, manageToken }), "propagate"),
    ...reminderOps(reservation, now, "schedule").map((op) => background(job(op), "propagate")),
  ];
}

function isStaffTimeChange(patch: UpdateReservationRequest): boolean {
  return patch.date !== undefined || patch.startTime !== undefined || patch.endTime !== undefined;
}

// ─── The table ───────────────────────────────────────────────────────────────

function planForFact(fact: TransitionFact, now: Date): PlannedEffect[] {
  switch (fact.kind) {
    case "cancelled":
      return [
        ...cancelReminders(fact.reservation.id).map((op) => awaited(job(op), "log")),
        awaited(
          message({
            kind: "booking-cancelled",
            reservation: fact.reservation,
            manageToken: fact.manageToken,
            initiator: fact.initiator,
          }),
          "propagate"
        ),
        live(reservationEvent("reservation:cancelled", fact.updated)),
      ];

    case "no-show":
      return [live(reservationEvent("reservation:updated", fact.reservation))];

    case "staff-updated":
      return [
        ...(fact.patch.status === "COMPLETED"
          ? [
              background(
                message({
                  kind: "post-visit-thank-you",
                  reservation: fact.after,
                }),
                "log"
              ),
            ]
          : []),
        ...(isStaffTimeChange(fact.patch)
          ? reminderOps(fact.after, now, "replace-if-present").map((op) =>
              background(job(op), "log")
            )
          : []),
        live(reservationEvent("reservation:updated", fact.after)),
      ];

    case "guest-modified":
      return [
        ...(fact.timeChanged
          ? [
              ...cancelReminders(fact.after.id).map((op) => background(job(op), "log")),
              ...confirmationChain(fact.after, fact.manageToken, now),
            ]
          : []),
        awaited(
          message({
            kind: "booking-modified",
            reservation: fact.after,
            manageToken: fact.manageToken,
          }),
          "log"
        ),
        live(reservationEvent("reservation:updated", fact.after)),
      ];

    case "hold-confirmed":
      return [
        ...(fact.door === "public-booking" && fact.manageToken !== undefined
          ? confirmationChain(fact.reservation, fact.manageToken, now)
          : []),
        live(reservationEvent("hold:confirmed", fact.reservation)),
      ];

    case "created":
      return [
        live(reservationEvent("reservation:created", fact.reservation)),
        ...(fact.door === "walk-in" && fact.table
          ? [
              live({
                type: "table:updated",
                venueId: fact.table.venueId ?? "",
                data: fact.table,
              }),
            ]
          : []),
      ];

    case "attendance-confirmed":
      return [live(reservationEvent("reservation:updated", fact.reservation))];
  }
}

/**
 * Plans the effects of one committed transition. `policy.outbound ===
 * "suppressed"` drops every guest message and reminder job; live events
 * always fire. Payments never appear — money stays inside the domain writes.
 */
export function planEffects(
  fact: TransitionFact,
  policy: VenueEffectPolicy,
  now: Date
): PlannedEffect[] {
  const planned = planForFact(fact, now);
  if (policy.outbound === "live") return planned;
  return planned.filter(({ effect }) => effect.port === "events");
}
