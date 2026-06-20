import { JOB_TYPES, JobScheduler } from "@mbe/jobs";
import { TwilioSmsAdapter, type SmsPort } from "@mbe/notifications";
import { waitlistService } from "./waitlist.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export interface WaitlistNotifierLogger {
  error(obj: Record<string, unknown>, msg: string): void;
  info(obj: Record<string, unknown>, msg: string): void;
}

export interface WaitlistNotifierScheduler {
  schedule(
    jobType: string,
    payload: Record<string, unknown>,
    delayMs: number,
    jobId?: string
  ): Promise<unknown>;
}

export interface WaitlistEntryRef {
  id: string;
  venueId?: string;
  guestPhone: string;
  guestName: string | null;
  position?: number;
  estimatedWaitMinutes?: number;
  status?: string;
}

export interface WaitlistNotifierDeps {
  smsAdapter: SmsPort | null;
  scheduler: WaitlistNotifierScheduler;
  expireEntry(id: string): Promise<{ id: string; venueId: string; status: string } | null>;
  listWaiting(venueId: string): Promise<WaitlistEntryRef[]>;
  notifyTableReady(entry: {
    id: string;
    guestPhone: string;
    guestName: string | null;
  }): Promise<void>;
  logger: WaitlistNotifierLogger;
}

export interface NotifyAddedInput {
  id: string;
  guestPhone: string;
  guestName: string | null;
  position: number;
  estimatedWaitMinutes: number;
}

export interface NotifyPositionUpdateInput {
  id: string;
  guestPhone: string;
  guestName: string | null;
  previousPosition: number;
  newPosition: number;
  estimatedWaitMinutes: number;
}

export interface NotifyTableReadyInput {
  id: string;
  guestPhone: string;
  guestName: string | null;
}

export interface HandleExpiryInput {
  waitlistEntryId: string;
  venueId: string;
}

export interface WaitlistNotifier {
  notifyAdded(input: NotifyAddedInput): Promise<void>;
  notifyPositionUpdate(input: NotifyPositionUpdateInput): Promise<void>;
  notifyTableReady(input: NotifyTableReadyInput): Promise<void>;
  handleExpiry(input: HandleExpiryInput): Promise<void>;
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const POSITION_UPDATE_THRESHOLD = 2;

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

    // Always schedule expiry regardless of SMS outcome
    await scheduler.schedule(
      JOB_TYPES.WAITLIST_EXPIRY,
      { waitlistEntryId: input.id },
      FIVE_MINUTES_MS,
      `${JOB_TYPES.WAITLIST_EXPIRY}:${input.id}`
    );
  }

  async function handleExpiry(input: HandleExpiryInput): Promise<void> {
    const expired = await expireEntry(input.waitlistEntryId);
    if (!expired) return;

    const waiting = await listWaiting(input.venueId);
    const next = waiting[0];
    if (!next) return;

    await notifyNextTableReady({
      id: next.id,
      guestPhone: next.guestPhone,
      guestName: next.guestName,
    });
  }

  return { notifyAdded, notifyPositionUpdate, notifyTableReady, handleExpiry };
}

const consoleLogger: WaitlistNotifierLogger = {
  error: (obj, msg) => process.stderr.write(JSON.stringify({ ...obj, msg }) + "\n"),
  info: (obj, msg) => process.stdout.write(JSON.stringify({ ...obj, msg }) + "\n"),
};

/**
 * Creates the production WaitlistNotifier backed by Twilio SMS + BullMQ.
 * Reads Twilio env vars at first use so buildApp() stays side-effect-free.
 * Dep construction is deferred to first use: JobScheduler opens a Redis
 * connection in its constructor.
 */
export function createDefaultWaitlistNotifier(): WaitlistNotifier {
  let notifier: WaitlistNotifier | null = null;

  function getNotifier(): WaitlistNotifier {
    if (notifier) return notifier;

    const smsAdapter: SmsPort | null =
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER
        ? new TwilioSmsAdapter({
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            client: require("twilio")(
              process.env.TWILIO_ACCOUNT_SID,
              process.env.TWILIO_AUTH_TOKEN
            ) as never,
            fromNumber: process.env.TWILIO_FROM_NUMBER,
          })
        : null;

    const jobScheduler = new JobScheduler({ redisUrl: REDIS_URL });

    // Use a ref object so the self-referential notifyTableReady callback can
    // capture the notifier instance after it is constructed (const-safe).
    const ref: { value: WaitlistNotifier | null } = { value: null };

    const built = createWaitlistNotifier({
      smsAdapter,
      scheduler: {
        schedule: (jobType, payload, delayMs, jobId) =>
          jobScheduler.schedule(
            jobType as typeof JOB_TYPES.WAITLIST_EXPIRY,
            payload as {
              waitlistEntryId: string;
              venueId: string;
              guestPhone: string | null;
              guestEmail: string | null;
            },
            delayMs,
            jobId
          ),
      },
      expireEntry: (id) => waitlistService.expire(id),
      listWaiting: (venueId) => waitlistService.listWaiting(venueId),
      notifyTableReady: (entry) => ref.value!.notifyTableReady(entry),
      logger: consoleLogger,
    });

    ref.value = built;
    notifier = built;
    return notifier;
  }

  return {
    notifyAdded: (input) => getNotifier().notifyAdded(input),
    notifyPositionUpdate: (input) => getNotifier().notifyPositionUpdate(input),
    notifyTableReady: (input) => getNotifier().notifyTableReady(input),
    handleExpiry: (input) => getNotifier().handleExpiry(input),
  };
}
