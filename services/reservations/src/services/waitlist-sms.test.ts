import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildAddedSms,
  buildPositionUpdateSms,
  buildTableReadySms,
  estimateWaitMinutes,
  sendWaitlistSms,
  scheduleClaimWindow,
} from "./waitlist-sms.js";
import type { SmsPort } from "@mbe/notifications";

vi.mock("./waitlist.js", () => ({
  waitlistService: {
    getById: vi.fn(),
    getNext: vi.fn(),
    updateStatus: vi.fn(),
  },
}));

import { waitlistService } from "./waitlist.js";

const mockLogger = {
  error: vi.fn(),
};

describe("waitlist SMS helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildAddedSms", () => {
    it("includes position and wait time", () => {
      const msg = buildAddedSms(3, 30);
      expect(msg).toContain("#3");
      expect(msg).toContain("30 min");
      expect(msg).toContain("We'll text when your table is ready");
    });
  });

  describe("buildPositionUpdateSms", () => {
    it("includes updated position and wait time", () => {
      const msg = buildPositionUpdateSms(1, 10);
      expect(msg).toContain("#1");
      expect(msg).toContain("10 min");
      expect(msg).toContain("Update:");
    });
  });

  describe("buildTableReadySms", () => {
    it("contains ready message and 5 minute window", () => {
      const msg = buildTableReadySms();
      expect(msg).toContain("table is ready");
      expect(msg).toContain("5 minutes");
    });
  });

  describe("estimateWaitMinutes", () => {
    it("returns 0 for position 1", () => {
      expect(estimateWaitMinutes(1)).toBe(0);
    });

    it("returns 15 per position above 1", () => {
      expect(estimateWaitMinutes(3)).toBe(30);
    });
  });

  describe("sendWaitlistSms", () => {
    it("calls sms.sendSms with correct args", async () => {
      const sms: SmsPort = { sendSms: vi.fn().mockResolvedValue(undefined) };
      await sendWaitlistSms(sms, "+15555550100", "hello", mockLogger);
      expect(sms.sendSms).toHaveBeenCalledWith("+15555550100", "hello");
    });

    it("logs error and does not throw on SMS failure", async () => {
      const sms: SmsPort = {
        sendSms: vi.fn().mockRejectedValue(new Error("Twilio down")),
      };
      await expect(sendWaitlistSms(sms, "+15555550100", "hi", mockLogger)).resolves.toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalledWith(
        "SMS send failed (non-blocking)",
        expect.any(Error)
      );
    });
  });

  describe("scheduleClaimWindow", () => {
    it("schedules a timer (does not throw)", () => {
      vi.useFakeTimers();
      const sms: SmsPort = { sendSms: vi.fn().mockResolvedValue(undefined) };
      expect(() => scheduleClaimWindow("entry-1", sms, mockLogger)).not.toThrow();
      vi.useRealTimers();
    });

    it("expires entry and notifies next party after 5 min", async () => {
      vi.useFakeTimers();
      const sms: SmsPort = { sendSms: vi.fn().mockResolvedValue(undefined) };

      vi.mocked(waitlistService.getById).mockResolvedValue({
        id: "entry-1",
        venueId: "venue-1",
        guestName: "Alice",
        guestPhone: "+15555550001",
        partySize: 2,
        status: "NOTIFIED",
        position: 1,
        notifyJobId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      vi.mocked(waitlistService.updateStatus).mockResolvedValue({
        id: "entry-1",
        venueId: "venue-1",
        guestName: "Alice",
        guestPhone: "+15555550001",
        partySize: 2,
        status: "EXPIRED",
        position: 1,
        notifyJobId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      vi.mocked(waitlistService.getNext).mockResolvedValue({
        id: "entry-2",
        venueId: "venue-1",
        guestName: "Bob",
        guestPhone: "+15555550002",
        partySize: 3,
        status: "WAITING",
        position: 1,
        notifyJobId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      scheduleClaimWindow("entry-1", sms, mockLogger);
      // runOnlyPendingTimersAsync fires only the currently-scheduled timer (the 5-min
      // claim window for entry-1) without chasing newly-registered timers for entry-2.
      await vi.runOnlyPendingTimersAsync();

      expect(waitlistService.getById).toHaveBeenCalledWith("entry-1");
      expect(waitlistService.updateStatus).toHaveBeenCalledWith("entry-1", "EXPIRED");
      expect(sms.sendSms).toHaveBeenCalledWith("+15555550002", buildTableReadySms());
      expect(waitlistService.updateStatus).toHaveBeenCalledWith("entry-2", "NOTIFIED");

      vi.useRealTimers();
    });

    it("does not notify next party when no next entry exists", async () => {
      vi.useFakeTimers();
      const sms: SmsPort = { sendSms: vi.fn().mockResolvedValue(undefined) };

      vi.mocked(waitlistService.getById).mockResolvedValue({
        id: "entry-1",
        venueId: "venue-1",
        guestName: "Alice",
        guestPhone: "+15555550001",
        partySize: 2,
        status: "NOTIFIED",
        position: 1,
        notifyJobId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      vi.mocked(waitlistService.updateStatus).mockResolvedValue({
        id: "entry-1",
        venueId: "venue-1",
        guestName: "Alice",
        guestPhone: "+15555550001",
        partySize: 2,
        status: "EXPIRED",
        position: 1,
        notifyJobId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      vi.mocked(waitlistService.getNext).mockResolvedValue(null);

      scheduleClaimWindow("entry-1", sms, mockLogger);
      await vi.runAllTimersAsync();

      expect(sms.sendSms).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});
