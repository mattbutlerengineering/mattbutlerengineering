import type {
  Venue,
  VenueGroup,
  VenueSettings,
  DepositType,
  PublicVenueConfig,
  CreateVenueRequest,
  UpdateVenueRequest,
  CreateVenueGroupRequest,
  UpdateVenueGroupRequest,
  PaginatedResponse,
} from "@mbe/types";
import { paginate, toPaginationMeta, isPrismaNotFound } from "@mbe/database";
import type { Prisma } from "../generated/prisma/index.js";
import { prisma } from "./database.js";

/**
 * Typed projection of a venue's deposit & cancellation policy, plus the
 * identity and currency needed to act on it. Returned by
 * {@link venueService.getPolicyById} / {@link venueService.getPolicyBySlug} so the
 * deposit/cancellation money path consumes exactly these fields behind the
 * serializer seam — never a raw Prisma venue row.
 */
export interface VenuePolicy {
  id: string;
  slug: string;
  currencyCode: string;
  depositEnabled: boolean;
  depositType: DepositType | null;
  depositAmountCents: number | null;
  freeCancellationHours: number | null;
  lateCancellationFeePercent: number | null;
  noShowFeePercent: number | null;
}

/** Exact set of columns projected onto {@link VenuePolicy} — no other row data escapes. */
const venuePolicySelect = {
  id: true,
  slug: true,
  currencyCode: true,
  depositEnabled: true,
  depositType: true,
  depositAmountCents: true,
  freeCancellationHours: true,
  lateCancellationFeePercent: true,
  noShowFeePercent: true,
} satisfies Prisma.VenueSelect;

function mapVenuePolicy(row: {
  id: string;
  slug: string;
  currencyCode: string;
  depositEnabled: boolean;
  depositType: DepositType | null;
  depositAmountCents: number | null;
  freeCancellationHours: number | null;
  lateCancellationFeePercent: number | null;
  noShowFeePercent: number | null;
}): VenuePolicy {
  return {
    id: row.id,
    slug: row.slug,
    currencyCode: row.currencyCode,
    depositEnabled: row.depositEnabled,
    depositType: row.depositType,
    depositAmountCents: row.depositAmountCents,
    freeCancellationHours: row.freeCancellationHours,
    lateCancellationFeePercent: row.lateCancellationFeePercent,
    noShowFeePercent: row.noShowFeePercent,
  };
}

function mapPrismaVenueGroup(group: {
  id: string;
  name: string;
  slug: string;
  settings: unknown;
  createdAt: Date;
}): VenueGroup {
  return {
    id: group.id,
    name: group.name,
    slug: group.slug,
    settings: group.settings as Record<string, unknown> | null,
    createdAt: group.createdAt.toISOString(),
  };
}

function mapPrismaVenue(venue: {
  id: string;
  venueGroupId: string | null;
  venueGroup?: {
    id: string;
    name: string;
    slug: string;
    settings: unknown;
    createdAt: Date;
  } | null;
  name: string;
  slug: string;
  ianaTimezone: string;
  currencyCode: string;
  operatingHours: unknown;
  settings: unknown;
  createdAt: Date;
  updatedAt: Date;
}): Venue {
  return {
    id: venue.id,
    venueGroupId: venue.venueGroupId,
    venueGroup: venue.venueGroup ? mapPrismaVenueGroup(venue.venueGroup) : undefined,
    name: venue.name,
    slug: venue.slug,
    ianaTimezone: venue.ianaTimezone,
    currencyCode: venue.currencyCode,
    operatingHours: venue.operatingHours as Venue["operatingHours"],
    settings: venue.settings as Venue["settings"],
    createdAt: venue.createdAt.toISOString(),
    updatedAt: venue.updatedAt.toISOString(),
  };
}

