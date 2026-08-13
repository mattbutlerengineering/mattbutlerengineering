import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

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
      venueMembership: {
        create: vi.fn(),
        count: vi.fn(),
      },
      $transaction: vi.fn(),
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
    depositEnabled: true,
    depositType: "flat",
    depositAmountCents: 2500,
    freeCancellationHours: 24,
    lateCancellationFeePercent: 50,
    noShowFeePercent: 100,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** Minimal interactive-transaction client shape used by create() seeding tests. */
interface TxLike {
  venue: { create: Mock };
  venueMembership: { create: Mock };
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
      const [group] = result.data;
      if (!group) throw new Error("expected a venue group");
      expect(group.id).toBe("group-1");
      expect(group.slug).toBe("test-group");
      expect(typeof group.createdAt).toBe("string");
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
      const [venue] = result.data;
      if (!venue) throw new Error("expected a venue");
      expect(venue.id).toBe("venue-1");
      expect(venue.venueGroup?.name).toBe("Test Group");
      expect(venue.ianaTimezone).toBe("America/Los_Angeles");
      expect(typeof venue.createdAt).toBe("string");
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

  describe("listForMember", () => {
    it("filters venues to those the given user is a member of", async () => {
      const dbVenue = makePrismaVenue();
      vi.mocked(prisma.venue.findMany).mockResolvedValueOnce([dbVenue] as never);
      vi.mocked(prisma.venue.count).mockResolvedValueOnce(1 as never);

      const result = await venueService.listForMember("auth0|user-1", 1, 10);

      expect(result.data).toHaveLength(1);
      const [venue] = result.data;
      if (!venue) throw new Error("expected a venue");
      expect(venue.id).toBe("venue-1");
      expect(prisma.venue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { memberships: { some: { userSub: "auth0|user-1" } } },
        })
      );
      // count must apply the same membership filter so pagination totals match
      expect(prisma.venue.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { memberships: { some: { userSub: "auth0|user-1" } } },
        })
      );
    });

    it("combines the membership filter with venueGroupId", async () => {
      vi.mocked(prisma.venue.findMany).mockResolvedValueOnce([] as never);
      vi.mocked(prisma.venue.count).mockResolvedValueOnce(0 as never);

      await venueService.listForMember("auth0|user-1", 1, 10, "group-1");

      expect(prisma.venue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            memberships: { some: { userSub: "auth0|user-1" } },
            venueGroupId: "group-1",
          },
        })
      );
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

  describe("getPublicBySlug (#4022)", () => {
    it("returns only the curated PublicVenue projection", async () => {
      vi.mocked(prisma.venue.findFirst).mockResolvedValueOnce(makePrismaVenue() as never);

      const result = await venueService.getPublicBySlug("test-venue");

      expect(result).toEqual({
        id: "venue-1",
        name: "Test Venue",
        slug: "test-venue",
        operatingHours: {
          monday: { open: "11:00", close: "22:00" },
          tuesday: { open: "11:00", close: "22:00" },
          sunday: { open: "11:00", close: "22:00", closed: true },
        },
      });
    });

    it("selects only the projected columns from Prisma — never venueGroup or settings", async () => {
      vi.mocked(prisma.venue.findFirst).mockResolvedValueOnce(makePrismaVenue() as never);

      await venueService.getPublicBySlug("test-venue");

      expect(prisma.venue.findFirst).toHaveBeenCalledWith({
        where: { slug: "test-venue" },
        select: {
          id: true,
          name: true,
          slug: true,
          operatingHours: true,
        },
      });
    });

    it("returns null when the venue does not exist", async () => {
      vi.mocked(prisma.venue.findFirst).mockResolvedValueOnce(null as never);

      expect(await venueService.getPublicBySlug("missing")).toBeNull();
    });
  });

  describe("getPolicyById", () => {
    it("returns the typed policy projection for the venue", async () => {
      vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce(makePrismaVenue() as never);

      const result = await venueService.getPolicyById("venue-1");

      expect(result).toEqual({
        id: "venue-1",
        slug: "test-venue",
        currencyCode: "USD",
        depositEnabled: true,
        depositType: "flat",
        depositAmountCents: 2500,
        freeCancellationHours: 24,
        lateCancellationFeePercent: 50,
        noShowFeePercent: 100,
      });
    });

    it("selects only the policy columns (no raw row leaks through the seam)", async () => {
      vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce(makePrismaVenue() as never);

      await venueService.getPolicyById("venue-1");

      expect(prisma.venue.findUnique).toHaveBeenCalledWith({
        where: { id: "venue-1" },
        select: {
          id: true,
          slug: true,
          currencyCode: true,
          depositEnabled: true,
          depositType: true,
          depositAmountCents: true,
          freeCancellationHours: true,
          lateCancellationFeePercent: true,
          noShowFeePercent: true,
        },
      });
    });

    it("returns null when the venue is not found", async () => {
      vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce(null as never);

      expect(await venueService.getPolicyById("missing")).toBeNull();
    });
  });

  describe("getPolicyBySlug", () => {
    it("returns the typed policy projection by slug", async () => {
      vi.mocked(prisma.venue.findFirst).mockResolvedValueOnce(makePrismaVenue() as never);

      const result = await venueService.getPolicyBySlug("test-venue");

      expect(result?.depositType).toBe("flat");
      expect(result?.depositAmountCents).toBe(2500);
      expect(result?.freeCancellationHours).toBe(24);
    });

    it("selects only the policy columns filtered by slug", async () => {
      vi.mocked(prisma.venue.findFirst).mockResolvedValueOnce(makePrismaVenue() as never);

      await venueService.getPolicyBySlug("test-venue");

      expect(prisma.venue.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: "test-venue" },
          select: expect.objectContaining({ depositEnabled: true, noShowFeePercent: true }),
        })
      );
    });

    it("returns null when the venue is not found", async () => {
      vi.mocked(prisma.venue.findFirst).mockResolvedValueOnce(null as never);

      expect(await venueService.getPolicyBySlug("missing")).toBeNull();
    });
  });

  describe("getPublicConfigBySlug", () => {
    it("maps base config plus deposit policy into the public shape", async () => {
      vi.mocked(prisma.venue.findFirst).mockResolvedValueOnce(makePrismaVenue() as never);

      const result = await venueService.getPublicConfigBySlug("test-venue");

      expect(result).toEqual({
        name: "Test Venue",
        slug: "test-venue",
        ianaTimezone: "America/Los_Angeles",
        currencyCode: "USD",
        operatingHours: expect.objectContaining({
          monday: { open: "11:00", close: "22:00" },
        }),
        settings: {
          defaultReservationDuration: 90,
          maxPartySize: undefined,
          maxAdvanceBooking: undefined,
          slotIntervalMinutes: 15,
        },
        deposit: {
          enabled: true,
          depositType: "flat",
          amountCents: 2500,
          freeCancellationHours: 24,
          lateCancellationFeePercent: 50,
          noShowFeePercent: 100,
        },
      });
    });

    it("never exposes id or venueGroupId on the public config", async () => {
      vi.mocked(prisma.venue.findFirst).mockResolvedValueOnce(makePrismaVenue() as never);

      const result = await venueService.getPublicConfigBySlug("test-venue");

      expect(result).not.toHaveProperty("id");
      expect(result).not.toHaveProperty("venueGroupId");
    });

    it("returns null when the venue is not found", async () => {
      vi.mocked(prisma.venue.findFirst).mockResolvedValueOnce(null as never);

      expect(await venueService.getPublicConfigBySlug("missing")).toBeNull();
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

  describe("create ownership seeding", () => {
    it("seeds an owner VenueMembership atomically when ownerSub is provided", async () => {
      const created = makePrismaVenue();
      const venueCreate = vi.fn().mockResolvedValue(created);
      const membershipCreate = vi.fn().mockResolvedValue({
        id: "vm-1",
        userSub: "auth0|owner-1",
        venueId: "venue-1",
        role: "owner",
        createdAt: NOW,
        updatedAt: NOW,
      });
      vi.mocked(prisma.$transaction).mockImplementationOnce((async (
        fn: (tx: TxLike) => Promise<unknown>
      ) =>
        fn({
          venue: { create: venueCreate },
          venueMembership: { create: membershipCreate },
        })) as never);

      const result = await venueService.create(
        { name: "Test Venue", slug: "test-venue", ianaTimezone: "America/Los_Angeles" },
        "auth0|owner-1"
      );

      expect(result.id).toBe("venue-1");
      expect(venueCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ name: "Test Venue" }) })
      );
      expect(membershipCreate).toHaveBeenCalledWith({
        data: { userSub: "auth0|owner-1", venueId: "venue-1", role: "owner" },
      });
      // Seeding path runs inside the transaction, not the direct create.
      expect(prisma.venue.create).not.toHaveBeenCalled();
    });

    it("does not open a transaction or seed membership when ownerSub is omitted", async () => {
      vi.mocked(prisma.venue.create).mockResolvedValueOnce(makePrismaVenue() as never);

      await venueService.create({ name: "Venue", slug: "venue", ianaTimezone: "UTC" });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.venueMembership.create).not.toHaveBeenCalled();
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
    it("returns 'deleted' on success", async () => {
      vi.mocked(prisma.venue.delete).mockResolvedValueOnce(undefined as never);

      expect(await venueService.delete("venue-1")).toBe("deleted");
    });

    it("returns 'not_found' for P2025", async () => {
      vi.mocked(prisma.venue.delete).mockRejectedValueOnce({ code: "P2025" } as never);

      expect(await venueService.delete("missing")).toBe("not_found");
    });

    it("returns 'has_dependents' for P2003 (FK constraint from Guest/FloorPlan/ReservationHold)", async () => {
      vi.mocked(prisma.venue.delete).mockRejectedValueOnce({ code: "P2003" } as never);

      expect(await venueService.delete("venue-with-guests")).toBe("has_dependents");
    });

    it("rethrows any other error", async () => {
      const unexpected = new Error("connection reset");
      vi.mocked(prisma.venue.delete).mockRejectedValueOnce(unexpected as never);

      await expect(venueService.delete("venue-1")).rejects.toThrow("connection reset");
    });
  });
});
