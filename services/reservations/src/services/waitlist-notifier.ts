import { JOB_TYPES } from "../jobs/index.js";
import type { SmsPort } from "@mbe/notifications";
import { waitlistService } from "./waitlist.js";
import type { NotifierRuntime, NotifierScheduler } from "./notifier-runtime.js";

export interface WaitlistNotifierLogger {
  error(obj: Record<string, unknown>, msg: string): void;
  info(obj: Record<string, unknown>, msg: string): void;
}

export interface WaitlistEntryRef {
  id: string;
  venueId?: string;
  guestPhone: string;
  guestName: string | null;
  position?: number;
  estimatedWaitMinutes?: number | null;
  status?: string;
}

export interface WaitlistNotifierDeps {
  smsAdapter: SmsPort | null;
  scheduler: Pick<NotifierScheduler, "schedule">;
  expireEntry(id: string): Promise<{ id: string; venueId: string; status: string } | null>;
  listWaiting(venueId: string): Promise<WaitlistEntryRef[]>;
  // Same shape as the public notifyTableReady method below — the default
  // wiring (createDefaultWaitlistNotifier) forwards this dep straight into
  // the notifier's own public method, so both must accept venueId.
  notifyTableReady(entry: NotifyTableReadyInput): Promise<void>;
  /**
   * Persists notified state on the row; null if the party is no longer waiting.
   * `positionChanges` are the parties behind it that moved up; the notifier texts
   * them only once the expiry job is scheduled, because a failed schedule reverts
   * the party and moves everyone back down.
   */
  markNotified(
    id: string
  ): Promise<{ id: string; positionChanges?: readonly NotifyPositionUpdateInput[] } | null>;
  /** Rolls a notified row back to waiting when the expiry job can't be scheduled. */
  revertNotified(id: string): Promise<{ id: string } | null>;
  logger: WaitlistNotifierLogger;
}

export interface NotifyAddedInput {
  id: string;
  guestPhone: string;
  guestName: string | null;
  position: number;
  estimatedWaitMinutes: number | null;
}

export interface NotifyPositionUpdateInput {
  id: string;
  guestPhone: string;
  guestName: string | null;
  previousPosition: number;
  newPosition: number;
  estimatedWaitMinutes: number | null;
}

export interface NotifyTableReadyInput {
  id: string;
  guestPhone: string;
  guestName: string | null;
  /**
   * Passed straight through to the WAITLIST_EXPIRY job payload at enqueue
   * time (ADR-026 §3.3 item 7), so the job worker can run the expiry handler
   * inside `runWithVenueContext(venueId, ...)` instead of deriving it from an
   * RLS-protected read.
   */
  venueId: string;
}

export interface HandleExpiryInput {
  /**
   * The venue is derived from the expired entry itself (expireEntry returns
   * it), so the WAITLIST_EXPIRY job payload only needs the entry id — which is
   * all notifyTableReady enqueues.
   */
  waitlistEntryId: string;
}

export interface WaitlistNotifier {
  notifyAdded(input: NotifyAddedInput): Promise<void>;
  notifyPositionUpdate(input: NotifyPositionUpdateInput): Promise<void>;
  notifyTableReady(input: NotifyTableReadyInput): Promise<void>;
  handleExpiry(input: HandleExpiryInput): Promise<void>;
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;
// Any move up the queue is worth a text: renumbering closes the gap, so a seat,
// cancel or notify moves each party behind it up by exactly one.
const POSITION_UPDATE_THRESHOLD = 1;

/**
 * Validates that a phone string contains at least 7 digits.
 * Accepts E.164, 10-digit US, or formatted numbers (dashes/spaces).
 */
export function validatePhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7;
}

