import type { TFunction } from "i18next";
import {
  decodeWeek,
  encodeWeek,
  projectLegacyOperatingHours,
  type ServiceHours,
  type ServiceWeek,
} from "@mbe/availability";
import { localeRuntime } from "../../i18n/runtime.js";
import {
  autoLastSeating,
  setServiceTime,
  toClock,
  toMinutes,
  type LinkedTimes,
} from "./service-fields/service-times.js";
import type {
  AvailabilityConfig,
  AvailabilityConfigChanges,
  OperatingHours,
  Schedule,
  ScheduleAssignment,
  ScheduleService,
  VenueService,
} from "@mbe/types";

/**
 * The quick-setup card's form state (S1) and its translation to the stored model: a regular
 * week of services, each following the shared days or running on days of its own, with optional
 * blocks of different hours on some of its days. Times are "HH:mm" strings (rialto
 * `TimePicker`); a close (or last seating) earlier than the opening runs past midnight.
 */

/**
 * Seating and booking types: carried on the hours they were stored with so an edit of the times
 * keeps them, and changed by the row's "Seat every" and "Booked by" (`quick-setup-options.ts`).
 */
export type KeptHours = Pick<ServiceHours, "seating" | "bookingTypes">;

/** The three times of a service or of one of its different-hours blocks. */
export interface DraftTimes extends LinkedTimes {
  /**
   * The stored seating and booking types of these hours (`draftFromConfig`), so a set's own are
   * not overwritten by the base's. Absent on hours the form made: they take the service's stored
   * ones (`draftToConfig`'s `keptOf`), or quick setup's defaults.
   */
  readonly kept?: KeptHours;
}

/** Other hours for some of a service's days (S13). A new block has no day ticked. */
export interface HoursBlock extends DraftTimes {
  readonly id: string;
  /** Stored weekday indexes, 0 = Sunday … 6 = Saturday. */
  readonly days: readonly number[];
  /**
   * Which of its seating and booking types the block had unlike its service's when the service's
   * was changed (`setServiceKept`): it keeps those through later changes, even one that brings
   * the service to the same value on the way to another. Form state only; never saved.
   */
  readonly ownKept?: { readonly seating: boolean; readonly bookingTypes: boolean };
}

export interface ServiceDraft extends DraftTimes {
  readonly id: string;
  readonly name: string;
  /** `null` follows the shared {@link QuickSetupDraft.days}. */
  readonly days: readonly number[] | null;
  readonly blocks: readonly HoursBlock[];
  /**
   * Set when a name chip moved the service off its preset times to follow the others (Late
   * after Dinner), with the times it gave; while they are untouched a change of days re-places it.
   */
  readonly autoPlaced?: {
    readonly preset: ServicePresetId;
    readonly opens: string;
    readonly closes: string;
  };
}

export interface QuickSetupDraft {
  readonly services: readonly ServiceDraft[];
  /** Shared days, for the services that follow them. Stored weekday indexes, 0 = Sunday … 6 = Saturday. */
  readonly days: readonly number[];
}

/** `VenueServiceSchema.name` max; the server refuses a longer name. */
export const SERVICE_NAME_MAX_LENGTH = 40;
const MINUTES_PER_DAY = 1440;
const SEATING_INTERVAL_MINUTES = 15;

/** Monday-first display order of the stored weekday indexes. */
export const WEEK_DISPLAY_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0];
export const WEEKDAY_SHORTCUT: readonly number[] = [1, 2, 3, 4, 5];
export const WEEKEND_SHORTCUT: readonly number[] = [6, 0];
export const FRIDAY_SATURDAY_SHORTCUT: readonly number[] = [5, 6];

export const SERVICE_PRESETS = {
  lunch: { opens: "11:30", closes: "14:30" },
  brunch: { opens: "10:00", closes: "14:00" },
  dinner: { opens: "17:00", closes: "22:00" },
  late: { opens: "22:00", closes: "01:00" },
} as const;
export type ServicePresetId = keyof typeof SERVICE_PRESETS;
export const SERVICE_PRESET_IDS = Object.keys(SERVICE_PRESETS) as ServicePresetId[];

