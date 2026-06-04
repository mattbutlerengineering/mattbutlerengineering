import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./database.js", () => ({
  prisma: {
    guest: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { guestService } from "./guest.js";
import { prisma } from "./database.js";

const NOW = new Date("2026-05-01T12:00:00Z");
const LAST_VISIT = new Date("2026-04-15T19:00:00Z");

function makePrismaGuest(overrides: Record<string, unknown> = {}) {
  return {
    id: "guest-1",
    venueId: "venue-1",
    email: "guest@example.com",
    phone: "+15551234567",
    name: "Jane Doe",
    notes: "Prefers booth seating",
    visitCount: 3,
    lifetimeSpend: { toString: () => "450.00" },
    lastVisit: LAST_VISIT,
    tags: ["vip", "regular"],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("guestService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("list", () => {
    it("returns paginated guests", async () => {
      vi.mocked(prisma.guest.findMany).mockResolvedValueOnce([makePrismaGuest()] as never);
      vi.mocked(prisma.guest.count).mockResolvedValueOnce(1 as never);

      const result = await guestService.list("venue-1", 1, 10);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe("Jane Doe");
      expect(result.data[0].lifetimeSpend).toBe("450.00");
      expect(result.data[0].lastVisit).toBe(LAST_VISIT.toISOString());
      expect(result.data[0].tags).toEqual(["vip", "regular"]);
      expect(result.pagination.total).toBe(1);
    });

    it("handles null lifetimeSpend and lastVisit", async () => {
      vi.mocked(prisma.guest.findMany).mockResolvedValueOnce([
        makePrismaGuest({ lifetimeSpend: null, lastVisit: null }),
      ] as never);
      vi.mocked(prisma.guest.count).mockResolvedValueOnce(1 as never);

      const result = await guestService.list("venue-1", 1, 10);

      expect(result.data[0].lifetimeSpend).toBeNull();
      expect(result.data[0].lastVisit).toBeNull();
    });
  });

  describe("getById", () => {
    it("returns guest when found", async () => {
      vi.mocked(prisma.guest.findUnique).mockResolvedValueOnce(makePrismaGuest() as never);

      const result = await guestService.getById("guest-1");

      expect(result!.id).toBe("guest-1");
      expect(result!.email).toBe("guest@example.com");
    });

    it("returns null when not found", async () => {
      vi.mocked(prisma.guest.findUnique).mockResolvedValueOnce(null as never);

      expect(await guestService.getById("missing")).toBeNull();
    });
  });

  describe("findByEmail", () => {
    it("finds guest by venue + email compound key", async () => {
      vi.mocked(prisma.guest.findUnique).mockResolvedValueOnce(makePrismaGuest() as never);

      const result = await guestService.findByEmail("venue-1", "guest@example.com");

      expect(result!.email).toBe("guest@example.com");
      expect(prisma.guest.findUnique).toHaveBeenCalledWith({
        where: { venueId_email: { venueId: "venue-1", email: "guest@example.com" } },
      });
    });
  });

  describe("findByPhone", () => {
    it("finds guest by venue + phone compound key", async () => {
      vi.mocked(prisma.guest.findUnique).mockResolvedValueOnce(makePrismaGuest() as never);

      const result = await guestService.findByPhone("venue-1", "+15551234567");

      expect(result!.phone).toBe("+15551234567");
      expect(prisma.guest.findUnique).toHaveBeenCalledWith({
        where: { venueId_phone: { venueId: "venue-1", phone: "+15551234567" } },
      });
    });
  });

  describe("findOrCreate", () => {
    it("returns existing guest found by email without updates", async () => {
      const existing = makePrismaGuest();
      vi.mocked(prisma.guest.findUnique).mockResolvedValueOnce(existing as never);

      const result = await guestService.findOrCreate("venue-1", {
        email: "guest@example.com",
        name: "Jane Doe",
      });

      expect(result.id).toBe("guest-1");
      expect(prisma.guest.update).not.toHaveBeenCalled();
      expect(prisma.guest.create).not.toHaveBeenCalled();
    });

    it("updates name when existing email guest has different name", async () => {
      const existing = makePrismaGuest({ name: "Old Name" });
      vi.mocked(prisma.guest.findUnique).mockResolvedValueOnce(existing as never);
      const updated = makePrismaGuest({ name: "New Name" });
      vi.mocked(prisma.guest.update).mockResolvedValueOnce(updated as never);

      const result = await guestService.findOrCreate("venue-1", {
        email: "guest@example.com",
        name: "New Name",
      });

      expect(result.name).toBe("New Name");
      expect(prisma.guest.update).toHaveBeenCalledWith({
        where: { id: "guest-1" },
        data: expect.objectContaining({ name: "New Name" }),
      });
    });

    it("updates phone on email-matched guest when phone differs", async () => {
      const existing = makePrismaGuest({ phone: "+10000000000" });
      vi.mocked(prisma.guest.findUnique).mockResolvedValueOnce(existing as never);
      const updated = makePrismaGuest({ phone: "+19999999999" });
      vi.mocked(prisma.guest.update).mockResolvedValueOnce(updated as never);

      const result = await guestService.findOrCreate("venue-1", {
        email: "guest@example.com",
        phone: "+19999999999",
        name: "Jane Doe",
      });

      expect(result.phone).toBe("+19999999999");
    });

    it("falls back to phone lookup when email not found", async () => {
      vi.mocked(prisma.guest.findUnique)
        .mockResolvedValueOnce(null as never) // email lookup
        .mockResolvedValueOnce(makePrismaGuest() as never); // phone lookup
      // Phone-matched guest gets email updated since "new@example.com" differs from existing
      vi.mocked(prisma.guest.update).mockResolvedValueOnce(
        makePrismaGuest({ email: "new@example.com" }) as never
      );

      const result = await guestService.findOrCreate("venue-1", {
        email: "new@example.com",
        phone: "+15551234567",
        name: "Jane Doe",
      });

      expect(result.id).toBe("guest-1");
    });

    it("creates new guest when neither email nor phone match", async () => {
      vi.mocked(prisma.guest.findUnique)
        .mockResolvedValueOnce(null as never) // email lookup
        .mockResolvedValueOnce(null as never); // phone lookup
      vi.mocked(prisma.guest.create).mockResolvedValueOnce(
        makePrismaGuest({ id: "guest-new", email: "brand-new@test.com" }) as never
      );

      const result = await guestService.findOrCreate("venue-1", {
        email: "brand-new@test.com",
        phone: "+10000000000",
        name: "New Guest",
      });

      expect(result.id).toBe("guest-new");
      expect(prisma.guest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          venueId: "venue-1",
          email: "brand-new@test.com",
          phone: "+10000000000",
          name: "New Guest",
        }),
      });
    });

    it("creates guest with name only (no email or phone)", async () => {
      vi.mocked(prisma.guest.create).mockResolvedValueOnce(
        makePrismaGuest({ email: null, phone: null }) as never
      );

      const result = await guestService.findOrCreate("venue-1", {
        name: "Walk-in Guest",
      });

      expect(result).not.toBeNull();
      expect(prisma.guest.create).toHaveBeenCalled();
    });
  });

  describe("create", () => {
    it("creates guest with all fields", async () => {
      vi.mocked(prisma.guest.create).mockResolvedValueOnce(makePrismaGuest() as never);

      const result = await guestService.create({
        venueId: "venue-1",
        name: "Jane Doe",
        email: "guest@example.com",
        phone: "+15551234567",
        notes: "Prefers booth seating",
        tags: ["vip"],
      });

      expect(result.name).toBe("Jane Doe");
    });
  });

  describe("update", () => {
    it("updates specified fields", async () => {
      vi.mocked(prisma.guest.update).mockResolvedValueOnce(
        makePrismaGuest({ notes: "Updated notes" }) as never
      );

      const result = await guestService.update("guest-1", { notes: "Updated notes" });

      expect(result!.notes).toBe("Updated notes");
    });

    it("returns null for P2025", async () => {
      vi.mocked(prisma.guest.update).mockRejectedValueOnce({ code: "P2025" } as never);

      expect(await guestService.update("missing", { name: "X" })).toBeNull();
    });

    it("re-throws non-P2025 errors", async () => {
      vi.mocked(prisma.guest.update).mockRejectedValueOnce(new Error("DB error") as never);

      await expect(guestService.update("g1", { name: "X" })).rejects.toThrow("DB error");
    });
  });

  describe("delete", () => {
    it("returns true on success", async () => {
      vi.mocked(prisma.guest.delete).mockResolvedValueOnce(undefined as never);

      expect(await guestService.delete("guest-1")).toBe(true);
    });

    it("returns false for P2025", async () => {
      vi.mocked(prisma.guest.delete).mockRejectedValueOnce({ code: "P2025" } as never);

      expect(await guestService.delete("missing")).toBe(false);
    });
  });

  describe("recordVisit", () => {
    it("increments visitCount and sets lastVisit", async () => {
      const visitDate = new Date("2026-05-01T20:00:00Z");
      vi.mocked(prisma.guest.update).mockResolvedValueOnce(
        makePrismaGuest({ visitCount: 4, lastVisit: visitDate }) as never
      );

      const result = await guestService.recordVisit("guest-1", visitDate);

      expect(result!.visitCount).toBe(4);
      expect(prisma.guest.update).toHaveBeenCalledWith({
        where: { id: "guest-1" },
        data: expect.objectContaining({
          visitCount: { increment: 1 },
          lastVisit: visitDate,
        }),
      });
    });

    it("increments lifetimeSpend when spendAmount provided", async () => {
      const visitDate = new Date("2026-05-01T20:00:00Z");
      vi.mocked(prisma.guest.update).mockResolvedValueOnce(makePrismaGuest() as never);

      await guestService.recordVisit("guest-1", visitDate, 150.5);

      expect(prisma.guest.update).toHaveBeenCalledWith({
        where: { id: "guest-1" },
        data: expect.objectContaining({
          lifetimeSpend: { increment: 150.5 },
        }),
      });
    });

    it("does not include lifetimeSpend when spendAmount is undefined", async () => {
      const visitDate = new Date("2026-05-01T20:00:00Z");
      vi.mocked(prisma.guest.update).mockResolvedValueOnce(makePrismaGuest() as never);

      await guestService.recordVisit("guest-1", visitDate);

      const callData = vi.mocked(prisma.guest.update).mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      expect(callData).not.toHaveProperty("lifetimeSpend");
    });

    it("returns null for P2025", async () => {
      vi.mocked(prisma.guest.update).mockRejectedValueOnce({ code: "P2025" } as never);

      expect(await guestService.recordVisit("missing", new Date())).toBeNull();
    });
  });

  describe("search", () => {
    it("searches by query across name, email, phone", async () => {
      vi.mocked(prisma.guest.findMany).mockResolvedValueOnce([makePrismaGuest()] as never);
      vi.mocked(prisma.guest.count).mockResolvedValueOnce(1 as never);

      const result = await guestService.search({
        venueId: "venue-1",
        query: "jane",
      });

      expect(result.data).toHaveLength(1);
      const findManyCall = vi.mocked(prisma.guest.findMany).mock.calls[0][0] as {
        where: { AND?: unknown[] };
      };
      expect(findManyCall.where.AND).toBeDefined();
    });

    it("filters by tags", async () => {
      vi.mocked(prisma.guest.findMany).mockResolvedValueOnce([] as never);
      vi.mocked(prisma.guest.count).mockResolvedValueOnce(0 as never);

      await guestService.search({
        venueId: "venue-1",
        tags: ["vip"],
      });

      expect(prisma.guest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tags: { array_contains: ["vip"] },
          }),
        })
      );
    });

    it("filters by hasNotVisitedInDays", async () => {
      vi.mocked(prisma.guest.findMany).mockResolvedValueOnce([] as never);
      vi.mocked(prisma.guest.count).mockResolvedValueOnce(0 as never);

      await guestService.search({
        venueId: "venue-1",
        hasNotVisitedInDays: 30,
      });

      const findManyCall = vi.mocked(prisma.guest.findMany).mock.calls[0][0] as {
        where: { AND?: unknown[] };
      };
      expect(findManyCall.where.AND).toBeDefined();
    });

    it("filters by minVisitCount and maxVisitCount", async () => {
      vi.mocked(prisma.guest.findMany).mockResolvedValueOnce([] as never);
      vi.mocked(prisma.guest.count).mockResolvedValueOnce(0 as never);

      await guestService.search({
        venueId: "venue-1",
        minVisitCount: 2,
        maxVisitCount: 10,
      });

      expect(prisma.guest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            visitCount: { gte: 2, lte: 10 },
          }),
        })
      );
    });

    it("limits results to 50", async () => {
      vi.mocked(prisma.guest.findMany).mockResolvedValueOnce([] as never);
      vi.mocked(prisma.guest.count).mockResolvedValueOnce(0 as never);

      await guestService.search({ venueId: "venue-1" });

      expect(prisma.guest.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
    });
  });

  describe("getSegments", () => {
    it("returns all six segment categories", async () => {
      vi.mocked(prisma.guest.count)
        .mockResolvedValueOnce(100 as never) // total
        .mockResolvedValueOnce(10 as never) // VIP
        .mockResolvedValueOnce(30 as never) // recent
        .mockResolvedValueOnce(20 as never) // at risk
        .mockResolvedValueOnce(15 as never) // lapsed
        .mockResolvedValueOnce(25 as never); // new

      const segments = await guestService.getSegments("venue-1");

      expect(segments).toHaveLength(6);
      expect(segments.map((s) => s.name)).toEqual([
        "All Guests",
        "VIP",
        "Recent",
        "At Risk",
        "Lapsed",
        "New",
      ]);
      expect(segments[0].count).toBe(100);
      expect(segments[1].count).toBe(10);
    });

    it("all segment count queries include venueId for index utilisation", async () => {
      vi.mocked(prisma.guest.count).mockResolvedValue(0 as never);

      await guestService.getSegments("venue-1");

      // Every count call must pass venueId so the DB uses guests_venue_id_visit_count_idx
      // and guests_venue_id_last_visit_idx instead of sequential scans
      const calls = vi.mocked(prisma.guest.count).mock.calls;
      expect(calls).toHaveLength(6);
      for (const [args] of calls) {
        expect((args as { where: { venueId: string } }).where.venueId).toBe("venue-1");
      }
    });

    it("VIP segment uses visitCount filter that benefits from index", async () => {
      vi.mocked(prisma.guest.count).mockResolvedValue(0 as never);

      await guestService.getSegments("venue-1");

      const calls = vi.mocked(prisma.guest.count).mock.calls;
      // VIP = index 1, New = index 5
      const vipCall = calls[1][0] as { where: { venueId: string; visitCount: { gte: number } } };
      const newCall = calls[5][0] as { where: { venueId: string; visitCount: number } };
      expect(vipCall.where.visitCount).toEqual({ gte: 5 });
      expect(newCall.where.visitCount).toBe(0);
    });
  });
});
