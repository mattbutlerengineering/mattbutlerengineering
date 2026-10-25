import type { AvailabilityConfig, DateRule, ScheduleService } from "@mbe/types";
import type { LegacyHours, LegacyWindow } from "./legacy-hours.js";
import { DEFAULT_SLOT_INTERVAL } from "./slot-rules.js";
import { WEEKDAYS, type ServiceDate } from "./types.js";
import { validateConfig } from "./validate-config.js";

/**
 * Turns normalised legacy hours plus the venue's `slotIntervalMinutes` and
 * `lastSeatingBuffer` into availability rows (docs/features/venue-availability/
 * architecture.md § Migration). Pure: ids come from the caller, `today` bounds
 * which dated overrides are kept, and the result is checked with
 * `validateConfig` — a config that does not validate is reported, never returned.
 *
 * The legacy column holds one set of hours per weekday but a schedule holds one
 * set of hours per service, so weekdays that share hours share a schedule. The
 * largest group is the regular week; any other group is an `alternate` schedule
 * with its own assignment. A weekday with no seating window gets no assignment,
 * which the engine reads as closed.
 */

/** DEFAULT_LAST_SEATING_BUFFER in services/reservations/src/services/availability.ts. */
export const DEFAULT_LAST_SEATING_BUFFER = 90;

const MAX_INTERVAL = 240;
const MAX_STAFF_NOTE = 500;
const CHANNELS = ["online", "phone"] as const;

export interface LegacyMigrationInput {
  hours: LegacyHours;
  /** `settings.slotIntervalMinutes`; absent means the legacy default (15). */
  slotIntervalMinutes?: number | null;
  /** `settings.lastSeatingBuffer`; absent means the legacy default (90). */
  lastSeatingBuffer?: number | null;
  /** Venue-local today; dated overrides before it are not migrated. */
  today: ServiceDate;
  newId: () => string;
}

export interface LegacyMigrationNotes {
  /** Windows the legacy slot loop could never seat (last seating before opening). */
  droppedWindows: number;
  skippedPastOverrides: number;
  migratedOverrides: number;
}

export type LegacyMigrationResult =
  | { ok: true; config: AvailabilityConfig; notes: LegacyMigrationNotes }
  | {
      ok: false;
      reason: "invalid_interval" | "invalid_buffer" | "invalid_config";
      detail: string;
    };

interface SeatedWindow {
  name?: string;
  open: number;
  close: number;
  last: number;
}

interface NamedWindow extends SeatedWindow {
  serviceName: string;
}

/** Stored weekday index (0 = Sunday) for a Monday-first weekday position. */
const storedIndex = (mondayFirst: number): number => (mondayFirst + 1) % 7;

function seat(windows: readonly LegacyWindow[], buffer: number): SeatedWindow[] {
  return windows.map((w) => ({ ...w, last: w.close - buffer })).filter((w) => w.last >= w.open);
}

/** Names a day's windows; unnamed or clashing names fall back to their order. */
function nameWindows(windows: readonly SeatedWindow[], multiple: boolean): NamedWindow[] {
  const fallback = (i: number) => (multiple ? `Service ${i + 1}` : "Open hours");
  const names = windows.map((w, i) => w.name ?? fallback(i));
  const clash = new Set(names).size < names.length;
  return windows.map((w, i) => ({ ...w, serviceName: clash ? `Service ${i + 1}` : names[i]! }));
}

const signature = (windows: readonly NamedWindow[]): string =>
  JSON.stringify(windows.map((w) => [w.serviceName, w.open, w.close]));

function validIntervalOrBuffer(
  input: LegacyMigrationInput
): { interval: number; buffer: number } | LegacyMigrationResult {
  const interval = input.slotIntervalMinutes ?? DEFAULT_SLOT_INTERVAL;
  if (!Number.isInteger(interval) || interval < 1 || interval > MAX_INTERVAL) {
    return { ok: false, reason: "invalid_interval", detail: `slotIntervalMinutes ${interval}` };
  }
  const buffer = input.lastSeatingBuffer ?? DEFAULT_LAST_SEATING_BUFFER;
  if (!Number.isInteger(buffer) || buffer < 0) {
    return { ok: false, reason: "invalid_buffer", detail: `lastSeatingBuffer ${buffer}` };
  }
  return { interval, buffer };
}

