import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: {
      venue: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
      venueGroup: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
      },
    },
  });
});

import { venueService, venueGroupService } from "./venue.js";
import { prisma } from "./database.js";

const NOW = new Date("2026-05-01T12:00:00Z");

function makePrismaVenueGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: "group-1",
    name: "Test Group",
    slug: "test-group",
    settings: null,
    createdAt: NOW,
    ...overrides,
  };
}

function makePrismaVenue(overrides: Record<string, unknown> = {}) {
  return {
    id: "venue-1",
    venueGroupId: "group-1",
    venueGroup: makePrismaVenueGroup(),
    name: "Test Venue",
    slug: "test-venue",
    ianaTimezone: "America/Los_Angeles",
    currencyCode: "USD",
    operatingHours: {
      monday: { open: "11:00", close: "22:00" },
      tuesday: { open: "11:00", close: "22:00" },
      sunday: { open: "11:00", close: "22:00", closed: true },
    },
    settings: {
      slotIntervalMinutes: 15,
      lastSeatingBuffer: 90,
      defaultReservationDuration: 90,
    },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("venueGroupService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("list", () => {
    it("returns paginated venue groups", async () => {
      const dbGroup = makePrismaVenueGroup();
      vi.mocked(prisma.venueGroup.findMany).mockResolvedValueOnce([dbGroup] as never);
      vi.mocked(prisma.venueGroup.count).mockResolvedValueOnce(1 as never);

      const result = await venueGroupService.list(1, 10);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe("group-1");
      expect(result.data[0].slug).toBe("test-group");
      expect(typeof result.data[0].createdAt).toBe("string");
      expect(result.pagination.total).toBe(1);
    });

    it("calculates pagination for multiple pages", async () => {
      vi.mocked(prisma.venueGroup.findMany).mockResolvedValueOnce([] as never);
      vi.mocked(prisma.venueGroup.count).mockResolvedValueOnce(30 as never);

      const result = await venueGroupService.list(2, 10);

      expect(result.pagination).toEqual({
        page: 2,
        limit: 10,
        total: 30,
        totalPages: 3,
        hasNext: true,
        hasPrev: true,
      });
    });
  });

  describe("getById", () => {
    it("returns mapped group when found", async () => {
      vi.mocked(prisma.venueGroup.findUnique).mockResolvedValueOnce(
        makePrismaVenueGroup() as never
      );

      const result = await venueGroupService.getById("group-1");

      expect(result).not.toBeNull();
      expect(result!.name).toBe("Test Group");
    });

    it("returns null when not found", async () => {
      vi.mocked(prisma.venueGroup.findUnique).mockResolvedValueOnce(null as never);

      const result = await venueGroupService.getById("missing");

      expect(result).toBeNull();
    });
  });

  describe("getBySlug", () => {
    it("returns group by slug", async () => {
      vi.mocked(prisma.venueGroup.findUnique).mockResolvedValueOnce(
        makePrismaVenueGroup() as never
      );

      const result = await venueGroupService.getBySlug("test-group");

      expect(result!.slug).toBe("test-group");
    });
  });

  describe("create", () => {
    it("creates a venue group", async () => {
      vi.mocked(prisma.venueGroup.create).mockResolvedValueOnce(makePrismaVenueGroup() as never);

      const result = await venueGroupService.create({
        name: "Test Group",
        slug: "test-group",
      });

      expect(result.name).toBe("Test Group");
      expect(prisma.venueGroup.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: "Test Group", slug: "test-group" }),
      });
    });
  });

  describe("update", () => {
    it("updates specified fields", async () => {
      vi.mocked(prisma.venueGroup.update).mockResolvedValueOnce(
        makePrismaVenueGroup({ name: "Updated" }) as never
      );

      const result = await venueGroupService.update("group-1", { name: "Updated" });

      expect(result!.name).toBe("Updated");
    });

    it("returns null for P2025", async () => {
      vi.mocked(prisma.venueGroup.update).mockRejectedValueOnce({ code: "P2025" } as never);

      const result = await venueGroupService.update("missing", { name: "X" });

      expect(result).toBeNull();
    });

    it("re-throws non-P2025 errors", async () => {
      vi.mocked(prisma.venueGroup.update).mockRejectedValueOnce(new Error("DB error") as never);

      await expect(venueGroupService.update("group-1", { name: "X" })).rejects.toThrow("DB error");
    });
  });

  describe("delete", () => {
    it("returns true on success", async () => {
      vi.mocked(prisma.venueGroup.delete).mockResolvedValueOnce(undefined as never);

      expect(await venueGroupService.delete("group-1")).toBe(true);
    });

    it("returns false for P2025", async () => {
      vi.mocked(prisma.venueGroup.delete).mockRejectedValueOnce({ code: "P2025" } as never);

      expect(await venueGroupService.delete("missing")).toBe(false);
    });
  });
});

