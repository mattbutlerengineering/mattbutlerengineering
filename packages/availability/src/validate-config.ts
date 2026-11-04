import {
  AvailabilityConfigSchema,
  type AvailabilityConfig,
  type ScheduleAssignment,
  type SpecialHoursService,
} from "@mbe/types";
import { addDays, weekdayIndexOf } from "./civil-date.js";
import { formatMinute } from "./format-minute.js";
import { WEEK_ORDER, hoursSourceOn } from "./service-days.js";

/**
 * The invariants the configuration layers must satisfy together (ADR-030).
 * The store calls this before every commit; the editor maps each issue's
 * `path` to a field. Never throws.
 */

export type ConfigIssueCode =
  | "invalid"
  | "overlap"
  | "weekday_clash"
  | "close_before_open"
  | "last_seating_after_close"
  | "last_seating_before_open"
  | "multiple_regular_schedules"
  | "no_regular_schedule"
  | "precedence_tie"
  | "ends_before_start"
  | "seating_outside_service"
  | "window_ends_before_start"
  | "booking_types_required";

export interface ConfigIssue {
  /** e.g. `scheduleServices[1].lastSeatingAt`; `""` is the whole config. */
  path: string;
  code: ConfigIssueCode;
  message: string;
  /** `overlap` on some weekdays only, `weekday_clash`: the weekday (0 = Sunday). */
  weekday?: number;
  /** `overlap`: the path of the other service's `opensAt`. */
  otherPath?: string;
}

/** The hours fields a schedule service and a special-hours service share. */
type ServiceHours = Pick<SpecialHoursService, "opensAt" | "lastSeatingAt" | "closesAt" | "seating">;

interface PathedService {
  path: string;
  hours: ServiceHours;
}

function issue(path: string, code: ConfigIssueCode, message: string): ConfigIssue {
  return { path, code, message };
}

function formatPath(segments: readonly PropertyKey[]): string {
  return segments
    .map((s, i) => (typeof s === "number" ? `[${s}]` : `${i === 0 ? "" : "."}${String(s)}`))
    .join("");
}

function fixedSeatingIssues({ path, hours }: PathedService): ConfigIssue[] {
  if (!("fixed" in hours.seating)) return [];
  return hours.seating.fixed.flatMap((minute, k) =>
    minute < hours.opensAt || minute > hours.lastSeatingAt
      ? [
          issue(
            `${path}.seating.fixed[${k}]`,
            "seating_outside_service",
            "Seating times must fall between opening and last seating."
          ),
        ]
      : []
  );
}

function hoursIssues({ path, hours }: PathedService): ConfigIssue[] {
  const { opensAt, lastSeatingAt, closesAt } = hours;
  if (closesAt <= opensAt) {
    return [issue(`${path}.closesAt`, "close_before_open", "Closing time must be after opening.")];
  }
  if (lastSeatingAt > closesAt) {
    return [
      issue(
        `${path}.lastSeatingAt`,
        "last_seating_after_close",
        "Last seating can't be after closing."
      ),
    ];
  }
  if (lastSeatingAt < opensAt) {
    return [
      issue(
        `${path}.lastSeatingAt`,
        "last_seating_before_open",
        "Last seating can't be before opening."
      ),
    ];
  }
  return fixedSeatingIssues({ path, hours });
}

/** Services that open and close in order, sorted by opening; each later one overlapping an earlier is reported. */
function overlapIssues(services: readonly PathedService[]): ConfigIssue[] {
  const sorted = services
    .filter(({ hours }) => hours.closesAt > hours.opensAt)
    .sort((a, b) => a.hours.opensAt - b.hours.opensAt);
  return sorted.flatMap((later, i) => {
    const earlier = sorted.slice(0, i).find((e) => e.hours.closesAt > later.hours.opensAt);
    if (!earlier) return [];
    const range = `${formatMinute(earlier.hours.opensAt)} – ${formatMinute(earlier.hours.closesAt)}`;
    return [issue(`${later.path}.opensAt`, "overlap", `Overlaps another service (${range}).`)];
  });
}

