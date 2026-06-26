import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: {
      reservation: {
        findMany: vi.fn(),
      },
    },
  });
});

import { briefingService } from "./briefing.js";
import { prisma } from "./database.js";

const NOW = new Date("2026-05-01T12:00:00Z");
const TARGET_DATE = "2026-05-15";
const TARGET_DATE_OBJ = new Date(TARGET_DATE);
const START_TIME = new Date("2026-05-15T19:00:00Z");
const END_TIME = new Date("2026-05-15T20:30:00Z");
const LAST_VISIT = new Date("2026-04-15T19:00:00Z");

function makePrismaReservation(overrides: Record<string, unknown> = {}) {
  return {
    id: "res-1",
    venueId: "venue-1",
    tableId: "table-1",
    guestId: "guest-1",
    guestName: "John Doe",
    guestPhone: "+15551234567",
    guestEmail: "john@example.com",
    userId: "user-1",
    date: TARGET_DATE_OBJ,
    startTime: START_TIME,
    endTime: END_TIME,
    partySize: 4,
    status: "CONFIRMED",
    notes: "Window seating preferred",
    occasion: null,
    seatingPreference: "window",
    cancellationReason: null,
    cancellationNote: null,
    createdAt: NOW,
    updatedAt: NOW,
    table: {
      id: "table-1",
      name: "Table 1",
      tableNumber: "1",
      capacity: 6,
      minCovers: 2,
      maxCovers: 6,
      location: "main dining",
      isActive: true,
      priority: 1,
      floorPlanId: "floor-1",
      shapeMetadata: null,
      status: "AVAILABLE",
      venueId: "venue-1",
      createdAt: NOW,
      updatedAt: NOW,
    },
    guest: null,
    ...overrides,
  };
}

function makePrismaGuest(overrides: Record<string, unknown> = {}) {
  return {
    id: "guest-1",
    venueId: "venue-1",
    email: "guest@example.com",
    phone: "+15551234567",
    name: "Jane Doe",
    notes: "Prefers booth seating",
    visitCount: 3,
    lastVisit: LAST_VISIT,
    tags: null,
    dietaryRestrictions: null,
    communicationPreference: "both",
    staffNotes: [],
    ...overrides,
  };
}

