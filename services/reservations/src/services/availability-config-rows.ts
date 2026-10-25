import type {
  AvailabilityConfig,
  DateRule,
  Schedule,
  ScheduleAssignment,
  ScheduleService,
  VenueService,
} from "@mbe/types";
import { Prisma, type PrismaClient } from "../generated/prisma/index.js";
import type { ConfigDiff } from "./availability-config-plan.js";
import { parseConfigRows, type SnapshotWarning } from "./availability-snapshot.js";

/**
 * Prisma reads and writes of the five config tables for the config store.
 * The caller owns the transaction and the venue's RLS context.
 */

export type ConfigRowDb = Pick<
  PrismaClient,
  | "schedule"
  | "venueService"
  | "scheduleService"
  | "scheduleAssignment"
  | "dateRule"
  | "dateRuleTable"
>;

const toDbDate = (serviceDate: string): Date => new Date(`${serviceDate}T00:00:00.000Z`);
const toDbDateOrNull = (d: string | null | undefined): Date | null => (d ? toDbDate(d) : null);
const toInstantOrNull = (iso: string | null | undefined): Date | null =>
  iso ? new Date(iso) : null;
const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;
const jsonOrNull = (value: unknown) => (value == null ? Prisma.DbNull : json(value));

/**
 * Every live row of the venue's config (no date window: a save diffs against
 * all of it). Date rules come oldest first, so the engine's "last special
 * hours wins" reads as "newest wins".
 */
