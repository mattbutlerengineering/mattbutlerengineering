import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@mattbutlerengineering/rialto";
import { addDays } from "@mbe/availability";
import { ApiClientError } from "@mbe/api-client";
import type { AvailabilityConfigState } from "@mbe/types";
import { useSaveAvailabilityConfig } from "../../hooks/useAvailability.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import { QuickSetupCard } from "./QuickSetupCard.js";
import { WEEK_DISPLAY_ORDER, draftToChanges, type QuickSetupDraft } from "./quick-setup-draft.js";

const SAMPLE_MONDAY = "2026-10-26";

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
  const { toast } = useToast();
  const format = useVenueFormat();
  const save = useSaveAvailabilityConfig();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const openDays = (draft: QuickSetupDraft) => {
    const names = WEEK_DISPLAY_ORDER.flatMap((day, position) =>
      draft.days.includes(day)
        ? [format.formatCalendarDate(addDays(SAMPLE_MONDAY, position), { weekday: "short" })]
        : []
    );
    return new Intl.ListFormat(format.locale, { type: "conjunction" }).format(names);
  };

  const onSave = async (draft: QuickSetupDraft) => {
    try {
      await save.mutateAsync({
        venueId,
        expectedVersion: state.version,
        changes: draftToChanges(draft, state.config, () => crypto.randomUUID()),
      });
      setErrorMessage(null);
      toast({
        title: t("availability.quickSetup.savedToast", { days: openDays(draft) }),
        variant: "success",
        duration: 5000,
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

  return <QuickSetupCard onSave={onSave} errorMessage={errorMessage} />;
}
