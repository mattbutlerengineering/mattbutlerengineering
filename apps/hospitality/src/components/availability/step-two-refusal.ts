import type { TFunction } from "i18next";
import { type AvailabilityChangeSummary, type ClosureImpactGroup } from "@mbe/types";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import { clockHourOfInstant } from "../../utils/clock-hour.js";
import { describeApiError, type ApiErrorCategory } from "../../lib/describe-api-error.js";
import { availabilityProblemOf, conflictOf, isDecisionRequired } from "./conflict-problem.js";

/**
 * How the server refused a Step 2 save, shared by every flow that decides on bookings (Close,
 * series growth, Add special date, Tonight). What each flow does next differs; how a refusal is
 * told apart, and what it says, does not.
 */
export type Refusal =
  /** A group's bookings changed since the Manager chose: the choices are void. */
  | { readonly kind: "groups-changed" }
  /** Someone saved first; `winningChange` is `null` when the server recorded none. */
  | { readonly kind: "version-conflict"; readonly winningChange: AvailabilityChangeSummary | null }
  /**
   * "Move" was chosen and some bookings have no open time (or the time was taken since): the server
   * saved nothing and told no guest. `reservationIds` are the ones it could not move.
   */
  | { readonly kind: "move-unavailable"; readonly reservationIds: readonly string[] }
  /** This attempt already committed (a response was lost). */
  | { readonly kind: "closure-exists" }
  /**
   * `outcomeUnknown`: no answer the server stands behind (a lost response, a timeout, a 5xx from
   * something in front of it), so the save may have committed.
   */
  | {
      readonly kind: "other";
      readonly detail: string;
      readonly outcomeUnknown: boolean;
    };

const UNKNOWN_OUTCOME: ReadonlySet<ApiErrorCategory> = new Set([
  "network",
  "timeout",
  "serverError",
  "unknown",
]);

/** The ids of a `move-unavailable` refusal, or `null` for any other problem. */
function moveUnavailableIds(error: unknown): readonly string[] | null {
  const problem = availabilityProblemOf(error);
  return problem?.code === "move-unavailable" ? (problem.reservationIds ?? []) : null;
}

export function refusalOf(error: unknown): Refusal {
  if (isDecisionRequired(error)) return { kind: "groups-changed" };
  const stuck = moveUnavailableIds(error);
  if (stuck) return { kind: "move-unavailable", reservationIds: stuck };
  const conflict = conflictOf(error);
  if (conflict?.code === "version-conflict") {
    return { kind: "version-conflict", winningChange: conflict.winningChange };
  }
  if (conflict?.code === "closure-exists") return { kind: "closure-exists" };
  const { category, detail } = describeApiError(error);
  return { kind: "other", detail, outcomeUnknown: UNKNOWN_OUTCOME.has(category) };
}

/** Whether the save may have committed, so "nothing has been closed" could be false. */
export function mayHaveSaved(refusal: Refusal): boolean {
  return refusal.kind === "closure-exists" || (refusal.kind === "other" && refusal.outcomeUnknown);
}

/** The bookings a flow is deciding on, and the formats that name them as the screen does. */
export interface RefusalContext {
  readonly groups: readonly ClosureImpactGroup[];
  readonly format: Pick<VenueFormat, "formatTime" | "formatCalendarDate" | "formatInstant">;
}

/** Bookings named in a refused move; the rest are counted. */
const MOVE_NAMED_MAX = 5;

/** "Rivera, Thu, Dec 24 at 7:30 PM" for each booking the server could not move. */
function moveUnavailableText(
  ids: readonly string[],
  t: TFunction,
  context: RefusalContext | undefined
): string {
  const known = new Map(
    (context?.groups ?? []).flatMap((g) => g.reservations.map((r) => [r.id, { g, r }] as const))
  );
  const named = ids.flatMap((id) => {
    const found = known.get(id);
    if (!found || !context) return [];
    const { g, r } = found;
    return [
      t("availability.close.moveUnavailableBooking", {
        name: r.guestName ?? t("availability.close.step2.guestUnnamed"),
        date: context.format.formatCalendarDate(g.date, {
          weekday: "short",
          month: "short",
          day: "numeric",
        }),
        time: context.format.formatTime(r.startTime),
        count: clockHourOfInstant(r.startTime, context.format),
      }),
    ];
  });
  const shown = named.slice(0, MOVE_NAMED_MAX);
  const more = named.length - shown.length;
  // Bookings no longer in the list cannot be named; say how many rather than naming nobody.
  const bookings =
    named.length === 0
      ? t("availability.close.moveUnavailableCount", { count: ids.length })
      : [
          ...shown,
          ...(more > 0 ? [t("availability.close.moveUnavailableMore", { count: more })] : []),
        ].join("; ");
  return t("availability.close.moveUnavailable", { count: Math.max(ids.length, 1), bookings });
}

export function refusalText(refusal: Refusal, t: TFunction, context?: RefusalContext): string {
  switch (refusal.kind) {
    case "move-unavailable":
      return moveUnavailableText(refusal.reservationIds, t, context);
    case "groups-changed":
      return t("availability.close.groupsChanged");
    case "version-conflict":
      return t("availability.close.versionConflict");
    case "closure-exists":
      return t("availability.close.alreadySaved");
    case "other":
      // The house sentences do not say this save may have gone through; this one does.
      return refusal.outcomeUnknown ? t("availability.close.maybeSaved") : refusal.detail;
  }
}
