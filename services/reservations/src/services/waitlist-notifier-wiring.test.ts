import { describe, it, expect, vi } from "vitest";

const markNotified = vi.fn();
vi.mock("./waitlist.js", () => ({
  waitlistService: {
    expire: vi.fn(),
    listWaiting: vi.fn(),
    markNotified: (...args: unknown[]) => markNotified(...args),
    revertNotified: vi.fn(),
  },
}));

import { createDefaultWaitlistNotifier } from "./waitlist-notifier.js";

describe("createDefaultWaitlistNotifier wiring", () => {
  it("sends a position-update SMS to parties who moved up when a party is marked notified", async () => {
    const sendWaitlistPositionUpdate = vi.fn().mockResolvedValue(undefined);
    const sendWaitlistTableReady = vi.fn().mockResolvedValue(undefined);
    markNotified.mockImplementation(async (_id: string, onImproved: (c: unknown[]) => void) => {
      onImproved([
        {
          id: "b",
          venueId: "venue-1",
          guestPhone: "+2",
          guestName: "B",
          previousPosition: 2,
          newPosition: 1,
          estimatedWaitMinutes: 10,
        },
      ]);
      return { id: "a" };
    });
    const notifier = createDefaultWaitlistNotifier({
      smsAdapter: { sendWaitlistPositionUpdate, sendWaitlistTableReady },
      scheduler: { schedule: vi.fn().mockResolvedValue("job") },
    } as never);

    await notifier.notifyTableReady({
      id: "a",
      guestPhone: "+1",
      guestName: "A",
      venueId: "venue-1",
    });

    expect(sendWaitlistPositionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ guestPhone: "+2", position: 1 })
    );
  });

  it("sends no position-update SMS when scheduling the expiry fails and the party is reverted", async () => {
    const sendWaitlistPositionUpdate = vi.fn().mockResolvedValue(undefined);
    const sendWaitlistTableReady = vi.fn().mockResolvedValue(undefined);
    markNotified.mockImplementation(async (_id: string, onImproved: (c: unknown[]) => void) => {
      onImproved([
        {
          id: "b",
          venueId: "venue-1",
          guestPhone: "+2",
          guestName: "B",
          previousPosition: 2,
          newPosition: 1,
          estimatedWaitMinutes: 10,
        },
      ]);
      return { id: "a" };
    });
    const notifier = createDefaultWaitlistNotifier({
      smsAdapter: { sendWaitlistPositionUpdate, sendWaitlistTableReady },
      scheduler: { schedule: vi.fn().mockRejectedValue(new Error("redis down")) },
    } as never);

    await expect(
      notifier.notifyTableReady({ id: "a", guestPhone: "+1", guestName: "A", venueId: "venue-1" })
    ).rejects.toThrow("redis down");

    expect(sendWaitlistPositionUpdate).not.toHaveBeenCalled();
  });
});
