import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: {
      table: { findMany: vi.fn() },
      reservation: { findMany: vi.fn() },
      waitlistEntry: { findMany: vi.fn() },
      reservationEvent: { findMany: vi.fn() },
    },
  });
});

vi.mock("./availability-config.js", () => ({ loadConfigState: vi.fn() }));
vi.mock("@mbe/availability", () => ({ currentServiceDate: vi.fn() }));

import { currentServiceDate } from "@mbe/availability";
import { loadConfigState } from "./availability-config.js";
import { autopilotProposalsService } from "./autopilot-proposals.js";
import { prisma } from "./database.js";

const NOW = new Date("2026-06-19T01:00:00Z");

const table = (id: string, name: string, capacity: number) => ({
  id,
  name,
  capacity,
  minCovers: 1,
  maxCovers: null,
  isActive: true,
  status: "AVAILABLE" as const,
});

describe("autopilotProposalsService.getProposals", () => {
  beforeEach(() => {
    vi.mocked(prisma.table.findMany).mockResolvedValue([
      table("t2", "Two-top", 2),
      table("t6", "Booth", 6),
    ] as never);
    vi.mocked(prisma.reservation.findMany).mockResolvedValue([
      {
        id: "r1",
        status: "CONFIRMED",
        tableId: "t6",
        partySize: 2,
        startTime: new Date("2026-06-19T02:00:00Z"),
        endTime: new Date("2026-06-19T03:30:00Z"),
        guestName: "Ana",
      },
    ] as never);
    vi.mocked(prisma.waitlistEntry.findMany).mockResolvedValue([
      {
        id: "w1",
        status: "waiting",
        partySize: 5,
        guestName: "Kim",
        createdAt: new Date("2026-06-19T00:30:00Z"),
      },
    ] as never);
    vi.mocked(prisma.reservationEvent.findMany).mockResolvedValue([] as never);
  });

  it("proposes moving a small booked party off the big table for a waiting party", async () => {
    const result = await autopilotProposalsService.getProposals({
      venueId: "v1",
      date: "2026-06-19",
      now: NOW,
    });

    expect(result.date).toBe("2026-06-19");
    expect(result.moves).toHaveLength(1);
    expect(result.moves[0]).toMatchObject({
      kind: "reseat",
      partyLabel: "Ana",
      partySize: 2,
      fromTableId: "t6",
      fromTableName: "Booth",
      toTableId: "t2",
      toTableName: "Two-top",
      startTime: "2026-06-19T02:00:00.000Z",
      endTime: "2026-06-19T03:30:00.000Z",
    });
    expect(result.moves[0]?.reason).toContain("Kim");
  });

  it("reads parties the host stand marked arrived from the reservation history", async () => {
    await autopilotProposalsService.getProposals({ venueId: "v1", date: "2026-06-19", now: NOW });

    expect(prisma.reservationEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ venueId: "v1", kind: "guest_signal" }),
      })
    );
  });

  it("returns no moves when nobody is waiting", async () => {
    vi.mocked(prisma.waitlistEntry.findMany).mockResolvedValue([] as never);
    const result = await autopilotProposalsService.getProposals({
      venueId: "v1",
      date: "2026-06-19",
      now: NOW,
    });
    expect(result.moves).toEqual([]);
  });

  it("sends null, not an invented label, for a booking with no guest name", async () => {
    vi.mocked(prisma.reservation.findMany).mockResolvedValue([
      {
        id: "r1",
        status: "CONFIRMED",
        tableId: "t6",
        partySize: 2,
        startTime: new Date("2026-06-19T02:00:00Z"),
        endTime: new Date("2026-06-19T03:30:00Z"),
        guestName: null,
      },
    ] as never);
    const result = await autopilotProposalsService.getProposals({
      venueId: "v1",
      date: "2026-06-19",
      now: NOW,
    });
    expect(result.moves[0]).toMatchObject({ kind: "reseat", partyLabel: null });
  });

  describe("service date", () => {
    it("uses the date it is given, without reading the venue's hours", async () => {
      await autopilotProposalsService.getProposals({ venueId: "v1", date: "2026-06-19", now: NOW });
      expect(loadConfigState).not.toHaveBeenCalled();
      expect(prisma.reservation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { venueId: "v1", date: new Date("2026-06-19T00:00:00.000Z") },
        })
      );
    });

    it("defaults to the service date, still Friday after midnight, not the calendar day", async () => {
      // 08:00Z on Jun 20 is 01:00 Saturday in Los Angeles; Friday's service is still open.
      const afterMidnight = new Date("2026-06-20T08:00:00Z");
      vi.mocked(loadConfigState).mockResolvedValue({
        timezone: "America/Los_Angeles",
        effective: { schedules: [] },
      } as never);
      vi.mocked(currentServiceDate).mockReturnValue("2026-06-19");

      const result = await autopilotProposalsService.getProposals({
        venueId: "v1",
        now: afterMidnight,
      });

      expect(currentServiceDate).toHaveBeenCalledWith(
        { timezone: "America/Los_Angeles", config: { schedules: [] } },
        afterMidnight
      );
      expect(result.date).toBe("2026-06-19");
      expect(prisma.reservation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { venueId: "v1", date: new Date("2026-06-19T00:00:00.000Z") },
        })
      );
    });
  });

  it("proposes seating a waiting party at a free table, placed from now", async () => {
    vi.mocked(prisma.reservation.findMany).mockResolvedValue([] as never);
    const result = await autopilotProposalsService.getProposals({
      venueId: "v1",
      date: "2026-06-19",
      now: NOW,
    });
    expect(result.moves[0]).toMatchObject({
      kind: "waitlist_offer",
      partyLabel: "Kim",
      fromTableId: null,
      toTableId: "t6",
      startTime: NOW.toISOString(),
    });
  });
});
