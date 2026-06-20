import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWaitlistNotifier, validatePhone } from "./waitlist-notifier.js";
import type { WaitlistNotifierDeps } from "./waitlist-notifier.js";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockSendWaitlistAdded = vi.fn().mockResolvedValue(undefined);
const mockSendWaitlistPositionUpdate = vi.fn().mockResolvedValue(undefined);
const mockSendWaitlistTableReady = vi.fn().mockResolvedValue(undefined);
const mockSchedule = vi.fn().mockResolvedValue("job-123");
const mockExpire = vi.fn().mockResolvedValue(null);
const mockListWaiting = vi.fn().mockResolvedValue([]);
const mockNotifyTableReady = vi.fn().mockResolvedValue(undefined);

function buildDeps(overrides: Partial<WaitlistNotifierDeps> = {}): WaitlistNotifierDeps {
  return {
    smsAdapter: {
      sendWaitlistAdded: mockSendWaitlistAdded,
      sendWaitlistPositionUpdate: mockSendWaitlistPositionUpdate,
      sendWaitlistTableReady: mockSendWaitlistTableReady,
      sendBookingReminder: vi.fn(),
      sendWaitlistUpdate: vi.fn(),
      sendWinbackMessage: vi.fn(),
    },
    scheduler: {
      schedule: mockSchedule,
    },
    expireEntry: mockExpire,
    listWaiting: mockListWaiting,
    notifyTableReady: mockNotifyTableReady,
    logger: { error: vi.fn(), info: vi.fn() },
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
    const logger = { error: vi.fn(), info: vi.fn() };
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
  it("sends position-update SMS when position improved by >= 2 spots", async () => {
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

  it("does NOT send SMS when position improved by only 1 spot", async () => {
    const notifier = createWaitlistNotifier(buildDeps());

    await notifier.notifyPositionUpdate({
      id: "entry-1",
      guestPhone: "+15551234567",
      guestName: "Alice",
      previousPosition: 4,
      newPosition: 3,
      estimatedWaitMinutes: 30,
    });

    expect(mockSendWaitlistPositionUpdate).not.toHaveBeenCalled();
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
    const logger = { error: vi.fn(), info: vi.fn() };
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

  it("sends table-ready SMS and schedules 5-minute expiry job", async () => {
    const notifier = createWaitlistNotifier(buildDeps());

    await notifier.notifyTableReady({
      id: "entry-1",
      guestPhone: "+15551234567",
      guestName: "Alice",
    });

    expect(mockSendWaitlistTableReady).toHaveBeenCalledOnce();
    expect(mockSendWaitlistTableReady).toHaveBeenCalledWith({
      guestPhone: "+15551234567",
      guestName: "Alice",
    });

    expect(mockSchedule).toHaveBeenCalledOnce();
    expect(mockSchedule).toHaveBeenCalledWith(
      "waitlist-expiry",
      { waitlistEntryId: "entry-1" },
      FIVE_MINUTES_MS,
      "waitlist-expiry:entry-1"
    );
  });

  it("logs but does not throw when SMS send fails, still schedules expiry", async () => {
    const logger = { error: vi.fn(), info: vi.fn() };
    mockSendWaitlistTableReady.mockRejectedValueOnce(new Error("Twilio down"));
    const notifier = createWaitlistNotifier(buildDeps({ logger }));

    await expect(
      notifier.notifyTableReady({
        id: "entry-1",
        guestPhone: "+15551234567",
        guestName: "Alice",
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

    await notifier.handleExpiry({
      waitlistEntryId: "entry-1",
      venueId: "venue-1",
    });

    expect(mockExpire).toHaveBeenCalledWith("entry-1");
    expect(mockNotifyTableReady).toHaveBeenCalledWith({
      id: "entry-2",
      guestPhone: "+15559998888",
      guestName: "Bob",
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

    await notifier.handleExpiry({
      waitlistEntryId: "entry-1",
      venueId: "venue-1",
    });

    expect(mockExpire).toHaveBeenCalledWith("entry-1");
    expect(mockNotifyTableReady).not.toHaveBeenCalled();
  });

  it("does nothing when entry not found (already expired)", async () => {
    mockExpire.mockResolvedValue(null);

    const notifier = createWaitlistNotifier(buildDeps());

    await notifier.handleExpiry({
      waitlistEntryId: "entry-1",
      venueId: "venue-1",
    });

    expect(mockNotifyTableReady).not.toHaveBeenCalled();
  });
});
