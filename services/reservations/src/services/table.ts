import type {
  Table,
  CreateTableRequest,
  UpdateTableRequest,
  PaginatedResponse,
} from "@mbe/types";
import { prisma } from "./database.js";

function mapPrismaTable(table: {
  id: string;
  name: string;
  capacity: number;
  location: string | null;
  isActive: boolean;
  venueId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Table {
  return {
    id: table.id,
    name: table.name,
    capacity: table.capacity,
    location: table.location,
    isActive: table.isActive,
    venueId: table.venueId,
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
        capacity: data.capacity,
        location: data.location ?? null,
        venueId: data.venueId ?? null,
      },
    });
    return mapPrismaTable(table);
  },

  async update(id: string, data: UpdateTableRequest): Promise<Table | null> {
    try {
      const table = await prisma.table.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.capacity !== undefined && { capacity: data.capacity }),
          ...(data.location !== undefined && { location: data.location }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
        },
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
