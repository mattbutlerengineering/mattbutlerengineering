import { describe, it, expect, vi } from "vitest";
import { runLapsedGuestScan } from "./lapsed-guest-scan.js";

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
    reservations: [] as { startTime: Date }[],
    ...overrides,
  };
}

function makeDeps(guests: ReturnType<typeof makeGuest>[] = []) {
  return {
    findGuestsForScan: vi.fn().mockResolvedValue(guests),
    emitLapsingGuests: vi.fn(),
  };
}

describe("runLapsedGuestScan", () => {
  it("returns empty array and does not emit when no guests are lapsing", async () => {
    const deps = makeDeps([
      makeGuest({
        reservations: [
          { startTime: daysAgo(20) },
          { startTime: daysAgo(13) },
          { startTime: daysAgo(6) },
        ],
      }),
    ]);

    const result = await runLapsedGuestScan("venue-1", deps);
    expect(result).toHaveLength(0);
    expect(deps.emitLapsingGuests).not.toHaveBeenCalled();
  });

  it("detects lapsing guest and emits SSE event", async () => {
    const deps = makeDeps([
      makeGuest({
        reservations: [
          { startTime: daysAgo(35) },
          { startTime: daysAgo(28) },
          { startTime: daysAgo(21) },
        ],
      }),
    ]);

    const result = await runLapsedGuestScan("venue-1", deps);
    expect(result).toHaveLength(1);
    expect(result[0].guestId).toBe("guest-1");
    expect(result[0].name).toBe("Jane Doe");
    expect(result[0].daysOverdue).toBeGreaterThan(0);
    expect(deps.emitLapsingGuests).toHaveBeenCalledWith("venue-1", result);
  });

  it("skips guests with transactional_only communication preference for winback but still lists them", async () => {
    const deps = makeDeps([
      makeGuest({
        communicationPreference: "transactional_only",
        reservations: [
          { startTime: daysAgo(35) },
          { startTime: daysAgo(28) },
          { startTime: daysAgo(21) },
        ],
      }),
    ]);

    const result = await runLapsedGuestScan("venue-1", deps);
    expect(result).toHaveLength(1);
    expect(result[0].communicationPreference).toBe("transactional_only");
  });

  it("handles multiple guests with mixed lapse status", async () => {
    const deps = makeDeps([
      makeGuest({
        id: "guest-1",
        reservations: [
          { startTime: daysAgo(35) },
          { startTime: daysAgo(28) },
          { startTime: daysAgo(21) },
        ],
      }),
      makeGuest({
        id: "guest-2",
        reservations: [
          { startTime: daysAgo(20) },
          { startTime: daysAgo(13) },
          { startTime: daysAgo(6) },
        ],
      }),
    ]);

    const result = await runLapsedGuestScan("venue-1", deps);
    expect(result).toHaveLength(1);
    expect(result[0].guestId).toBe("guest-1");
  });
});