export const venueGroupService = {
  async list(page: number, limit: number): Promise<PaginatedResponse<VenueGroup>> {
    const [groups, total] = await Promise.all([
      prisma.venueGroup.findMany({
        ...paginate({ page, limit }),
        orderBy: { name: "asc" },
      }),
      prisma.venueGroup.count(),
    ]);

    return {
      data: groups.map(mapPrismaVenueGroup),
      pagination: toPaginationMeta(page, limit, total),
    };
  },

  async getById(id: string): Promise<VenueGroup | null> {
    const group = await prisma.venueGroup.findUnique({ where: { id } });
    return group ? mapPrismaVenueGroup(group) : null;
  },

  async getBySlug(slug: string): Promise<VenueGroup | null> {
    const group = await prisma.venueGroup.findUnique({ where: { slug } });
    return group ? mapPrismaVenueGroup(group) : null;
  },

  async create(data: CreateVenueGroupRequest): Promise<VenueGroup> {
    const group = await prisma.venueGroup.create({
      data: {
        name: data.name,
        slug: data.slug,
        settings: data.settings as Prisma.InputJsonValue | undefined,
      },
    });
    return mapPrismaVenueGroup(group);
  },

  async update(id: string, data: UpdateVenueGroupRequest): Promise<VenueGroup | null> {
    try {
      const updateData: Prisma.VenueGroupUpdateInput = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.slug !== undefined) updateData.slug = data.slug;
      if (data.settings !== undefined) updateData.settings = data.settings as Prisma.InputJsonValue;

      const group = await prisma.venueGroup.update({
        where: { id },
        data: updateData,
      });
      return mapPrismaVenueGroup(group);
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return null;
      throw err;
    }
  },

  async delete(id: string): Promise<boolean> {
    try {
      await prisma.venueGroup.delete({ where: { id } });
      return true;
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return false;
      throw err;
    }
  },
};

/** Contract for venue-group consumers; implemented by the `venueGroupService` singleton. */
export type VenueGroupService = typeof venueGroupService;