describe("briefingService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getBriefing", () => {
    it("returns correctly structured briefing for a date with reservations", async () => {
      const guestData = makePrismaGuest({
        name: "Jane Doe",
        visitCount: 5,
        lastVisit: LAST_VISIT,
        tags: ["regular"],
        dietaryRestrictions: ["gluten-free"],
      });

      const reservation = makePrismaReservation({
        id: "res-1",
        guestName: "Jane Doe",
        partySize: 4,
        occasion: "date_night",
        guest: guestData,
      });

      vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([reservation] as never);

      const result = await briefingService.getBriefing({
        date: TARGET_DATE,
        venueId: "venue-1",
      });

      expect(result).toHaveLength(1);
      const entry = result[0];

      expect(entry.id).toBe("res-1");
      expect(entry.guestName).toBe("Jane Doe");
      expect(entry.partySize).toBe(4);
      expect(entry.date).toBe(TARGET_DATE_OBJ.toISOString());
      expect(entry.startTime).toBe(START_TIME.toISOString());
      expect(entry.endTime).toBe(END_TIME.toISOString());
      expect(entry.status).toBe("CONFIRMED");
      expect(entry.occasion).toBe("date_night");
      expect(entry.seatingPreference).toBe("window");

      expect(entry.guest).not.toBeNull();
      expect(entry.guest!.id).toBe("guest-1");
      expect(entry.guest!.name).toBe("Jane Doe");
      expect(entry.guest!.visitCount).toBe(5);
      expect(entry.guest!.lastVisit).toBe(LAST_VISIT.toISOString());
      expect(entry.guest!.tags).toEqual(["regular"]);
      expect(entry.guest!.dietaryRestrictions).toEqual(["gluten-free"]);
    });

    it("returns empty array for date with no reservations", async () => {
      vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([] as never);

      const result = await briefingService.getBriefing({
        date: TARGET_DATE,
        venueId: "venue-1",
      });

      expect(result).toEqual([]);
    });

    it("queries for PENDING and CONFIRMED reservations only", async () => {
      vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([] as never);

      await briefingService.getBriefing({
        date: TARGET_DATE,
        venueId: "venue-1",
      });

      expect(prisma.reservation.findMany).toHaveBeenCalledWith({
        where: {
          venueId: "venue-1",
          date: TARGET_DATE_OBJ,
          status: { in: ["PENDING", "CONFIRMED"] },
        },
        include: {
          table: true,
          guest: true,
        },
        orderBy: { startTime: "asc" },
      });
    });

    it("detects VIP guests via tags", async () => {
      const vipGuest = makePrismaGuest({
        name: "VIP Guest",
        tags: ["vip"],
      });

      const reservation = makePrismaReservation({
        guestName: "VIP Guest",
        guest: vipGuest,
      });

      vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([reservation] as never);

      const result = await briefingService.getBriefing({
        date: TARGET_DATE,
        venueId: "venue-1",
      });

      expect(result[0].guest!.tags).toContain("vip");
    });

    it("includes special occasion (anniversary) in briefing", async () => {
      const guest = makePrismaGuest();
      const reservation = makePrismaReservation({
        occasion: "anniversary",
        guest,
      });

      vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([reservation] as never);

      const result = await briefingService.getBriefing({
        date: TARGET_DATE,
        venueId: "venue-1",
      });

      expect(result[0].occasion).toBe("anniversary");
    });

    it("includes other special occasions (birthday, business, etc.)", async () => {
      const occasions = ["birthday", "business", "date_night", "other"] as const;

      for (const occasion of occasions) {
        vi.clearAllMocks();
        const guest = makePrismaGuest();
        const reservation = makePrismaReservation({
          occasion,
          guest,
        });

        vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([reservation] as never);

        const result = await briefingService.getBriefing({
          date: TARGET_DATE,
          venueId: "venue-1",
        });

        expect(result[0].occasion).toBe(occasion);
      }
    });

    it("handles null guest gracefully without throwing", async () => {
      const reservation = makePrismaReservation({
        guestId: null,
        guest: null,
      });

      vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([reservation] as never);

      const result = await briefingService.getBriefing({
        date: TARGET_DATE,
        venueId: "venue-1",
      });

      expect(result[0].guest).toBeNull();
    });

    it("handles null guest fields (name, notes, etc.) gracefully", async () => {
      const guestWithNulls = makePrismaGuest({
        name: "Guest Name",
        notes: null,
        dietaryRestrictions: null,
        tags: null,
        lastVisit: null,
      });

      const reservation = makePrismaReservation({
        guest: guestWithNulls,
      });

      vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([reservation] as never);

      const result = await briefingService.getBriefing({
        date: TARGET_DATE,
        venueId: "venue-1",
      });

      expect(result[0].guest).not.toBeNull();
      expect(result[0].guest!.notes).toBeNull();
      expect(result[0].guest!.dietaryRestrictions).toBeNull();
      expect(result[0].guest!.tags).toBeNull();
      expect(result[0].guest!.lastVisit).toBeNull();
    });

    it("handles empty staffNotes array", async () => {
      const guest = makePrismaGuest({
        staffNotes: [],
      });

      const reservation = makePrismaReservation({
        guest,
      });

      vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([reservation] as never);

      const result = await briefingService.getBriefing({
        date: TARGET_DATE,
        venueId: "venue-1",
      });

      expect(result[0].guest!.staffNotes).toEqual([]);
    });

    it("includes staffNotes in guest briefing", async () => {
      const staffNotes = [
        { text: "Allergic to shellfish", createdBy: "user-1", createdAt: "2026-05-01T10:00:00Z" },
        { text: "Prefers quiet table", createdBy: "user-2", createdAt: "2026-05-02T11:00:00Z" },
      ];

      const guest = makePrismaGuest({
        staffNotes,
      });

      const reservation = makePrismaReservation({
        guest,
      });

      vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([reservation] as never);

      const result = await briefingService.getBriefing({
        date: TARGET_DATE,
        venueId: "venue-1",
      });

      expect(result[0].guest!.staffNotes).toEqual(staffNotes);
    });

    it("excludes guestEmail and guestPhone from briefing entry", async () => {
      const guest = makePrismaGuest();
      const reservation = makePrismaReservation({
        guestEmail: "john@example.com",
        guestPhone: "+15551234567",
        guest,
      });

      vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([reservation] as never);

      const result = await briefingService.getBriefing({
        date: TARGET_DATE,
        venueId: "venue-1",
      });

      expect(result[0]).not.toHaveProperty("guestEmail");
      expect(result[0]).not.toHaveProperty("guestPhone");
    });

    it("orders reservations by startTime ascending", async () => {
      const guest = makePrismaGuest();
      const earlierReservation = makePrismaReservation({
        id: "res-1",
        startTime: new Date("2026-05-15T18:00:00Z"),
        guest,
      });
      const laterReservation = makePrismaReservation({
        id: "res-2",
        startTime: new Date("2026-05-15T20:00:00Z"),
        guest,
      });

      vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([
        earlierReservation,
        laterReservation,
      ] as never);

      const result = await briefingService.getBriefing({
        date: TARGET_DATE,
        venueId: "venue-1",
      });

      expect(result[0].id).toBe("res-1");
      expect(result[1].id).toBe("res-2");
    });

    it("includes multiple reservations with mixed guest states", async () => {
      const guest1 = makePrismaGuest({
        id: "guest-1",
        name: "Guest One",
        tags: ["vip"],
      });

      const guest2 = makePrismaGuest({
        id: "guest-2",
        name: "Guest Two",
        tags: null,
      });

      const res1 = makePrismaReservation({
        id: "res-1",
        guestName: "Guest One",
        occasion: "anniversary",
        guest: guest1,
      });

      const res2 = makePrismaReservation({
        id: "res-2",
        guestName: "Guest Two",
        occasion: null,
        guest: guest2,
      });

      const res3 = makePrismaReservation({
        id: "res-3",
        guestName: "Walk-in",
        guest: null,
      });

      vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([res1, res2, res3] as never);

      const result = await briefingService.getBriefing({
        date: TARGET_DATE,
        venueId: "venue-1",
      });

      expect(result).toHaveLength(3);
      expect(result[0].guest!.tags).toContain("vip");
      expect(result[0].occasion).toBe("anniversary");
      expect(result[1].guest!.tags).toBeNull();
      expect(result[2].guest).toBeNull();
    });

    it("includes table information in briefing entry", async () => {
      const guest = makePrismaGuest();
      const reservation = makePrismaReservation({
        table: {
          id: "table-5",
          name: "Table 5",
          tableNumber: "5",
          capacity: 8,
          minCovers: 4,
          maxCovers: 8,
          location: "patio",
          isActive: true,
          priority: 2,
          floorPlanId: "floor-1",
          shapeMetadata: { shape: "rectangular" },
          status: "AVAILABLE",
          venueId: "venue-1",
          createdAt: NOW,
          updatedAt: NOW,
        },
        guest,
      });

      vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([reservation] as never);

      const result = await briefingService.getBriefing({
        date: TARGET_DATE,
        venueId: "venue-1",
      });

      expect(result[0].table).toBeDefined();
      expect(result[0].table!.id).toBe("table-5");
      expect(result[0].table!.name).toBe("Table 5");
      expect(result[0].table!.capacity).toBe(8);
      expect(result[0].table!.location).toBe("patio");
    });

    it("includes guest communication preference in briefing", async () => {
      const guest = makePrismaGuest({
        communicationPreference: "email_only",
      });

      const reservation = makePrismaReservation({
        guest,
      });

      vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([reservation] as never);

      const result = await briefingService.getBriefing({
        date: TARGET_DATE,
        venueId: "venue-1",
      });

      expect(result[0].guest!.communicationPreference).toBe("email_only");
    });

    it("converts dates to ISO strings", async () => {
      const guest = makePrismaGuest({
        lastVisit: LAST_VISIT,
      });

      const reservation = makePrismaReservation({
        guest,
      });

      vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([reservation] as never);

      const result = await briefingService.getBriefing({
        date: TARGET_DATE,
        venueId: "venue-1",
      });

      const entry = result[0];
      expect(entry.date).toBe(TARGET_DATE_OBJ.toISOString());
      expect(entry.startTime).toBe(START_TIME.toISOString());
      expect(entry.endTime).toBe(END_TIME.toISOString());
      expect(entry.guest!.lastVisit).toBe(LAST_VISIT.toISOString());
      expect(entry.table!.createdAt).toBe(NOW.toISOString());
      expect(entry.table!.updatedAt).toBe(NOW.toISOString());
    });
  });
});
