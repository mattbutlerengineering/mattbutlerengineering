import type {
  Table,
  TableStatus,
  CreateTableRequest,
  UpdateTableRequest,
  PaginatedResponse,
} from "@mbe/types";
import { paginate, toPaginationMeta, isPrismaNotFound } from "@mbe/database";
import { Prisma } from "../generated/prisma/index.js";
import { prisma } from "./database.js";
import { setVenueContext } from "../middleware/venue-context.js";
import { getCurrentVenueId } from "./venue-context-store.js";
import { recordTableEvent, staffTableActor } from "./table-events.js";
import { toTable } from "./serializers.js";
import { transitionTable, TableTransitionError } from "./table-state-machine.js";

export { TableTransitionError };

export class TableConcurrentUpdateError extends Error {
  constructor(id: string, status: string) {
    super(
      `Table ${id} concurrent update conflict: lost race moving to ${status}. Another status change completed first.`
    );
    this.name = "TableConcurrentUpdateError";
  }
}

const VALID_TABLE_STATUSES: TableStatus[] = ["AVAILABLE", "OCCUPIED", "DIRTY", "READY"];

export const tableService = {
  async list(
    page: number,
    limit: number,
    activeOnly: boolean = false,
    venueId?: string
  ): Promise<PaginatedResponse<Table>> {
    const where: Record<string, unknown> = activeOnly ? { isActive: true } : {};
    if (venueId) {
      where.venueId = venueId;
    }

    const [tables, total] = await Promise.all([
      prisma.table.findMany({
        where,
        ...paginate({ page, limit }),
        orderBy: { name: "asc" },
      }),
      prisma.table.count({ where }),
    ]);

    return {
      data: tables.map(toTable),
      pagination: toPaginationMeta(page, limit, total),
    };
  },

  async getById(id: string): Promise<Table | null> {
    const table = await prisma.table.findUnique({ where: { id } });
    return table ? toTable(table) : null;
  },

  /**
   * Batched venue lookup for a set of table ids (one `findMany`, not N
   * `findUnique`s). Ids that don't resolve are simply absent from the result.
   * Runs on the ambient Prisma client, so it honors the caller's venue context.
   */
  async listVenueIdsByIds(ids: string[]): Promise<Array<{ id: string; venueId: string | null }>> {
    return prisma.table.findMany({
      where: { id: { in: ids } },
      select: { id: true, venueId: true },
    });
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
    return toTable(table);
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
      return toTable(table);
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return null;
      throw err;
    }
  },

  async updateStatus(id: string, status: string, userId?: string): Promise<Table | null> {
    if (!VALID_TABLE_STATUSES.includes(status as TableStatus)) {
      return null;
    }
    // Explicit transaction so the CAS and its event commit together. This call
    // bypasses the per-call auto-wrap `venue-scoped-prisma.ts` gives the
    // `prisma` export, so set app.venue_id on this `tx` ourselves (ADR-026 part 6).
    return prisma.$transaction(async (tx) => {
      await setVenueContext(tx, getCurrentVenueId());
      const current = await tx.table.findUnique({ where: { id } });
      if (!current) return null;
      transitionTable(current.status, status as TableStatus);
      const { count } = await tx.table.updateMany({
        where: { id, status: current.status },
        data: { status: status as TableStatus },
      });
      if (count === 0) throw new TableConcurrentUpdateError(id, status);
      await recordTableEvent(tx, {
        tableId: id,
        venueId: current.venueId,
        fromStatus: current.status,
        toStatus: status as TableStatus,
        actor: staffTableActor(userId),
      });
      const table = await tx.table.findUnique({ where: { id } });
      return table ? toTable(table) : null;
    });
  },

  async delete(id: string): Promise<boolean> {
    try {
      await prisma.table.delete({ where: { id } });
      return true;
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return false;
      throw err;
    }
  },
};
