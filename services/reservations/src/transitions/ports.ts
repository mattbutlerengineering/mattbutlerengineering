/**
 * Ports the reservation-transitions module sets effects off through
 * (architecture.md "Interfaces & contracts"). Owned by the policy side: the
 * planner (`plan.ts`) and executor (`run.ts`) depend on these types only, and
 * the production adapters (`adapters/*`) and in-memory recorders
 * (`in-memory.ts`) implement them. Type-only imports — no Fastify, Prisma,
 * BullMQ or EventEmitter at runtime.
 */
import type { JobScheduler, ReminderPayload } from "@mbe/jobs";
import type { JOB_TYPES } from "@mbe/jobs";
import type { Reservation } from "@mbe/types";
import type { ReservationEvent } from "../services/events.js";

/**
 * Who triggered a cancellation. Guest self-service and staff/venue-side
 * cancels both notify the guest identically today; the distinction drives
 * deposit fee policy and is carried for observability.
 */
export type CancelInitiator = "guest" | "staff";

// ─── Messaging ───────────────────────────────────────────────────────────────

export type GuestMessage =
  | {
      kind: "booking-confirmation";
      reservation: Reservation;
      manageToken: string;
    }
  | { kind: "booking-modified"; reservation: Reservation; manageToken: string }
  | {
      kind: "booking-cancelled";
      reservation: Reservation;
      manageToken: string;
      initiator: CancelInitiator;
    }
  | { kind: "post-visit-thank-you"; reservation: Reservation };

export type GuestMessageKind = GuestMessage["kind"];

export interface MessagingPort {
  send(message: GuestMessage): Promise<void>;
}

// ─── Jobs ────────────────────────────────────────────────────────────────────

/** `cancel(jobId)` resolves `true` when a job was removed, `false` otherwise. */
export type JobsPort = Pick<JobScheduler, "schedule" | "cancel">;

export type ReminderJobType = typeof JOB_TYPES.BOOKING_REMINDER | typeof JOB_TYPES.DAY_OF_REMINDER;

export type JobOp =
  | {
      op: "schedule";
      jobType: ReminderJobType;
      jobId: string;
      delayMs: number;
      payload: ReminderPayload;
    }
  | { op: "cancel"; jobId: string }
  | {
      op: "replace-if-present";
      jobType: ReminderJobType;
      jobId: string;
      delayMs: number;
      payload: ReminderPayload;
    };

// ─── Events ──────────────────────────────────────────────────────────────────

/** A live SSE event before the adapter stamps its timestamp. */
export type LiveEvent = Omit<ReservationEvent, "timestamp">;

export interface EventsPort {
  publish(event: LiveEvent): void;
}

// ─── Planned effects ─────────────────────────────────────────────────────────

export type Effect =
  | { port: "events"; event: LiveEvent }
  | { port: "messaging"; message: GuestMessage }
  | { port: "jobs"; op: JobOp };

/**
 * - `timing: "await"` — runs in sequence before the verb returns.
 * - `timing: "background"` — runs in one detached chain after the verb returns.
 * - `onFailure: "propagate"` — an awaited failure reaches the caller; a
 *   background failure stops the chain and is logged once.
 * - `onFailure: "log"` — the failure is logged and the next effect runs.
 */
export interface PlannedEffect {
  effect: Effect;
  timing: "await" | "background";
  onFailure: "log" | "propagate";
}

export interface EffectPorts {
  messaging: MessagingPort;
  jobs: JobsPort;
  events: EventsPort;
}