function serviceListIssues(services: readonly PathedService[]): ConfigIssue[] {
  return [...services.flatMap(hoursIssues), ...overlapIssues(services)];
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

type ScheduleServiceRow = AvailabilityConfig["scheduleServices"][number];

interface IndexedRow {
  index: number;
  row: ScheduleServiceRow;
}

/** The base hours and each set's hours of one row, each at its own path. */
function rowHoursIssues({ index, row }: IndexedRow): ConfigIssue[] {
  const path = `scheduleServices[${index}]`;
  return [
    ...hoursIssues({ path, hours: row }),
    ...row.dayHours.sets.flatMap((set, j) =>
      hoursIssues({ path: `${path}.dayHours.sets[${j}]`, hours: set })
    ),
  ];
}

/** A weekday claimed by two of a row's sets, or by a set and an explicit base, is reported at the later claimant. */
function weekdayClashIssues({ index, row }: IndexedRow): ConfigIssue[] {
  const claimed = new Set(row.weekdays);
  return row.dayHours.sets.flatMap((set, j) =>
    WEEK_ORDER.filter((d) => set.weekdays.includes(d)).flatMap((weekday) => {
      const clash = claimed.has(weekday);
      claimed.add(weekday);
      return clash
        ? [
            {
              ...issue(
                `scheduleServices[${index}].dayHours.sets[${j}].weekdays`,
                "weekday_clash",
                `${WEEKDAY_NAMES[weekday]} can only have one set of hours.`
              ),
              weekday,
            },
          ]
        : [];
    })
  );
}

interface DayOverlap {
  later: string;
  earlier: string;
  /** The earlier hours, as "5:00 PM – 10:00 PM". */
  range: string;
  weekday: number;
}

/**
 * Overlaps on one weekday, over the hours each row has that day. Rows that don't run that day
 * are not in it. Like the all-days rule it replaces, rows whose venue service is gone still count.
 */
function overlapsOn(rows: readonly IndexedRow[], weekday: number): DayOverlap[] {
  const running = rows.flatMap(({ index, row }) => {
    const source = hoursSourceOn(row, weekday);
    if (!source) return [];
    const base = `scheduleServices[${index}]`;
    const path = source.setIndex === null ? base : `${base}.dayHours.sets[${source.setIndex}]`;
    return [{ path, hours: source.hours }];
  });
  const sorted = running
    .filter(({ hours }) => hours.closesAt > hours.opensAt)
    .sort((a, b) => a.hours.opensAt - b.hours.opensAt);
  return sorted.flatMap((later, i) => {
    const earlier = sorted.slice(0, i).find((e) => e.hours.closesAt > later.hours.opensAt);
    return earlier
      ? [
          {
            later: `${later.path}.opensAt`,
            earlier: `${earlier.path}.opensAt`,
            range: `${formatMinute(earlier.hours.opensAt)} – ${formatMinute(earlier.hours.closesAt)}`,
            weekday,
          },
        ]
      : [];
  });
}

/**
 * Per-weekday overlap, one issue per pair of hours however many days it holds. The weekday is
 * named (the first in Monday-first order) only when the pair overlaps on some days and not all,
 * so a legacy row pair that overlaps every day reads exactly as it always did.
 */
function overlapIssuesPerWeekday(rows: readonly IndexedRow[]): ConfigIssue[] {
  const byPair = new Map<string, DayOverlap[]>();
  for (const weekday of WEEK_ORDER) {
    for (const overlap of overlapsOn(rows, weekday)) {
      const key = `${overlap.later}|${overlap.earlier}`;
      byPair.set(key, [...(byPair.get(key) ?? []), overlap]);
    }
  }
  return [...byPair.values()].flatMap(([first, ...rest]) => {
    if (!first) return [];
    const allDays = rest.length + 1 === WEEK_ORDER.length;
    return [
      {
        ...issue(first.later, "overlap", `Overlaps another service (${first.range}).`),
        ...(allDays ? {} : { weekday: first.weekday }),
        otherPath: first.earlier,
      },
    ];
  });
}

function scheduleServiceIssues(config: AvailabilityConfig): ConfigIssue[] {
  const rows = config.scheduleServices.map((row, index) => ({ index, row }));
  const scheduleIds = [...new Set(rows.map(({ row }) => row.scheduleId))];
  return scheduleIds.flatMap((id) => {
    const own = rows.filter(({ row }) => row.scheduleId === id);
    return [
      ...own.flatMap(rowHoursIssues),
      ...own.flatMap(weekdayClashIssues),
      ...overlapIssuesPerWeekday(own),
    ];
  });
}

function specialHoursIssues(config: AvailabilityConfig): ConfigIssue[] {
  return config.dateRules.flatMap((rule, i) =>
    rule.kind === "special_hours"
      ? serviceListIssues(
          rule.payload.services.map((s, j) => ({
            path: `dateRules[${i}].payload.services[${j}]`,
            hours: s,
          }))
        )
      : []
  );
}

function regularScheduleIssues(config: AvailabilityConfig): ConfigIssue[] {
  const regular = config.schedules
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.isRegular && !s.archivedAt);
  if (regular.length === 0) {
    return [issue("schedules", "no_regular_schedule", "Choose one schedule as the regular week.")];
  }
  return regular
    .slice(1)
    .map(({ i }) =>
      issue(
        `schedules[${i}].isRegular`,
        "multiple_regular_schedules",
        "Only one schedule can be the regular week."
      )
    );
}

