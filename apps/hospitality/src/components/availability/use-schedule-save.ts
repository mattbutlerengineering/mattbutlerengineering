import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AvailabilityConfigProblemSchema,
  type AvailabilityConfigChanges,
  type AvailabilityConfigState,
  type ScopeConflictMode,
} from "@mbe/types";
import { useSaveAvailabilityConfig } from "../../hooks/useAvailability.js";
import { describeApiError } from "../../lib/describe-api-error.js";

/**
 * Saves one schedule-level change through the single config hook and turns a refusal into
 * messages the Schedules surfaces show in an `Alert`. A concurrent change is not merged here:
 * the Manager is told, and the config is reloaded (`onStale`) so the next try is against it.
 */
export function useScheduleSave(
  onStale: () => void,
  strandedKey:
    | "availabilitySchedules.stranded"
    | "availabilitySpecial.series.stranded" = "availabilitySchedules.stranded"
) {
  const { t } = useTranslation();
  const { mutateAsync, isPending } = useSaveAvailabilityConfig();
  const [failure, setFailure] = useState<readonly string[]>([]);

  const reject = (error: unknown) => {
    const details = (error as { problemDetails?: unknown } | null)?.problemDetails;
    const parsed = AvailabilityConfigProblemSchema.safeParse(details);
    const problem = parsed.success ? parsed.data : null;
    if (problem?.code === "version-conflict") {
      onStale();
      setFailure([t("availabilitySchedules.conflict")]);
    } else if (problem?.code === "invalid-config" && problem.issues?.length) {
      setFailure(problem.issues.map((i) => i.message));
    } else if (problem?.code === "stranded-bookings") {
      setFailure([t(strandedKey, { count: problem.reservations?.length ?? 0 })]);
    } else {
      setFailure([describeApiError(error).detail]);
    }
  };

  /** Resolves `true` when the change was saved. */
  const save = async (
    venueId: string,
    state: AvailabilityConfigState,
    changes: AvailabilityConfigChanges,
    scopeConflicts: ScopeConflictMode
  ): Promise<boolean> => {
    setFailure([]);
    try {
      await mutateAsync({
        venueId,
        body: { expectedVersion: state.version, changes, scopeConflicts },
      });
      return true;
    } catch (error) {
      reject(error);
      return false;
    }
  };

  return { save, isPending, failure, clearFailure: () => setFailure([]) };
}
