import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./database.js", () => ({
  prisma: {
    guest: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("./events.js", () => ({
  emitLapsingGuests: vi.fn(),
}));

import { runLapsedGuestScan } from "./lapsed-guest-scan.js";
import { prisma } from "./database.js";
import { emitLapsingGuests } from "./events.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * DAY_MS);
}

function makeGuest(overrides: Record<string, unknown> = {}) {
  return {
    id: "guest-1",
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "+15551234567",
    communicationPreference: "both",
    reservations: [],
    ...overrides,
  };
}

describe("runLapsedGuestScan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array and does not emit when no guests are lapsing", async () => {
    // Weekly guest visited 6 days ago — not lapsing
    vi.mocked(prisma.guest.findMany).mockResolvedValueOnce([
      makeGuest({
        reservations: [
          { startTime: daysAgo(20) },
          { startTime: daysAgo(13) },
          { startTime: daysAgo(6) },
        ],
      }),
    ] as never);

    const result = await runLapsedGuestScan("venue-1");
    expect(result).toHaveLength(0);
    expect(emitLapsingGuests).not.toHaveBeenCalled();
  });

  it("detects lapsing guest and emits SSE event", async () => {
    // Weekly guest last visited 21 days ago — lapsing (21 > 7*2=14)
    vi.mocked(prisma.guest.findMany).mockResolvedValueOnce([
      makeGuest({
        reservations: [
          { startTime: daysAgo(35) },
          { startTime: daysAgo(28) },
          { startTime: daysAgo(21) },
        ],
      }),
    ] as never);

    const result = await runLapsedGuestScan("venue-1");
    expect(result).toHaveLength(1);
    expect(result[0].guestId).toBe("guest-1");
    expect(result[0].name).toBe("Jane Doe");
    expect(result[0].daysOverdue).toBeGreaterThan(0);
    expect(emitLapsingGuests).toHaveBeenCalledWith("venue-1", result);
  });

  it("skips guests with transactional_only communication preference for winback but still lists them", async () => {
    // The scan itself lists all lapsing guests; winback skip is at send-time
    vi.mocked(prisma.guest.findMany).mockResolvedValueOnce([
      makeGuest({
        communicationPreference: "transactional_only",
        reservations: [
          { startTime: daysAgo(35) },
          { startTime: daysAgo(28) },
          { startTime: daysAgo(21) },
        ],
      }),
    ] as never);

    const result = await runLapsedGuestScan("venue-1");
    expect(result).toHaveLength(1);
    expect(result[0].communicationPreference).toBe("transactional_only");
  });

  it("handles multiple guests with mixed lapse status", async () => {
    vi.mocked(prisma.guest.findMany).mockResolvedValueOnce([
      makeGuest({
        id: "guest-1",
        // Lapsing: last visit 21 days ago, weekly freq
        reservations: [
          { startTime: daysAgo(35) },
          { startTime: daysAgo(28) },
          { startTime: daysAgo(21) },
        ],
      }),
      makeGuest({
        id: "guest-2",
        // Not lapsing: last visit 6 days ago, weekly freq
        reservations: [
          { startTime: daysAgo(20) },
          { startTime: daysAgo(13) },
          { startTime: daysAgo(6) },
        ],
      }),
    ] as never);

    const result = await runLapsedGuestScan("venue-1");
    expect(result).toHaveLength(1);
    expect(result[0].guestId).toBe("guest-1");
  });
});
