import {
  AvailabilityConfigSchema,
  type AvailabilityConfig,
  type ScheduleAssignment,
  type SpecialHoursService,
} from "@mbe/types";

/**
 * The invariants the configuration layers must satisfy together (ADR-030).
 * The store calls this before every commit; the editor maps each issue's
 * `path` to a field. Never throws.
 */

export type ConfigIssueCode =
  | "invalid"
  | "overlap"
  | "close_before_open"
  | "last_seating_after_close"
  | "last_seating_before_open"
  | "multiple_regular_schedules"
  | "no_regular_schedule"
  | "precedence_tie"
  | "ends_before_start";

export interface ConfigIssue {
  /** e.g. `scheduleServices[1].lastSeatingAt`; `""` is the whole config. */
  path: string;
  code: ConfigIssueCode;
  message: string;
}

/** The hours fields a schedule service and a special-hours service share. */
type ServiceHours = Pick<SpecialHoursService, "opensAt" | "lastSeatingAt" | "closesAt">;

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

function formatMinute(minute: number): string {
  const m = minute % 1440;
  const hour24 = Math.floor(m / 60);
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(m % 60).padStart(2, "0")} ${hour24 < 12 ? "AM" : "PM"}`;
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
  return [];
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

function scheduleServiceIssues(config: AvailabilityConfig): ConfigIssue[] {
  const pathed = config.scheduleServices.map((s, i) => ({
    scheduleId: s.scheduleId,
    path: `scheduleServices[${i}]`,
    hours: s,
  }));
  const scheduleIds = [...new Set(pathed.map((s) => s.scheduleId))];
  return scheduleIds.flatMap((id) => serviceListIssues(pathed.filter((s) => s.scheduleId === id)));
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

function assignmentsMeet(a: ScheduleAssignment, b: ScheduleAssignment): boolean {
  const shareWeekday = a.weekdays.some((d) => b.weekdays.includes(d));
  // Open ends are unbounded; "YYYY-MM-DD" strings order chronologically.
  const startsBeforeOtherEnds = (x: ScheduleAssignment, y: ScheduleAssignment) =>
    x.startsOn == null || y.endsOn == null || x.startsOn <= y.endsOn;
  return shareWeekday && startsBeforeOtherEnds(a, b) && startsBeforeOtherEnds(b, a);
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
  ];
}
