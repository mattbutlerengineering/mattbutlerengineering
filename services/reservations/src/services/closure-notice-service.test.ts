import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JOB_TYPES, DEFAULT_JOB_OPTIONS, dispatchJob } from "../jobs/index.js";
import type { ClosureNoticePayload } from "../jobs/index.js";
import {
  createClosureNoticeHandler,
  isOnCallList,
  type Deliveries,
  type NoticeOutcome,
} from "./closure-notice.js";
import { createClosureNoticeService, URGENT_WINDOW_MS } from "./closure-notice-service.js";

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
      store: { listNotifiable: async () => notifiable(3, 30) } as never,
    });
    const count = await service.enqueueForClosure({ venueId: "v1", ruleId: "r1", now: NOW });
    expect(count).toBe(3);
    expect(scheduler.jobs.map((j) => j.jobId)).toEqual([
      "closure-notice:o0",
      "closure-notice:o1",
      "closure-notice:o2",
    ]);
    expect(scheduler.jobs.every((j) => j.jobType === JOB_TYPES.CLOSURE_NOTICE)).toBe(true);
    expect(scheduler.jobs.every((j) => j.delayMs === 0)).toBe(true);
    expect(scheduler.jobs[0]!.payload).toMatchObject({
      outcomeId: "o0",
      venueId: "v1",
      urgent: false,
    });
  });

  it("marks a booking within 6 hours urgent", async () => {
    const scheduler = fakeScheduler();
    const service = createClosureNoticeService({
      scheduler: scheduler as never,
      store: { listNotifiable: async () => notifiable(1, URGENT_WINDOW_MS / 3_600_000) } as never,
    });
    await service.enqueueForClosure({ venueId: "v1", ruleId: "r1", now: NOW });
    expect(scheduler.jobs[0]!.payload.urgent).toBe(true);
  });

  it("a replayed enqueue adds no duplicate job", async () => {
    const scheduler = fakeScheduler();
    const service = createClosureNoticeService({
      scheduler: scheduler as never,
      store: { listNotifiable: async () => notifiable(2, 30) } as never,
    });
    await service.enqueueForClosure({ venueId: "v1", ruleId: "r1", now: NOW });
    await service.enqueueForClosure({ venueId: "v1", ruleId: "r1", now: NOW });
    expect(scheduler.jobs).toHaveLength(2);
  });

  it("reopen notices use their own job id and variant", async () => {
    const scheduler = fakeScheduler();
    const service = createClosureNoticeService({
      scheduler: scheduler as never,
      store: { listNotifiable: async () => notifiable(1, 30) } as never,
    });
    await service.enqueueForReopen({ venueId: "v1", ruleId: "r1", now: NOW });
    expect(scheduler.jobs[0]).toMatchObject({
      jobId: "closure-notice:o0:reopened",
      payload: { variant: "reopened", urgent: false },
    });
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
      jobId: "closure-notice:o9",
      delayMs: 0,
      payload: { outcomeId: "o9", venueId: "v1" },
    });
    expect(store.get("o9")!.deliveries.email).toBe("failed");
    expect(isOnCallList(store.get("o9")!)).toBe(true);
  });
});
