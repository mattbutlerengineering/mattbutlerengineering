/**
 * Effects harness for the reservation-transition suite
 * (`src/transitions/entry-points.test.ts`, maintenance run
 * reservation-transition-effects, PR 1).
 *
 * It records what a reservation transition SETS OFF — live SSE events, guest
 * messages, reminder-job operations and deposit money operations — and
 * normalizes them into one shape, `{ events, messages, jobs, depositOps }`.
 * Tests assert on that shape only, so when the effects move behind injected
 * ports (PR 2/PR 3) the harness is re-backed and the test bodies do not change.
 *
 * Each channel is recorded at the LOWEST outbound seam available today, so the
 * recording is of what would actually leave the process, not of an
 * intermediate call:
 *
 * - events:     every `change` on the single live `ReservationEventEmitter`
 *               (the instance `routes/events.ts` subscribes to), minus the
 *               `table-status:changed` deltas that route derives itself.
 * - messages:   calls on a recording `NotificationDispatcher`. Anything not
 *               listed in {@link MESSAGE_KINDS} is recorded as
 *               `unexpected:<sendMethod>` so a new message can never pass
 *               silently.
 *               The post-visit thank-you goes through the real
 *               `createPostVisitNotifier`, so its venue-flag and unsubscribe
 *               gates run unchanged.
 * - jobs:       a recording scheduler behind the REAL `createBookingNotifier`,
 *               so reminder timing and job ids are today's code, not a fake.
 *               `scheduledJobs` is the resulting store; `seedReminders` puts a
 *               reservation's two reminders in it, as a public booking would.
 * - depositOps: money-moving calls on {@link recordingDepositService}. The test
 *               file routes `depositService` to it with ONE temporary
 *               `vi.mock("../services/deposit.js")` (vi.mock must live in the
 *               test file to be hoisted). Reads are not recorded.
 */
import { JOB_TYPES } from "@mbe/jobs";
import type { NotificationDispatcher } from "@mbe/notifications";
import type { ReminderPayload } from "@mbe/jobs";
import { ReservationEventEmitter, type ReservationEvent } from "../services/events.js";
import { createBookingNotifier } from "../services/booking-notifications.js";
import { createPostVisitNotifier } from "../services/post-visit-notifier.js";
import type { NotifierScheduler } from "../services/notifier-runtime.js";
import { venueService } from "../services/venue.js";
import type { ReservationsAppOptions } from "../app.js";

export interface RecordedEvent {
  type: string;
  id?: string;
}

export interface RecordedMessage {
  kind: string;
  reservationId?: string;
  guestEmail?: string;
}

export type RecordedJobOp =
  | { op: "schedule"; jobType: string; jobId: string; delayMs: number }
  | { op: "cancel"; jobId: string };

export interface RecordedDepositOp {
  op: string;
  args: unknown[];
}

export interface RecordedEffects {
  events: RecordedEvent[];
  messages: RecordedMessage[];
  jobs: RecordedJobOp[];
  depositOps: RecordedDepositOp[];
}

const MESSAGE_KINDS: Record<string, string> = {
  sendBookingConfirmation: "booking-confirmation",
  sendBookingModified: "booking-modified",
  sendBookingCancelled: "booking-cancelled",
  sendThankYouEmail: "post-visit-thank-you",
};

/** DepositService methods that can move money; reads are deliberately absent. */
type DepositMoneyOp = "refund" | "refundPartial" | "forfeit" | "apply" | "verifyCaptureCompleted";

interface ScriptedDeposit {
  id: string;
  status: string;
  [key: string]: unknown;
}

// ─── Recording DepositService (shared by the test file's vi.mock) ────────────

let currentDeposits: DepositRecorder | null = null;

interface DepositRecorder {
  ops: RecordedDepositOp[];
  deposit: ScriptedDeposit | null;
  results: Map<string, () => Promise<unknown>>;
}

function activeDeposits(): DepositRecorder {
  if (!currentDeposits) {
    throw new Error("effects-harness: createEffectsRecorder() must run before deposit calls");
  }
  return currentDeposits;
}

function recordDepositOp(op: string) {
  return async (...args: unknown[]): Promise<unknown> => {
    const recorder = activeDeposits();
    recorder.ops.push({ op, args });
    const scripted = recorder.results.get(op);
    if (scripted) return scripted();
    return { ...(recorder.deposit ?? {}), id: args[0] };
  };
}

/**
 * Stand-in for the `depositService` singleton. Delegates to whichever recorder
 * {@link createEffectsRecorder} created last, so a module-scope `vi.mock`
 * factory can hand out one stable object.
 */
type DepositMethod = (...args: unknown[]) => Promise<unknown>;

export const recordingDepositService: Record<
  "getByReservationId" | "getById" | DepositMoneyOp,
  DepositMethod