export function emptyService(id: string): ServiceDraft {
  return {
    id,
    name: "",
    opens: null,
    lastSeating: null,
    closes: null,
    lastSeatingLinked: true,
    days: null,
    blocks: [],
  };
}

export function emptyDraft(firstServiceId: string): QuickSetupDraft {
  return { services: [emptyService(firstServiceId)], days: [] };
}

// ── Time helpers ──────────────────────────────────────────────────────────

// The clock helpers live with the shared service fields, which both forms' rows render.
export { autoLastSeating, setServiceTime, toClock, toMinutes };

/** A name chip: fills the name and its typical times; last seating re-links to the close. */
export function applyPreset(service: ServiceDraft, preset: ServicePresetId, name: string) {
  const { opens, closes } = SERVICE_PRESETS[preset];
  return {
    ...service,
    name,
    opens,
    closes,
    lastSeating: autoLastSeating(closes, opens),
    lastSeatingLinked: true,
  };
}

export function replaceService(draft: QuickSetupDraft, next: ServiceDraft): QuickSetupDraft {
  return { ...draft, services: draft.services.map((s) => (s.id === next.id ? next : s)) };
}

export function toggleDayIn(days: readonly number[], day: number): readonly number[] {
  return days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
}

function keepDays<T extends { readonly days: readonly number[] }>(
  blocks: readonly T[],
  allowed: readonly number[]
): T[] {
  return blocks.map((block) => ({
    ...block,
    days: block.days.filter((day) => allowed.includes(day)),
  }));
}

/**
 * A service's own days (`null` follows the shared days again). Days its blocks had on days it
 * then no longer runs are dropped from them.
 */
export function setServiceDays(
  service: ServiceDraft,
  days: readonly number[] | null,
  sharedDays: readonly number[]
): ServiceDraft {
  return { ...service, days, blocks: keepDays(service.blocks, days ?? sharedDays) };
}

/** The shared days; the services that follow them lose any block day they no longer run on. */
export function setSharedDays(draft: QuickSetupDraft, days: readonly number[]): QuickSetupDraft {
  return {
    ...draft,
    days,
    services: draft.services.map((service) =>
      service.days === null ? { ...service, blocks: keepDays(service.blocks, days) } : service
    ),
  };
}

/** A new block with the service's own hours, so the Manager changes only what differs (S13). */
export function addBlock(service: ServiceDraft, id: string): ServiceDraft {
  const { opens, lastSeating, closes, lastSeatingLinked, kept } = service;
  const block: HoursBlock = {
    id,
    days: [],
    opens,
    lastSeating,
    closes,
    lastSeatingLinked,
    ...(kept ? { kept } : {}),
  };
  return { ...service, blocks: [...service.blocks, block] };
}

export function replaceBlock(service: ServiceDraft, next: HoursBlock): ServiceDraft {
  return { ...service, blocks: service.blocks.map((b) => (b.id === next.id ? next : b)) };
}

export function removeBlock(service: ServiceDraft, blockId: string): ServiceDraft {
  return { ...service, blocks: service.blocks.filter((b) => b.id !== blockId) };
}

export interface BlockDayToggle {
  readonly service: ServiceDraft;
  /** The day was in another block and moved out of it. */
  readonly moved: boolean;
  /** Blocks the move left with no day; they are gone from `service`. */
  readonly removed: readonly HoursBlock[];
}

/**
 * Ticks or unticks a day in a block. A day is in at most one block of a service, so ticking one
 * moves it out of the other (F1 6); a block that leaves with no day goes too.
 */
export function toggleBlockDay(
  service: ServiceDraft,
  blockId: string,
  day: number
): BlockDayToggle {
  const target = service.blocks.find((b) => b.id === blockId);
  if (!target) return { service, moved: false, removed: [] };
  if (target.days.includes(day)) {
    const next = { ...target, days: toggleDayIn(target.days, day) };
    return { service: replaceBlock(service, next), moved: false, removed: [] };
  }
  const moved = service.blocks.some((b) => b.id !== blockId && b.days.includes(day));
  const removed = service.blocks.filter((b) => b.id !== blockId && b.days.join() === String(day));
  const blocks = service.blocks.flatMap((b): HoursBlock[] => {
    if (b.id === blockId) return [{ ...b, days: [...b.days, day] }];
    if (!b.days.includes(day)) return [b];
    return removed.includes(b) ? [] : [{ ...b, days: b.days.filter((d) => d !== day) }];
  });
  return { service: { ...service, blocks }, moved, removed };
}

