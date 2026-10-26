import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Dialog, Text, useToast } from "@mattbutlerengineering/rialto";
import type {
  AvailabilityConfigState,
  ClosureAlongside,
  ClosureImpact,
  DateRule,
} from "@mbe/types";
import { useCreateClosure } from "../../hooks/useClosures.js";
import { useNow } from "../../hooks/useNow.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import { minutesOfDayIn } from "../../utils/service-day.js";
import {
  decisionsReady,
  isUrgent,
  outcomeCounts,
  toDecisions,
  type ChoiceMap,
} from "./close-draft.js";
import { CloseStepTwo } from "./CloseStepTwo.js";
import { outcomeLabel } from "./outcome-label.js";
import styles from "./CloseDialog.module.css";

export interface SeriesGrowthStepTwoProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  readonly timezone: string;
  /** Today on the venue clock. */
  readonly today: string;
  /** The edited series, as a closure draft, and the rows it replaces (`growthClosure`). */
  readonly rule: DateRule;
  readonly alongside: ClosureAlongside;
  /** The bookings the edited series would newly close. */
  readonly impact: ClosureImpact;
  readonly onBack: () => void;
  readonly onClose: () => void;
}

/**
 * Step 2 of a series edit that closes new dates (ux.md F-SER step 4, S7): the same one-choice-
 * per-group step a new closure gets, then one closure-command save that replaces the series and
 * cancels, refunds and notifies exactly as for a new closure. The rule and the cancels commit
 * together or not at all.
 */
export function SeriesGrowthStepTwo(props: SeriesGrowthStepTwoProps) {
  const { venueId, state, timezone, today, rule, alongside, impact, onBack, onClose } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const { toast } = useToast();
  const now = useNow();
  const { mutateAsync, isPending } = useCreateClosure();
  const [choices, setChoices] = useState<ChoiceMap>({});
  const [failure, setFailure] = useState<string | null>(null);
  // One key per dialog: a retry of the same save replays the first result.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const firstDate = impact.groups[0]?.date ?? rule.startsOn;
  const urgent = isUrgent(
    { startsOn: firstDate, fromMinute: rule.window?.from ?? null },
    today,
    minutesOfDayIn(now, timezone)
  );

  const save = async () => {
    setFailure(null);
    try {
      const result = await mutateAsync({
        venueId,
        idempotencyKey,
        body: {
          expectedVersion: state.version,
          rule,
          alongside,
          decisions: toDecisions(impact.groups, choices),
        },
      });
      const { cancel, move, keep_notify } = result.outcomes;
      const notified = cancel + move + keep_notify;
      toast({
        title:
          notified > 0
            ? t("availability.close.toast.notified", {
                date: format.formatCalendarDate(firstDate, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                }),
                count: notified,
              })
            : t("availabilitySpecial.series.savedToast"),
        variant: "success",
      });
      onClose();
    } catch (error) {
      setFailure(describeApiError(error).detail);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("availabilitySpecial.series.title")}
      description={t("availability.close.step", { step: 2 })}
      footer={
        <div className={styles.footer}>
          <Text variant="caption" color="secondary" className={styles.footerNote}>
            {t("availability.close.step2.irreversible")}
          </Text>
          <Button variant="secondary" onClick={onBack}>
            {t("availability.close.back")}
          </Button>
          <Button
            variant="primary"
            isLoading={isPending}
            disabled={!decisionsReady(impact.groups, choices)}
            onClick={() => void save()}
          >
            {outcomeLabel(outcomeCounts(impact.groups, choices), t)}
          </Button>
        </div>
      }
    >
      {failure && (
        <Alert variant="error" title={t("availability.close.saveError")}>
          {failure}
        </Alert>
      )}
      <CloseStepTwo
        impact={impact}
        choices={choices}
        urgent={urgent}
        guestMessage={rule.guestMessage ?? ""}
        onChoose={(key, choice) => setChoices({ ...choices, [key]: choice })}
      />
    </Dialog>
  );
}
