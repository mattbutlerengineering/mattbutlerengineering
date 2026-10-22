import type {
  FloorPlanSection,
  CreateFloorPlanSectionRequest,
  UpdateFloorPlanSectionRequest,
  Table,
} from "@mbe/types";
import {
  CreateFloorPlanSectionRequestSchema,
  UpdateFloorPlanSectionRequestSchema,
} from "@mbe/types";
import { prisma } from "./database.js";
import { toTable } from "./serializers.js";
import { setVenueContext } from "../middleware/venue-context.js";

interface PrismaFloorPlanSection {
  id: string;
  venueId: string;
  floorPlanId: string;
  name: string;
  color: string;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

function mapSection(section: PrismaFloorPlanSection): FloorPlanSection {
  return {
    id: section.id,
    venueId: section.venueId,
    floorPlanId: section.floorPlanId,
    name: section.name,
    color: section.color,
    displayOrder: section.displayOrder,
    createdAt: section.createdAt.toISOString(),
    updatedAt: section.updatedAt.toISOString(),
  };
}

/** Explicit order, then name for a stable tie-break (same as menus). */
const BY_ORDER = [{ displayOrder: "asc" as const }, { name: "asc" as const }];

/**
 * Every method takes the `venueId` the route already authorised and filters on
 * it explicitly, on top of the RLS backstop (ADR-026): an id belonging to
 * another venue is indistinguishable from a missing one, so callers answer 404.
 */
export const floorPlanSectionService = {
  async list(venueId: string, floorPlanId?: string): Promise<FloorPlanSection[]> {
    const sections = await prisma.floorPlanSection.findMany({
      where: { venueId, ...(floorPlanId ? { floorPlanId } : {}) },
      orderBy: BY_ORDER,
    });
    return sections.map(mapSection);
  },

  /** `null` when the floor plan is not this venue's. */
  async create(
    venueId: string,
    data: CreateFloorPlanSectionRequest
  ): Promise<FloorPlanSection | null> {
    // Re-parsing strips unknown keys: an `id`/`venueId` smuggled into the body must never reach Prisma.
    const body = CreateFloorPlanSectionRequestSchema.parse(data);
    const floorPlan = await prisma.floorPlan.findFirst({
      where: { id: body.floorPlanId, venueId },
      select: { id: true },
    });
    if (!floorPlan) return null;
    return mapSection(await prisma.floorPlanSection.create({ data: { ...body, venueId } }));
  },

  async update(
    venueId: string,
    sectionId: string,
    data: UpdateFloorPlanSectionRequest
  ): Promise<FloorPlanSection | null> {
    const where = { id: sectionId, venueId };
    // Allowlist via the schema: a body `floorPlanId` would otherwise re-parent the section.
    const { count } = await prisma.floorPlanSection.updateMany({
      where,
      data: UpdateFloorPlanSectionRequestSchema.parse(data),
    });
    if (count === 0) return null;
    const section = await prisma.floorPlanSection.findFirst({ where });
    return section ? mapSection(section) : null;
  },

  /** Its tables are kept and become unassigned (`ON DELETE SET NULL`). */
  async delete(venueId: string, sectionId: string): Promise<boolean> {
    const { count } = await prisma.floorPlanSection.deleteMany({
      where: { id: sectionId, venueId },
    });
    return count > 0;
  },

  /**
   * Persists `displayOrder = index` for the given section ids. Returns `null`
   * (nothing written) unless every id is a distinct section of this floor plan
   * in this venue — a foreign or duplicated id fails the whole reorder.
   */
  async reorder(
    venueId: string,
    floorPlanId: string,
    ids: string[]
  ): Promise<FloorPlanSection[] | null> {
    if (new Set(ids).size !== ids.length) return null;
    // Explicit transaction: bypasses the per-call auto-wrap, so set the venue ourselves.
    return prisma.$transaction(async (tx) => {
      await setVenueContext(tx, venueId);
      const owned = await tx.floorPlanSection.count({
        where: { id: { in: ids }, floorPlanId, venueId },
      });
      if (owned !== ids.length) return null;
      for (const [displayOrder, id] of ids.entries()) {
        await tx.floorPlanSection.updateMany({
          where: { id, floorPlanId, venueId },
          data: { displayOrder },
        });
      }
      const sections = await tx.floorPlanSection.findMany({
        where: { floorPlanId, venueId },
        orderBy: BY_ORDER,
      });
      return sections.map(mapSection);
    });
  },

  /**
   * Makes `tableIds` the section's exact membership: they join it, and every
   * other table leaves it. Returns `null` (nothing written) unless the section
   * is this venue's and every table is a distinct table of the section's own
   * floor plan in this venue — a table cannot be pulled across plans or venues.
   */
  async assignTables(
    venueId: string,
    sectionId: string,
    tableIds: string[]
  ): Promise<Table[] | null> {
    const section = await prisma.floorPlanSection.findFirst({
      where: { id: sectionId, venueId },
      select: { floorPlanId: true },
    });
    if (!section) return null;
    const ids = [...new Set(tableIds)];
    return prisma.$transaction(async (tx) => {
      await setVenueContext(tx, venueId);
      const where = { id: { in: ids }, venueId, floorPlanId: section.floorPlanId };
      if ((await tx.table.count({ where })) !== ids.length) return null;
      await tx.table.updateMany({
        where: { venueId, sectionId, id: { notIn: ids } },
        data: { sectionId: null },
      });
      await tx.table.updateMany({ where, data: { sectionId } });
      const tables = await tx.table.findMany({ where: { venueId, sectionId } });
      return tables.map(toTable);
    });
  },
};