/**
 * A block's days replaced by a shortcut's, limited to the days the service runs. Like ticking one
 * day, each day leaves the other blocks, and a block left with no day goes too.
 */
export function setBlockDays(
  service: ServiceDraft,
  blockId: string,
  days: readonly number[],
  offered: readonly number[]
): BlockDayToggle {
  const wanted = days.filter((day) => offered.includes(day));
  const others = service.blocks.filter((b) => b.id !== blockId);
  const removed = others.filter(
    (b) => b.days.length > 0 && b.days.every((day) => wanted.includes(day))
  );
  const moved = others.some((b) => b.days.some((day) => wanted.includes(day)));
  const blocks = service.blocks.flatMap((b): HoursBlock[] => {
    if (b.id === blockId) return [{ ...b, days: wanted }];
    return removed.includes(b)
      ? []
      : [{ ...b, days: b.days.filter((day) => !wanted.includes(day)) }];
  });
  return { service: { ...service, blocks }, moved, removed };
}

// ── Times as minutes ──────────────────────────────────────────────────────

export interface ServiceMinutes {
  readonly opensAt: number;
  readonly lastSeatingAt: number;
  readonly closesAt: number;
}

/** Minutes past the service day's midnight; a time earlier than the opening is after midnight. */
export function minutesOf(
  service: Pick<DraftTimes, "opens" | "lastSeating" | "closes">
): ServiceMinutes | null {
  if (service.opens === null || service.lastSeating === null || service.closes === null)
    return null;
  const opensAt = toMinutes(service.opens);
  const afterOpen = (hhmm: string, strict: boolean) => {
    const m = toMinutes(hhmm);
    return strict
      ? m <= opensAt
        ? m + MINUTES_PER_DAY
        : m
      : m < opensAt
        ? m + MINUTES_PER_DAY
        : m;
  };
  return {
    opensAt,
    closesAt: afterOpen(service.closes, true),
    lastSeatingAt: afterOpen(service.lastSeating, false),
  };
}

// ── To the stored model ───────────────────────────────────────────────────

/** The days a service runs on: its own, or the shared days it follows. */
export function effectiveDays(draft: QuickSetupDraft, service: ServiceDraft): readonly number[] {
  return service.days ?? draft.days;
}

/** The weekdays any service runs on, ascending: what the regular week's assignment covers. */
export function coveredDays(draft: QuickSetupDraft): number[] {
  const days =
    draft.services.length === 0
      ? draft.days
      : draft.services.flatMap((service) => effectiveDays(draft, service));
  return [...new Set(days)].sort((a, b) => a - b);
}

/** What a service the form made is saved with when nothing stored says otherwise. */
export const DEFAULT_KEPT: KeptHours = {
  seating: { version: 1, interval: SEATING_INTERVAL_MINUTES },
  bookingTypes: ["online", "phone"],
};

function hoursOf(m: ServiceMinutes, kept: KeptHours | undefined): ServiceHours {
  return { ...m, ...(kept ?? DEFAULT_KEPT) };
}

/** One service's hours on each weekday: its base hours, a complete block's hours where it claims the day. */
function weekOf(
  draft: QuickSetupDraft,
  service: ServiceDraft,
  m: ServiceMinutes,
  keptOf: KeptHours | undefined
) {
  const running = new Set(effectiveDays(draft, service));
  const base = hoursOf(m, service.kept ?? keptOf);
  // A day in two blocks (the form moves it out of the first) takes the last block's hours.
  const blocks = service.blocks
    .flatMap((block) => {
      const bm = minutesOf(block);
      return bm ? [{ days: block.days, hours: hoursOf(bm, block.kept ?? keptOf) }] : [];
    })
    .reverse();
  return Array.from({ length: 7 }, (_, day) =>
    running.has(day) ? (blocks.find((b) => b.days.includes(day))?.hours ?? base) : null
  );
}

