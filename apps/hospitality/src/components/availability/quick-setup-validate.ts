import type { TFunction } from "i18next";
import {
  buildLegacyConfig,
  MAX_PAST_MIDNIGHT_SPAN,
  normalizeLegacyHours,
  validateConfig,
  WEEKDAYS,
  type LegacyHours,
} from "@mbe/availability";
import {
  SERVICE_NAME_MAX_LENGTH,
  coveredDays,
  draftToConfig,
  draftToLegacyHours,
  minutesOf,
  type DraftTimes,
  type QuickSetupDraft,
  type ServiceDraft,
  type ServiceMinutes,
} from "./quick-setup-draft.js";

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
  | "days_required"
  | "block_days_required"
  | "days_outside_use";

export interface QuickSetupIssue {
  /** `null` for the whole card (the shared days). */
  readonly serviceId: string | null;
  /** Set when the problem is inside one of the service's different-hours blocks. */
  readonly blockId?: string;
  readonly field: QuickSetupField | "days";
  readonly code: QuickSetupIssueCode;
  /** `overlap` on some weekdays only: the weekday (0 = Sunday) and the service it overlaps. */
  readonly weekday?: number;
  readonly otherServiceId?: string;
}

const TIME_FIELDS = [
  ["opens", "opens"],
  ["lastSeating", "lastSeating"],
  ["closes", "closes"],
] as const;

interface IssueOwner {
  readonly serviceId: string;
  readonly blockId?: string;
}

function missingTimes(times: DraftTimes, owner: IssueOwner): QuickSetupIssue[] {
  return TIME_FIELDS.filter(([key]) => times[key] === null).map(([, field]): QuickSetupIssue => ({
    ...owner,
    field,
    code: "time_required",
  }));
}

function completenessIssues(service: ServiceDraft): QuickSetupIssue[] {
  const owner = { serviceId: service.id };
  const name = service.name.trim();
  const unnamed: QuickSetupIssue[] =
    name === ""
      ? [{ ...owner, field: "name", code: "name_required" }]
      : name.length > SERVICE_NAME_MAX_LENGTH
        ? [{ ...owner, field: "name", code: "name_too_long" }]
        : [];
  return [...unnamed, ...missingTimes(service, owner)];
}

function orderIssues(times: DraftTimes, m: ServiceMinutes, owner: IssueOwner): QuickSetupIssue[] {
  const at = (field: QuickSetupField, code: QuickSetupIssueCode): QuickSetupIssue => ({
    ...owner,
    field,
    code,
  });
  if (times.opens === times.closes) return [at("closes", "close_after_open")];
  return m.lastSeatingAt > m.closesAt ? [at("lastSeating", "last_seating_after_close")] : [];
}

/** Times first (a block's own, or the service's), then nothing else until they are all there. */
function timesIssues(times: DraftTimes, owner: IssueOwner): QuickSetupIssue[] {
  const missing = missingTimes(times, owner);
  const minutes = minutesOf(times);
  return missing.length > 0 || minutes === null ? missing : orderIssues(times, minutes, owner);
}

function serviceIssues(service: ServiceDraft): QuickSetupIssue[] {
  const missing = completenessIssues(service);
  const minutes = minutesOf(service);
  const times =
    missing.length > 0 || minutes === null
      ? missing
      : orderIssues(service, minutes, { serviceId: service.id });
  const days: QuickSetupIssue[] =
    service.days !== null && service.days.length === 0
      ? [{ serviceId: service.id, field: "days", code: "days_required" }]
      : [];
  const blocks = service.blocks.flatMap((block): QuickSetupIssue[] => {
    const owner = { serviceId: service.id, blockId: block.id };
    const blockDays: QuickSetupIssue[] =
      block.days.length === 0 ? [{ ...owner, field: "days", code: "block_days_required" }] : [];
    return [...timesIssues(block, owner), ...blockDays];
  });
  return [...times, ...days, ...blocks];
}

