import { randomUUID } from "node:crypto";
import {
  buildLegacyConfig,
  normalizeLegacyHours,
  projectLegacyOperatingHours,
  type LegacyMigrationNotes,
  type LegacyOperatingHours,
  type LegacyShape,
} from "@mbe/availability";
import type { AvailabilityConfig, VenueSettings } from "@mbe/types";
import type { Prisma, PrismaClient } from "../generated/prisma/index.js";
import { setVenueContext } from "../middleware/venue-context.js";

/**
 * Legacy `Venue.operatingHours` → availability rows (docs/features/
 * venue-availability/architecture.md § Migration). `planVenueMigration` is the
 * pure decision; `migrateVenue` applies it for one venue.
 *
 * Safety: additive only (inserts new rows, never deletes), idempotent (a venue
 * with a regular schedule is skipped), one transaction per venue inside that
 * venue's RLS context, and a venue whose hours cannot be read is left alone.
 * The legacy column is rewritten only when it is in the seed-array shape the
 * legacy slot code cannot read at all; a weekday-keyed value already is the
 * projection of what is written, so it is left byte-for-byte as it was.
 */

export const MIGRATION_ACTOR = "system:availability-legacy-migration";

export interface VenueForMigration {
  operatingHours: unknown;
  settings: unknown;
  ianaTimezone: string;
}

export type VenueMigrationPlan =
  | {
      kind: "migrate";
      shape: LegacyShape;
      config: AvailabilityConfig;
      notes: LegacyMigrationNotes;
      /** Set when the legacy column must be rewritten to stay readable. */
      projection: LegacyOperatingHours | null;
    }
  | { kind: "unrecognised"; reason: string; detail: string };

/** Today's civil date in a time zone, "YYYY-MM-DD". */
export function civilDateIn(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function planVenueMigration(
  venue: VenueForMigration,
  now: Date,
  newId: () => string = randomUUID
): VenueMigrationPlan {
  const normalised = normalizeLegacyHours(venue.operatingHours);
  if (!normalised.ok) {
    const detail = "detail" in normalised ? normalised.detail : "";
    return { kind: "unrecognised", reason: normalised.reason, detail };
  }
  const settings = (venue.settings ?? {}) as VenueSettings;
  const built = buildLegacyConfig({
    hours: normalised.hours,
    slotIntervalMinutes: settings.slotIntervalMinutes,
    lastSeatingBuffer: settings.lastSeatingBuffer,
    today: civilDateIn(now, venue.ianaTimezone),
    newId,
  });
  if (!built.ok) return { kind: "unrecognised", reason: built.reason, detail: built.detail };
  return {
    kind: "migrate",
    shape: normalised.shape,
    config: built.config,
    notes: built.notes,
    projection: normalised.shape === "weekday" ? null : projectLegacyOperatingHours(built.config),
  };
}

export type VenueMigrationOutcome =
  | {
      venueId: string;
      outcome: "migrated";
      shape: LegacyShape;
      notes: LegacyMigrationNotes;
      rows: number;
      legacyColumnRewritten: boolean;
    }
  | {
      venueId: string;
      outcome: "would_migrate";
      shape: LegacyShape;
      notes: LegacyMigrationNotes;
      rows: number;
      legacyColumnRewritten: boolean;
    }
  | { venueId: string; outcome: "already_migrated" }
  | { venueId: string; outcome: "unrecognised"; reason: string; detail: string }
  | { venueId: string; outcome: "not_found" };

const toDate = (serviceDate: string): Date => new Date(`${serviceDate}T00:00:00.000Z`);

async function writeConfig(
  tx: Prisma.TransactionClient,
  venueId: string,
  config: AvailabilityConfig
): Promise<void> {
  await tx.schedule.createMany({
    data: config.schedules.map((s) => ({
      id: s.id,
      venueId,
      name: s.name,
      kind: s.kind,
      isRegular: s.isRegular,
    })),
  });
  await tx.venueService.createMany({
    data: config.venueServices.map((s) => ({
      id: s.id,
      venueId,
      name: s.name,
      position: s.position,
    })),
  });
  await tx.scheduleService.createMany({
    data: config.scheduleServices.map((s) => ({
      id: s.id,
      venueId,
      scheduleId: s.scheduleId,
      venueServiceId: s.venueServiceId,
      opensAt: s.opensAt,
      lastSeatingAt: s.lastSeatingAt,
      closesAt: s.closesAt,
      seating: s.seating,
      bookingTypes: s.bookingTypes,
    })),
  });
  await tx.scheduleAssignment.createMany({
    data: config.assignments.map((a) => ({
      id: a.id,
      venueId,
      scheduleId: a.scheduleId,
      weekdays: a.weekdays,
      precedence: a.precedence,
    })),
  });
  await tx.dateRule.createMany({
    data: config.dateRules.map((r) => ({
      id: r.id,
      venueId,
      kind: r.kind,
      targetKind: r.targetKind,
      startsOn: toDate(r.startsOn),
      endsOn: r.endsOn ? toDate(r.endsOn) : null,
      staffNote: r.staffNote ?? null,
      ...(r.kind === "special_hours" ? { payload: r.payload } : {}),
      createdBy: MIGRATION_ACTOR,
    })),
  });
}

const countRows = (c: AvailabilityConfig): number =>
  c.schedules.length +
  c.venueServices.length +
  c.scheduleServices.length +
  c.assignments.length +
  c.dateRules.length;

/**
 * Migrates one venue in its own transaction, inside the venue's RLS context.
 * With `apply: false` it plans and reports (`would_migrate`) without writing.
 */
export async function migrateVenue(
  prisma: PrismaClient,
  venueId: string,
  options: { apply: boolean; now?: Date }
): Promise<VenueMigrationOutcome> {
  const now = options.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    await setVenueContext(tx, venueId);
    const venue = await tx.venue.findUnique({
      where: { id: venueId },
      select: { operatingHours: true, settings: true, ianaTimezone: true },
    });
    if (!venue) return { venueId, outcome: "not_found" as const };

    const existing = await tx.schedule.count({
      where: { venueId, isRegular: true, archivedAt: null },
    });
    if (existing > 0) return { venueId, outcome: "already_migrated" as const };

    const plan = planVenueMigration(venue, now);
    if (plan.kind === "unrecognised") {
      return {
        venueId,
        outcome: "unrecognised" as const,
        reason: plan.reason,
        detail: plan.detail,
      };
    }
    const summary = {
      venueId,
      shape: plan.shape,
      notes: plan.notes,
      rows: countRows(plan.config),
      legacyColumnRewritten: plan.projection !== null,
    };
    if (!options.apply) return { ...summary, outcome: "would_migrate" as const };

    await writeConfig(tx, venueId, plan.config);
    if (plan.projection) {
      await tx.venue.update({
        where: { id: venueId },
        data: { operatingHours: plan.projection },
      });
    }
    return { ...summary, outcome: "migrated" as const };
  });
}