function endsBeforeStart(
  startsOn: string | null | undefined,
  endsOn: string | null | undefined
): boolean {
  return startsOn != null && endsOn != null && endsOn < startsOn;
}

function rangeIssues(config: AvailabilityConfig): ConfigIssue[] {
  const message = "The end date can't be before the start date.";
  return [
    ...config.assignments.flatMap((a, i) =>
      endsBeforeStart(a.startsOn, a.endsOn)
        ? [issue(`assignments[${i}].endsOn`, "ends_before_start", message)]
        : []
    ),
    ...config.dateRules.flatMap((r, i) =>
      endsBeforeStart(r.startsOn, r.endsOn)
        ? [issue(`dateRules[${i}].endsOn`, "ends_before_start", message)]
        : []
    ),
  ];
}

function latest(a?: string | null, b?: string | null): string | null {
  if (a == null) return b ?? null;
  return b == null || a > b ? a : b;
}

function earliest(a?: string | null, b?: string | null): string | null {
  if (a == null) return b ?? null;
  return b == null || a < b ? a : b;
}

/** Do the two assignments cover at least one common date? */
function assignmentsMeet(a: ScheduleAssignment, b: ScheduleAssignment): boolean {
  const shared = a.weekdays.filter((d) => b.weekdays.includes(d));
  // Open ends are unbounded; "YYYY-MM-DD" strings order chronologically.
  const from = latest(a.startsOn, b.startsOn);
  const to = earliest(a.endsOn, b.endsOn);
  if (shared.length === 0 || (from != null && to != null && from > to)) return false;
  if (from == null || to == null || addDays(from, 6) <= to) return true;
  // A common range shorter than a week may miss every shared weekday.
  const dates = Array.from({ length: 7 }, (_, i) => addDays(from, i)).filter((d) => d <= to);
  return dates.some((d) => shared.includes(weekdayIndexOf(d)));
}

function precedenceIssues(config: AvailabilityConfig): ConfigIssue[] {
  const { assignments } = config;
  return assignments.flatMap((later, j) =>
    assignments
      .slice(0, j)
      .some((earlier) => earlier.precedence === later.precedence && assignmentsMeet(earlier, later))
      ? [
          issue(
            `assignments[${j}].precedence`,
            "precedence_tie",
            "Two assignments cover the same day; choose which one wins."
          ),
        ]
      : []
  );
}

function windowIssues(config: AvailabilityConfig): ConfigIssue[] {
  const message = "The end time must be after the start time.";
  return config.dateRules.flatMap((rule, i) => [
    ...(rule.window && rule.window.to <= rule.window.from
      ? [issue(`dateRules[${i}].window.to`, "window_ends_before_start", message)]
      : []),
    ...(rule.kind === "tonight" &&
    "stop" in rule.payload &&
    rule.payload.stop.to <= rule.payload.stop.from
      ? [issue(`dateRules[${i}].payload.stop.to`, "window_ends_before_start", message)]
      : []),
  ]);
}

function bookingTypesIssues(config: AvailabilityConfig): ConfigIssue[] {
  return config.dateRules.flatMap((rule, i) =>
    rule.targetKind === "booking" && !rule.bookingTypes?.length
      ? [
          issue(
            `dateRules[${i}].bookingTypes`,
            "booking_types_required",
            "Choose which booking types to close."
          ),
        ]
      : []
  );
}

export function validateConfig(input: unknown): ConfigIssue[] {
  const parsed = AvailabilityConfigSchema.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.map((i) => issue(formatPath(i.path), "invalid", i.message));
  }
  const config = parsed.data;
  return [
    ...regularScheduleIssues(config),
    ...scheduleServiceIssues(config),
    ...specialHoursIssues(config),
    ...rangeIssues(config),
    ...precedenceIssues(config),
    ...windowIssues(config),
    ...bookingTypesIssues(config),
  ];
}
