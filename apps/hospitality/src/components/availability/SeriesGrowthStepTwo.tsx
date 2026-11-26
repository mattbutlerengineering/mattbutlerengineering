import { useTranslation } from "react-i18next";
import { Alert, Button, Dialog, Text } from "@mattbutlerengineering/rialto";
import { useNow } from "../../hooks/useNow.js";
import { minutesOfDayIn } from "../../utils/service-day.js";
import {
  decisionsReady,
  isUrgent,
  outcomeCounts,
  stepTwoNote,
  stepTwoNoteId,
} from "./close-draft.js";
import { CloseStepTwo } from "./CloseStepTwo.js";
import { outcomeLabel } from "./outcome-label.js";
import type { SeriesGrowth, SeriesGrowthSession } from "./use-series-growth-session.js";
import styles from "./CloseDialog.module.css";

export interface SeriesGrowthStepTwoProps {
  readonly venueId: string;
  readonly timezone: string;
  /** Today on the venue clock. */
  readonly today: string;
  /** The edited series and the bookings it would newly close. */
  readonly growth: SeriesGrowth;
  /** Held by `SeriesEditDialog`: going Back must not forget a save that may have gone through. */
  readonly session: SeriesGrowthSession;
  readonly onBack: () => void;
}

/**
 * Step 2 of a series edit that closes new dates (ux.md F-SER step 4, S7): the same one-choice-
 * per-group step a new closure gets. The session owns the choices, the attempt ids and what each
 * refusal does next; this renders them.
 */
export function SeriesGrowthStepTwo(props: SeriesGrowthStepTwoProps) {
  const { venueId, timezone, today, growth, session, onBack } = props;
  const { rule, impact } = growth;
  const { t } = useTranslation();
  const now = useNow();
  const { state, choices, failure, attempts } = session;
  const sending = state.kind === "sending";
  const ready = decisionsReady(impact.groups, choices);

  const firstDate = impact.groups[0]?.date ?? rule.startsOn;
  const urgent = isUrgent(
    { startsOn: firstDate, fromMinute: rule.window?.from ?? null },
    today,
    minutesOfDayIn(now, timezone)
  );

  return (
    <Dialog
      open
      onClose={session.leave}
      title={t("availabilitySpecial.series.title")}
      description={t("availability.close.step", { step: 2 })}
      footer={
        <div className={styles.footer}>
          <Text
            id={stepTwoNoteId}
            variant="caption"
            color="secondary"
            className={styles.footerNote}
          >
            {stepTwoNote(ready, t)}
          </Text>
          <Button variant="secondary" disabled={sending} onClick={onBack}>
            {t("availability.close.back")}
          </Button>
          <Button
            variant="primary"
            aria-describedby={stepTwoNoteId}
            isLoading={sending}
            disabled={
              session.savedEarlier ||
              (state.kind === "settled" && state.reason === "earlier") ||
              !ready
            }
            onClick={() => void session.submit()}
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
        venueId={venueId}
        impact={impact}
        choices={choices}
        urgent={urgent}
        guestMessage={rule.guestMessage ?? ""}
        onChoose={(key, choice) => {
          session.setChoice(key, choice);
          attempts.setDirty(true);
        }}
      />
    </Dialog>
  );
}
