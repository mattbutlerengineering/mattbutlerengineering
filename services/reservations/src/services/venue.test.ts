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
        findMany: vi.fn(),
      },
      $queryRaw: vi.fn(),
      $transaction: vi.fn(),
    },
  });
});

import { venueService, venueGroupService, VenueBootstrapForbiddenError } from "./venue.js";
import { prisma } from "./database.js";
import { getCurrentVenueId } from "./venue-context-store.js";

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

/**
 * A raw `venues` row joined to its group, as `venueService.list`'s
 * `app_cross_venue_venues()` query returns it — Postgres column names and
 * Postgres types, not Prisma's camelCase field names (ADR-026 §3, #5369).
 */
function makeCrossVenueRow(overrides: Record<string, unknown> = {}) {
  const venue = makePrismaVenue();
  return {
    id: venue.id,
    venue_group_id: venue.venueGroupId,
    name: venue.name,
    slug: venue.slug,
    iana_timezone: venue.ianaTimezone,
    currency_code: venue.currencyCode,
    operating_hours: venue.operatingHours,
    settings: venue.settings,
    created_at: venue.createdAt,
    updated_at: venue.updatedAt,
    group_id: "group-1",
    group_name: "Test Group",
    group_slug: "test-group",
    group_settings: null,
    group_created_at: NOW,
    ...overrides,
  };
}

/**
 * Answers `list`'s two `$queryRaw` calls by SQL shape rather than call order:
 * they are issued concurrently, so a `mockResolvedValueOnce` pair would couple
 * the test to `Promise.all`'s scheduling.
 */
function mockCrossVenueQueries(rows: unknown[], total: number): void {
  vi.mocked(prisma.$queryRaw).mockImplementation(((strings: TemplateStringsArray) =>
    Promise.resolve(strings.join("").includes("count(") ? [{ total }] : rows)) as never);
}

/** The SQL text of every `$queryRaw` call made so far, tagged template joined. */
function crossVenueSqlCalls(): string[] {
  return vi
    .mocked(prisma.$queryRaw)
    .mock.calls.map((call) => (call[0] as unknown as TemplateStringsArray).join(""));
}

/** The bound values of every `$queryRaw` call made so far. */
function crossVenueValueCalls(): unknown[][] {
  return vi.mocked(prisma.$queryRaw).mock.calls.map((call) => call.slice(1));
}

/** Minimal interactive-transaction client shape used by create() seeding tests. */
interface TxLike {
  venue: { create: Mock };
  venueMembership: { create: Mock; count?: Mock };
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
    it("returns paginated venues with venueGroup included, read through the cross-venue escape hatch (#5369)", async () => {
      mockCrossVenueQueries([makeCrossVenueRow()], 1);

      const result = await venueService.list(1, 10);

      expect(result.data).toHaveLength(1);
      const [venue] = result.data;
      if (!venue) throw new Error("expected a venue");
      expect(venue.id).toBe("venue-1");
      expect(venue.venueGroup?.name).toBe("Test Group");
      expect(venue.ianaTimezone).toBe("America/Los_Angeles");
      expect(typeof venue.createdAt).toBe("string");
      expect(result.pagination.total).toBe(1);
    });

    it("reads through app_cross_venue_venues(), never the venue delegate (which depends on owner-bypass)", async () => {
      mockCrossVenueQueries([makeCrossVenueRow()], 1);

      await venueService.list(1, 10);

      // The admin list is irreducibly cross-venue, so under
      // FORCE ROW LEVEL SECURITY a delegate read returns zero rows — see
      // ADR-026 §3 and the migration that adds this function.
      for (const sql of crossVenueSqlCalls()) {
        expect(sql).toContain("app_cross_venue_venues(");
      }
      expect(prisma.venue.findMany).not.toHaveBeenCalled();
      expect(prisma.venue.count).not.toHaveBeenCalled();
    });

    it("filters by venueGroupId when provided, as a bound parameter on both queries", async () => {
      mockCrossVenueQueries([], 0);

      await venueService.list(1, 10, "group-1");

      // Both the page query and the count query go through the same function
      // with the same filter, so the total matches the page's own scope.
      expect(crossVenueSqlCalls()).toHaveLength(2);
      for (const values of crossVenueValueCalls()) {
        expect(values).toContain("group-1");
      }
    });

    it("passes NULL when venueGroupId is omitted, so every venue is in scope", async () => {
      mockCrossVenueQueries([], 0);

      await venueService.list(1, 10);

      for (const values of crossVenueValueCalls()) {
        expect(values[0]).toBeNull();
      }
    });