describe("venueService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("list", () => {
    it("returns paginated venues with venueGroup included", async () => {
      const dbVenue = makePrismaVenue();
      vi.mocked(prisma.venue.findMany).mockResolvedValueOnce([dbVenue] as never);
      vi.mocked(prisma.venue.count).mockResolvedValueOnce(1 as never);

      const result = await venueService.list(1, 10);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe("venue-1");
      expect(result.data[0].venueGroup?.name).toBe("Test Group");
      expect(result.data[0].ianaTimezone).toBe("America/Los_Angeles");
      expect(typeof result.data[0].createdAt).toBe("string");
    });

    it("filters by venueGroupId when provided", async () => {
      vi.mocked(prisma.venue.findMany).mockResolvedValueOnce([] as never);
      vi.mocked(prisma.venue.count).mockResolvedValueOnce(0 as never);

      await venueService.list(1, 10, "group-1");

      expect(prisma.venue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { venueGroupId: "group-1" } })
      );
      // count query must also filter by venueGroupId so both use the venues_venue_group_id_idx index
      expect(prisma.venue.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: { venueGroupId: "group-1" } })
      );
    });

    it("does not filter when venueGroupId is omitted", async () => {
      vi.mocked(prisma.venue.findMany).mockResolvedValueOnce([] as never);
      vi.mocked(prisma.venue.count).mockResolvedValueOnce(0 as never);

      await venueService.list(1, 10);

      expect(prisma.venue.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    });
  });

  describe("getById", () => {
    it("returns mapped venue with venueGroup", async () => {
      vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce(makePrismaVenue() as never);

      const result = await venueService.getById("venue-1");

      expect(result).not.toBeNull();
      expect(result!.settings).toEqual(expect.objectContaining({ slotIntervalMinutes: 15 }));
    });

    it("returns null when not found", async () => {
      vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce(null as never);

      expect(await venueService.getById("missing")).toBeNull();
    });
  });

  describe("getBySlug", () => {
    it("returns venue by slug", async () => {
      vi.mocked(prisma.venue.findFirst).mockResolvedValueOnce(makePrismaVenue() as never);

      const result = await venueService.getBySlug("test-venue");

      expect(result!.slug).toBe("test-venue");
    });

    it("filters by venueGroupId when provided", async () => {
      vi.mocked(prisma.venue.findFirst).mockResolvedValueOnce(null as never);

      await venueService.getBySlug("test-venue", "group-1");

      expect(prisma.venue.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: "test-venue", venueGroupId: "group-1" },
        })
      );
    });
  });

  describe("create", () => {
    it("creates venue with all fields", async () => {
      vi.mocked(prisma.venue.create).mockResolvedValueOnce(makePrismaVenue() as never);

      const result = await venueService.create({
        name: "Test Venue",
        slug: "test-venue",
        ianaTimezone: "America/Los_Angeles",
        venueGroupId: "group-1",
      });

      expect(result.name).toBe("Test Venue");
      expect(prisma.venue.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "Test Venue",
            currencyCode: "USD",
          }),
        })
      );
    });

    it("defaults currencyCode to USD", async () => {
      vi.mocked(prisma.venue.create).mockResolvedValueOnce(makePrismaVenue() as never);

      await venueService.create({
        name: "Venue",
        slug: "venue",
        ianaTimezone: "UTC",
      });

      expect(prisma.venue.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currencyCode: "USD" }),
        })
      );
    });
  });

  describe("update", () => {
    it("updates name", async () => {
      vi.mocked(prisma.venue.update).mockResolvedValueOnce(
        makePrismaVenue({ name: "New Name" }) as never
      );

      const result = await venueService.update("venue-1", { name: "New Name" });

      expect(result!.name).toBe("New Name");
    });

    it("disconnects venueGroup when set to null", async () => {
      vi.mocked(prisma.venue.update).mockResolvedValueOnce(
        makePrismaVenue({ venueGroupId: null, venueGroup: null }) as never
      );

      await venueService.update("venue-1", { venueGroupId: null });

      expect(prisma.venue.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            venueGroup: { disconnect: true },
          }),
        })
      );
    });

    it("connects venueGroup when set to a value", async () => {
      vi.mocked(prisma.venue.update).mockResolvedValueOnce(makePrismaVenue() as never);

      await venueService.update("venue-1", { venueGroupId: "group-2" });

      expect(prisma.venue.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            venueGroup: { connect: { id: "group-2" } },
          }),
        })
      );
    });

    it("returns null for P2025", async () => {
      vi.mocked(prisma.venue.update).mockRejectedValueOnce({ code: "P2025" } as never);

      expect(await venueService.update("missing", { name: "X" })).toBeNull();
    });
  });

  describe("delete", () => {
    it("returns true on success", async () => {
      vi.mocked(prisma.venue.delete).mockResolvedValueOnce(undefined as never);

      expect(await venueService.delete("venue-1")).toBe(true);
    });

    it("returns false for P2025", async () => {
      vi.mocked(prisma.venue.delete).mockRejectedValueOnce({ code: "P2025" } as never);

      expect(await venueService.delete("missing")).toBe(false);
    });
  });
});
