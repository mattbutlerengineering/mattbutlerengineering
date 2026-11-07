import { decodeWeek } from "@mbe/availability";
import type { AvailabilityConfig } from "@mbe/types";
import {
  WEEK_DISPLAY_ORDER,
  coveredDays,
  draftToConfig,
  type QuickSetupDraft,
  type ServiceDraft,
} from "./quick-setup-draft.js";

/**
 * What Change regular week does with a `QuickSetupDraft` besides encode it (`schedule-changes.ts`):
 * tell whether it changed, which weekday the Manager just edited, lay it over a colleague's newer
 * week after a lost race, and name the schedules that run days outside the regular week. Pure.
 */

const sorted = (days: readonly number[] | null) => (days === null ? null : [...days].sort());
const nameKey = (service: ServiceDraft) => service.name.trim().toLowerCase();

/** A service's content without row ids, the linked flag and the order of its days. */
function serviceKey(service: ServiceDraft) {
  return JSON.stringify([
    nameKey(service),
    service.opens,
    service.lastSeating,
    service.closes,
    sorted(service.days),
    service.blocks.map((b) => [sorted(b.days), b.opens, b.lastSeating, b.closes]),
  ]);
}

/** Two drafts say the same week when everything but row ids and the order of days matches. */
export function weekKey(draft: QuickSetupDraft): string {
  return JSON.stringify([sorted(draft.days), draft.services.map(serviceKey)]);
}

/** Per weekday (0 = Sunday), what runs: each service's name and hours, as text. */
function daySignatures(draft: QuickSetupDraft): string[] {
  let n = 0;
  const config = draftToConfig(draft, () => `edit-${++n}`);
  const names = new Map(config.venueServices.map((v) => [v.id, v.name.trim().toLowerCase()]));
  const week = decodeWeek(config.scheduleServices, coveredDays(draft));
  return Array.from({ length: 7 }, (_, day) =>
    JSON.stringify(
      week
        .flatMap((service) => {
          const hours = service.days[day];
          return hours
            ? [
                [
                  names.get(service.venueServiceId),
                  hours.opensAt,
                  hours.lastSeatingAt,
                  hours.closesAt,
                ],
              ]
            : [];
        })
        .sort()
    )
  );
}

/** The first weekday, Monday first, whose services or hours differ between two drafts. */
export function editedWeekday(before: QuickSetupDraft, after: QuickSetupDraft): number | null {
  const was = daySignatures(before);
  const now = daySignatures(after);
  return WEEK_DISPLAY_ORDER.find((day) => was[day] !== now[day]) ?? null;
}

interface ReapplyInput {
  /** The week the draft was opened on. */
  readonly base: QuickSetupDraft;
  /** The week as the Manager has it now. */
  readonly draft: QuickSetupDraft;
  /** The regular week in the version that won. */
  readonly latest: QuickSetupDraft;
}

/**
 * The winning week with only the Manager's own changes on top: services they removed stay gone,
 * services they added or edited are theirs, and anything else (a colleague's new or edited service)
 * stays as the colleague left it. Services are matched by name.
 */
export function reapplyWeek({ base, draft, latest }: ReapplyInput): QuickSetupDraft {
  const baseBy = new Map(base.services.map((s) => [nameKey(s), s]));
  const draftBy = new Map(draft.services.map((s) => [nameKey(s), s]));
  const kept = latest.services.flatMap((row): ServiceDraft[] => {
    const was = baseBy.get(nameKey(row));
    const mine = draftBy.get(nameKey(row));
    if (was && !mine) return [];
    if (!was || !mine || serviceKey(was) === serviceKey(mine)) return [row];
    return [{ ...mine, id: row.id }];
  });
  const latestNames = new Set(latest.services.map(nameKey));
  const added = draft.services.filter(
    (s) => !baseBy.has(nameKey(s)) && !latestNames.has(nameKey(s))
  );
  const days =
    JSON.stringify(sorted(base.days)) === JSON.stringify(sorted(draft.days))
      ? latest.days
      : draft.days;
  return { days, services: [...kept, ...added] };
}

/** A schedule that runs days on its own, outside the regular week (for example a migrated "Weekend"). */
export interface OutsideSchedule {
  readonly name: string;
  readonly weekdays: readonly number[];
}

/** Live schedules other than the regular week that are in use with no dates: they own those days. */
export function outsideSchedules(config: AvailabilityConfig): OutsideSchedule[] {
  return config.schedules
    .filter((s) => !s.archivedAt && s.kind !== "regular")
    .flatMap((s) => {
      const days = new Set(
        config.assignments
          .filter((a) => a.scheduleId === s.id && a.startsOn == null && a.endsOn == null)
          .flatMap((a) => a.weekdays)
      );
      return days.size > 0 ? [{ name: s.name, weekdays: [...days].sort((a, b) => a - b) }] : [];
    });
}
