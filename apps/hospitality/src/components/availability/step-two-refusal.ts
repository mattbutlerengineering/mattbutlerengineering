import type { TFunction } from "i18next";
import type { AvailabilityChangeSummary } from "@mbe/types";
import { describeApiError } from "../../lib/describe-api-error.js";
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
  | { readonly kind: "other"; readonly detail: string };

export function refusalOf(error: unknown): Refusal {
  if (isDecisionRequired(error)) return { kind: "groups-changed" };
  const conflict = conflictOf(error);
  if (conflict?.code === "version-conflict") {
    return { kind: "version-conflict", winningChange: conflict.winningChange };
  }
  if (conflict?.code === "closure-exists") return { kind: "closure-exists" };
  return { kind: "other", detail: describeApiError(error).detail };
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
      return refusal.detail;
  }
}
