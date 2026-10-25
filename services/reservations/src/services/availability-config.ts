import { randomUUID } from "node:crypto";
import {
  addDays,
  projectLegacyOperatingHours,
  resolveDay,
  validateConfig,
  type ConfigIssue,
} from "@mbe/availability";
import type {
  AvailabilityChangeSummary,
  AvailabilityConfig,
  AvailabilityConfigSource,
  AvailabilityDaySummary,
  PutAvailabilityConfigBody,
  StrandedReservation,
} from "@mbe/types";
import type { Prisma, PrismaClient } from "../generated/prisma/index.js";
import { setVenueContext } from "../middleware/venue-context.js";
import {
  affectedRange,
  applyChanges,
  diffConfig,
  inverseOf,
  referenceIssues,
  resolveScopeConflicts,
  type ConfigDiff,
  type ConfigInverse,
  type ReferenceIssue,
} from "./availability-config-plan.js";
import {
  findStrandedReservations,
  summarizeDay,
  type BookedReservation,
} from "./availability-config-checks.js";
import { readStoredConfig, writeConfigDiff, type ConfigRowDb } from "./availability-config-rows.js";
import { civilDateIn, planVenueMigration } from "./availability-migration.js";
import { prisma } from "./database.js";
import { NOT_BOOKED_STATUSES } from "./slot-rules.js";

/**
 * The availability config store (docs/features/venue-availability/
 * architecture.md § Availability store). Reads and writes the config rows
 * inside the venue's RLS context; every committed save bumps
 * `Venue.availabilityVersion` by compare-and-set, writes an
 * `AvailabilityChange` with its inverse, and rewrites the legacy
 * `Venue.operatingHours` as `projectLegacyOperatingHours(config)` — all in
 * one transaction.
 *
 * A venue with no rows yet (the backfill has not reached it, or its hours
 * could not be read) is served its legacy-derived config, with
 * `source: "legacy"`, and its version as stored: the backfill does not bump
 * `availabilityVersion`, so such a venue reads version 0 and its first save
 * makes it 1. There is no separate "migrated" version; compare-and-set only
 * needs the number to move on every save. The derived config's ids are
 * deterministic per venue, so a client that read it can address its rows,
 * and the first save writes the whole derived config as rows.
 */

type StoreDb = ConfigRowDb &
  Pick<PrismaClient, "venue" | "reservation" | "availabilityChange" | "table">;
type StoreClient = Pick<PrismaClient, "$transaction">;

export interface ConfigState {
  /** The rows as stored (empty for a venue with none). */
  stored: AvailabilityConfig;
  /** What the venue runs on: the rows, or the legacy-derived config. */
  effective: AvailabilityConfig;
  source: AvailabilityConfigSource;
  version: number;
  timezone: string;
  operatingHours: unknown;
}

const EMPTY_CONFIG: AvailabilityConfig = {
  schedules: [],
  venueServices: [],
  scheduleServices: [],
  assignments: [],
  dateRules: [],
};

/** Stable ids for a venue's legacy-derived config, the same on every read. */
function legacyIds(venueId: string): () => string {
  let n = 0;
  return () => `${venueId}-legacy-${++n}`;
}

export async function loadConfigState(
  db: StoreDb,
  venueId: string,
  now: Date
): Promise<ConfigState | null> {
  const [venue, stored] = await Promise.all([
    db.venue.findUnique({
      where: { id: venueId },
      select: {
        ianaTimezone: true,
        settings: true,
        operatingHours: true,
        availabilityVersion: true,
      },
    }),
    readStoredConfig(db, venueId),
  ]);
  if (!venue) return null;
  const base = {
    stored: stored.config,
    version: venue.availabilityVersion,
    timezone: venue.ianaTimezone,
    operatingHours: venue.operatingHours,
  };
  if (stored.hasRows) return { ...base, effective: stored.config, source: "rows" };
  const plan = planVenueMigration(venue, now, legacyIds(venueId));
  return plan.kind === "migrate"
    ? { ...base, effective: plan.config, source: "legacy" }
    : { ...base, effective: EMPTY_CONFIG, source: "empty" };
}

function readState(client: StoreClient, venueId: string, now: Date): Promise<ConfigState | null> {
  return client.$transaction(async (tx) => {
    await setVenueContext(tx, venueId);
    return loadConfigState(tx, venueId, now);
  });
}

export async function getAvailabilityConfig(
  venueId: string,
  now: Date,
  client: StoreClient = prisma
): Promise<{
  config: AvailabilityConfig;
  version: number;
  source: AvailabilityConfigSource;
} | null> {
  const state = await readState(client, venueId, now);
  return state && { config: state.effective, version: state.version, source: state.source };
}

/** Calendar summaries for `from`..`to` inclusive; the caller bounds the range. */
export async function listAvailabilityDays(
  venueId: string,
  from: string,
  to: string,
  now: Date,
  client: StoreClient = prisma
): Promise<AvailabilityDaySummary[] | null> {
  const state = await readState(client, venueId, now);
  if (!state) return null;
  const snapshot = { timezone: state.timezone, config: state.effective };
  const days: AvailabilityDaySummary[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    days.push(summarizeDay(state.effective, resolveDay(snapshot, date)));
  }
  return days;
}

// ── Save ────────────────────────────────────────────────────────────────────

export type SavePlan =
  | { kind: "invalid"; issues: (ConfigIssue | ReferenceIssue)[] }
  | { kind: "stranded"; reservations: StrandedReservation[] }
  | {
      kind: "write";
      next: AvailabilityConfig;
      diff: ConfigDiff;
      inverse: ConfigInverse;
      range: { from: string | null; to: string | null };
      summary: string;
    };

