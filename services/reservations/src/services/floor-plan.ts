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
import {
  paginate,
  toPaginationMeta,
  isPrismaNotFound,
  isPrismaForeignKeyViolation,
} from "@mbe/database";
import { Prisma } from "../generated/prisma/index.js";
import { prisma } from "./database.js";
import { toTable } from "./serializers.js";
import { materialiseSectionClosures } from "./section-closure-materialise.js";
import { setVenueContext } from "../middleware/venue-context.js";

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

function mapPrismaFloorPlan(floorPlan: PrismaFloorPlan): FloorPlan {
  return {
    id: floorPlan.id,
    venueId: floorPlan.venueId,
    name: floorPlan.name,
    isActive: floorPlan.isActive,
    layoutJson: floorPlan.layoutJson as FloorPlanLayout,
    tables: floorPlan.tables?.map(toTable),
    createdAt: floorPlan.createdAt.toISOString(),
    updatedAt: floorPlan.updatedAt.toISOString(),
  };
}

/**
 * A venue-unique name for each of `desired`, in order: the name itself when
 * free, else the first `candidate(name, n)` (n = 2, 3, …) nobody holds yet.
 *
 * Table names are unique per **venue** (`tables_venue_id_name_key`), not per
 * plan, and that is relied on: the agent's `resolveTable` and onboarding's
 * `launch-sequence.ts` resolve a table by name across the whole venue. So a
 * cloned table cannot keep its source's name (#8255). `T1` → `T1-2` matches the
 * scheme `apply-room-template.ts` already uses for a venue's later plans.
 */
function venueUniqueNames(
  desired: readonly string[],
  taken: readonly string[],
  candidate: (name: string, n: number) => string
): string[] {
  const used = new Set(taken);
  return desired.map((name) => {
    let pick = used.has(name) ? candidate(name, 2) : name;
    for (let n = 3; used.has(pick); n += 1) pick = candidate(name, n);
    used.add(pick);
    return pick;
  });
}

/**
 * `deleted` and `archived` both mean the plan is gone for the caller;
 * `active` and `in_use` are refusals the route answers with a 409.
 */
export type FloorPlanDeleteOutcome =
  "deleted" | "archived" | "active" | "has_upcoming" | "in_use" | "not_found";

/** Statuses of a booking that is over or never happened: it does not hold a table. */
const SETTLED_STATUSES = ["CANCELLED", "NO_SHOW", "COMPLETED"] as const;

