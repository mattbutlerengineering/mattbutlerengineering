import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type AvailabilityChangeSummary,
  type AvailabilityConfigChanges,
  type AvailabilityConfigSaveResult,
  type AvailabilityConfigState,
  type ConflictChangesSince,
  type ScopeConflictMode,
  type StrandedReservation,
} from "@mbe/types";
import { useSaveAvailabilityConfig } from "../../hooks/useAvailability.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import { availabilityProblemOf } from "./conflict-problem.js";

/** A lost race as the 409 told it, for the conflict dialog. */
export interface SaveConflict {
  /** The change that won; `null` when the server recorded none. */
  readonly winningChange: AvailabilityChangeSummary | null;
  readonly changesSince?: ConflictChangesSince;
  /** The version the 409 reported, which Overwrite goes against; `null` from an older server. */
  readonly seen: number | null;
  /** An Overwrite met this one: the dialog was already open on an earlier change. */
  readonly again: boolean;
}

/**
 * Saves one schedule-level change through the single config hook and turns a refusal into
 * messages the Schedules surfaces show in an `Alert`. A concurrent change is not merged here:
 * the Manager is told, and the config is reloaded (`onStale`) so the next try is against it.
 */
export function useScheduleSave(
  onStale: () => void,
  strandedKey:
    | "availabilitySchedules.stranded"
    | "availabilitySpecial.series.stranded"
    | "availabilitySpecial.rowStranded" = "availabilitySchedules.stranded"
) {
  const { t } = useTranslation();
  const { mutateAsync, isPending } = useSaveAvailabilityConfig();
  const [failure, setFailure] = useState<readonly string[]>([]);
  // The bookings behind a stranded refusal, listed beneath its message.
  const [stranded, setStranded] = useState<readonly StrandedReservation[]>([]);
  // A lost race. The draft was built from a version that is gone, so a form that edits rows
  // must show what changed and get an answer before it saves again.
  const [conflict, setConflict] = useState<SaveConflict | null>(null);
  // The last refusal answered an Overwrite, so it is said in the conflict dialog.
  const [overwriteRefused, setOverwriteRefused] = useState(false);

  const clearFailure = () => {
    setFailure([]);
    setStranded([]);
    setOverwriteRefused(false);
  };

  const reject = (error: unknown, overwrote: boolean) => {
    const problem = availabilityProblemOf(error);
    if (problem?.code === "version-conflict") {
      onStale();
      setConflict({
        winningChange: problem.winningChange ?? null,
        ...(problem.changesSince ? { changesSince: problem.changesSince } : {}),
        seen: problem.currentVersion ?? null,
        again: overwrote,
      });
      setFailure([t("availabilitySchedules.conflict")]);
      return;
    }
    setOverwriteRefused(overwrote);
    if (problem?.code === "invalid-config" && problem.issues?.length) {
      setFailure(problem.issues.map((i) => i.message));
    } else if (problem?.code === "stranded-bookings") {
      setFailure([t(strandedKey, { count: problem.reservations?.length ?? 0 })]);
      setStranded(problem.reservations ?? []);
    } else {
      setFailure([describeApiError(error).detail]);
    }
  };

  const send = async (
    venueId: string,
    body: {
      expectedVersion: number;
      changes: AvailabilityConfigChanges;
      scopeConflicts: ScopeConflictMode;
    },
    overwrote: boolean
  ): Promise<AvailabilityConfigSaveResult | null> => {
    clearFailure();
    try {
      return await mutateAsync({ venueId, body });
    } catch (error) {
      reject(error, overwrote);
      return null;
    }
  };

  /** Resolves the save result (truthy) when the change was saved, `null` when it was refused. */
  const save = (
    venueId: string,
    state: AvailabilityConfigState,
    changes: AvailabilityConfigChanges,
    scopeConflicts: ScopeConflictMode,
    /** The version the changes were built against, when that is not the latest `state`. */
    expectedVersion: number = state.version
  ): Promise<AvailabilityConfigSaveResult | null> =>
    send(venueId, { expectedVersion, changes, scopeConflicts }, false);

  /**
   * Saves over the change the conflict named: checked against the version the 409 reported, never
   * one read at click time, so a change the dialog did not show is another conflict.
   */
  const overwrite = async (
    venueId: string,
    changes: AvailabilityConfigChanges,
    scopeConflicts: ScopeConflictMode
  ): Promise<AvailabilityConfigSaveResult | null> => {
    const seen = conflict?.seen;
    if (seen === null || seen === undefined) return null;
    const saved = await send(venueId, { expectedVersion: seen, changes, scopeConflicts }, true);
    if (saved) setConflict(null);
    return saved;
  };

  return {
    save,
    overwrite,
    isPending,
    failure,
    stranded,
    conflict,
    conflicted: conflict !== null,
    /** Why the last Overwrite was refused, when it was not for a newer change. */
    overwriteFailure: overwriteRefused ? failure : [],
    clearFailure,
    /** The Manager has answered the conflict; the next save is against the version they saw. */
    clearConflict: () => {
      setConflict(null);
      clearFailure();
    },
  };
}
