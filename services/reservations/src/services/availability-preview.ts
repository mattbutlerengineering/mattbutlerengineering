import { randomUUID } from "node:crypto";
import { addDays, diffDays, resolveDay, type BookingSnapshot } from "@mbe/availability";
import {
  PREVIEW_STRANDED_PAGE_SIZE,
  PREVIEW_WINDOW_DAYS,
  type PreviewAvailabilityParsed,
  type PreviewResult,
  type PreviewScope,
} from "@mbe/types";
import {
  findStrandedReservations,
  summarizeDay,
  type BookedReservation,
} from "./availability-config-checks.js";
import { settleDraft, type ReferenceIssue } from "./availability-config-plan.js";
import type { ConfigState } from "./availability-config-state.js";
import { civilDateIn } from "./availability-migration.js";
import type { ConfigIssue } from "@mbe/availability";

/**
 * The decision half of `POST …/availability/preview`, pure: what an unsaved
 * draft changes for guests (a window of days), how the focus date resolves, and
 * which future bookings in scope it would strand. The store
 * (`availability-config.ts`) loads the state and bookings once and runs this.
 */

export interface PreviewInput {
  state: ConfigState;
  body: PreviewAvailabilityParsed;
  /** Future, still-booked reservations, each with its service date. */
  bookings: readonly BookedReservation[];
  tableIds: ReadonlySet<string>;
  now: Date;
  newId?: () => string;
}

export type PreviewPlan =
  | { kind: "invalid"; issues: (ConfigIssue | ReferenceIssue)[] }
  | { kind: "ok"; result: PreviewResult };

/** Is the service date inside the edit's scope (a list, or a range open at its end)? */
export function scopeIncludes(scope: PreviewScope, date: string): boolean {
  if (Array.isArray(scope)) return scope.includes(date);
  return scope.from <= date && (scope.to === undefined || date <= scope.to);
}

const toServiceDate = (d: Date): string => d.toISOString().slice(0, 10);

/** Structure only: the preview shows times the schedule lists, not which tables are free. */
const structural = (timezone: string, config: BookingSnapshot["config"]): BookingSnapshot => ({
  timezone,
  config,
  tables: [],
  reservations: [],
  holds: [],
  settings: null,
});

const PREVIEW_PARTY_SIZE = 2;

export function planPreview(input: PreviewInput): PreviewPlan {
  const { state, body, now } = input;
  const { draft, scope, focusDate, strandedOffset } = body;
  const { next, issues } = settleDraft({
    snapshot: { timezone: state.timezone, config: state.effective },
    changes: draft.changes,
    scopeConflicts: draft.scopeConflicts,
    tableIds: input.tableIds,
    now,
    today: civilDateIn(now, state.timezone),
    newId: input.newId ?? randomUUID,
  });
  if (issues.length > 0) return { kind: "invalid", issues };

  const before = structural(state.timezone, state.effective);
  const after = structural(state.timezone, next);
  const dates = Array.from({ length: PREVIEW_WINDOW_DAYS }, (_, i) => addDays(focusDate, i));
  const days = diffDays(before, after, dates, {
    partySize: PREVIEW_PARTY_SIZE,
    channel: "online",
    now,
  });

  const focus = resolveDay(after, focusDate);
  const stranded = findStrandedReservations(
    before,
    after,
    input.bookings.filter((b) => b.date && scopeIncludes(scope, toServiceDate(b.date)))
  ).sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id));

  const names = new Map(next.venueServices.map((s) => [s.id, s.name]));
  return {
    kind: "ok",
    result: {
      version: state.version,
      days,
      focusDay: {
        ...summarizeDay(next, focus),
        services: focus.services.map((s) => ({
          venueServiceId: s.venueServiceId,
          name: names.get(s.venueServiceId) ?? s.name,
          opensAt: s.opensAt,
          lastSeatingAt: s.lastSeatingAt,
          closesAt: s.closesAt,
        })),
      },
      stranded: {
        total: stranded.length,
        offset: strandedOffset,
        items: stranded.slice(strandedOffset, strandedOffset + PREVIEW_STRANDED_PAGE_SIZE),
      },
    },
  };
}