/** A complete draft as a config: one regular schedule, one assignment, one encoded row per service that runs. */
export function draftToConfig(
  draft: QuickSetupDraft,
  newId: () => string,
  existing?: {
    regularScheduleId?: string;
    venueServiceIds?: Readonly<Record<string, string>>;
    /** The days the rows are encoded over, when the schedule's use is fixed apart from the draft. */
    coveredDays?: readonly number[];
    /** Per venue service id, the seating and booking types hours the draft carries none for take. */
    keptOf?: Readonly<Record<string, KeptHours>>;
  }
): AvailabilityConfig {
  const scheduleId = existing?.regularScheduleId ?? newId();
  const schedule: Schedule = {
    id: scheduleId,
    name: "Regular week",
    kind: "regular",
    isRegular: true,
  };
  const venueServices: VenueService[] = [];
  const week: ServiceWeek[] = [];
  draft.services.forEach((service, position) => {
    const m = minutesOf(service);
    if (m === null) return;
    const name = service.name.trim();
    const venueServiceId = existing?.venueServiceIds?.[name.toLowerCase()] ?? newId();
    venueServices.push({ id: venueServiceId, name, position });
    week.push({
      venueServiceId,
      days: weekOf(draft, service, m, existing?.keptOf?.[venueServiceId]),
    });
  });
  const covered = existing?.coveredDays ?? coveredDays(draft);
  const scheduleServices: ScheduleService[] = encodeWeek(week, covered).map((row) => ({
    id: newId(),
    scheduleId,
    ...row,
  }));
  const assignment: ScheduleAssignment = {
    id: newId(),
    scheduleId,
    weekdays: [...covered],
    precedence: 0,
  };
  return {
    schedules: [schedule],
    venueServices,
    scheduleServices,
    assignments: [assignment],
    dateRules: [],
  };
}

function clockTimes(hours: ServiceHours): DraftTimes {
  const opens = toClock(hours.opensAt);
  const closes = toClock(hours.closesAt);
  const lastSeating = toClock(hours.lastSeatingAt);
  return {
    opens,
    lastSeating,
    closes,
    lastSeatingLinked: lastSeating === autoLastSeating(closes, opens),
    kept: { seating: hours.seating, bookingTypes: hours.bookingTypes },
  };
}

/**
 * The weekdays a schedule's assignments cover, ascending. A schedule that no assignment uses (one
 * only a `use_schedule` rule sends dates to) runs on whichever days its rows say, so with
 * `anyDay` it covers all seven.
 */
export function scheduleDays(
  config: AvailabilityConfig,
  scheduleId: string,
  anyDay = false
): number[] {
  const assigned = [
    ...new Set(
      config.assignments.filter((a) => a.scheduleId === scheduleId).flatMap((a) => a.weekdays)
    ),
  ].sort((a, b) => a - b);
  return assigned.length === 0 && anyDay ? [0, 1, 2, 3, 4, 5, 6] : assigned;
}

/**
 * The editor's view of a stored regular week: `decodeWeek` over the days its assignments cover,
 * then presentation. Each service shows the base hours most of its days share and a block per
 * other set of hours; a service on every covered day follows the shared days. A last seating
 * that happens to equal the linked default reads as linked.
 */
