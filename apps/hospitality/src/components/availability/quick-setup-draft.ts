import type { TFunction } from "i18next";
import {
  buildLegacyConfig,
  decodeWeek,
  encodeWeek,
  MAX_PAST_MIDNIGHT_SPAN,
  normalizeLegacyHours,
  projectLegacyOperatingHours,
  validateConfig,
  WEEKDAYS,
  type LegacyHours,
  type ServiceHours,
  type ServiceWeek,
} from "@mbe/availability";
import { localeRuntime } from "../../i18n/runtime.js";
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

/** What the form has no controls for, carried so an edit keeps it: seating and booking types. */
export type KeptHours = Pick<ServiceHours, "seating" | "bookingTypes">;

/** The three times of a service or of one of its different-hours blocks. */
export interface DraftTimes {
  readonly opens: string | null;
  readonly lastSeating: string | null;
  readonly closes: string | null;
  /** While true, last seating follows close minus {@link LAST_SEATING_LEAD_MINUTES}. */
  readonly lastSeatingLinked: boolean;
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
}

export interface ServiceDraft extends DraftTimes {
  readonly id: string;
  readonly name: string;
  /** `null` follows the shared {@link QuickSetupDraft.days}. */
  readonly days: readonly number[] | null;
  readonly blocks: readonly HoursBlock[];
}

export interface QuickSetupDraft {
  readonly services: readonly ServiceDraft[];
  /** Shared days, for the services that follow them. Stored weekday indexes, 0 = Sunday … 6 = Saturday. */
  readonly days: readonly number[];
}

const LAST_SEATING_LEAD_MINUTES = 45;
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

/**
 * Last seating that follows a close: close minus the lead time, e.g. 22:00 → 21:15. With the
 * opening known, a service shorter than the lead seats at its opening, not before it; a close
 * earlier than the opening is the next day's.
 */
export function autoLastSeating(closes: string, opens: string | null = null): string {
  const lead = toMinutes(closes) - LAST_SEATING_LEAD_MINUTES;
  if (opens === null) return toClock(lead);
  const opensAt = toMinutes(opens);
  const closesAfter = toMinutes(closes) <= opensAt ? MINUTES_PER_DAY : 0;
  return toClock(Math.max(lead + closesAfter, opensAt));
}

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

/** A window another service holds on one day: minutes past that service day's midnight. */
interface DayWindow {
  readonly day: number;
  readonly opensAt: number;
  readonly closesAt: number;
}

/** The hours a service keeps on a day: its different-hours block's if one has the day, else its own. */
function windowOn(service: ServiceDraft, day: number): DayWindow | null {
  const times = service.blocks.find((b) => b.days.includes(day)) ?? service;
  const m = minutesOf(times);
  return m && { day, opensAt: m.opensAt, closesAt: m.closesAt };
}

/** The windows of every other service on the given days. */
function othersOn(draft: QuickSetupDraft, serviceId: string, days: readonly number[]) {
  return draft.services
    .filter((s) => s.id !== serviceId)
    .flatMap((s) =>
      effectiveDays(draft, s)
        .filter((d) => days.includes(d))
        .map((d) => windowOn(s, d))
    )
    .filter((w): w is DayWindow => w !== null);
}

/** True when every affected day's earliest open → latest close stays within the span rule. */
function withinSpan(
  others: readonly DayWindow[],
  days: readonly number[],
  opensAt: number,
  closesAt: number
) {
  return days.every((day) => {
    const mine = others.filter((w) => w.day === day);
    const open = Math.min(opensAt, ...mine.map((w) => w.opensAt));
    const close = Math.max(closesAt, ...mine.map((w) => w.closesAt));
    return close - open <= MAX_PAST_MIDNIGHT_SPAN;
  });
}

/** Minutes from a service's opening to its close; a close not after the opening is the next day's. */
function lengthOf(opens: string, closes: string): number {
  const length = toMinutes(closes) - toMinutes(opens);
  return length > 0 ? length : length + MINUTES_PER_DAY;
}

/**
 * A name chip placed in the draft (ux.md F2): the preset's name and length, starting when the
 * other services on its days close, so Late follows Dinner instead of overlapping it. The preset's
 * own times stay when that start would pass midnight, push a day past the span rule, or no other
 * service shares its days.
 */
export function placePreset(
  draft: QuickSetupDraft,
  serviceId: string,
  preset: ServicePresetId,
  name: string
): ServiceDraft {
  const service = draft.services.find((s) => s.id === serviceId) ?? emptyService(serviceId);
  const defaults = applyPreset(service, preset, name);
  const days = effectiveDays(draft, service);
  const others = othersOn(draft, serviceId, days);
  if (others.length === 0) return defaults;
  const start = Math.max(...others.map((w) => w.closesAt));
  const { opens, closes } = SERVICE_PRESETS[preset];
  const end = start + lengthOf(opens, closes);
  // A start is a time of day: one at or after midnight cannot be stored as the opening.
  if (start >= MINUTES_PER_DAY || end > 2 * MINUTES_PER_DAY) return defaults;
  if (!withinSpan(others, days, start, end)) return defaults;
  const placedOpens = toClock(start);
  const placedCloses = toClock(end);
  return {
    ...defaults,
    opens: placedOpens,
    closes: placedCloses,
    lastSeating: autoLastSeating(placedCloses, placedOpens),
  };
}