> = {
  getByReservationId: async () => activeDeposits().deposit,
  getById: async () => activeDeposits().deposit,
  refund: recordDepositOp("refund"),
  refundPartial: recordDepositOp("refundPartial"),
  forfeit: recordDepositOp("forfeit"),
  apply: recordDepositOp("apply"),
  verifyCaptureCompleted: recordDepositOp("verifyCaptureCompleted"),
};

// ─── Recorder ────────────────────────────────────────────────────────────────

export interface EffectsRecorder {
  /** Normalized effects recorded so far (live arrays). */
  effects: RecordedEffects;
  /** Spread into `buildApp(...)`; carries every recording seam. */
  appOptions: Pick<
    ReservationsAppOptions,
    "notificationPort" | "bookingNotifier" | "postVisitNotifier" | "reservationEvents"
  >;
  /** Reminder jobs currently scheduled, keyed by job id. */
  scheduledJobs: Map<string, { jobType: string; delayMs: number; payload: unknown }>;
  /** Put a reservation's two reminders in the store, as a public booking would. */
  seedReminders(reservationId: string, venueId: string): void;
  deposits: {
    service: typeof recordingDepositService;
    /** The deposit `getByReservationId`/`getById` return (null = no deposit). */
    seed(deposit: ScriptedDeposit | null): void;
    /** Script one money op's result (resolve or reject). */
    script(op: string, result: () => Promise<unknown>): void;
  };
  /** Wait for fire-and-forget effects to settle. */
  settle(): Promise<void>;
}

function reminderJobId(jobType: string, reservationId: string): string {
  return `${jobType}:${reservationId}`;
}

function createRecordingDispatcher(messages: RecordedMessage[]): NotificationDispatcher {
  return new Proxy({} as NotificationDispatcher, {
    get(_target, prop) {
      // Only `send*` members are outbound messages. Anything else (`then`,
      // Fastify's decorate-time `getter`/`setter` probe) must read as absent.
      if (typeof prop !== "string" || !prop.startsWith("send")) return undefined;
      return async (input: { reservationId?: string; guestEmail?: string } | undefined) => {
        messages.push({
          kind: MESSAGE_KINDS[prop] ?? `unexpected:${prop}`,
          ...(input?.reservationId !== undefined && { reservationId: input.reservationId }),
          ...(input?.guestEmail !== undefined && { guestEmail: input.guestEmail }),
        });
      };
    },
  });
}

function createRecordingScheduler(
  jobs: RecordedJobOp[],
  store: EffectsRecorder["scheduledJobs"]
): NotifierScheduler {
  return {
    async schedule(jobType, payload, delayMs, jobId) {
      const id = jobId ?? `${jobType}:${store.size}`;
      jobs.push({ op: "schedule", jobType, jobId: id, delayMs });
      store.set(id, { jobType, delayMs, payload });
      return id;
    },
    async cancel(jobId: string) {
      jobs.push({ op: "cancel", jobId });
      return store.delete(jobId);
    },
  };
}

export function createEffectsRecorder(): EffectsRecorder {
  const effects: RecordedEffects = { events: [], messages: [], jobs: [], depositOps: [] };
  const scheduledJobs: EffectsRecorder["scheduledJobs"] = new Map();

  const reservationEvents = new ReservationEventEmitter();
  reservationEvents.on("change", (event: ReservationEvent) => {
    if (event.type === "table-status:changed") return;
    const data = event.data as { id?: unknown };
    effects.events.push({
      type: event.type,
      ...(typeof data?.id === "string" && { id: data.id }),
    });
  });

  const notificationPort = createRecordingDispatcher(effects.messages);
  const scheduler = createRecordingScheduler(effects.jobs, scheduledJobs);
  const bookingNotifier = createBookingNotifier({
    notificationAdapter: notificationPort,
    scheduler,
    getVenue: (venueId) => venueService.getById(venueId),
  });
  const postVisitNotifier = createPostVisitNotifier({
    sendThankYouEmail: (input) => notificationPort.sendThankYouEmail(input),
    updateReservationEmailStatus: async () => undefined,
    updateGuestUnsubscribed: async () => undefined,
  });

  const depositRecorder: DepositRecorder = {
    ops: effects.depositOps,
    deposit: null,
    results: new Map(),
  };
  currentDeposits = depositRecorder;

  return {
    effects,
    appOptions: { notificationPort, bookingNotifier, postVisitNotifier, reservationEvents },
    scheduledJobs,
    seedReminders(reservationId, venueId) {
      const payload: ReminderPayload = { reservationId, venueId };
      for (const jobType of [JOB_TYPES.BOOKING_REMINDER, JOB_TYPES.DAY_OF_REMINDER]) {
        scheduledJobs.set(reminderJobId(jobType, reservationId), {
          jobType,
          delayMs: 1,
          payload,
        });
      }
    },
    deposits: {
      service: recordingDepositService,
      seed(deposit) {
        depositRecorder.deposit = deposit;
      },
      script(op, result) {
        depositRecorder.results.set(op, result);
      },
    },
    async settle() {
      for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    },
  };
}
