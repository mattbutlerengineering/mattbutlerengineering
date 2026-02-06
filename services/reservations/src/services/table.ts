import type {
  Table,
  TableShapeMetadata,
  CreateTableRequest,
  UpdateTableRequest,
  PaginatedResponse,
} from "@mbe/types";
import { Prisma } from "@prisma/client";
import { prisma } from "./database.js";

function mapPrismaTable(table: {
  id: string;
  name: string;
  tableNumber: string | null;
  capacity: number;
  minCovers: number;
  maxCovers: number | null;
  location: string | null;
  isActive: boolean;
  priority: number;
  venueId: string | null;
  floorPlanId: string | null;
  shapeMetadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): Table {
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
    venueId: table.venueId,
    floorPlanId: table.floorPlanId,
    shapeMetadata: table.shapeMetadata as TableShapeMetadata | null,
    createdAt: table.createdAt.toISOString(),
    updatedAt: table.updatedAt.toISOString(),
  };
}

export const tableService = {
  async list(
    page: number,
    limit: number,
    activeOnly: boolean = false
  ): Promise<PaginatedResponse<Table>> {
    const skip = (page - 1) * limit;
    const where = activeOnly ? { isActive: true } : {};

    const [tables, total] = await Promise.all([
      prisma.table.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: "asc" },
      }),
      prisma.table.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: tables.map(mapPrismaTable),
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

  async getById(id: string): Promise<Table | null> {
    const table = await prisma.table.findUnique({ where: { id } });
    return table ? mapPrismaTable(table) : null;
  },

  async create(data: CreateTableRequest): Promise<Table> {
    const table = await prisma.table.create({
      data: {
        name: data.name,
        tableNumber: data.tableNumber ?? null,
        capacity: data.capacity,
        minCovers: data.minCovers ?? 1,
        maxCovers: data.maxCovers ?? null,
        location: data.location ?? null,
        priority: data.priority ?? 0,
        venueId: data.venueId ?? null,
        floorPlanId: data.floorPlanId ?? null,
        shapeMetadata: data.shapeMetadata
          ? (data.shapeMetadata as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
      },
    });
    return mapPrismaTable(table);
  },

  async update(id: string, data: UpdateTableRequest): Promise<Table | null> {
    try {
      const updateData: Prisma.TableUpdateInput = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.tableNumber !== undefined) updateData.tableNumber = data.tableNumber;
      if (data.capacity !== undefined) updateData.capacity = data.capacity;
      if (data.minCovers !== undefined) updateData.minCovers = data.minCovers;
      if (data.maxCovers !== undefined) updateData.maxCovers = data.maxCovers;
      if (data.location !== undefined) updateData.location = data.location;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;
      if (data.priority !== undefined) updateData.priority = data.priority;
      if (data.floorPlanId !== undefined) {
        updateData.floorPlan = data.floorPlanId
          ? { connect: { id: data.floorPlanId } }
          : { disconnect: true };
      }
      if (data.shapeMetadata !== undefined) {
        updateData.shapeMetadata = data.shapeMetadata
          ? (data.shapeMetadata as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull;
      }

      const table = await prisma.table.update({
        where: { id },
        data: updateData,
      });
      return mapPrismaTable(table);
    } catch {
      return null;
    }
  },

  async delete(id: string): Promise<boolean> {
    try {
      await prisma.table.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  },
};