export function draftFromConfig(
  config: AvailabilityConfig,
  newId: () => string,
  scheduleId?: string
): QuickSetupDraft {
  const regular = scheduleId
    ? config.schedules.find((s) => s.id === scheduleId)
    : config.schedules.find((s) => s.isRegular);
  if (!regular) return emptyDraft(newId());
  const covered = scheduleDays(config, regular.id, scheduleId !== undefined);
  const rows = config.scheduleServices.filter((row) => row.scheduleId === regular.id);
  const names = new Map(config.venueServices.map((vs) => [vs.id, vs]));
  const positionOf = (id: string) => names.get(id)?.position ?? 0;
  const week = [...decodeWeek(rows, covered)].sort(
    (a, b) => positionOf(a.venueServiceId) - positionOf(b.venueServiceId)
  );
  const services = encodeWeek(week, covered).flatMap((row): ServiceDraft[] => {
    const venueService = names.get(row.venueServiceId);
    const running = week.find((w) => w.venueServiceId === row.venueServiceId);
    if (!venueService || !running) return [];
    const days = WEEK_DISPLAY_ORDER.filter((day) => running.days[day] !== null);
    return [
      {
        ...clockTimes(row),
        id: newId(),
        name: venueService.name,
        days: days.length === covered.length ? null : days,
        blocks: row.dayHours.sets.map((set) => ({
          ...clockTimes(set),
          id: newId(),
          days: set.weekdays,
        })),
      },
    ];
  });
  return services.length === 0 ? emptyDraft(newId()) : { services, days: covered };
}

/**
 * The PUT body that makes the draft the venue's regular week. Reuses a stored regular schedule
 * (even an archived one) and same-named services so nothing that references them dangles, and
 * clears that schedule's previous services and assignments.
 */
export function draftToChanges(
  draft: QuickSetupDraft,
  stored: AvailabilityConfig,
  newId: () => string
): AvailabilityConfigChanges {
  const regular = stored.schedules.find((s) => s.isRegular);
  const venueServiceIds = Object.fromEntries(
    stored.venueServices.filter((s) => !s.archivedAt).map((s) => [s.name.toLowerCase(), s.id])
  );
  const next = draftToConfig(draft, newId, {
    ...(regular ? { regularScheduleId: regular.id } : {}),
    venueServiceIds,
  });
  const scheduleId = next.schedules[0]?.id;
  const storedServiceIds = new Set(stored.venueServices.map((s) => s.id));
  return {
    upsert: {
      schedules: next.schedules,
      venueServices: next.venueServices.filter((s) => !storedServiceIds.has(s.id)),
      scheduleServices: next.scheduleServices,
      assignments: next.assignments,
    },
    remove: {
      scheduleServices: stored.scheduleServices
        .filter((s) => s.scheduleId === scheduleId)
        .map((s) => s.id),
      assignments: stored.assignments.filter((a) => a.scheduleId === scheduleId).map((a) => a.id),
    },
  };
}

/** What the wizard's hours gate reports: a step-level message and/or one per weekday. */
export interface OperatingHoursValidationErrors {
  readonly global?: string;
  readonly days?: Readonly<Partial<Record<keyof OperatingHours, string>>>;
}

/**
 * The wizard's step-3 gate for hours that came from the card. The card has already validated
 * its times, and a close earlier than the open is a legitimate past-midnight service that the
 * old per-day string compare would refuse, so only "at least one day open" remains.
 */
export function validateQuickSetupHours(
  hours: OperatingHours,
  t: TFunction = localeRuntime.i18n.t
): OperatingHoursValidationErrors | null {
  return Object.keys(hours).length === 0 ? { global: t("onboarding.hours.atLeastOne") } : null;
}

/** The legacy shape the new-venue wizard sends (the venue has no config rows until it exists). */
export function draftToLegacyHours(draft: QuickSetupDraft): OperatingHours {
  let n = 0;
  const projected = projectLegacyOperatingHours(draftToConfig(draft, () => `wizard-${++n}`));
  const hours: OperatingHours = {};
  for (const [day, value] of Object.entries(projected)) {
    if (!value.closed)
      hours[day as keyof OperatingHours] = { open: value.open, close: value.close };
  }
  return hours;
}

/** Seeds the wizard's card from hours already entered: one service on the open days. */
export function draftFromLegacyHours(hours: OperatingHours, serviceId: string): QuickSetupDraft {
  const order = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ] as const;
  const open = order.flatMap((day, index) => {
    const value = hours[day];
    return value && !value.closed ? [{ index, value }] : [];
  });
  const first = open[0]?.value;
  if (!first) return emptyDraft(serviceId);
  return {
    services: [
      {
        ...emptyService(serviceId),
        opens: first.open,
        closes: first.close,
        lastSeating: autoLastSeating(first.close, first.open),
      },
    ],
    days: open.map((o) => o.index),
  };
}
