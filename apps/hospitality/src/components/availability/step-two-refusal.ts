import type { TFunction } from "i18next";
import type { AvailabilityChangeSummary } from "@mbe/types";
import { describeApiError, type ApiErrorCategory } from "../../lib/describe-api-error.js";
import { conflictOf, isDecisionRequired } from "./conflict-problem.js";

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

export function refusalOf(error: unknown): Refusal {
  if (isDecisionRequired(error)) return { kind: "groups-changed" };
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

export function refusalText(refusal: Refusal, t: TFunction): string {
  switch (refusal.kind) {
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
