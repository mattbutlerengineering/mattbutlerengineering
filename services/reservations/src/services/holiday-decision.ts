import {
  HolidayDecisionKindSchema,
  type HolidayDecision,
  type HolidayDecisionKind,
} from "@mbe/types";
import type { PrismaClient } from "../generated/prisma/index.js";
import { setVenueContext } from "../middleware/venue-context.js";
import { prisma } from "./database.js";
import { toDbDate } from "./availability-config.js";

/**
 * The venue's holiday decisions (docs/features/availability-holidays-copy/architecture.md § A).
 * A Manager's answer for one holiday that does not change the hours. Nothing in the availability
 * engine, the config or the booking path reads this table; it is only read and written here.
 *
 * Every call runs in one transaction under the venue's RLS context and returns `null` / `false`
 * for a venue that does not exist (the route answers 404).
 */

type StoreClient = Pick<PrismaClient, "$transaction">;
type Db = Pick<PrismaClient, "venue" | "venueHolidayDecision">;

/** The part of the request logger the reader needs. */
export interface DecisionLogger {
  warn(obj: object, msg: string): void;
}

const toDay = (d: Date): string => d.toISOString().slice(0, 10);

const toWire = (row: {
  serviceDate: Date;
  decision: HolidayDecisionKind;
  createdAt: Date;
}): HolidayDecision => ({
  serviceDate: toDay(row.serviceDate),
  decision: row.decision,
  createdAt: row.createdAt.toISOString(),
});

/** Runs `work` in the venue's context, or returns `missing` when the venue does not exist. */
async function inVenue<T, M>(
  client: StoreClient,
  venueId: string,
  missing: M,
  work: (db: Db) => Promise<T>
): Promise<T | M> {
  return client.$transaction(async (tx) => {
    await setVenueContext(tx, venueId);
    const db = tx as unknown as Db;
    const venue = await db.venue.findUnique({ where: { id: venueId }, select: { id: true } });
    return venue ? work(db) : missing;
  });
}

/** Decisions from `range.from` to `range.to` inclusive, by date; a row with an unknown decision is skipped and logged. */
function listHolidayDecisions(
  venueId: string,
  range: { from: string; to: string },
  logger?: DecisionLogger,
  client: StoreClient = prisma
): Promise<HolidayDecision[] | null> {
  return inVenue(client, venueId, null, async (db) => {
    const rows = await db.venueHolidayDecision.findMany({
      where: {
        venueId,
        serviceDate: { gte: toDbDate(range.from)!, lte: toDbDate(range.to)! },
      },
      orderBy: { serviceDate: "asc" },
    });
    return rows.flatMap((row) => {
      const decision = HolidayDecisionKindSchema.safeParse(row.decision);
      if (!decision.success) {
        logger?.warn(
          { venueId, serviceDate: toDay(row.serviceDate), decision: row.decision },
          "holiday_decision_row_invalid"
        );
        return [];
      }
      return [toWire({ ...row, decision: decision.data })];
    });
  });
}

export interface SetHolidayDecisionInput {
  venueId: string;
  serviceDate: string;
  decision: HolidayDecisionKind;
  actorId: string;
}

/** An idempotent upsert: a repeat returns the existing row, its first author and time unchanged. */
function setHolidayDecision(
  input: SetHolidayDecisionInput,
  client: StoreClient = prisma
): Promise<HolidayDecision | null> {
  const { venueId, decision, actorId } = input;
  const serviceDate = toDbDate(input.serviceDate)!;
  return inVenue(client, venueId, null, async (db) => {
    // `update: { decision }`, not `{}`: Prisma compiles an upsert to one `INSERT … ON CONFLICT DO
    // UPDATE` only when the update is non-empty (an empty one becomes SELECT then INSERT, which
    // concurrent sets race into a unique violation, a 500). Re-writing the same value leaves
    // `createdByUserId` and `createdAt`, the first author and time, untouched.
    const row = await db.venueHolidayDecision.upsert({
      where: { venueId_serviceDate: { venueId, serviceDate } },
      create: { venueId, serviceDate, decision, createdByUserId: actorId },
      update: { decision },
    });
    return toWire({ ...row, decision: HolidayDecisionKindSchema.parse(row.decision) });
  });
}

/** Idempotent: a date with no decision still succeeds. `false` only when the venue does not exist. */
async function clearHolidayDecision(
  venueId: string,
  serviceDate: string,
  client: StoreClient = prisma
): Promise<boolean> {
  return inVenue(client, venueId, false, async (db) => {
    await db.venueHolidayDecision.deleteMany({
      where: { venueId, serviceDate: toDbDate(serviceDate)! },
    });
    return true;
  });
}

/** The store as a domain-service record, for the `buildApp({ services })` seam. */
export const holidayDecisionService = {
  list: listHolidayDecisions,
  set: setHolidayDecision,
  clear: clearHolidayDecision,
};
