import type {
  Venue,
  VenueGroup,
  CreateVenueRequest,
  UpdateVenueRequest,
  CreateVenueGroupRequest,
  UpdateVenueGroupRequest,
  PaginatedResponse,
} from "@mbe/types";
import type { Prisma } from "../generated/prisma/index.js";
import { prisma } from "./database.js";

function isPrismaNotFound(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: string }).code === "P2025"
  );
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
    const skip = (page - 1) * limit;

    const [groups, total] = await Promise.all([
      prisma.venueGroup.findMany({
        skip,
        take: limit,
        orderBy: { name: "asc" },
      }),
      prisma.venueGroup.count(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: groups.map(mapPrismaVenueGroup),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
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

export const venueService = {
  async list(
    page: number,
    limit: number,
    venueGroupId?: string
  ): Promise<PaginatedResponse<Venue>> {
    const skip = (page - 1) * limit;
    const where = venueGroupId ? { venueGroupId } : {};

    const [venues, total] = await Promise.all([
      prisma.venue.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: "asc" },
        include: { venueGroup: true },
      }),
      prisma.venue.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: venues.map(mapPrismaVenue),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
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
   * Returns the raw Prisma venue record for a given slug, including deposit fields.
   * Use in routes that need deposit-specific fields not on the mapped Venue type.
   */
  async getRawBySlug(slug: string) {
    return prisma.venue.findFirst({ where: { slug } });
  },

  async create(data: CreateVenueRequest): Promise<Venue> {
    const venue = await prisma.venue.create({
      data: {
        venueGroupId: data.venueGroupId,
        name: data.name,
        slug: data.slug,
        ianaTimezone: data.ianaTimezone,
        currencyCode: data.currencyCode ?? "USD",
        operatingHours: data.operatingHours as Prisma.InputJsonValue | undefined,
        settings: data.settings as Prisma.InputJsonValue | undefined,
      },
      include: { venueGroup: true },
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
