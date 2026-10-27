import { addDays, serviceDayInstant } from "@mbe/availability";
import type {
  AvailabilityChangeEntry,
  AvailabilityChangeOutcome,
  AvailabilityChangesPage,
  AvailabilityChangesParsed,
} from "@mbe/types";
import { Prisma, type PrismaClient } from "../generated/prisma/index.js";
import { setVenueContext } from "../middleware/venue-context.js";
import {
  commitSave,
  inSaveTransaction,
  refuseSave,
  type SaveOutcome,
  type StoreClient,
} from "./availability-config.js";
import { CONFIG_TABLES, type ConfigInverse } from "./availability-config-plan.js";
import { prisma } from "./database.js";

/**
 * History and undo (docs/features/venue-availability/architecture.md §
 * Availability store). `list` reads the audit rows; `revert` applies a row's
 * stored inverse as a new save through the config store's own path
 * (`commitSave`: compare-and-set, validation, stranded check, audit row), never
 * as a raw write.
 *
 * Undo is offered on the newest change only: its inverse is exact only against
 * the state that change left behind, and a change that told guests can never be
 * undone. A revert is itself a change (`kind: "revert"`, with its own inverse)
 * and is not revertable.
 */

export const REVERT_KIND = "revert";

const toDay = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

/**
 * The instant a venue-local civil day begins. A zone whose midnight does not exist
 * (a spring-forward at 00:00) begins the day at the first real wall time, 01:00, which is
 * the transition instant itself.
 */
function dayStart(d: string, timezone: string): Date {
  return (
    serviceDayInstant(d, 0, timezone) ??
    serviceDayInstant(d, 60, timezone) ??
    new Date(`${d}T00:00:00.000Z`)
  );
}

/** The counts a closure recorded in its meta; `null` on rows saved before they were. */
function outcomeOf(kind: string, inverse: unknown): AvailabilityChangeOutcome | null {
  if (kind !== "closure") return null;
  const meta = (inverse as { closure?: { outcome?: AvailabilityChangeOutcome } } | null)?.closure;
  return meta?.outcome ?? null;
}

function whereOf(
  venueId: string,
  query: AvailabilityChangesParsed,
  timezone: string
): Prisma.AvailabilityChangeWhereInput {
  return {
    venueId,
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(query.kind ? { kind: query.kind } : {}),
    ...(query.from || query.to
      ? {
          at: {
            ...(query.from ? { gte: dayStart(query.from, timezone) } : {}),
            ...(query.to ? { lt: dayStart(addDays(query.to, 1), timezone) } : {}),
          },
        }
      : {}),
  };
}

/** The newest change that is still in force: unreverted and not itself a revert. */
function newestInForce(db: Pick<StoreTx, "availabilityChange">, venueId: string) {
  return db.availabilityChange.findFirst({
    where: { venueId, revertedById: null, kind: { not: REVERT_KIND } },
    orderBy: [{ at: "desc" }, { id: "desc" }],
    select: { id: true },
  });
}

type StoreTx = Pick<PrismaClient, "venue" | "availabilityChange">;

export async function listAvailabilityChanges(
  venueId: string,
  query: AvailabilityChangesParsed,
  client: StoreClient = prisma
): Promise<AvailabilityChangesPage | null> {
  return client.$transaction(async (tx) => {
    await setVenueContext(tx, venueId);
    const db = tx as unknown as StoreTx;
    const venue = await db.venue.findUnique({
      where: { id: venueId },
      select: { id: true, ianaTimezone: true },
    });
    if (!venue) return null;
    const where = whereOf(venueId, query, venue.ianaTimezone);
    const [rows, total, newest] = await Promise.all([
      db.availabilityChange.findMany({
        where,
        orderBy: [{ at: "desc" }, { id: "desc" }],
        skip: query.offset,
        take: query.limit,
      }),
      db.availabilityChange.count({ where }),
      newestInForce(db, venueId),
    ]);
    const items: AvailabilityChangeEntry[] = rows.map((r) => ({
      id: r.id,
      actorId: r.actorId,
      at: r.at.toISOString(),
      kind: r.kind,
      summary: r.summary,
      affectedFrom: toDay(r.affectedFrom),
      affectedTo: toDay(r.affectedTo),
      notifiedGuests: r.notifiedGuests,
      revertedById: r.revertedById,
      outcome: outcomeOf(r.kind, r.inverse),
      revertible:
        r.id === newest?.id &&
        !r.notifiedGuests &&
        r.revertedById == null &&
        r.kind !== REVERT_KIND,
    }));
    return { total, offset: query.offset, items };
  });
}

export type RevertRefusalReason =
  "guests_notified" | "already_reverted" | "superseded" | "not_revertable";

export type RevertOutcome =
  SaveOutcome | { kind: "change_not_found" } | { kind: "refused"; reason: RevertRefusalReason };

const refused = (reason: RevertRefusalReason) => ({ kind: "refused" as const, reason });

/** Reads the stored inverse; `null` when it is not a version this code understands. */
function readInverse(value: unknown): ConfigInverse | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Partial<ConfigInverse>;
  if (v.version !== 1 || typeof v.restore !== "object" || typeof v.remove !== "object") {
    return null;
  }
  const tables = CONFIG_TABLES.every(
    (t) => Array.isArray(v.restore?.[t]) && Array.isArray(v.remove?.[t])
  );
  return tables ? (v as ConfigInverse) : null;
}

export async function revertAvailabilityChange(
  input: {
    venueId: string;
    changeId: string;
    actorId: string;
    expectedVersion: number;
    now: Date;
  },
  client: StoreClient = prisma
): Promise<RevertOutcome> {
  const { venueId, changeId, actorId, expectedVersion, now } = input;
  return inSaveTransaction<SaveOutcome, RevertOutcome>(client, venueId, (tx) =>
    commitSave(tx, { venueId, actorId, expectedVersion, now }, async (state) => {
      const change = await tx.availabilityChange.findFirst({ where: { id: changeId, venueId } });
      if (!change) return refuseSave({ kind: "change_not_found" });
      if (change.revertedById) return refuseSave(refused("already_reverted"));
      if (change.kind === REVERT_KIND) return refuseSave(refused("not_revertable"));
      if (change.notifiedGuests) return refuseSave(refused("guests_notified"));
      const newest = await newestInForce(tx, venueId);
      if (newest?.id !== change.id) return refuseSave(refused("superseded"));
      const inverse = readInverse(change.inverse);
      if (!inverse) return refuseSave(refused("not_revertable"));

      const stored = new Set(state.stored.dateRules.map((r) => r.id));
      const restore = inverse.restore;
      return {
        changes: { upsert: restore, remove: inverse.remove },
        scopeConflicts: "keep",
        // The inverse is the exact prior state: no scope-conflict skips on top.
        exact: true,
        kind: REVERT_KIND,
        summary: `Reverted: ${change.summary}`,
        // The column exactly as it was (null included), so undoing a venue's first
        // save puts its hours back rather than projecting an empty week over them.
        operatingHours: inverse.operatingHours == null ? Prisma.DbNull : inverse.operatingHours,
        allowNoHours: true,
        revive: new Set(restore.dateRules.map((r) => r.id).filter((id) => !stored.has(id))),
        afterChange: async (db, revertId) => {
          await db.availabilityChange.update({
            where: { id: changeId },
            data: { revertedById: revertId },
          });
        },
      };
    })
  );
}

/** The store as a domain-service record, for the `buildApp({ services })` seam. */
export const availabilityChangesService = {
  list: listAvailabilityChanges,
  revert: revertAvailabilityChange,
};