export function buildLegacyConfig(input: LegacyMigrationInput): LegacyMigrationResult {
  const checked = validIntervalOrBuffer(input);
  if ("ok" in checked) return checked;
  const { interval, buffer } = checked;
  const { hours, newId, today } = input;

  const seatedWeek = WEEKDAYS.map((day) => seat(hours.weekly[day], buffer));
  const dropped = WEEKDAYS.reduce(
    (n, day, i) => n + hours.weekly[day].length - seatedWeek[i]!.length,
    0
  );
  const multiple =
    seatedWeek.some((w) => w.length > 1) ||
    hours.overrides.some((o) => seat(o.windows, buffer).length > 1);

  const venueServices = new Map<string, { id: string; name: string; position: number }>();
  const serviceId = (name: string): string => {
    const existing = venueServices.get(name);
    if (existing) return existing.id;
    const created = { id: newId(), name, position: venueServices.size };
    venueServices.set(name, created);
    return created.id;
  };

  // Group weekdays that share hours; first-seen order keeps the output stable.
  const groups = new Map<string, { days: number[]; windows: NamedWindow[] }>();
  seatedWeek.forEach((windows, i) => {
    if (windows.length === 0) return;
    const named = nameWindows(windows, multiple);
    const key = signature(named);
    const group = groups.get(key) ?? { days: [], windows: named };
    groups.set(key, { ...group, days: [...group.days, storedIndex(i)] });
  });
  const ordered = [...groups.values()].sort((a, b) => b.days.length - a.days.length);

  const hoursFields = (w: NamedWindow) => ({
    venueServiceId: serviceId(w.serviceName),
    opensAt: w.open,
    lastSeatingAt: w.last,
    closesAt: w.close,
    seating: { version: 1 as const, interval },
    bookingTypes: [...CHANNELS],
  });

  const schedules = ordered.length === 0 ? [null] : ordered;
  const rows = schedules.map((group, index) => {
    const id = newId();
    const schedule = {
      id,
      name: index === 0 ? "Regular week" : `Alternate week ${index}`,
      kind: index === 0 ? ("regular" as const) : ("alternate" as const),
      isRegular: index === 0,
    };
    const services: ScheduleService[] = (group?.windows ?? []).map((w) => ({
      id: newId(),
      scheduleId: id,
      ...hoursFields(w),
    }));
    const assignments = group
      ? [{ id: newId(), scheduleId: id, weekdays: [...group.days].sort(), precedence: 0 }]
      : [];
    return { schedule, services, assignments };
  });

  const futureOverrides = hours.overrides.filter((o) => o.date >= today);
  const dateRules: DateRule[] = futureOverrides.map((override) => {
    const seated = nameWindows(seat(override.windows, buffer), multiple);
    const base = {
      id: newId(),
      targetKind: "venue" as const,
      startsOn: override.date,
      endsOn: override.date,
      ...(override.note ? { staffNote: override.note.slice(0, MAX_STAFF_NOTE) } : {}),
    };
    return seated.length === 0
      ? { ...base, kind: "closure" as const }
      : {
          ...base,
          kind: "special_hours" as const,
          payload: { version: 1 as const, services: seated.map(hoursFields) },
        };
  });

  const config: AvailabilityConfig = {
    schedules: rows.map((r) => r.schedule),
    venueServices: [...venueServices.values()],
    scheduleServices: rows.flatMap((r) => r.services),
    assignments: rows.flatMap((r) => r.assignments),
    dateRules,
  };

  const issues = validateConfig(config);
  if (issues.length > 0) {
    const first = issues
      .slice(0, 3)
      .map((i) => `${i.path} ${i.code}`)
      .join("; ");
    return { ok: false, reason: "invalid_config", detail: first };
  }
  return {
    ok: true,
    config,
    notes: {
      droppedWindows: dropped,
      skippedPastOverrides: hours.overrides.length - futureOverrides.length,
      migratedOverrides: futureOverrides.length,
    },
  };
}