function describeDiff(diff: ConfigDiff): string {
  const count = (part: Record<string, unknown[]>) =>
    Object.values(part).reduce((n, rows) => n + rows.length, 0);
  return `Availability updated: ${count(diff.create)} added, ${count(diff.update)} changed, ${count(diff.remove)} removed`;
}

/** The decision half of a save, pure: what the change becomes, or why it is refused. */
export function planSave(input: {
  state: ConfigState;
  body: PutAvailabilityConfigBody;
  bookings: readonly BookedReservation[];
  /** Every table of the venue, active or not: a date rule may only block these. */
  tableIds: ReadonlySet<string>;
  now: Date;
  newId?: () => string;
}): SavePlan {
  const { state, body, bookings, now } = input;
  const applied = applyChanges(state.effective, body.changes, now.toISOString());
  const next = resolveScopeConflicts(
    state.effective,
    applied,
    body.scopeConflicts,
    input.newId ?? randomUUID
  );
  const issues = [...validateConfig(next), ...referenceIssues(next, input.tableIds)];
  if (issues.length > 0) return { kind: "invalid", issues };

  const reservations = findStrandedReservations(
    { timezone: state.timezone, config: state.effective },
    { timezone: state.timezone, config: next },
    bookings
  );
  if (reservations.length > 0) return { kind: "stranded", reservations };

  const diff = diffConfig(state.stored, next);
  return {
    kind: "write",
    next,
    diff,
    inverse: inverseOf(state.stored, diff, state.operatingHours),
    range: affectedRange(state.stored, diff, civilDateIn(now, state.timezone)),
    summary: describeDiff(diff),
  };
}

export type SaveOutcome =
  | { kind: "saved"; version: number; changeId: string }
  | { kind: "version_conflict"; winningChange: AvailabilityChangeSummary | null }
  | { kind: "not_found" }
  | Exclude<SavePlan, { kind: "write" }>;

/** Thrown inside the save transaction to roll back the version bump. */
class SaveRefused extends Error {
  constructor(readonly outcome: SaveOutcome) {
    super(outcome.kind);
  }
}

/** Future, still-booked reservations: the ones a change could strand. */
async function futureBookings(
  db: StoreDb,
  venueId: string,
  today: string,
  now: Date
): Promise<BookedReservation[]> {
  return db.reservation.findMany({
    where: {
      venueId,
      date: { gte: new Date(`${today}T00:00:00.000Z`) },
      startTime: { gte: now },
      status: { notIn: [...NOT_BOOKED_STATUSES] },
    },
    select: { id: true, tableId: true, startTime: true, partySize: true },
  });
}

async function refuseStale(db: StoreDb, venueId: string): Promise<SaveOutcome> {
  const exists = await db.venue.findUnique({ where: { id: venueId }, select: { id: true } });
  if (!exists) return { kind: "not_found" };
  const winner = await db.availabilityChange.findFirst({
    where: { venueId },
    orderBy: { at: "desc" },
    select: { id: true, actorId: true, at: true, kind: true, summary: true },
  });
  return {
    kind: "version_conflict",
    winningChange: winner && { ...winner, at: winner.at.toISOString() },
  };
}

const toDbDate = (d: string | null): Date | null => (d ? new Date(`${d}T00:00:00.000Z`) : null);

export async function saveAvailabilityConfig(
  input: { venueId: string; actorId: string; body: PutAvailabilityConfigBody; now: Date },
  client: StoreClient = prisma
): Promise<SaveOutcome> {
  const { venueId, actorId, body, now } = input;
  try {
    return await client.$transaction(async (tx) => {
      await setVenueContext(tx, venueId);
      // Compare-and-set first: it takes the venue row lock, so concurrent
      // saves serialize here and a stale one never reads past this point.
      const cas = await tx.venue.updateMany({
        where: { id: venueId, availabilityVersion: body.expectedVersion },
        data: { availabilityVersion: { increment: 1 } },
      });
      if (cas.count === 0) return refuseStale(tx, venueId);

      const state = await loadConfigState(tx, venueId, now);
      if (!state) throw new SaveRefused({ kind: "not_found" });
      const today = civilDateIn(now, state.timezone);
      const [bookings, tables] = await Promise.all([
        futureBookings(tx, venueId, today, now),
        tx.table.findMany({ where: { venueId }, select: { id: true } }),
      ]);
      const tableIds = new Set(tables.map((t) => t.id));
      const plan = planSave({ state, body, bookings, tableIds, now });
      if (plan.kind !== "write") throw new SaveRefused(plan);

      await writeConfigDiff(tx, venueId, plan.diff, { actorId, now });
      const change = await tx.availabilityChange.create({
        data: {
          venueId,
          actorId,
          at: now,
          kind: "config",
          summary: plan.summary,
          affectedFrom: toDbDate(plan.range.from),
          affectedTo: toDbDate(plan.range.to),
          inverse: plan.inverse as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      await tx.venue.update({
        where: { id: venueId },
        data: { operatingHours: projectLegacyOperatingHours(plan.next) },
      });
      return { kind: "saved" as const, version: body.expectedVersion + 1, changeId: change.id };
    });
  } catch (error) {
    if (error instanceof SaveRefused) return error.outcome;
    throw error;
  }
}

/** The store as a domain-service record, for the `buildApp({ services })` seam. */
export const availabilityConfigService = {
  get: getAvailabilityConfig,
  listDays: listAvailabilityDays,
  save: saveAvailabilityConfig,
};