    it("maps a venue with no venue group to a null venueGroupId and no venueGroup", async () => {
      mockCrossVenueQueries(
        [
          makeCrossVenueRow({
            venue_group_id: null,
            group_id: null,
            group_name: null,
            group_slug: null,
            group_settings: null,
            group_created_at: null,
          }),
        ],
        1
      );

      const result = await venueService.list(1, 10);

      const [venue] = result.data;
      if (!venue) throw new Error("expected a venue");
      expect(venue.venueGroupId).toBeNull();
      expect(venue.venueGroup).toBeUndefined();
    });
  });

  describe("listForMember", () => {
    it("resolves the member's venue ids from venue_memberships (no RLS read), never a cross-venue venue.findMany (#5369)", async () => {
      vi.mocked(prisma.venueMembership.findMany).mockResolvedValueOnce([
        { venueId: "venue-1" },
      ] as never);
      vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce(makePrismaVenue() as never);

      const result = await venueService.listForMember("auth0|user-1", 1, 10);

      expect(prisma.venueMembership.findMany).toHaveBeenCalledWith({
        where: { userSub: "auth0|user-1" },
        select: { venueId: true },
        distinct: ["venueId"],
      });
      expect(result.data).toHaveLength(1);
      const [venue] = result.data;
      if (!venue) throw new Error("expected a venue");
      expect(venue.id).toBe("venue-1");
      expect(prisma.venue.findMany).not.toHaveBeenCalled();
    });

    it("reads each member venue inside its own runWithVenueContext (one venue at a time)", async () => {
      // `venueIds.map(...)` invokes `runWithVenueContext` synchronously in
      // array order (`AsyncLocalStorage.run` calls its callback synchronously
      // before any `await` inside it), so the two mocked calls below fire in
      // the same order `getMemberVenueIds` returned.
      vi.mocked(prisma.venueMembership.findMany).mockResolvedValueOnce([
        { venueId: "venue-1" },
        { venueId: "venue-2" },
      ] as never);
      const observedVenueIds: Array<string | null> = [];
      vi.mocked(prisma.venue.findUnique)
        .mockImplementationOnce((async () => {
          observedVenueIds.push(getCurrentVenueId());
          return makePrismaVenue({ id: "venue-1", name: "Alpha" });
        }) as never)
        .mockImplementationOnce((async () => {
          observedVenueIds.push(getCurrentVenueId());
          return makePrismaVenue({ id: "venue-2", name: "Bravo" });
        }) as never);

      await venueService.listForMember("auth0|user-1", 1, 10);

      expect(observedVenueIds).toEqual(["venue-1", "venue-2"]);
      // The context must not leak past listForMember's own execution.
      expect(getCurrentVenueId()).toBeNull();
    });

    it("returns both of a member's venues, sorted by name, when they belong to more than one", async () => {
      vi.mocked(prisma.venueMembership.findMany).mockResolvedValueOnce([
        { venueId: "venue-1" },
        { venueId: "venue-2" },
      ] as never);
      vi.mocked(prisma.venue.findUnique)
        .mockResolvedValueOnce(makePrismaVenue({ id: "venue-1", name: "Zeta" }) as never)
        .mockResolvedValueOnce(makePrismaVenue({ id: "venue-2", name: "Alpha" }) as never);

      const result = await venueService.listForMember("auth0|user-1", 1, 10);

      expect(result.data.map((v) => v.id)).toEqual(["venue-2", "venue-1"]);
      expect(result.pagination.total).toBe(2);
    });

    it("sorts mixed-case and accented names the way the database collation did, not by code unit", async () => {
      // The removed `orderBy: { name: "asc" }` sorted with Postgres's en_US
      // collation; a raw `<` comparison would put "Bravo" before "alpha" and
      // "Éclair" after "zeta", changing which venues land on page 1.
      vi.mocked(prisma.venueMembership.findMany).mockResolvedValueOnce([
        { venueId: "v-zeta" },
        { venueId: "v-eclair" },
        { venueId: "v-bravo" },
        { venueId: "v-alpha" },
      ] as never);
      vi.mocked(prisma.venue.findUnique)
        .mockResolvedValueOnce(makePrismaVenue({ id: "v-zeta", name: "zeta" }) as never)
        .mockResolvedValueOnce(makePrismaVenue({ id: "v-eclair", name: "Éclair" }) as never)
        .mockResolvedValueOnce(makePrismaVenue({ id: "v-bravo", name: "Bravo" }) as never)
        .mockResolvedValueOnce(makePrismaVenue({ id: "v-alpha", name: "alpha" }) as never);

      const result = await venueService.listForMember("auth0|user-1", 1, 10);

      expect(result.data.map((v) => v.name)).toEqual(["alpha", "Bravo", "Éclair", "zeta"]);
    });

    it("filters out a venue id whose row no longer exists", async () => {
      vi.mocked(prisma.venueMembership.findMany).mockResolvedValueOnce([
        { venueId: "venue-1" },
        { venueId: "venue-deleted" },
      ] as never);
      vi.mocked(prisma.venue.findUnique)
        .mockResolvedValueOnce(makePrismaVenue({ id: "venue-1" }) as never)
        .mockResolvedValueOnce(null as never);

      const result = await venueService.listForMember("auth0|user-1", 1, 10);

      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
    });

    it("filters the fanned-out venues by venueGroupId in-process", async () => {
      vi.mocked(prisma.venueMembership.findMany).mockResolvedValueOnce([
        { venueId: "venue-1" },
        { venueId: "venue-2" },
      ] as never);
      vi.mocked(prisma.venue.findUnique)
        .mockResolvedValueOnce(makePrismaVenue({ id: "venue-1", venueGroupId: "group-1" }) as never)
        .mockResolvedValueOnce(
          makePrismaVenue({ id: "venue-2", venueGroupId: "group-2" }) as never
        );

      const result = await venueService.listForMember("auth0|user-1", 1, 10, "group-1");

      expect(result.data.map((v) => v.id)).toEqual(["venue-1"]);
      expect(result.pagination.total).toBe(1);
    });

    it("returns an empty page when the user holds no membership at all", async () => {
      vi.mocked(prisma.venueMembership.findMany).mockResolvedValueOnce([] as never);

      const result = await venueService.listForMember("auth0|no-memberships", 1, 10);

      expect(result.data).toEqual([]);
      expect(result.pagination.total).toBe(0);
      expect(prisma.venue.findUnique).not.toHaveBeenCalled();
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
        ianaTimezone: "America/Los_Angeles",
        operatingHours: {
          monday: { open: "11:00", close: "22:00" },
          tuesday: { open: "11:00", close: "22:00" },
          sunday: { open: "11:00", close: "22:00", closed: true },
        },
      });
    });

    it("selects only the projected columns from Prisma — never venueGroup", async () => {
      vi.mocked(prisma.venue.findFirst).mockResolvedValueOnce(makePrismaVenue() as never);

      await venueService.getPublicBySlug("test-venue");

      expect(prisma.venue.findFirst).toHaveBeenCalledWith({
        where: { slug: "test-venue" },
        select: {
          id: true,
          name: true,
          slug: true,
          ianaTimezone: true,
          operatingHours: true,
          settings: true,
        },
      });
    });

    it("returns null when the venue does not exist", async () => {
      vi.mocked(prisma.venue.findFirst).mockResolvedValueOnce(null as never);

      expect(await venueService.getPublicBySlug("missing")).toBeNull();
    });

    // #4979: guests at venues that seat more than the widget's hardcoded
    // default of 8 were silently unable to select their real party size, and
    // the "please call us" fallback carried no phone number. Forwarding both
    // from the venue's settings JSON blob lets the widget offer a real cap
    // and a real number, with no schema migration (settings is already Json).
    it("forwards maxPartySize and phone from settings", async () => {
      vi.mocked(prisma.venue.findFirst).mockResolvedValueOnce(
        makePrismaVenue({ settings: { maxPartySize: 12, phone: "+1-555-0100" } }) as never
      );

      const result = await venueService.getPublicBySlug("test-venue");

      expect(result).toMatchObject({
        settings: { maxPartySize: 12 },
        phone: "+1-555-0100",
      });
    });

    it("omits settings and phone when the venue has no maxPartySize/phone configured", async () => {
      vi.mocked(prisma.venue.findFirst).mockResolvedValueOnce(makePrismaVenue() as never);

      const result = await venueService.getPublicBySlug("test-venue");

      expect(result?.settings).toBeUndefined();
      expect(result?.phone).toBeUndefined();
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
      // No `isAdmin` passed: the bootstrap invariant applies (fail-closed
      // default), so the transaction must be able to answer the count.
      const membershipCount = vi.fn().mockResolvedValue(0);
      vi.mocked(prisma.$transaction).mockImplementationOnce((async (
        fn: (tx: TxLike) => Promise<unknown>
      ) =>
        fn({
          venue: { create: venueCreate },
          venueMembership: { create: membershipCreate, count: membershipCount },
        })) as never);

      const result = await venueService.create(
        { name: "Test Venue", slug: "test-venue", ianaTimezone: "America/Los_Angeles" },
        "auth0|owner-1"
      );

      expect(membershipCount).toHaveBeenCalledWith({ where: { userSub: "auth0|owner-1" } });

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

    it("re-checks membership INSIDE the transaction and refuses a non-admin who gained one", async () => {
      // The preHandler guard reads membership outside the transaction that
      // establishes it, so two concurrent bootstraps can both pass it. This
      // re-check is the authority.
      const venueCreate = vi.fn();
      const membershipCreate = vi.fn();
      const membershipCount = vi.fn().mockResolvedValue(1);
      vi.mocked(prisma.$transaction).mockImplementationOnce((async (
        fn: (tx: TxLike) => Promise<unknown>
      ) =>
        fn({
          venue: { create: venueCreate },
          venueMembership: { create: membershipCreate, count: membershipCount },
        })) as never);

      await expect(
        venueService.create(
          { name: "Second Venue", slug: "second", ianaTimezone: "UTC" },
          "auth0|raced",
          { isAdmin: false }
        )
      ).rejects.toBeInstanceOf(VenueBootstrapForbiddenError);

      expect(membershipCount).toHaveBeenCalledWith({ where: { userSub: "auth0|raced" } });
      expect(venueCreate).not.toHaveBeenCalled();
      expect(membershipCreate).not.toHaveBeenCalled();
    });

    it("admits a non-admin whose membership count is still zero at commit time", async () => {
      const created = makePrismaVenue();
      const venueCreate = vi.fn().mockResolvedValue(created);
      const membershipCreate = vi.fn().mockResolvedValue({
        id: "vm-seeded",
        userSub: "auth0|owner",
        venueId: "venue-1",
        role: "owner",
        createdAt: NOW,
        updatedAt: NOW,
      });
      const membershipCount = vi.fn().mockResolvedValue(0);
      vi.mocked(prisma.$transaction).mockImplementationOnce((async (
        fn: (tx: TxLike) => Promise<unknown>
      ) =>
        fn({
          venue: { create: venueCreate },
          venueMembership: { create: membershipCreate, count: membershipCount },
        })) as never);

      const result = await venueService.create(
        { name: "First Venue", slug: "first", ianaTimezone: "UTC" },
        "auth0|brand-new",
        { isAdmin: false }
      );

      expect(result.id).toBe("venue-1");
      expect(membershipCount).toHaveBeenCalledTimes(1);
      expect(membershipCreate).toHaveBeenCalled();
    });

    it("skips the re-check entirely for an admin", async () => {
      const created = makePrismaVenue();
      const membershipCount = vi.fn();
      vi.mocked(prisma.$transaction).mockImplementationOnce((async (
        fn: (tx: TxLike) => Promise<unknown>
      ) =>
        fn({
          venue: { create: vi.fn().mockResolvedValue(created) },
          venueMembership: {
            create: vi.fn().mockResolvedValue({
              id: "vm-seeded",
              userSub: "auth0|owner",
              venueId: "venue-1",
              role: "owner",
              createdAt: NOW,
              updatedAt: NOW,
            }),
            count: membershipCount,
          },
        })) as never);

      await venueService.create(
        { name: "Nth Venue", slug: "nth", ianaTimezone: "UTC" },
        "auth0|admin",
        { isAdmin: true }
      );

      // Admins may hold many venues; the bootstrap invariant does not apply.
      expect(membershipCount).not.toHaveBeenCalled();
    });

    it("runs the bootstrap transaction at Serializable isolation", async () => {
      // READ COMMITTED lets two concurrent bootstraps each see zero memberships
      // and both commit, which the in-transaction re-check alone cannot prevent.
      const created = makePrismaVenue();
      vi.mocked(prisma.$transaction).mockImplementationOnce((async (
        fn: (tx: TxLike) => Promise<unknown>
      ) =>
        fn({
          venue: { create: vi.fn().mockResolvedValue(created) },
          venueMembership: {
            create: vi.fn().mockResolvedValue({
              id: "vm-seeded",
              userSub: "auth0|owner",
              venueId: "venue-1",
              role: "owner",
              createdAt: NOW,
              updatedAt: NOW,
            }),
            count: vi.fn().mockResolvedValue(0),
          },
        })) as never);

      await venueService.create(
        { name: "First Venue", slug: "first", ianaTimezone: "UTC" },
        "auth0|brand-new",
        { isAdmin: false }
      );

      expect(prisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ isolationLevel: "Serializable" })
      );
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
