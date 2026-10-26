import { Job } from "bullmq";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JOB_TYPES, DEFAULT_JOB_OPTIONS, dispatchJob } from "../jobs/index.js";
import type { ClosureNoticePayload } from "../jobs/index.js";
import {
  createClosureNoticeHandler,
  isOnCallList,
  type Deliveries,
  type NoticeOutcome,
} from "./closure-notice.js";
import {
  closureStartsAt,
  createClosureNoticeService,
  URGENT_WINDOW_MS,
} from "./closure-notice-service.js";
import { loadClosureWindow } from "./closure-notice-store.js";

const NOW = new Date("2026-12-24T15:00:00.000Z");
const MINUTE = 60_000;

interface QueuedJob {
  jobType: string;
  payload: ClosureNoticePayload;
  delayMs: number;
  jobId: string;
}

function fakeScheduler() {
  const jobs: QueuedJob[] = [];
  return {
    jobs,
    async schedule(jobType: string, payload: unknown, delayMs: number, jobId?: string) {
      if (jobs.some((j) => j.jobId === jobId)) return jobId!;
      jobs.push({ jobType, payload: payload as ClosureNoticePayload, delayMs, jobId: jobId! });
      return jobId!;
    },
    async cancel() {
      return false;
    },
  };
}

/** A whole-day closure two days after NOW: never urgent. */
const laterClosure = {
  loadClosureWindow: async () => ({ startsOn: "2026-12-26", from: null, timezone: "UTC" }),
};

/**
 * Runs a job through BullMQ's real `Job#validateOptions` with the options
 * `JobScheduler.schedule` sends, without Redis: `Queue.add` calls exactly
 * this before it writes, and throws on an id it will never accept.
 */
class ValidatingJob extends Job {
  validate(): void {
    this.validateOptions(this.asJSON());
  }
}

function validateWithBullmq(jobType: string, payload: unknown, jobId: string): void {
  const queue = { toKey: (k: string) => k, qualifiedName: "bull:test", backend: {} };
  const opts = { ...DEFAULT_JOB_OPTIONS, jobId };
  new ValidatingJob(queue as never, jobType, payload, opts, jobId).validate();
}

const notifiable = (n: number, hoursAhead: number) =>
  Array.from({ length: n }, (_, i) => ({
    outcomeId: `o${i}`,
    startTime: new Date(NOW.getTime() + hoursAhead * 3_600_000),
  }));

