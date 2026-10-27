import type { TFunction } from "i18next";
import {
  buildLegacyConfig,
  MAX_PAST_MIDNIGHT_SPAN,
  normalizeLegacyHours,
  projectLegacyOperatingHours,
  validateConfig,
  WEEKDAYS,
  type LegacyHours,
} from "@mbe/availability";
import { localeRuntime } from "../../i18n/runtime.js";
import type { OperatingHoursValidationErrors } from "../venue-onboarding/OperatingHoursStep.js";
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
 * week of services that all run on the same days. Times are "HH:mm" strings (rialto
 * `TimePicker`); a close (or last seating) earlier than the opening runs past midnight.
 */

export interface ServiceDraft {
  readonly id: string;
  readonly name: string;
  readonly opens: string | null;
  readonly lastSeating: string | null;
  readonly closes: string | null;
  /** While true, last seating follows close minus {@link LAST_SEATING_LEAD_MINUTES}. */
  readonly lastSeatingLinked: boolean;
}

export interface QuickSetupDraft {
  readonly services: readonly ServiceDraft[];
  /** Stored weekday indexes, 0 = Sunday … 6 = Saturday. */
  readonly days: readonly number[];
}

export const LAST_SEATING_LEAD_MINUTES = 45;
/** `VenueServiceSchema.name` max; the server refuses a longer name. */
export const SERVICE_NAME_MAX_LENGTH = 40;
const MINUTES_PER_DAY = 1440;
const SEATING_INTERVAL_MINUTES = 15;

/** Monday-first display order of the stored weekday indexes. */
export const WEEK_DISPLAY_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0];
export const WEEKDAY_SHORTCUT: readonly number[] = [1, 2, 3, 4, 5];
export const WEEKEND_SHORTCUT: readonly number[] = [6, 0];

export const SERVICE_PRESETS = {
  lunch: { opens: "11:30", closes: "14:30" },
  brunch: { opens: "10:00", closes: "14:00" },
  dinner: { opens: "17:00", closes: "22:00" },
  late: { opens: "22:00", closes: "01:00" },
} as const;
export type ServicePresetId = keyof typeof SERVICE_PRESETS;
export const SERVICE_PRESET_IDS = Object.keys(SERVICE_PRESETS) as ServicePresetId[];

export function emptyService(id: string): ServiceDraft {
  return { id, name: "", opens: null, lastSeating: null, closes: null, lastSeatingLinked: true };
}

export function emptyDraft(firstServiceId: string): QuickSetupDraft {
  return { services: [emptyService(firstServiceId)], days: [] };
}

// ── Time helpers ──────────────────────────────────────────────────────────

