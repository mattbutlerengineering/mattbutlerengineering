import { useTranslation } from "react-i18next";
import { Button, Text } from "@mattbutlerengineering/rialto";
import type { ClosureSummary } from "@mbe/types";
import { ClosureOutcomes } from "./ClosureOutcomes.js";
import styles from "./ClosureListItem.module.css";

export interface ClosureListItemProps {
  /** The row's one sentence: what is closed, and when. */
  readonly title: string;
  /** The dates alone, which the row's buttons name themselves by ("Edit Thu, Nov 26"). */
  readonly subject: string;
  readonly summary: ClosureSummary | null;
  readonly isManager: boolean;
  /** A pause is resumed; every other closure is reopened. */
  readonly pause: boolean;
  readonly retrying: boolean;
  /** Present when the Close form can say everything the closure says. */
  readonly onEdit?: () => void;
  /** Present on a repeating closure. */
  readonly onEditDates?: () => void;
  /** The dates a repeating closure skips, each with a Restore. */
  readonly skips?: readonly { readonly id: string; readonly label: string }[];
  readonly onRestore?: (skipId: string) => void;
  /** Present on a closure in force or to come; Reopen, or Resume for a pause. */
  readonly onReopen?: () => void;
  readonly onCallList: () => void;
  readonly onRetry: () => void;
}

/** One closure, pause or earlier refund: its sentence, what became of the bookings, its actions. */
export function ClosureListItem(props: ClosureListItemProps) {
  const { title, subject, summary, isManager, pause, retrying } = props;
  const { t } = useTranslation();
  const refundsOpen = (summary?.refundFailed ?? 0) + (summary?.refundPending ?? 0);
  return (
    <li className={styles.item}>
      <div className={styles.summary}>
        <Text variant="body">{title}</Text>
        <ClosureOutcomes summary={summary} />
      </div>
      <div className={styles.actions}>
        {summary !== null && summary.unreachable > 0 && (
          <Button
            variant="secondary"
            aria-label={t("availabilitySpecial.callListFor", { date: subject })}
            onClick={props.onCallList}
          >
            {t("availabilitySpecial.callListOpen")}
          </Button>
        )}
        {isManager && refundsOpen > 0 && (
          <Button variant="secondary" isLoading={retrying} onClick={props.onRetry}>
            {t("availabilitySpecial.retry")}
          </Button>
        )}
        {isManager && props.onEdit && (
          <Button
            variant="ghost"
            aria-label={t("availabilityHub.closuresPage.editFor", { subject })}
            onClick={props.onEdit}
          >
            {t("availabilitySpecial.editClosure")}
          </Button>
        )}
        {isManager && props.onEditDates && (
          <Button
            variant="ghost"
            aria-label={t("availabilitySpecial.series.editDatesFor", { date: subject })}
            onClick={props.onEditDates}
          >
            {t("availabilitySpecial.series.editDates")}
          </Button>
        )}
        {isManager &&
          props.skips?.map((skip) => (
            <Button key={skip.id} variant="ghost" onClick={() => props.onRestore?.(skip.id)}>
              {t("availabilitySpecial.series.restoreDate", { date: skip.label })}
            </Button>
          ))}
        {isManager && props.onReopen && (
          <Button
            variant="ghost"
            aria-label={t(
              pause
                ? "availabilityHub.closuresPage.resumeAria"
                : "availabilityHub.closuresPage.reopenFor",
              { subject }
            )}
            onClick={props.onReopen}
          >
            {t(pause ? "availability.paused.resume" : "availabilityHub.closuresPage.reopen")}
          </Button>
        )}
      </div>
    </li>
  );
}