describe("closure notice service: enqueue", () => {
  it("enqueues one CLOSURE_NOTICE per notifiable outcome, immediately, with a stable job id", async () => {
    const scheduler = fakeScheduler();
    const service = createClosureNoticeService({
      scheduler: scheduler as never,
      store: { ...laterClosure, listNotifiable: async () => notifiable(3, 30) } as never,
    });
    const count = await service.enqueueForClosure({ venueId: "v1", ruleId: "r1", now: NOW });
    expect(count).toBe(3);
    expect(scheduler.jobs.map((j) => j.jobId)).toEqual([
      "closure-notice_o0",
      "closure-notice_o1",
      "closure-notice_o2",
    ]);
    expect(scheduler.jobs.every((j) => j.jobType === JOB_TYPES.CLOSURE_NOTICE)).toBe(true);
    expect(scheduler.jobs.every((j) => j.delayMs === 0)).toBe(true);
    expect(scheduler.jobs[0]!.payload).toMatchObject({
      outcomeId: "o0",
      venueId: "v1",
      urgent: false,
    });
  });

  it("urgency is the closure's: one starting within 6 hours makes every outcome urgent", async () => {
    // ux.md scenario (b): close tonight from 3 PM (venue time), it is 1 PM now,
    // and the booking is at 9:30 PM — 8.5 h away, but the closure starts in 2 h.
    const now = new Date("2026-12-24T21:00:00.000Z"); // 1:00 PM in Los Angeles
    const scheduler = fakeScheduler();
    const service = createClosureNoticeService({
      scheduler: scheduler as never,
      store: {
        loadClosureWindow: async () => ({
          startsOn: "2026-12-24",
          from: 15 * 60,
          timezone: "America/Los_Angeles",
        }),
        listNotifiable: async () => [
          { outcomeId: "o0", startTime: new Date("2026-12-25T05:30:00.000Z") }, // 9:30 PM
          { outcomeId: "o1", startTime: new Date("2026-12-26T03:00:00.000Z") }, // next day
        ],
      } as never,
    });
    await service.enqueueForClosure({ venueId: "v1", ruleId: "r1", now });
    expect(scheduler.jobs.map((j) => j.payload.urgent)).toEqual([true, true]);
  });

  describe("a repeating closure that started in the past", () => {
    // NOW is Thursday 2026-12-24 15:00 UTC.
    const urgentFor = async (weekdays: number[], from: number | null) => {
      const scheduler = fakeScheduler();
      const service = createClosureNoticeService({
        scheduler: scheduler as never,
        store: {
          loadClosureWindow: async () => ({
            startsOn: "2026-10-01",
            endsOn: null,
            weekdays,
            from,
            timezone: "UTC",
          }),
          listNotifiable: async () => notifiable(1, 30),
        } as never,
      });
      await service.enqueueForClosure({ venueId: "v1", ruleId: "r1", now: NOW });
      return scheduler.jobs[0]!.payload.urgent;
    };

    it("is urgent when its next occurrence is tonight, within 6 hours", async () => {
      expect(await urgentFor([4], 20 * 60)).toBe(true);
    });

    it("is not urgent when its next occurrence is days away", async () => {
      expect(await urgentFor([0], null)).toBe(false); // next Sunday
    });
  });

  it("a closure with no occurrence left is not urgent", async () => {
    const scheduler = fakeScheduler();
    const service = createClosureNoticeService({
      scheduler: scheduler as never,
      store: {
        loadClosureWindow: async () => ({
          startsOn: "2026-10-01",
          endsOn: "2026-12-01",
          weekdays: null,
          from: null,
          timezone: "UTC",
        }),
        listNotifiable: async () => notifiable(1, 30),
      } as never,
    });
    await service.enqueueForReopen({ venueId: "v1", ruleId: "r1", now: NOW });
    expect(scheduler.jobs[0]!.payload.urgent).toBe(false);
  });

  it("a closure starting more than 6 hours out is not urgent, even for a booking within 6 hours", async () => {
    const scheduler = fakeScheduler();
    const service = createClosureNoticeService({
      scheduler: scheduler as never,
      store: {
        ...laterClosure,
        listNotifiable: async () => notifiable(1, URGENT_WINDOW_MS / 3_600_000 / 2),
      } as never,
    });
    await service.enqueueForClosure({ venueId: "v1", ruleId: "r1", now: NOW });
    expect(scheduler.jobs[0]!.payload.urgent).toBe(false);
  });

  it("job ids pass BullMQ's own option validation (no ':' outside its 3-part form)", async () => {
    const scheduler = fakeScheduler();
    const service = createClosureNoticeService({
      scheduler: scheduler as never,
      store: { ...laterClosure, listNotifiable: async () => notifiable(1, 30) } as never,
    });
    await service.enqueueForClosure({ venueId: "v1", ruleId: "r1", now: NOW });
    await service.enqueueForReopen({ venueId: "v1", ruleId: "r1", now: NOW });
    expect(scheduler.jobs).toHaveLength(2);
    for (const job of scheduler.jobs) {
      expect(() => validateWithBullmq(job.jobType, job.payload, job.jobId)).not.toThrow();
    }
    // The check is real: the id shape that shipped first is rejected.
    expect(() => validateWithBullmq(JOB_TYPES.CLOSURE_NOTICE, {}, "closure-notice:o0")).toThrow(
      "Custom Id cannot contain :"
    );
  });

  it("a replayed enqueue adds no duplicate job", async () => {
    const scheduler = fakeScheduler();
    const service = createClosureNoticeService({
      scheduler: scheduler as never,
      store: { ...laterClosure, listNotifiable: async () => notifiable(2, 30) } as never,
    });
    await service.enqueueForClosure({ venueId: "v1", ruleId: "r1", now: NOW });
    await service.enqueueForClosure({ venueId: "v1", ruleId: "r1", now: NOW });
    expect(scheduler.jobs).toHaveLength(2);
  });

  it("reopen notices use their own job id and variant", async () => {
    const scheduler = fakeScheduler();
    const service = createClosureNoticeService({
      scheduler: scheduler as never,
      store: { ...laterClosure, listNotifiable: async () => notifiable(1, 30) } as never,
    });
    await service.enqueueForReopen({ venueId: "v1", ruleId: "r1", now: NOW });
    expect(scheduler.jobs[0]).toMatchObject({
      jobId: "closure-notice_o0_reopened",
      payload: { variant: "reopened", urgent: false },
    });
  });
});

describe("closure start", () => {
  const ruleDb = (row: object | null) => ({ dateRule: { findFirst: async () => row } }) as never;

  it("reads a windowed closure's first date and window start in the venue's zone", async () => {
    const w = await loadClosureWindow(
      "v1",
      "r1",
      ruleDb({
        startsOn: new Date("2026-12-24T00:00:00.000Z"),
        window: { version: 1, from: 900, to: 1440 },
        venue: { ianaTimezone: "America/Los_Angeles" },
      })
    );
    expect(w).toEqual({
      startsOn: "2026-12-24",
      endsOn: null,
      weekdays: null,
      from: 900,
      timezone: "America/Los_Angeles",
    });
    expect(closureStartsAt(w!, NOW)).toEqual(new Date("2026-12-24T23:00:00.000Z")); // 3 PM PST
  });

  it("a whole-day closure starts at the service day's start", async () => {
    const w = await loadClosureWindow(
      "v1",
      "r1",
      ruleDb({
        startsOn: new Date("2026-12-24T00:00:00.000Z"),
        window: null,
        venue: { ianaTimezone: "America/Los_Angeles" },
      })
    );
    expect(w!.from).toBeNull();
    expect(closureStartsAt(w!, NOW)).toEqual(new Date("2026-12-24T08:00:00.000Z"));
  });

  it("an unknown rule has no window", async () => {
    expect(await loadClosureWindow("v1", "r1", ruleDb(null))).toBeNull();
  });
});

