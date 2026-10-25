import { randomUUID } from "node:crypto";
import {
  addDays,
  projectLegacyOperatingHours,
  resolveDay,
  type ConfigIssue,
} from "@mbe/availability";
import type {
  AvailabilityChangeSummary,
  AvailabilityConfig,
  AvailabilityConfigSource,
  AvailabilityDaySummary,
  PreviewAvailabilityParsed,
  PutAvailabilityConfigBody,
  StrandedReservation,
} from "@mbe/types";
import type { Prisma, PrismaClient } from "../generated/prisma/index.js";
import { setVenueContext } from "../middleware/venue-context.js";
import {
  affectedRange,
  diffConfig,
  inverseOf,
  settleDraft,
  type ConfigDiff,
  type ConfigInverse,
  type ReferenceIssue,
} from "./availability-config-plan.js";
import {
  findStrandedReservations,
  summarizeDay,
  type BookedReservation,
} from "./availability-config-checks.js";
import {
  ConfigRowConflict,
  readStoredConfig,
  writeConfigDiff,
  type ConfigRowDb,
} from "./availability-config-rows.js";
import { civilDateIn, planVenueMigration } from "./availability-migration.js";
import { planPreview, type PreviewPlan } from "./availability-preview.js";
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
  /** `legacy` only: days the lenient reader closed, and values it coerced. */
  legacyNotes?: LegacyNotes;
  /** `unreadable` only: why even the lenient reader could not read the hours. */
  legacyProblem?: { reason: string; detail: string };
  version: number;
  timezone: string;
  operatingHours: unknown;
}

export interface LegacyNotes {
  unreadableDays: string[];
  coercions: string[];
}

const hasRegularSchedule = (config: AvailabilityConfig): boolean =>
  config.schedules.some((s) => s.isRegular && !s.archivedAt);

/** The legacy-derived week with every stored row kept, so a save drops nothing. */
function withStored(legacy: AvailabilityConfig, stored: AvailabilityConfig): AvailabilityConfig {
  return {
    schedules: [...legacy.schedules, ...stored.schedules],
    venueServices: [...legacy.venueServices, ...stored.venueServices],
    scheduleServices: [...legacy.scheduleServices, ...stored.scheduleServices],
    assignments: [...legacy.assignments, ...stored.assignments],
    dateRules: [...legacy.dateRules, ...stored.dateRules],
  };
}

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
  // The same choice, and the same lenient read, as the live listing's
  // snapshot loader, so the editor and the stranded check both start from
  // what guests see.
  if (hasRegularSchedule(stored.config)) {
    return { ...base, effective: stored.config, source: "rows" };
  }
  const plan = planVenueMigration(venue, now, legacyIds(venueId), { lenient: true });
  if (plan.kind === "migrate") {
    const { unreadableDays = [], coercions = [] } = plan.notes;
    const notes = unreadableDays.length + coercions.length > 0;
    return {
      ...base,
      effective: withStored(plan.config, stored.config),
      source: "legacy",
      ...(notes ? { legacyNotes: { unreadableDays, coercions } } : {}),
    };
  }
  if (plan.reason === "no_hours") return { ...base, effective: stored.config, source: "empty" };
  // Not even the lenient reader can read it, and the listing serves it as
  // closed too: the editor starts from that, and says why.
  return {
    ...base,
    effective: stored.config,
    source: "unreadable",
    legacyProblem: { reason: plan.reason, detail: plan.detail },
  };
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
  legacyNotes?: LegacyNotes;
  legacyProblem?: { reason: string; detail: string };
} | null> {
  const state = await readState(client, venueId, now);
  if (!state) return null;
  const { effective: config, version, source, legacyNotes, legacyProblem } = state;
  return {
    config,
    version,
    source,
    ...(legacyNotes ? { legacyNotes } : {}),
    ...(legacyProblem ? { legacyProblem } : {}),
  };
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
  const { next, issues } = settleDraft({
    snapshot: { timezone: state.timezone, config: state.effective },
    changes: body.changes,
    scopeConflicts: body.scopeConflicts,
    tableIds: input.tableIds,
    now,
    today: civilDateIn(now, state.timezone),
    newId: input.newId ?? randomUUID,
  });
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
      // From yesterday's service day: a service running past midnight is still
      // yesterday's (ADR-029), and `startTime >= now` keeps the scan to the future.
      date: { gte: new Date(`${addDays(today, -1)}T00:00:00.000Z`) },
      startTime: { gte: now },
      status: { notIn: [...NOT_BOOKED_STATUSES] },
    },
    select: { id: true, tableId: true, startTime: true, partySize: true, date: true },
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

/** A unique-constraint refusal as the 422 a client can act on, addressed into the next config. */
function conflictIssue(error: ConfigRowConflict, next: AvailabilityConfig): SaveOutcome {
  const index = (next[error.table] as { id: string }[]).findIndex((r) => r.id === error.id);
  return {
    kind: "invalid",
    issues: [
      error.onId
        ? {
            path: `${error.table}[${index}].id`,
            code: "id_taken",
            message: "This id is already used; choose another.",
          }
        : {
            path: `${error.table}[${index}]`,
            code: "duplicate_row",
            message: "Another row already has these values.",
          },
    ],
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

      await writeConfigDiff(tx, venueId, plan.diff, { actorId, now }).catch((error: unknown) => {
        throw error instanceof ConfigRowConflict
          ? new SaveRefused(conflictIssue(error, plan.next))
          : error;
      });
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

// ── Preview ─────────────────────────────────────────────────────────────────

/** The server gives up on a preview after this long (architecture § Reservations HTTP). */
export const PREVIEW_TIMEOUT_MS = 5000;

export type PreviewOutcome = { kind: "not_found" } | { kind: "timeout" } | PreviewPlan;

/**
 * Read-only: loads the config and every future booking once, with no version
 * bump and no lock, then lets the pure planner compute the rest. Anything
 * that outlives the timeout is answered `timeout` (the caller returns 503).
 */
export async function previewAvailabilityConfig(
  input: {
    venueId: string;
    body: PreviewAvailabilityParsed;
    now: Date;
    timeoutMs?: number;
  },
  client: StoreClient = prisma
): Promise<PreviewOutcome> {
  const { venueId, body, now } = input;
  const run = client.$transaction(async (tx): Promise<PreviewOutcome> => {
    await setVenueContext(tx, venueId);
    const state = await loadConfigState(tx, venueId, now);
    if (!state) return { kind: "not_found" };
    const [bookings, tables] = await Promise.all([
      futureBookings(tx, venueId, civilDateIn(now, state.timezone), now),
      tx.table.findMany({ where: { venueId }, select: { id: true } }),
    ]);
    return planPreview({
      state,
      body,
      bookings,
      tableIds: new Set(tables.map((t) => t.id)),
      now,
    });
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<PreviewOutcome>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "timeout" }), input.timeoutMs ?? PREVIEW_TIMEOUT_MS);
  });
  try {
    return await Promise.race([run, timeout]);
  } finally {
    clearTimeout(timer);
    // A preview that lost the race still settles; its failure has no reader.
    run.catch(() => undefined);
  }
}

/** The store as a domain-service record, for the `buildApp({ services })` seam. */
export const availabilityConfigService = {
  get: getAvailabilityConfig,
  listDays: listAvailabilityDays,
  save: saveAvailabilityConfig,
  preview: previewAvailabilityConfig,
};
