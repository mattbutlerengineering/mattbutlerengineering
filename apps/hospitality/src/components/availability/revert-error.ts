import type { TFunction } from "i18next";
import { ApiClientError } from "@mbe/api-client";
import { describeApiError } from "../../lib/describe-api-error.js";

/** Problem codes a revert answers with that have their own sentence. */
const REVERT_CODES = [
  "guests-notified",
  "already-reverted",
  "superseded",
  "not-revertable",
  "version-conflict",
  "stranded-bookings",
  "invalid-config",
] as const;

/** One sentence for why an undo did not happen; anything unrecognised gets the house voice. */
export function revertErrorText(error: unknown, t: TFunction): string {
  const code = error instanceof ApiClientError ? error.problemDetails.code : undefined;
  const known = REVERT_CODES.find((c) => c === code);
  return known ? t(`availability.undo.errors.${known}`) : describeApiError(error).detail;
}