/**
 * Field-level problems, in card order (first is where focus goes). Overlap is the engine's call
 * (`validateConfig`): the same rule the server applies on save, per weekday. `legacyReader` is
 * for the new-venue wizard, which sends legacy hours; the card writes config rows directly, so
 * days the legacy reader would close (`legacy_closed_day`) are fine there.
 */
export function validateDraft(
  draft: QuickSetupDraft,
  options: { readonly legacyReader?: boolean; readonly within?: readonly number[] } = {}
): QuickSetupIssue[] {
  // `within`: the days an edited schedule is used on. Rows are stored over those days only, so a
  // service whose own days are all outside would be dropped and its stored row deleted.
  const outside: QuickSetupIssue[] = draft.services.flatMap((service) =>
    options.within &&
    service.days !== null &&
    service.days.length > 0 &&
    service.days.every((day) => !options.within?.includes(day))
      ? [{ serviceId: service.id, field: "days" as const, code: "days_outside_use" as const }]
      : []
  );
  const perService = [...draft.services.flatMap(serviceIssues), ...outside];
  // The shared days are needed only while a service follows them.
  const followsShared = draft.services.length === 0 || draft.services.some((s) => s.days === null);
  const daysIssue: QuickSetupIssue[] =
    followsShared && draft.days.length === 0
      ? [{ serviceId: null, field: "days", code: "days_required" }]
      : [];
  if (perService.length > 0) return [...perService, ...daysIssue];

  let n = 0;
  const config = draftToConfig(draft, () => `check-${++n}`);
  const serviceByVenueService = new Map(
    config.venueServices.map((vs) => [vs.id, draft.services[vs.position]])
  );
  const serviceAt = (path: string) => {
    const row = config.scheduleServices[Number(/scheduleServices\[(\d+)\]/.exec(path)?.[1])];
    return row ? serviceByVenueService.get(row.venueServiceId) : undefined;
  };
  const overlaps = validateConfig(config)
    .filter((issue) => issue.code === "overlap")
    .flatMap((issue): QuickSetupIssue[] => {
      const service = serviceAt(issue.path);
      if (!service) return [];
      const other = issue.otherPath === undefined ? undefined : serviceAt(issue.otherPath);
      const { weekday } = issue;
      const block =
        weekday === undefined ? undefined : service.blocks.find((b) => b.days.includes(weekday));
      return [
        {
          serviceId: service.id,
          ...(block ? { blockId: block.id } : {}),
          field: "opens",
          code: "overlap",
          ...(weekday !== undefined && other ? { weekday, otherServiceId: other.id } : {}),
        },
      ];
    });
  return [...overlaps, ...spanIssues(draft, options.legacyReader === true), ...daysIssue];
}

/** A service as the Manager reads it: its name, else "Service N" by position. */
export function serviceLabel(
  draft: QuickSetupDraft,
  id: string | null | undefined,
  t: TFunction
): string {
  const index = draft.services.findIndex((s) => s.id === id);
  return (
    draft.services[index]?.name.trim() || t("availability.quickSetup.serviceN", { n: index + 1 })
  );
}

/** The sentence for an issue. Overlap and missing service days name the service and the day. */
export function issueMessage(
  issue: QuickSetupIssue,
  draft: QuickSetupDraft,
  t: TFunction,
  weekdayName: (weekday: number) => string
): string {
  const nameOf = (id: string | null | undefined) => serviceLabel(draft, id, t);
  if (issue.code === "overlap" && issue.weekday !== undefined) {
    return t("availability.quickSetup.issues.overlap_on", {
      service: nameOf(issue.serviceId),
      other: nameOf(issue.otherServiceId),
      day: weekdayName(issue.weekday),
    });
  }
  if (issue.code === "days_required" && issue.serviceId !== null) {
    return t("availability.quickSetup.issues.days_required_service", {
      service: nameOf(issue.serviceId),
    });
  }
  return t(`availability.quickSetup.issues.${issue.code}`);
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
  return coveredDays(draft).some((day) => !open.has(day));
}