function toMinutes(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function toClock(minutes: number): string {
  const wrapped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hh = String(Math.floor(wrapped / 60)).padStart(2, "0");
  const mm = String(wrapped % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Last seating that follows a close: close minus the lead time, e.g. 22:00 → 21:15. */
export function autoLastSeating(closes: string): string {
  return toClock(toMinutes(closes) - LAST_SEATING_LEAD_MINUTES);
}

/** A name chip: fills the name and its typical times; last seating re-links to the close. */
export function applyPreset(service: ServiceDraft, preset: ServicePresetId, name: string) {
  const { opens, closes } = SERVICE_PRESETS[preset];
  return {
    ...service,
    name,
    opens,
    closes,
    lastSeating: autoLastSeating(closes),
    lastSeatingLinked: true,
  };
}

/** Editing close keeps a linked last seating in step; editing last seating unlinks it. */
export function setServiceTime(
  service: ServiceDraft,
  field: "opens" | "lastSeating" | "closes",
  value: string | null
): ServiceDraft {
  if (field === "lastSeating") return { ...service, lastSeating: value, lastSeatingLinked: false };
  if (field === "closes" && service.lastSeatingLinked) {
    return {
      ...service,
      closes: value,
      lastSeating: value === null ? null : autoLastSeating(value),
    };
  }
  return { ...service, [field]: value };
}

export function replaceService(draft: QuickSetupDraft, next: ServiceDraft): QuickSetupDraft {
  return { ...draft, services: draft.services.map((s) => (s.id === next.id ? next : s)) };
}

export function toggleDay(draft: QuickSetupDraft, day: number): QuickSetupDraft {
  const days = draft.days.includes(day)
    ? draft.days.filter((d) => d !== day)
    : [...draft.days, day];
  return { ...draft, days };
}

// ── Validation ────────────────────────────────────────────────────────────

export type QuickSetupField = "name" | "opens" | "lastSeating" | "closes";
export type QuickSetupIssueCode =
  | "name_required"
  | "name_too_long"
  | "time_required"
  | "close_after_open"
  | "last_seating_after_close"
  | "span_too_long"
  | "legacy_closed_day"
  | "overlap"
  | "days_required";

export interface QuickSetupIssue {
  /** `null` for the whole card (days). */
  readonly serviceId: string | null;
  readonly field: QuickSetupField | "days";
  readonly code: QuickSetupIssueCode;
}

interface ServiceMinutes {
  readonly opensAt: number;
  readonly lastSeatingAt: number;
  readonly closesAt: number;
}

/** Minutes past the service day's midnight; a time earlier than the opening is after midnight. */
function minutesOf(service: ServiceDraft): ServiceMinutes | null {
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

const TIME_FIELDS = [
  ["opens", "opens"],
  ["lastSeating", "lastSeating"],
  ["closes", "closes"],
] as const;

function completenessIssues(service: ServiceDraft): QuickSetupIssue[] {
  const missing = TIME_FIELDS.filter(([key]) => service[key] === null).map(
    ([, field]): QuickSetupIssue => ({
      serviceId: service.id,
      field,
      code: "time_required",
    })
  );
  const name = service.name.trim();
  const unnamed: QuickSetupIssue[] =
    name === ""
      ? [{ serviceId: service.id, field: "name", code: "name_required" }]
      : name.length > SERVICE_NAME_MAX_LENGTH
        ? [{ serviceId: service.id, field: "name", code: "name_too_long" }]
        : [];
  return [...unnamed, ...missing];
}

function orderIssues(service: ServiceDraft, m: ServiceMinutes): QuickSetupIssue[] {
  const at = (field: QuickSetupField, code: QuickSetupIssueCode): QuickSetupIssue => ({
    serviceId: service.id,
    field,
    code,
  });
  if (service.opens === service.closes) return [at("closes", "close_after_open")];
  return m.lastSeatingAt > m.closesAt ? [at("lastSeating", "last_seating_after_close")] : [];
}

/**
 * Field-level problems, in card order (first is where focus goes). Overlap is the engine's call
 * (`validateConfig`): the same rule the server applies on save. `legacyReader` is for the
 * new-venue wizard, which sends legacy hours; the card writes config rows directly, so days the
 * legacy reader would close (`legacy_closed_day`) are fine there.
 */
export function validateDraft(
  draft: QuickSetupDraft,
  options: { readonly legacyReader?: boolean } = {}
): QuickSetupIssue[] {
  const perService = draft.services.flatMap((service) => {
    const missing = completenessIssues(service);
    const minutes = minutesOf(service);
    return missing.length > 0 || minutes === null ? missing : orderIssues(service, minutes);
  });
  const daysIssue: QuickSetupIssue[] =
    draft.days.length === 0 ? [{ serviceId: null, field: "days", code: "days_required" }] : [];
  if (perService.length > 0) return [...perService, ...daysIssue];

  const config = draftToConfig(draft, () => "check");
  const overlaps = validateConfig(config)
    .filter((issue) => issue.code === "overlap")
    .flatMap((issue): QuickSetupIssue[] => {
      const index = Number(/scheduleServices\[(\d+)\]/.exec(issue.path)?.[1]);
      const service = draft.services[index];
      return service ? [{ serviceId: service.id, field: "opens", code: "overlap" }] : [];
    });
  return [...overlaps, ...spanIssues(draft, options.legacyReader === true), ...daysIssue];
}

/**
 * The server stores the day as one legacy window (earliest open, latest close) and its
 * reader closes the day when that window cannot seat anyone: a past-midnight window longer
 * than MAX_PAST_MIDNIGHT_SPAN, a span of exactly 24 hours (open == close), or one shorter
 * than the last-seating buffer. Read the projection with the server's own reader
 * (`normalizeLegacyHours` + `buildLegacyConfig`) so the thresholds are not copied here, and
 * blame the latest-closing service.
 */
function spanIssues(draft: QuickSetupDraft, legacyReader: boolean): QuickSetupIssue[] {
  const read = normalizeLegacyHours(draftToLegacyHours(draft));
  const tooLong =
    read.ok &&
    WEEKDAYS.some((day) =>
      read.hours.weekly[day].some(
        (w) => w.wrapped === true && w.close - w.open > MAX_PAST_MIDNIGHT_SPAN
      )
    );
  const code: QuickSetupIssueCode | null = tooLong
    ? "span_too_long"
    : legacyReader && read.ok && hasClosedDay(draft, read.hours)
      ? "legacy_closed_day"
      : null;
  if (code === null) return [];
  const latest = draft.services.reduce<{ id: string; closesAt: number } | null>((acc, s) => {
    const m = minutesOf(s);
    return m && (!acc || m.closesAt > acc.closesAt) ? { id: s.id, closesAt: m.closesAt } : acc;
  }, null);
  return latest ? [{ serviceId: latest.id, field: "closes", code }] : [];
}

/** True when a day the draft opens gets no assignment from the legacy reader (read as closed). */
function hasClosedDay(draft: QuickSetupDraft, hours: LegacyHours): boolean {
  let n = 0;
  const built = buildLegacyConfig({ hours, today: "1970-01-01", newId: () => `legacy-${++n}` });
  if (!built.ok) return false;
  const open = new Set(built.config.assignments.flatMap((a) => a.weekdays));
  return draft.days.some((day) => !open.has(day));
}

// ── To the stored model ───────────────────────────────────────────────────

/** A complete draft as a config: one regular schedule, one assignment, one row per service. */
export function draftToConfig(
  draft: QuickSetupDraft,
  newId: () => string,
  existing?: { regularScheduleId?: string; venueServiceIds?: Readonly<Record<string, string>> }
): AvailabilityConfig {
  const scheduleId = existing?.regularScheduleId ?? newId();
  const schedule: Schedule = {
    id: scheduleId,
    name: "Regular week",
    kind: "regular",
    isRegular: true,
  };
  const venueServices: VenueService[] = [];
  const scheduleServices: ScheduleService[] = [];
  draft.services.forEach((service, position) => {
    const m = minutesOf(service);
    if (m === null) return;
    const name = service.name.trim();
    const venueServiceId = existing?.venueServiceIds?.[name.toLowerCase()] ?? newId();
    venueServices.push({ id: venueServiceId, name, position });
    scheduleServices.push({
      id: newId(),
      scheduleId,
      venueServiceId,
      ...m,
      seating: { version: 1, interval: SEATING_INTERVAL_MINUTES },
      bookingTypes: ["online", "phone"],
    });
  });
  const assignment: ScheduleAssignment = {
    id: newId(),
    scheduleId,
    weekdays: [...draft.days].sort((a, b) => a - b),
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
  const projected = projectLegacyOperatingHours(draftToConfig(draft, () => "wizard"));
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
        lastSeating: autoLastSeating(first.close),
      },
    ],
    days: open.map((o) => o.index),
  };
}