export function createWaitlistNotifier(deps: WaitlistNotifierDeps): WaitlistNotifier {
  const {
    smsAdapter,
    scheduler,
    expireEntry,
    listWaiting,
    notifyTableReady: notifyNextTableReady,
    markNotified,
    revertNotified,
    logger,
  } = deps;

  async function notifyAdded(input: NotifyAddedInput): Promise<void> {
    if (!smsAdapter) return;
    try {
      await smsAdapter.sendWaitlistAdded({
        guestPhone: input.guestPhone,
        guestName: input.guestName,
        position: input.position,
        estimatedWaitMinutes: input.estimatedWaitMinutes,
      });
    } catch (err) {
      logger.error({ err }, "waitlist SMS failed: added");
    }
  }

  async function notifyPositionUpdate(input: NotifyPositionUpdateInput): Promise<void> {
    const improvement = input.previousPosition - input.newPosition;
    if (improvement < POSITION_UPDATE_THRESHOLD) return;
    if (!smsAdapter) return;
    try {
      await smsAdapter.sendWaitlistPositionUpdate({
        guestPhone: input.guestPhone,
        guestName: input.guestName,
        position: input.newPosition,
        estimatedWaitMinutes: input.estimatedWaitMinutes,
      });
    } catch (err) {
      logger.error({ err }, "waitlist SMS failed: position-update");
    }
  }

  async function notifyTableReady(input: NotifyTableReadyInput): Promise<void> {
    // Record notified state first: a party that was seated/cancelled in the
    // meantime gets no SMS and no expiry job.
    const marked = await markNotified(input.id);
    if (!marked) return;

    if (smsAdapter) {
      try {
        await smsAdapter.sendWaitlistTableReady({
          guestPhone: input.guestPhone,
          guestName: input.guestName,
        });
      } catch (err) {
        logger.error({ err }, "waitlist SMS failed: table-ready");
      }
    }

    // Always schedule expiry regardless of SMS outcome. If scheduling fails the
    // row would stay notified forever (host can't retry, next guest never
    // notified), so roll it back to waiting and surface the error.
    try {
      await scheduler.schedule(
        JOB_TYPES.WAITLIST_EXPIRY,
        { waitlistEntryId: input.id, venueId: input.venueId },
        FIVE_MINUTES_MS,
        `${JOB_TYPES.WAITLIST_EXPIRY}:${input.id}`
      );
    } catch (err) {
      await revertNotified(input.id);
      throw err;
    }

    // Queue positions are final only now that the notified state stuck.
    for (const change of marked.positionChanges ?? []) {
      notifyPositionUpdate(change).catch(() => {
        // Already logged inside notifyPositionUpdate
      });
    }
  }

  async function handleExpiry(input: HandleExpiryInput): Promise<void> {
    const expired = await expireEntry(input.waitlistEntryId);
    if (!expired) return;

    const waiting = await listWaiting(expired.venueId);
    const next = waiting[0];
    if (!next) return;

    // expired.venueId (not next.venueId — WaitlistEntryRef declares it
    // optional for looser test doubles) is the venue this whole call is
    // already scoped to; listWaiting(expired.venueId) guarantees `next`
    // belongs to it.
    await notifyNextTableReady({
      id: next.id,
      guestPhone: next.guestPhone,
      guestName: next.guestName,
      venueId: expired.venueId,
    });
  }

  return { notifyAdded, notifyPositionUpdate, notifyTableReady, handleExpiry };
}

const consoleLogger: WaitlistNotifierLogger = {
  error: (obj, msg) => process.stderr.write(JSON.stringify({ ...obj, msg }) + "\n"),
  info: (obj, msg) => process.stdout.write(JSON.stringify({ ...obj, msg }) + "\n"),
};

/**
 * Creates the production WaitlistNotifier from the shared NotifierRuntime. The
 * runtime owns the Twilio SMS adapter and the typed, lazily-connected scheduler
 * (its Redis connection opens on first use), so buildApp() stays side-effect-free.
 */
export function createDefaultWaitlistNotifier(runtime: NotifierRuntime): WaitlistNotifier {
  // notifyTableReady re-notifies the next waiting guest via the notifier's own
  // public method; a ref lets that self-referential callback capture the
  // instance after construction (const-safe).
  const ref: { value: WaitlistNotifier | null } = { value: null };

  const notifier = createWaitlistNotifier({
    smsAdapter: runtime.smsAdapter,
    scheduler: runtime.scheduler,
    expireEntry: (id) => waitlistService.expire(id),
    listWaiting: (venueId) => waitlistService.listWaiting(venueId),
    notifyTableReady: (entry) => ref.value!.notifyTableReady(entry),
    markNotified: async (id) => {
      const positionChanges: NotifyPositionUpdateInput[] = [];
      const entry = await waitlistService.markNotified(id, (changes) => {
        positionChanges.push(...changes);
      });
      return entry ? { id: entry.id, positionChanges } : null;
    },
    revertNotified: (id) => waitlistService.revertNotified(id),
    logger: consoleLogger,
  });

  ref.value = notifier;
  return notifier;
}