/**
 * The acceptance test: every guest the Manager chose to notify has a job, and
 * with the clock advanced every job has delivered inside 2 minutes, retries
 * and all, SMS and email when urgent.
 */
describe("closure notices settle within 2 minutes (time-advanced)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  const outcomeRow = (id: string): NoticeOutcome => ({
    outcomeId: id,
    action: "cancel",
    deliveries: {},
    rebooked: false,
    closureDate: "2026-12-24",
    message: "Closed.",
    startTime: new Date(NOW.getTime() + 2 * 3_600_000),
    partySize: 2,
    guestName: "Guest",
    guestEmail: `${id}@example.com`,
    guestPhone: "+15551112222",
    preference: "email_only",
    refund: null,
    venueName: "Bistro Lune",
    timezone: "UTC",
    venueId: "v1",
    reservationId: `res-${id}`,
  });

  /** A worker honouring the queue's attempts + exponential backoff against the fake clock. */
  async function runJob(
    handlers: Parameters<typeof dispatchJob>[0],
    job: QueuedJob
  ): Promise<void> {
    let data: object = job.payload;
    for (let attempt = 1; attempt <= DEFAULT_JOB_OPTIONS.attempts; attempt++) {
      try {
        await dispatchJob(handlers, {
          name: job.jobType,
          data,
          updateData: async (d) => {
            data = d;
          },
          attemptsMade: attempt - 1,
          opts: { attempts: DEFAULT_JOB_OPTIONS.attempts },
        });
        return;
      } catch {
        await vi.advanceTimersByTimeAsync(DEFAULT_JOB_OPTIONS.backoff.delay * 2 ** (attempt - 1));
      }
    }
  }

  it("delivers every notified guest by SMS and email, surviving one failed send", async () => {
    const store = new Map<string, NoticeOutcome>(
      ["o0", "o1", "o2", "o3"].map((id) => [id, outcomeRow(id)])
    );
    const scheduler = fakeScheduler();
    const service = createClosureNoticeService({
      scheduler: scheduler as never,
      store: {
        loadClosureWindow: async () => ({ startsOn: "2026-12-24", from: 15 * 60, timezone: "UTC" }),
        listNotifiable: async () =>
          [...store.values()].map((o) => ({ outcomeId: o.outcomeId, startTime: o.startTime })),
      } as never,
    });
    await service.enqueueForClosure({ venueId: "v1", ruleId: "r1", now: new Date() });
    expect(scheduler.jobs).toHaveLength(4);

    let emailFailures = 1; // the first email send fails once, then recovers
    const sent: string[] = [];
    const handlers = {
      [JOB_TYPES.CLOSURE_NOTICE]: createClosureNoticeHandler({
        load: async (id) => store.get(id) ?? null,
        offers: async () => [],
        manageUrl: (o) => `https://m.test/${o.outcomeId}`,
        record: async (id: string, deliveries: Deliveries) => {
          store.set(id, { ...store.get(id)!, deliveries });
        },
        sendEmail: async (input) => {
          if (emailFailures-- > 0) throw new Error("resend 503");
          sent.push(`email:${input.to}`);
        },
        sendSms: async (input) => {
          sent.push(`sms:${input.to}`);
        },
        smsEnabled: true,
        logger: { warn: () => undefined },
      }),
    };

    const started = Date.now();
    await Promise.all(scheduler.jobs.map((job) => runJob(handlers, job)));
    expect(Date.now() - started).toBeLessThanOrEqual(2 * MINUTE);

    for (const o of store.values()) {
      expect(o.deliveries).toMatchObject({ email: "sent", sms: "sent" });
    }
    expect(sent.filter((s) => s.startsWith("email:"))).toHaveLength(4);
    expect(sent.filter((s) => s.startsWith("sms:"))).toHaveLength(4);
  });

  it("a guest whose every attempt fails lands on the call list", async () => {
    const o = { ...outcomeRow("o9"), preference: "email_only" as const };
    const store = new Map([["o9", o]]);
    const handlers = {
      [JOB_TYPES.CLOSURE_NOTICE]: createClosureNoticeHandler({
        load: async (id) => store.get(id) ?? null,
        offers: async () => [],
        manageUrl: () => "https://m.test/x",
        record: async (id: string, deliveries: Deliveries) => {
          store.set(id, { ...store.get(id)!, deliveries });
        },
        sendEmail: async () => {
          throw new Error("hard bounce");
        },
        sendSms: async () => undefined,
        smsEnabled: true,
        logger: { warn: () => undefined },
      }),
    };
    await runJob(handlers, {
      jobType: JOB_TYPES.CLOSURE_NOTICE,
      jobId: "closure-notice_o9",
      delayMs: 0,
      payload: { outcomeId: "o9", venueId: "v1" },
    });
    expect(store.get("o9")!.deliveries.email).toBe("failed");
    expect(isOnCallList(store.get("o9")!)).toBe(true);
  });
});