export const venueService = {
  async list(
    page: number,
    limit: number,
    venueGroupId?: string
  ): Promise<PaginatedResponse<Venue>> {
    const where = venueGroupId ? { venueGroupId } : {};

    const [venues, total] = await Promise.all([
      prisma.venue.findMany({
        where,
        ...paginate({ page, limit }),
        orderBy: { name: "asc" },
        include: { venueGroup: true },
      }),
      prisma.venue.count({ where }),
    ]);

    return {
      data: venues.map(mapPrismaVenue),
      pagination: toPaginationMeta(page, limit, total),
    };
  },

  /**
   * Lists only the venues the given operator is a member of (owns or was
   * invited to), scoped via VenueMembership (ADR-020). Platform admins bypass
   * this and use `list` instead. The `count` shares the same filter so
   * pagination totals reflect the scoped set.
   */
  async listForMember(
    userSub: string,
    page: number,
    limit: number,
    venueGroupId?: string
  ): Promise<PaginatedResponse<Venue>> {
    const where: Prisma.VenueWhereInput = {
      memberships: { some: { userSub } },
      ...(venueGroupId ? { venueGroupId } : {}),
    };

    const [venues, total] = await Promise.all([
      prisma.venue.findMany({
        where,
        ...paginate({ page, limit }),
        orderBy: { name: "asc" },
        include: { venueGroup: true },
      }),
      prisma.venue.count({ where }),
    ]);

    return {
      data: venues.map(mapPrismaVenue),
      pagination: toPaginationMeta(page, limit, total),
    };
  },

  async getById(id: string): Promise<Venue | null> {
    const venue = await prisma.venue.findUnique({
      where: { id },
      include: { venueGroup: true },
    });
    return venue ? mapPrismaVenue(venue) : null;
  },

  async getBySlug(slug: string, venueGroupId?: string): Promise<Venue | null> {
    const venue = await prisma.venue.findFirst({
      where: { slug, ...(venueGroupId ? { venueGroupId } : {}) },
      include: { venueGroup: true },
    });
    return venue ? mapPrismaVenue(venue) : null;
  },

  /**
   * Returns the venue's deposit/cancellation {@link VenuePolicy} by ID, or `null`
   * when the venue does not exist. Projects exactly the policy columns so the
   * money path (cancellation, modification) never touches a raw Prisma row.
   */
  async getPolicyById(id: string): Promise<VenuePolicy | null> {
    const venue = await prisma.venue.findUnique({
      where: { id },
      select: venuePolicySelect,
    });
    return venue ? mapVenuePolicy(venue) : null;
  },

  /**
   * Returns the venue's deposit/cancellation {@link VenuePolicy} by slug, or `null`
   * when the venue does not exist. Used by the public deposit-intent flow.
   */
  async getPolicyBySlug(slug: string): Promise<VenuePolicy | null> {
    const venue = await prisma.venue.findFirst({
      where: { slug },
      select: venuePolicySelect,
    });
    return venue ? mapVenuePolicy(venue) : null;
  },

  /**
   * Returns the typed public booking-widget config for a venue slug, or `null`
   * when the venue does not exist. Assembles the base config and deposit policy
   * behind the serializer seam so the public route never handles a raw Prisma
   * row (nor internal fields like `id`/`venueGroupId`).
   */
  async getPublicConfigBySlug(slug: string): Promise<PublicVenueConfig | null> {
    const venue = await prisma.venue.findFirst({
      where: { slug },
      select: {
        name: true,
        slug: true,
        ianaTimezone: true,
        currencyCode: true,
        operatingHours: true,
        settings: true,
        depositEnabled: true,
        depositType: true,
        depositAmountCents: true,
        freeCancellationHours: true,
        lateCancellationFeePercent: true,
        noShowFeePercent: true,
      },
    });
    if (!venue) return null;

    const settings = venue.settings as VenueSettings | null;

    return {
      name: venue.name,
      slug: venue.slug,
      ianaTimezone: venue.ianaTimezone,
      currencyCode: venue.currencyCode,
      operatingHours: venue.operatingHours as PublicVenueConfig["operatingHours"],
      settings: {
        defaultReservationDuration: settings?.defaultReservationDuration,
        maxPartySize: settings?.maxPartySize,
        maxAdvanceBooking: settings?.maxAdvanceBooking,
        slotIntervalMinutes: settings?.slotIntervalMinutes,
      },
      deposit: {
        enabled: venue.depositEnabled,
        depositType: venue.depositType,
        amountCents: venue.depositAmountCents,
        freeCancellationHours: venue.freeCancellationHours,
        lateCancellationFeePercent: venue.lateCancellationFeePercent,
        noShowFeePercent: venue.noShowFeePercent,
      },
    };
  },

  /**
   * Creates a venue. When `ownerSub` is supplied, the creator is atomically
   * seeded as the venue `owner` via a VenueMembership row (ADR-020) so their
   * scoped venue list (`listForMember`) surfaces the new venue immediately —
   * both writes share one transaction so a venue never persists without its
   * owner grant.
   */
  async create(data: CreateVenueRequest, ownerSub?: string): Promise<Venue> {
    const venueData = {
      venueGroupId: data.venueGroupId,
      name: data.name,
      slug: data.slug,
      ianaTimezone: data.ianaTimezone,
      currencyCode: data.currencyCode ?? "USD",
      operatingHours: data.operatingHours as Prisma.InputJsonValue | undefined,
      settings: data.settings as Prisma.InputJsonValue | undefined,
    };

    if (!ownerSub) {
      const venue = await prisma.venue.create({
        data: venueData,
        include: { venueGroup: true },
      });
      return mapPrismaVenue(venue);
    }

    const venue = await prisma.$transaction(async (tx) => {
      const created = await tx.venue.create({
        data: venueData,
        include: { venueGroup: true },
      });
      await tx.venueMembership.create({
        data: { userSub: ownerSub, venueId: created.id, role: "owner" },
      });
      return created;
    });
    return mapPrismaVenue(venue);
  },

  async update(id: string, data: UpdateVenueRequest): Promise<Venue | null> {
    try {
      const updateData: Prisma.VenueUpdateInput = {};
      if (data.venueGroupId !== undefined) {
        updateData.venueGroup = data.venueGroupId
          ? { connect: { id: data.venueGroupId } }
          : { disconnect: true };
      }
      if (data.name !== undefined) updateData.name = data.name;
      if (data.slug !== undefined) updateData.slug = data.slug;
      if (data.ianaTimezone !== undefined) updateData.ianaTimezone = data.ianaTimezone;
      if (data.currencyCode !== undefined) updateData.currencyCode = data.currencyCode;
      if (data.operatingHours !== undefined) {
        updateData.operatingHours = data.operatingHours as Prisma.InputJsonValue | undefined;
      }
      if (data.settings !== undefined) {
        updateData.settings = data.settings as Prisma.InputJsonValue | undefined;
      }

      const venue = await prisma.venue.update({
        where: { id },
        data: updateData,
        include: { venueGroup: true },
      });
      return mapPrismaVenue(venue);
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return null;
      throw err;
    }
  },

  async delete(id: string): Promise<boolean> {
    try {
      await prisma.venue.delete({ where: { id } });
      return true;
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return false;
      throw err;
    }
  },
};

/** Contract for venue consumers; implemented by the `venueService` singleton. */
export type VenueService = typeof venueService;