export const floorPlanService = {
  async list(page: number, limit: number, venueId?: string): Promise<PaginatedResponse<FloorPlan>> {
    const where = { archivedAt: null, ...(venueId ? { venueId } : {}) };

    const [floorPlans, total] = await Promise.all([
      prisma.floorPlan.findMany({
        where,
        ...paginate({ page, limit }),
        orderBy: { name: "asc" },
        include: { tables: true },
      }),
      prisma.floorPlan.count({ where }),
    ]);

    return {
      data: floorPlans.map(mapPrismaFloorPlan),
      pagination: toPaginationMeta(page, limit, total),
    };
  },

  /**
   * Same as {@link list}, scoped to venues the caller belongs to
   * (`VenueMembership`). Used for non-admin callers of `GET /floor-plans` so
   * they can never enumerate floor plans — including layoutJson — for a
   * venue they are not a member of (#4015).
   */
  async listForMember(
    userSub: string,
    page: number,
    limit: number,
    venueId?: string
  ): Promise<PaginatedResponse<FloorPlan>> {
    const where: Prisma.FloorPlanWhereInput = {
      archivedAt: null,
      venue: { memberships: { some: { userSub } } },
      ...(venueId ? { venueId } : {}),
    };

    const [floorPlans, total] = await Promise.all([
      prisma.floorPlan.findMany({
        where,
        ...paginate({ page, limit }),
        orderBy: { name: "asc" },
        include: { tables: true },
      }),
      prisma.floorPlan.count({ where }),
    ]);

    return {
      data: floorPlans.map(mapPrismaFloorPlan),
      pagination: toPaginationMeta(page, limit, total),
    };
  },

  async getById(id: string): Promise<FloorPlan | null> {
    const floorPlan = await prisma.floorPlan.findFirst({
      where: { id, archivedAt: null },
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
    const source = await prisma.floorPlan.findFirst({
      where: { id, archivedAt: null },
      include: { tables: true },
    });
    if (!source) return null;

    // Handle name collisions: find next available copy name
    const baseName = source.name;
    // Every plan name in the venue: the first copy's `Copy of …` does not start
    // with `baseName`, so a `startsWith` filter missed it and a second clone
    // reused the same name.
    const existingNames = await prisma.floorPlan.findMany({
      where: { venueId: source.venueId },
      select: { name: true },
    });
    const existingNameSet = new Set(existingNames.map((n) => n.name));

    let newName = `Copy of ${baseName}`;
    if (existingNameSet.has(newName)) {
      let copyNum = 2;
      while (existingNameSet.has(`${baseName} (Copy ${copyNum})`)) {
        copyNum++;
      }
      newName = `${baseName} (Copy ${copyNum})`;
    }

    const cloned = await prisma.$transaction(async (tx) => {
      // This `prisma.$transaction` call bypasses the per-call auto-wrap
      // `services/venue-scoped-prisma.ts` gives the `prisma` export — set
      // app.venue_id on THIS transaction's own `tx` explicitly (ADR-026
      // part 6), using the source floor plan's own (already-resolved)
      // venue rather than the request-scoped store, since it's more precise.
      await setVenueContext(tx, source.venueId);

      const newFloorPlan = await tx.floorPlan.create({
        data: {
          venueId: source.venueId,
          name: newName,
          isActive: false,
          layoutJson: source.layoutJson as Prisma.InputJsonValue,
        },
      });

      if (source.tables.length > 0) {
        // Copies keep the source's flag only while the venue has an active
        // plan. With none, every active table is bookable (#8276), so an
        // active copy would double online capacity (#8255).
        const venueHasActivePlan =
          (await tx.floorPlan.count({ where: { venueId: source.venueId, isActive: true } })) > 0;
        const venueTables = await tx.table.findMany({
          where: { venueId: source.venueId },
          select: { name: true },
        });
        const copyNames = venueUniqueNames(
          source.tables.map((t) => t.name),
          venueTables.map((t) => t.name),
          (name, n) => `${name}-${n}`
        );
        await tx.table.createMany({
          data: source.tables.map((t, i) => ({
            name: copyNames[i]!,
            tableNumber: t.tableNumber,
            capacity: t.capacity,
            minCovers: t.minCovers,
            maxCovers: t.maxCovers,
            location: t.location,
            isActive: venueHasActivePlan && t.isActive,
            priority: t.priority,
            status: "AVAILABLE",
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

    if (!cloned) return null;

    return mapPrismaFloorPlan(cloned);
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
        where: { id, archivedAt: null },
        data: updateData,
        include: { tables: true },
      });
      return mapPrismaFloorPlan(floorPlan);
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return null;
      throw err;
    }
  },

  /**
   * Deletes a floor plan in one transaction (#8254). Reservations and holds
   * reference tables with ON DELETE RESTRICT and are never deleted, so a plan
   * whose tables carry any (even cancelled or expired) history is archived
   * instead: hidden from every read, its tables taken out of service and
   * renamed so the venue can reuse their names. The active plan is refused —
   * the venue must never be left without one — and so is a plan with a booking
   * still to come, which would otherwise sit on a table no longer shown.
   */
  async delete(id: string): Promise<FloorPlanDeleteOutcome> {
    // Read through the venue-scoped client first: the explicit transaction
    // below must set app.venue_id itself (ADR-026 part 6), so it needs the venue.
    const found = await prisma.floorPlan.findFirst({
      where: { id, archivedAt: null },
      select: { venueId: true },
    });
    if (!found) return "not_found";
    const { venueId } = found;

    try {
      return await prisma.$transaction(async (tx) => {
        await setVenueContext(tx, venueId);
        // Lock the plan row so a concurrent activate cannot slip in between
        // the active check and the delete.
        const [plan] = await tx.$queryRaw<Array<{ isActive: boolean; archivedAt: Date | null }>>`
          SELECT is_active AS "isActive", archived_at AS "archivedAt"
          FROM floor_plans WHERE id = ${id} FOR UPDATE
        `;
        if (!plan || plan.archivedAt) return "not_found" as const;
        if (plan.isActive) return "active" as const;

        const tables = await tx.table.findMany({
          where: { floorPlanId: id },
          select: { id: true, name: true },
        });
        const tableIds = tables.map((t) => t.id);
        const upcoming = await tx.reservation.count({
          where: {
            tableId: { in: tableIds },
            status: { notIn: [...SETTLED_STATUSES] },
            endTime: { gt: new Date() },
          },
        });
        if (upcoming > 0) return "has_upcoming" as const;
        const [reservations, holds] = await Promise.all([
          tx.reservation.count({ where: { tableId: { in: tableIds } } }),
          tx.reservationHold.count({ where: { tableId: { in: tableIds } } }),
        ]);

        if (reservations + holds === 0) {
          // The plan's sections go with it (ON DELETE CASCADE): a live section closure becomes a
          // plain tables closure first (ADR-032), as when a section is deleted on its own.
          const sections = await tx.floorPlanSection.findMany({
            where: { floorPlanId: id },
            select: { id: true },
          });
          await materialiseSectionClosures(
            tx,
            venueId,
            sections.map((s) => s.id),
            new Date()
          );
          await tx.table.deleteMany({ where: { floorPlanId: id } });
          await tx.floorPlan.delete({ where: { id } });
          return "deleted" as const;
        }

        const ownNames = new Set(tables.map((t) => t.name));
        const venueTables = await tx.table.findMany({ where: { venueId }, select: { name: true } });
        const archivedNames = venueUniqueNames(
          tables.map((t) => `${t.name} (archived)`),
          venueTables.map((t) => t.name).filter((name) => !ownNames.has(name)),
          (name, n) => `${name.slice(0, -")".length)} ${n})`
        );
        for (const [i, table] of tables.entries()) {
          await tx.table.update({
            where: { id: table.id },
            data: { name: archivedNames[i]!, isActive: false },
          });
        }
        await tx.floorPlan.update({ where: { id }, data: { archivedAt: new Date() } });
        return "archived" as const;
      });
    } catch (err: unknown) {
      // A booking or hold committed on one of the tables after the history
      // check: the RESTRICT FK refuses the delete. Never surface the raw error.
      if (isPrismaForeignKeyViolation(err)) return "in_use";
      throw err;
    }
  },

  async setActive(id: string, venueId: string): Promise<FloorPlan | null> {
    try {
      const floorPlan = await prisma.$transaction(async (tx) => {
        // See the `clone()` comment above — this `$transaction` call also
        // bypasses the per-call auto-wrap, so it sets app.venue_id itself.
        await setVenueContext(tx, venueId);

        await tx.floorPlan.updateMany({
          where: { venueId, isActive: true },
          data: { isActive: false },
        });

        return tx.floorPlan.update({
          where: { id, archivedAt: null },
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
      return toTable(table);
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return null;
      throw err;
    }
  },

  async bulkUpdateTablePositions(
    floorPlanId: string,
    positions: UpdateTablePositionRequest[]
  ): Promise<Table[]> {
    if (positions.length === 0) return [];

    // The route authorizes the caller against the floor plan's venue, but every
    // tableId in `positions` is caller-supplied and unverified. Without a tenant
    // predicate on the statement itself, a member of one venue can name another
    // venue's tables and re-point them at their own floor plan. Resolve the
    // owning venue here so the UPDATE below can be scoped to it.
    const floorPlan = await prisma.floorPlan.findUnique({
      where: { id: floorPlanId },
      select: { venueId: true },
    });
    if (!floorPlan) {
      throw Object.assign(new Error("Floor plan not found"), { code: "P2025" });
    }

    // Postgres does not guarantee UPDATE ... RETURNING row order matches the
    // input VALUES order. Callers (the /tables/positions route and its
    // hospitality client) key results by table id, not by array position, so
    // this is safe — do not add positional-order assumptions downstream.
    const values = Prisma.join(
      positions.map(
        (pos) => Prisma.sql`(${pos.tableId}::text, ${JSON.stringify(pos.shapeMetadata)}::jsonb)`
      )
    );

    // A raw `$queryRaw` call bypasses `venue-scoped-prisma.ts`'s per-call
    // auto-wrap (`$`-prefixed methods pass through unwrapped, on purpose —
    // see that module's doc comment) and, unlike `prisma.model.method(...)`,
    // is not itself a single implicit transaction Postgres would wrap
    // `set_config` around — so it must open its own explicit transaction and
    // set app.venue_id there (ADR-026 part 6).
    const tables = await prisma.$transaction(async (tx) => {
      await setVenueContext(tx, floorPlan.venueId);
      return tx.$queryRaw<PrismaTable[]>`
        UPDATE tables AS t
        SET floor_plan_id = ${floorPlanId}, shape_metadata = v.shape_metadata
        FROM (VALUES ${values}) AS v(id, shape_metadata)
        WHERE t.id = v.id AND t.venue_id = ${floorPlan.venueId}
        RETURNING
          t.id,
          t.name,
          t.table_number AS "tableNumber",
          t.capacity,
          t.min_covers AS "minCovers",
          t.max_covers AS "maxCovers",
          t.location,
          t.is_active AS "isActive",
          t.status,
          t.priority,
          t.venue_id AS "venueId",
          t.floor_plan_id AS "floorPlanId",
          t.section_id AS "sectionId",
          t.shape_metadata AS "shapeMetadata",
          t.created_at AS "createdAt",
          t.updated_at AS "updatedAt"
      `;
    });

    // An unknown/deleted tableId — or, since the venue predicate above, one
    // belonging to another venue — simply doesn't match any row: the UPDATE
    // doesn't error, it just returns fewer rows. Fail loudly on a partial
    // match so this restores the pre-#3892 contract: throw the same P2025
    // shape isPrismaNotFound/classifyError already map to a 404, triggering
    // the client's rollback path instead of a silent 200.
    if (tables.length !== positions.length) {
      throw Object.assign(new Error("One or more tables not found"), { code: "P2025" });
    }

    return tables.map(toTable);
  },

  async assignTableToFloorPlan(
    tableId: string,
    floorPlanId: string,
    shapeMetadata?: TableShapeMetadata
  ): Promise<Table | null> {
    // The route authorizes on the body's floorPlanId, which leaves :tableId
    // caller-controlled and unchecked. Assert both sides resolve to the same
    // venue before writing, so a member of one venue cannot pull another
    // venue's table onto their own floor plan (and vice versa). A table with
    // no venue is refused too: it can never match a floor plan's venue, and
    // adopting an orphan row is the same leak by another route.
    const [existing, floorPlan] = await Promise.all([
      prisma.table.findUnique({ where: { id: tableId }, select: { venueId: true } }),
      prisma.floorPlan.findUnique({ where: { id: floorPlanId }, select: { venueId: true } }),
    ]);
    if (!existing?.venueId || !floorPlan || existing.venueId !== floorPlan.venueId) {
      return null;
    }

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
      return toTable(table);
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
          sectionId: null,
          shapeMetadata: Prisma.DbNull,
        },
      });
      return toTable(table);
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return null;
      throw err;
    }
  },
};
