import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiClientError } from "@mbe/api-client";
import type { AvailabilityConfigState } from "@mbe/types";
import { useSaveAvailabilityConfig } from "../../hooks/useAvailability.js";
import { useAvailabilityUndo } from "../../hooks/useAvailabilityUndo.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import { LeaveGuard } from "./LeaveGuard.js";
import { QuickSetupCard } from "./QuickSetupCard.js";
import { useWeekdaySummary } from "./ScheduleFormParts.js";
import { coveredDays, draftToChanges, type QuickSetupDraft } from "./quick-setup-draft.js";

export interface AvailabilityQuickSetupProps {
  readonly venueId: string;
  /** The empty config the save is checked against (its `version` is the compare-and-set). */
  readonly state: AvailabilityConfigState;
  /** Refetch the config; used after a lost race so the retry carries the winning version. */
  readonly onStale: () => void;
}

/** Wires S1 to the config API: save, toast, and the three ways a save can fail. */
export function AvailabilityQuickSetup({ venueId, state, onStale }: AvailabilityQuickSetupProps) {
  const { t } = useTranslation();
  const offerUndo = useAvailabilityUndo();
  // "Mon–Fri" or "every day", as the regular-week line above the calendar will read.
  const summarize = useWeekdaySummary();
  const save = useSaveAvailabilityConfig();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Hours typed but not saved: closing the tab or leaving the page asks first.
  const [dirty, setDirty] = useState(false);

  const onSave = async (draft: QuickSetupDraft) => {
    try {
      const saved = await save.mutateAsync({
        venueId,
        body: {
          expectedVersion: state.version,
          changes: draftToChanges(draft, state.config, () => crypto.randomUUID()),
        },
      });
      setErrorMessage(null);
      setDirty(false);
      offerUndo({
        venueId,
        saved,
        // The union of the days any service runs, not just the shared days.
        title: t("availability.quickSetup.savedToast", { days: summarize(coveredDays(draft)) }),
      });
    } catch (error) {
      const lostRace =
        error instanceof ApiClientError && error.problemDetails.code === "version-conflict";
      if (lostRace) onStale();
      setErrorMessage(
        lostRace ? t("availability.quickSetup.versionConflict") : describeApiError(error).detail
      );
    }
  };

  return (
    <>
      <QuickSetupCard onSave={onSave} errorMessage={errorMessage} onDirtyChange={setDirty} />
      <LeaveGuard active={dirty} date={null} title={t("availabilitySchedules.discard.title")} />
    </>
  );
}
