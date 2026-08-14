import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type * as Jobs from "@mbe/jobs";

// ─── Mocks ──────────────────────────────────────────────────────────────────
// Replace the real JobScheduler with a fake so no Redis connection is opened.
// The ctor spy lets us prove construction is deferred until first use, and the
// schedule/cancel spies let us assert the typed payload survives the seam.

const scheduleSpy = vi.fn().mockResolvedValue("job-1");
const cancelSpy = vi.fn().mockResolvedValue(undefined);
const jobSchedulerCtor = vi.fn();

vi.mock("@mbe/jobs", async (importOriginal) => {
  const actual = await importOriginal<typeof Jobs>();
  class FakeJobScheduler {
    schedule = scheduleSpy;
    cancel = cancelSpy;
    constructor(config: { redisUrl: string }) {
      jobSchedulerCtor(config);
    }
  }
  return { ...actual, JobScheduler: FakeJobScheduler };
});

import { createNotifierRuntime } from "./notifier-runtime.js";
import { JOB_TYPES } from "@mbe/jobs";
import type { ReminderPayload } from "@mbe/jobs";

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
  delete process.env.REDIS_URL;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_FROM_NUMBER;
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("createNotifierRuntime", () => {
  it("is side-effect-free: constructing the runtime does NOT open the scheduler's Redis connection", () => {
    const runtime = createNotifierRuntime();
    expect(jobSchedulerCtor).not.toHaveBeenCalled();
    // Merely holding a reference to the scheduler is not a use.
    expect(runtime.scheduler).toBeDefined();
    expect(jobSchedulerCtor).not.toHaveBeenCalled();
  });

  it("lazily constructs exactly one JobScheduler on first use and reuses it", async () => {
    const runtime = createNotifierRuntime();

    await runtime.scheduler.schedule(
      JOB_TYPES.WAITLIST_EXPIRY,
      { waitlistEntryId: "e1" },
      1000,
      "j1"
    );
    await runtime.scheduler.cancel("j1");

    expect(jobSchedulerCtor).toHaveBeenCalledOnce();
  });

  it("forwards schedule() with the exact typed payload, delay and jobId", async () => {
    const runtime = createNotifierRuntime();
    const payload: ReminderPayload = {
      reservationId: "r1",
      venueId: "v1",
    };

    await runtime.scheduler.schedule(
      JOB_TYPES.BOOKING_REMINDER,
      payload,
      5000,
      "booking-reminder:r1"
    );

    expect(scheduleSpy).toHaveBeenCalledWith(
      JOB_TYPES.BOOKING_REMINDER,
      payload,
      5000,
      "booking-reminder:r1"
    );
  });

  it("forwards cancel() to the underlying scheduler", async () => {
    const runtime = createNotifierRuntime();

    await runtime.scheduler.cancel("booking-reminder:r9");

    expect(cancelSpy).toHaveBeenCalledWith("booking-reminder:r9");
  });

  it("reads REDIS_URL from env and passes it to the scheduler", async () => {
    process.env.REDIS_URL = "redis://custom:6380";
    const runtime = createNotifierRuntime();

    expect(runtime.redisUrl).toBe("redis://custom:6380");

    await runtime.scheduler.schedule(JOB_TYPES.WAITLIST_EXPIRY, { waitlistEntryId: "e1" }, 1, "j");
    expect(jobSchedulerCtor).toHaveBeenCalledWith({ redisUrl: "redis://custom:6380" });
  });

  it("defaults REDIS_URL to redis://localhost:6379 when unset", () => {
    const runtime = createNotifierRuntime();
    expect(runtime.redisUrl).toBe("redis://localhost:6379");
  });

  it("smsAdapter is null when Twilio env vars are absent", () => {
    const runtime = createNotifierRuntime();
    expect(runtime.smsAdapter).toBeNull();
  });

  describe("production REDIS_URL guard (#4172)", () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
      errorSpy.mockRestore();
    });

    it("does NOT fall back to redis://localhost:6379 when NODE_ENV=production and REDIS_URL is unset", () => {
      process.env.NODE_ENV = "production";

      const runtime = createNotifierRuntime();

      expect(runtime.redisUrl).toBeNull();
    });

    it("logs an error-level message naming REDIS_URL when NODE_ENV=production and REDIS_URL is unset", () => {
      process.env.NODE_ENV = "production";

      createNotifierRuntime();

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("REDIS_URL"));
    });

    it("does NOT open a Redis connection when scheduling in production with REDIS_URL unset", async () => {
      process.env.NODE_ENV = "production";
      const runtime = createNotifierRuntime();

      await expect(
        runtime.scheduler.schedule(JOB_TYPES.WAITLIST_EXPIRY, { waitlistEntryId: "e1" }, 1, "j")
      ).rejects.toThrow(/REDIS_URL/);
      expect(jobSchedulerCtor).not.toHaveBeenCalled();
    });

    it("uses the provided REDIS_URL unchanged when NODE_ENV=production and REDIS_URL is set", async () => {
      process.env.NODE_ENV = "production";
      process.env.REDIS_URL = "redis://prod-host:6379";

      const runtime = createNotifierRuntime();

      expect(runtime.redisUrl).toBe("redis://prod-host:6379");
      expect(errorSpy).not.toHaveBeenCalled();

      await runtime.scheduler.schedule(
        JOB_TYPES.WAITLIST_EXPIRY,
        { waitlistEntryId: "e1" },
        1,
        "j"
      );
      expect(jobSchedulerCtor).toHaveBeenCalledWith({ redisUrl: "redis://prod-host:6379" });
    });

    it("defaults REDIS_URL to redis://localhost:6379 unchanged when NODE_ENV=development and REDIS_URL is unset", () => {
      process.env.NODE_ENV = "development";

      const runtime = createNotifierRuntime();

      expect(runtime.redisUrl).toBe("redis://localhost:6379");
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("defaults REDIS_URL to redis://localhost:6379 unchanged when NODE_ENV=test and REDIS_URL is unset", () => {
      process.env.NODE_ENV = "test";

      const runtime = createNotifierRuntime();

      expect(runtime.redisUrl).toBe("redis://localhost:6379");
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });
});
