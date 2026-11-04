import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWaitlistNotifier, validatePhone } from "./waitlist-notifier.js";
import type { WaitlistNotifierDeps } from "./waitlist-notifier.js";
import { JobQueueUnavailableError } from "./notifier-runtime.js";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockSendWaitlistAdded = vi.fn().mockResolvedValue(undefined);
const mockSendWaitlistPositionUpdate = vi.fn().mockResolvedValue(undefined);
const mockSendWaitlistTableReady = vi.fn().mockResolvedValue(undefined);
const mockSchedule = vi.fn().mockResolvedValue("job-123");
const mockExpire = vi.fn().mockResolvedValue(null);
const mockListWaiting = vi.fn().mockResolvedValue([]);
const mockNotifyTableReady = vi.fn().mockResolvedValue(undefined);
const mockMarkNotified = vi.fn().mockResolvedValue({ id: "entry-1", venueId: "venue-1" });
const mockRevertNotified = vi.fn().mockResolvedValue({ id: "entry-1" });

function buildDeps(overrides: Partial<WaitlistNotifierDeps> = {}): WaitlistNotifierDeps {
  return {
    smsAdapter: {
      sendWaitlistAdded: mockSendWaitlistAdded,
      sendWaitlistPositionUpdate: mockSendWaitlistPositionUpdate,
      sendWaitlistTableReady: mockSendWaitlistTableReady,
      sendBookingReminder: vi.fn(),
      sendClosureNotice: vi.fn(),
      sendWaitlistUpdate: vi.fn(),
      sendWinbackMessage: vi.fn(),
    },
    scheduler: {
      schedule: mockSchedule,
    },
    expireEntry: mockExpire,
    listWaiting: mockListWaiting,
    notifyTableReady: mockNotifyTableReady,
    markNotified: mockMarkNotified,
    revertNotified: mockRevertNotified,
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── validatePhone ─────────────────────────────────────────────────────────

describe("validatePhone", () => {
  it("accepts E.164 format", () => {
    expect(validatePhone("+15551234567")).toBe(true);
    expect(validatePhone("+447911123456")).toBe(true);
  });

  it("accepts 10-digit US numbers without country code", () => {
    expect(validatePhone("5551234567")).toBe(true);
    expect(validatePhone("555-123-4567")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(validatePhone("")).toBe(false);
  });

  it("rejects strings with fewer than 7 digits", () => {
    expect(validatePhone("123456")).toBe(false);
  });
});

// ─── notifyAdded ──────────────────────────────────────────────────────────

describe("WaitlistNotifier.notifyAdded", () => {
  it("sends waitlist-added SMS with position and estimated wait", async () => {
    const notifier = createWaitlistNotifier(buildDeps());

    await notifier.notifyAdded({
      id: "entry-1",
      guestPhone: "+15551234567",
      guestName: "Alice",
      position: 3,
      estimatedWaitMinutes: 45,
    });

    expect(mockSendWaitlistAdded).toHaveBeenCalledOnce();
    expect(mockSendWaitlistAdded).toHaveBeenCalledWith({
      guestPhone: "+15551234567",
      guestName: "Alice",
      position: 3,
      estimatedWaitMinutes: 45,
    });
  });

  it("logs but does not throw when SMS send fails", async () => {
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    mockSendWaitlistAdded.mockRejectedValueOnce(new Error("Twilio 429"));
    const notifier = createWaitlistNotifier(buildDeps({ logger }));

    await expect(
      notifier.notifyAdded({
        id: "entry-1",
        guestPhone: "+15551234567",
        guestName: "Alice",
        position: 1,
        estimatedWaitMinutes: 30,
      })
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "waitlist SMS failed: added"
    );
  });

  it("no-ops when smsAdapter is null", async () => {
    const notifier = createWaitlistNotifier(buildDeps({ smsAdapter: null }));

    await expect(
      notifier.notifyAdded({
        id: "entry-1",
        guestPhone: "+15551234567",
        guestName: "Alice",
        position: 1,
        estimatedWaitMinutes: 30,
      })
    ).resolves.toBeUndefined();
  });
});

// ─── notifyPositionUpdate ─────────────────────────────────────────────────

describe("WaitlistNotifier.notifyPositionUpdate", () => {
  it("sends position-update SMS when position improved by several spots", async () => {
    const notifier = createWaitlistNotifier(buildDeps());

    await notifier.notifyPositionUpdate({
      id: "entry-1",
      guestPhone: "+15551234567",
      guestName: "Alice",
      previousPosition: 5,
      newPosition: 3,
      estimatedWaitMinutes: 30,
    });

    expect(mockSendWaitlistPositionUpdate).toHaveBeenCalledOnce();
    expect(mockSendWaitlistPositionUpdate).toHaveBeenCalledWith({
      guestPhone: "+15551234567",
      guestName: "Alice",
      position: 3,
      estimatedWaitMinutes: 30,
    });
  });

  it("sends SMS when position improved by a single spot (a real queue move is always 1)", async () => {
    const notifier = createWaitlistNotifier(buildDeps());

    await notifier.notifyPositionUpdate({
      id: "entry-1",
      guestPhone: "+15551234567",
      guestName: "Alice",
      previousPosition: 4,
      newPosition: 3,
      estimatedWaitMinutes: 30,
    });

    expect(mockSendWaitlistPositionUpdate).toHaveBeenCalledOnce();
  });

  it("does NOT send SMS when position did not improve", async () => {
    const notifier = createWaitlistNotifier(buildDeps());

    await notifier.notifyPositionUpdate({
      id: "entry-1",
      guestPhone: "+15551234567",
      guestName: "Alice",
      previousPosition: 3,
      newPosition: 3,
      estimatedWaitMinutes: 30,
    });

    expect(mockSendWaitlistPositionUpdate).not.toHaveBeenCalled();
  });

  it("logs but does not throw when SMS send fails", async () => {
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    mockSendWaitlistPositionUpdate.mockRejectedValueOnce(new Error("Network error"));
    const notifier = createWaitlistNotifier(buildDeps({ logger }));

    await expect(
      notifier.notifyPositionUpdate({
        id: "entry-1",
        guestPhone: "+15551234567",
        guestName: "Alice",
        previousPosition: 5,
        newPosition: 2,
        estimatedWaitMinutes: 20,
      })
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "waitlist SMS failed: position-update"
    );
  });
});

// ─── notifyTableReady ─────────────────────────────────────────────────────

describe("WaitlistNotifier.notifyTableReady", () => {
  const FIVE_MINUTES_MS = 5 * 60 * 1000;

  it("sends table-ready SMS and schedules 5-minute expiry job carrying venueId", async () => {
    const notifier = createWaitlistNotifier(buildDeps());

    await notifier.notifyTableReady({
      id: "entry-1",
      guestPhone: "+15551234567",
      guestName: "Alice",
      venueId: "venue-1",
    });

    expect(mockSendWaitlistTableReady).toHaveBeenCalledOnce();
    expect(mockSendWaitlistTableReady).toHaveBeenCalledWith({
      guestPhone: "+15551234567",
      guestName: "Alice",
    });

    // ADR-026 §3.3 item 7: venueId travels with the job payload so the
    // WAITLIST_EXPIRY handler can run inside runWithVenueContext(venueId, …).
    expect(mockSchedule).toHaveBeenCalledOnce();
    expect(mockSchedule).toHaveBeenCalledWith(
      "waitlist-expiry",
      { waitlistEntryId: "entry-1", venueId: "venue-1" },
      FIVE_MINUTES_MS,
      "waitlist-expiry:entry-1"
    );
  });

  it("logs but does not throw when SMS send fails, still schedules expiry", async () => {
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    mockSendWaitlistTableReady.mockRejectedValueOnce(new Error("Twilio down"));
    const notifier = createWaitlistNotifier(buildDeps({ logger }));

    await expect(
      notifier.notifyTableReady({
        id: "entry-1",
        guestPhone: "+15551234567",
        guestName: "Alice",
        venueId: "venue-1",
      })
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "waitlist SMS failed: table-ready"
    );
    // expiry job must still be scheduled even if SMS failed
    expect(mockSchedule).toHaveBeenCalledOnce();
  });

  it("no-ops SMS when smsAdapter is null, but still schedules expiry", async () => {
    const notifier = createWaitlistNotifier(buildDeps({ smsAdapter: null }));

    await notifier.notifyTableReady({
      id: "entry-1",
      guestPhone: "+15551234567",
      guestName: "Alice",
      venueId: "venue-1",
    });

    expect(mockSendWaitlistTableReady).not.toHaveBeenCalled();
    expect(mockSchedule).toHaveBeenCalledOnce();
  });
});

// ─── handleExpiry ──────────────────────────────────────────────────────────

describe("WaitlistNotifier.handleExpiry", () => {
  it("expires the entry and notifies next waiting party", async () => {
    mockExpire.mockResolvedValue({
      id: "entry-1",
      venueId: "venue-1",
      status: "expired",
    });
    mockListWaiting.mockResolvedValue([
      {
        id: "entry-2",
        venueId: "venue-1",
        guestPhone: "+15559998888",
        guestName: "Bob",
        position: 1,
        estimatedWaitMinutes: 0,
        status: "waiting",
      },
    ]);

    const notifier = createWaitlistNotifier(buildDeps());

    await notifier.handleExpiry({ waitlistEntryId: "entry-1" });

    expect(mockExpire).toHaveBeenCalledWith("entry-1");
    // venue for the next-guest lookup is derived from the expired entry
    expect(mockListWaiting).toHaveBeenCalledWith("venue-1");
    // venueId passed to notifyTableReady is the expired entry's venue (not
    // the next entry's — see the doc comment on the call site), which is
    // what ends up on the re-notified guest's own WAITLIST_EXPIRY job.
    expect(mockNotifyTableReady).toHaveBeenCalledWith({
      id: "entry-2",
      guestPhone: "+15559998888",
      guestName: "Bob",
      venueId: "venue-1",
    });
  });

  it("does NOT notify next party if no waiting entries remain", async () => {
    mockExpire.mockResolvedValue({
      id: "entry-1",
      venueId: "venue-1",
      status: "expired",
    });
    mockListWaiting.mockResolvedValue([]);

    const notifier = createWaitlistNotifier(buildDeps());

    await notifier.handleExpiry({ waitlistEntryId: "entry-1" });

    expect(mockExpire).toHaveBeenCalledWith("entry-1");
    expect(mockNotifyTableReady).not.toHaveBeenCalled();
  });

  it("does nothing when entry not found (already expired)", async () => {
    mockExpire.mockResolvedValue(null);

    const notifier = createWaitlistNotifier(buildDeps());

    await notifier.handleExpiry({ waitlistEntryId: "entry-1" });

    expect(mockNotifyTableReady).not.toHaveBeenCalled();
  });
});

// ─── notified-state lifecycle (#6492) ─────────────────────────────────────

describe("WaitlistNotifier.notifyTableReady records notified state", () => {
  const input = { id: "entry-1", guestPhone: "+15551234567", guestName: "Ann", venueId: "venue-1" };

  it("marks the row notified before texting and scheduling expiry", async () => {
    const notifier = createWaitlistNotifier(buildDeps());
    await notifier.notifyTableReady(input);
    expect(mockMarkNotified).toHaveBeenCalledWith("entry-1");
    expect(mockSendWaitlistTableReady).toHaveBeenCalledOnce();
    expect(mockSchedule).toHaveBeenCalledOnce();
  });

  it("sends no SMS and schedules no expiry when the party is no longer waiting", async () => {
    mockMarkNotified.mockResolvedValueOnce(null);
    const notifier = createWaitlistNotifier(buildDeps());
    await notifier.notifyTableReady(input);
    expect(mockSendWaitlistTableReady).not.toHaveBeenCalled();
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("reverts the row to waiting and rethrows when scheduling the expiry fails", async () => {
    mockSchedule.mockRejectedValueOnce(new Error("redis down"));
    const notifier = createWaitlistNotifier(buildDeps());
    await expect(notifier.notifyTableReady(input)).rejects.toThrow("redis down");
    expect(mockRevertNotified).toHaveBeenCalledWith("entry-1");
  });

  // #8257 (Sentry RESERVATIONS-API-G): production has no Redis, so the expiry
  // job cannot be queued. Notifying must still succeed: the row stays notified
  // (its expiresAt is the claim deadline), the guest is texted, the parties
  // behind move up, and only the delayed expiry job is skipped.
  it("keeps the party notified and texts it when the job queue is unavailable (#8257)", async () => {
    mockSchedule.mockRejectedValueOnce(new JobQueueUnavailableError());
    mockMarkNotified.mockResolvedValueOnce({
      id: "entry-1",
      positionChanges: [
        {
          id: "entry-2",
          guestPhone: "+15550000002",
          guestName: "Bob",
          previousPosition: 2,
          newPosition: 1,
          estimatedWaitMinutes: null,
        },
      ],
    });
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const notifier = createWaitlistNotifier(buildDeps({ logger }));

    await expect(notifier.notifyTableReady(input)).resolves.toBeUndefined();

    expect(mockRevertNotified).not.toHaveBeenCalled();
    expect(mockSendWaitlistTableReady).toHaveBeenCalledOnce();
    expect(mockSendWaitlistPositionUpdate).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ waitlistEntryId: "entry-1" }),
      expect.stringContaining("expiry job not scheduled")
    );
  });

  it("does not revert when scheduling succeeds", async () => {
    const notifier = createWaitlistNotifier(buildDeps());
    await notifier.notifyTableReady(input);
    expect(mockRevertNotified).not.toHaveBeenCalled();
  });

  it("expiry after the party was seated texts nobody (expireEntry no-ops)", async () => {
    mockExpire.mockResolvedValue(null);
    mockListWaiting.mockResolvedValue([
      { id: "entry-2", venueId: "venue-1", guestPhone: "+1555", guestName: "Bob" },
    ]);
    const notifier = createWaitlistNotifier(buildDeps());
    await notifier.handleExpiry({ waitlistEntryId: "entry-1" });
    expect(mockListWaiting).not.toHaveBeenCalled();
    expect(mockNotifyTableReady).not.toHaveBeenCalled();
  });
});