const START_STEP_MINUTES = 15;

/**
 * The earliest start at or after the service's own, in 15-minute steps, that keeps its length and
 * overlaps nothing on its days (past midnight included) within the span rule; `null` when none.
 * Only the service's own hours move: days a different-hours block covers keep the block's.
 */
export function firstClearStart(draft: QuickSetupDraft, serviceId: string): number | null {
  const service = draft.services.find((s) => s.id === serviceId);
  if (!service || service.opens === null || service.closes === null) return null;
  const days = effectiveDays(draft, service).filter(
    (d) => !service.blocks.some((b) => b.days.includes(d))
  );
  if (days.length === 0) return null;
  const length = lengthOf(service.opens, service.closes);
  const near = days.flatMap((d) => [d, (d + 1) % 7, (d + 6) % 7]);
  const others = othersOn(draft, serviceId, near);
  const clashes = (w: DayWindow, day: number, from: number, to: number) => {
    // The same service day, then a window spilling in from the day before or out into the next.
    if (w.day === day) return from < w.closesAt && w.opensAt < to;
    if (w.day === (day + 6) % 7) return w.closesAt - MINUTES_PER_DAY > from;
    return w.day === (day + 1) % 7 && to - MINUTES_PER_DAY > w.opensAt;
  };
  for (let from = toMinutes(service.opens); from < MINUTES_PER_DAY; from += START_STEP_MINUTES) {
    const to = from + length;
    const free = days.every((day) => !others.some((w) => clashes(w, day, from, to)));
    if (free && withinSpan(others, days, from, to)) return from;
  }
  return null;
}

/** The service starting at `opensAt` (minutes) with its length kept; a typed last seating shifts with it. */
export function moveServiceStart(service: ServiceDraft, opensAt: number): ServiceDraft {
  if (service.opens === null || service.closes === null) return service;
  const closes = toClock(opensAt + lengthOf(service.opens, service.closes));
  const opens = toClock(opensAt);
  const shift = opensAt - toMinutes(service.opens);
  const lastSeating = service.lastSeatingLinked
    ? autoLastSeating(closes, opens)
    : service.lastSeating === null
      ? null
      : toClock(toMinutes(service.lastSeating) + shift);
  return { ...service, opens, closes, lastSeating };
}

/** Editing close keeps a linked last seating in step; editing last seating unlinks it. */
export function setServiceTime<T extends DraftTimes>(
  service: T,
  field: "opens" | "lastSeating" | "closes",
  value: string | null
): T {
  if (field === "lastSeating") return { ...service, lastSeating: value, lastSeatingLinked: false };
  const next = { ...service, [field]: value };
  // Both ends bound a linked last seating, so moving either one keeps it in step.
  if (!service.lastSeatingLinked) return next;
  return {
    ...next,
    lastSeating: next.closes === null ? null : autoLastSeating(next.closes, next.opens),
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
  /** `overlap` only: a later start for `serviceId` that clears it (`firstClearStart`). */
  readonly fix?: { readonly serviceId: string; readonly opensAt: number };
}

interface ServiceMinutes {
  readonly opensAt: number;
  readonly lastSeatingAt: number;
  readonly closesAt: number;
}

/** Minutes past the service day's midnight; a time earlier than the opening is after midnight. */
function minutesOf(
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
      const opensAt = block === undefined ? firstClearStart(draft, service.id) : null;
      const fix =
        opensAt !== null && opensAt !== minutesOf(service)?.opensAt
          ? { serviceId: service.id, opensAt }
          : null;
      return [
        {
          serviceId: service.id,
          ...(block ? { blockId: block.id } : {}),
          field: "opens",
          code: "overlap",
          ...(weekday !== undefined && other ? { weekday, otherServiceId: other.id } : {}),
          ...(fix ? { fix } : {}),
        },
      ];
    });
  return [...overlaps, ...spanIssues(draft, options.legacyReader === true), ...daysIssue];
}

/** The sentence for an issue. Overlap and missing service days name the service and the day. */
export function issueMessage(
  issue: QuickSetupIssue,
  draft: QuickSetupDraft,
  t: TFunction,
  weekdayName: (weekday: number) => string
): string {
  const nameOf = (id: string | null | undefined) => {
    const index = draft.services.findIndex((s) => s.id === id);
    const service = draft.services[index];
    return service?.name.trim() || t("availability.quickSetup.serviceN", { n: index + 1 });
  };
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

function hoursOf(m: ServiceMinutes, kept: KeptHours | undefined): ServiceHours {
  return {
    ...m,
    ...(kept ?? {
      seating: { version: 1 as const, interval: SEATING_INTERVAL_MINUTES },
      bookingTypes: ["online" as const, "phone" as const],
    }),
  };
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