export async function readStoredConfig(
  db: ConfigRowDb,
  venueId: string
): Promise<{ config: AvailabilityConfig; hasRows: boolean; warnings: SnapshotWarning[] }> {
  const [schedules, venueServices, scheduleServices, assignments, dateRules] = await Promise.all([
    db.schedule.findMany({ where: { venueId } }),
    db.venueService.findMany({ where: { venueId }, orderBy: { position: "asc" } }),
    db.scheduleService.findMany({ where: { venueId } }),
    db.scheduleAssignment.findMany({ where: { venueId } }),
    db.dateRule.findMany({
      where: { venueId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: { tables: { select: { tableId: true } } },
    }),
  ]);
  const warnings: SnapshotWarning[] = [];
  const config = parseConfigRows(
    { schedules, venueServices, scheduleServices, assignments, dateRules },
    warnings
  );
  return { config, hasRows: schedules.length > 0, warnings };
}

const scheduleData = (s: Schedule) => ({
  name: s.name,
  kind: s.kind,
  isRegular: s.isRegular,
  archivedAt: toInstantOrNull(s.archivedAt),
});

const venueServiceData = (s: VenueService) => ({
  name: s.name,
  position: s.position,
  archivedAt: toInstantOrNull(s.archivedAt),
});

const scheduleServiceData = (s: ScheduleService) => ({
  scheduleId: s.scheduleId,
  venueServiceId: s.venueServiceId,
  opensAt: s.opensAt,
  lastSeatingAt: s.lastSeatingAt,
  closesAt: s.closesAt,
  seating: json(s.seating),
  bookingTypes: s.bookingTypes,
});

const assignmentData = (a: ScheduleAssignment) => ({
  scheduleId: a.scheduleId,
  weekdays: a.weekdays,
  startsOn: toDbDateOrNull(a.startsOn),
  endsOn: toDbDateOrNull(a.endsOn),
  precedence: a.precedence,
});

const dateRuleData = (r: DateRule) => ({
  kind: r.kind,
  targetKind: r.targetKind,
  venueServiceId: r.venueServiceId ?? null,
  bookingTypes: r.bookingTypes ?? [],
  startsOn: toDbDate(r.startsOn),
  endsOn: toDbDateOrNull(r.endsOn),
  repeat: jsonOrNull(r.repeat),
  window: jsonOrNull(r.window),
  payload: json("payload" in r ? r.payload : {}),
  useScheduleId: r.kind === "use_schedule" ? r.useScheduleId : null,
  seriesId: r.seriesId ?? null,
  guestMessage: r.guestMessage ?? null,
  staffNote: r.staffNote ?? null,
  expiresAt: r.kind === "tonight" ? toInstantOrNull(r.expiresAt) : null,
});

async function writeRuleTables(db: ConfigRowDb, venueId: string, rule: DateRule): Promise<void> {
  const tableIds = rule.tableIds ?? [];
  if (tableIds.length === 0) return;
  await db.dateRuleTable.createMany({
    data: tableIds.map((tableId) => ({ dateRuleId: rule.id, tableId, venueId })),
  });
}

async function writeCreates(
  db: ConfigRowDb,
  venueId: string,
  create: ConfigDiff["create"],
  actorId: string
): Promise<void> {
  if (create.schedules.length > 0) {
    await db.schedule.createMany({
      data: create.schedules.map((s) => ({ id: s.id, venueId, ...scheduleData(s) })),
    });
  }
  if (create.venueServices.length > 0) {
    await db.venueService.createMany({
      data: create.venueServices.map((s) => ({ id: s.id, venueId, ...venueServiceData(s) })),
    });
  }
  if (create.scheduleServices.length > 0) {
    await db.scheduleService.createMany({
      data: create.scheduleServices.map((s) => ({ id: s.id, venueId, ...scheduleServiceData(s) })),
    });
  }
  if (create.assignments.length > 0) {
    await db.scheduleAssignment.createMany({
      data: create.assignments.map((a) => ({ id: a.id, venueId, ...assignmentData(a) })),
    });
  }
  for (const r of create.dateRules) {
    await db.dateRule.create({
      data: { id: r.id, venueId, createdBy: actorId, ...dateRuleData(r) },
    });
    await writeRuleTables(db, venueId, r);
  }
}

/**
 * Applies a diff. Order matters for the constraints: schedule and service
 * edits first (so a regular-week handover clears the one-regular index before
 * a new regular schedule lands), then removals (so a re-added
 * schedule/service pair does not collide), then creates, then the remaining
 * updates (which may point at rows just created).
 */
export async function writeConfigDiff(
  db: ConfigRowDb,
  venueId: string,
  diff: ConfigDiff,
  context: { actorId: string; now: Date }
): Promise<void> {
  const { create, update, remove } = diff;
  const demotionsFirst = [...update.schedules].sort(
    (a, b) => Number(a.isRegular) - Number(b.isRegular)
  );
  for (const s of demotionsFirst) {
    await db.schedule.update({ where: { id: s.id }, data: scheduleData(s) });
  }
  for (const s of update.venueServices) {
    await db.venueService.update({ where: { id: s.id }, data: venueServiceData(s) });
  }

  const inVenue = (ids: string[]) => ({ venueId, id: { in: ids } });
  if (remove.scheduleServices.length > 0) {
    await db.scheduleService.deleteMany({ where: inVenue(remove.scheduleServices) });
  }
  if (remove.assignments.length > 0) {
    await db.scheduleAssignment.deleteMany({ where: inVenue(remove.assignments) });
  }
  if (remove.dateRules.length > 0) {
    await db.dateRule.updateMany({
      where: inVenue(remove.dateRules),
      data: { deletedAt: context.now },
    });
  }

  await writeCreates(db, venueId, create, context.actorId);

  for (const s of update.scheduleServices) {
    await db.scheduleService.update({ where: { id: s.id }, data: scheduleServiceData(s) });
  }
  for (const a of update.assignments) {
    await db.scheduleAssignment.update({ where: { id: a.id }, data: assignmentData(a) });
  }
  for (const r of update.dateRules) {
    await db.dateRule.update({ where: { id: r.id }, data: dateRuleData(r) });
    await db.dateRuleTable.deleteMany({ where: { venueId, dateRuleId: r.id } });
    await writeRuleTables(db, venueId, r);
  }
}
