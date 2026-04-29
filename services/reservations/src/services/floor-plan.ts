import type {
  FloorPlan,
  FloorPlanLayout,
  Table,
  TableShapeMetadata,
  CreateFloorPlanRequest,
  UpdateFloorPlanRequest,
  UpdateTablePositionRequest,
  PaginatedResponse,
} from "@mbe/types";
import { Prisma } from "../generated/prisma/index.js";
import { prisma } from "./database.js";

function isPrismaNotFound(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: string }).code === "P2025"
  );
}

type PrismaFloorPlan = {
  id: string;
  venueId: string;
  name: string;
  isActive: boolean;
  layoutJson: unknown;
  createdAt: Date;
  updatedAt: Date;
  tables?: PrismaTable[];
};

type PrismaTable = {
  id: string;
  name: string;
  tableNumber: string | null;
  capacity: number;
  minCovers: number;
  maxCovers: number | null;
  location: string | null;
  isActive: boolean;
  priority: number;
  status: string;
  venueId: string | null;
  floorPlanId: string | null;
  shapeMetadata: unknown;
  createdAt: Date;
  updatedAt: Date;
};

function mapPrismaTable(table: PrismaTable): Table {
  return {
    id: table.id,
    name: table.name,
    tableNumber: table.tableNumber,
    capacity: table.capacity,
    minCovers: table.minCovers,
    maxCovers: table.maxCovers,
    location: table.location,
    isActive: table.isActive,
    priority: table.priority,
    status: table.status as Table["status"],
    venueId: table.venueId,
    floorPlanId: table.floorPlanId,
    shapeMetadata: table.shapeMetadata as TableShapeMetadata | null,
    createdAt: table.createdAt.toISOString(),
    updatedAt: table.updatedAt.toISOString(),
  };
}

function mapPrismaFloorPlan(floorPlan: PrismaFloorPlan): FloorPlan {
  return {
    id: floorPlan.id,
    venueId: floorPlan.venueId,
    name: floorPlan.name,
    isActive: floorPlan.isActive,
    layoutJson: floorPlan.layoutJson as FloorPlanLayout,
    tables: floorPlan.tables?.map(mapPrismaTable),
    createdAt: floorPlan.createdAt.toISOString(),
    updatedAt: floorPlan.updatedAt.toISOString(),
  };
}

