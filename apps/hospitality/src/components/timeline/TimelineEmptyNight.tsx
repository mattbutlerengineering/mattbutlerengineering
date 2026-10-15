import { useTranslation } from "react-i18next";
import { Button, EmptyState } from "@mattbutlerengineering/rialto";
import styles from "./TimelineEmptyNight.module.css";

export interface TimelineEmptyNightProps {
  variant: "today" | "otherDate";
  /** The selected night as the page already renders it — "Wednesday, Sep 4". */
  dateLabel: string;
  onWalkIn: () => void;
  onToday: () => void;
}

/**
 * The quiet night, over the hour columns (ux.md Screen 7). Tonight invites a
 * walk-in; another date offers the way back. Not an alert — nothing happened.
 */
export function TimelineEmptyNight({
  variant,
  dateLabel,
  onWalkIn,
  onToday,
}: TimelineEmptyNightProps) {
  const { t } = useTranslation();
  const today = variant === "today";
  return (
    <div data-testid="timeline-empty-night" className={styles.overlay}>
      <EmptyState
        variant="flat"
        size="sm"
        icon={null}
        className={styles.card}
        heading={
          today
            ? t("timeline.emptyNight.todayHeading")
            : t("timeline.emptyNight.otherHeading", { date: dateLabel })
        }
        description={
          today
            ? t("timeline.emptyNight.todayDescription")
            : t("timeline.emptyNight.otherDescription")
        }
        action={
          today ? (
            <Button variant="primary" onClick={onWalkIn}>
              {t("timeline.emptyNight.walkIn")}
            </Button>
          ) : (
            <Button variant="secondary" onClick={onToday}>
              {t("timeline.emptyNight.backToToday")}
            </Button>
          )
        }
      />
    </div>
  );
}