export const floorPlanService = {
  async list(
    page: number,
    limit: number,
    venueId?: string
  ): Promise<PaginatedResponse<FloorPlan>> {
    const skip = (page - 1) * limit;
    const where = venueId ? { venueId } : {};

    const [floorPlans, total] = await Promise.all([
      prisma.floorPlan.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: "asc" },
        include: { tables: true },
      }),
      prisma.floorPlan.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: floorPlans.map(mapPrismaFloorPlan),
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

  async getById(id: string): Promise<FloorPlan | null> {
    const floorPlan = await prisma.floorPlan.findUnique({
      where: { id },
      include: { tables: true },
    });
    return floorPlan ? mapPrismaFloorPlan(floorPlan) : null;
  },

  async getActiveByVenueId(venueId: string): Promise<FloorPlan | null> {
    const floorPlan = await prisma.floorPlan.findFirst({
      where: { venueId, isActive: true },
      include: { tables: true },
    });
    return floorPlan ? mapPrismaFloorPlan(floorPlan) : null;
  },

  async create(data: CreateFloorPlanRequest): Promise<FloorPlan> {
    const floorPlan = await prisma.floorPlan.create({
      data: {
        venueId: data.venueId,
        name: data.name,
        isActive: data.isActive ?? false,
        layoutJson: data.layoutJson as unknown as Prisma.InputJsonValue,
      },
      include: { tables: true },
    });
    return mapPrismaFloorPlan(floorPlan);
  },

  async clone(id: string): Promise<FloorPlan | null> {
    const source = await prisma.floorPlan.findUnique({
      where: { id },
      include: { tables: true },
    });
    if (!source) return null;

    const cloned = await prisma.$transaction(async (tx) => {
      const newFloorPlan = await tx.floorPlan.create({
        data: {
          venueId: source.venueId,
          name: `Copy of ${source.name}`,
          isActive: false,
          layoutJson: source.layoutJson as Prisma.InputJsonValue,
        },
      });

      if (source.tables.length > 0) {
        await tx.table.createMany({
          data: source.tables.map((t) => ({
            name: t.name,
            tableNumber: t.tableNumber,
            capacity: t.capacity,
            minCovers: t.minCovers,
            maxCovers: t.maxCovers,
            location: t.location,
            isActive: t.isActive,
            priority: t.priority,
            status: t.status,
            venueId: t.venueId,
            floorPlanId: newFloorPlan.id,
            shapeMetadata: t.shapeMetadata as Prisma.InputJsonValue,
          })),
        });
      }

      return tx.floorPlan.findUnique({
        where: { id: newFloorPlan.id },
        include: { tables: true },
      });
    });

    return cloned ? mapPrismaFloorPlan(cloned) : null;
  },

  async update(id: string, data: UpdateFloorPlanRequest): Promise<FloorPlan | null> {
    try {
      const updateData: Prisma.FloorPlanUpdateInput = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;
      if (data.layoutJson !== undefined) {
        updateData.layoutJson = data.layoutJson as unknown as Prisma.InputJsonValue;
      }

      const floorPlan = await prisma.floorPlan.update({
        where: { id },
        data: updateData,
        include: { tables: true },
      });
      return mapPrismaFloorPlan(floorPlan);
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return null;
      throw err;
    }
  },

  async delete(id: string): Promise<boolean> {
    try {
      await prisma.table.deleteMany({
        where: { floorPlanId: id },
      });
      await prisma.floorPlan.delete({ where: { id } });
      return true;
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return false;
      throw err;
    }
  },

  async setActive(id: string, venueId: string): Promise<FloorPlan | null> {
    try {
      const floorPlan = await prisma.$transaction(async (tx) => {
        await tx.floorPlan.updateMany({
          where: { venueId, isActive: true },
          data: { isActive: false },
        });

        return tx.floorPlan.update({
          where: { id },
          data: { isActive: true },
          include: { tables: true },
        });
      });
      return mapPrismaFloorPlan(floorPlan);
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return null;
      throw err;
    }
  },

  async updateTablePosition(
    tableId: string,
    shapeMetadata: TableShapeMetadata
  ): Promise<Table | null> {
    try {
      const table = await prisma.table.update({
        where: { id: tableId },
        data: { shapeMetadata: shapeMetadata as unknown as Prisma.InputJsonValue },
      });
      return mapPrismaTable(table);
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return null;
      throw err;
    }
  },

  async bulkUpdateTablePositions(
    floorPlanId: string,
    positions: UpdateTablePositionRequest[]
  ): Promise<Table[]> {
    const updates = positions.map((pos) =>
      prisma.table.update({
        where: { id: pos.tableId },
        data: {
          floorPlanId,
          shapeMetadata: pos.shapeMetadata as unknown as Prisma.InputJsonValue,
        },
      })
    );

    const tables = await prisma.$transaction(updates);
    return tables.map(mapPrismaTable);
  },

  async assignTableToFloorPlan(
    tableId: string,
    floorPlanId: string,
    shapeMetadata?: TableShapeMetadata
  ): Promise<Table | null> {
    try {
      const table = await prisma.table.update({
        where: { id: tableId },
        data: {
          floorPlanId,
          shapeMetadata: shapeMetadata
            ? (shapeMetadata as unknown as Prisma.InputJsonValue)
            : undefined,
        },
      });
      return mapPrismaTable(table);
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return null;
      throw err;
    }
  },

  async removeTableFromFloorPlan(tableId: string): Promise<Table | null> {
    try {
      const table = await prisma.table.update({
        where: { id: tableId },
        data: {
          floorPlanId: null,
          shapeMetadata: Prisma.DbNull,
        },
      });
      return mapPrismaTable(table);
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return null;
      throw err;
    }
  },
};
