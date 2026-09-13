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
  const today = variant === "today";
  return (
    <div data-testid="timeline-empty-night" className={styles.overlay}>
      <EmptyState
        variant="flat"
        size="sm"
        icon={null}
        className={styles.card}
        heading={today ? "Quiet so far." : `Nothing on the book for ${dateLabel}.`}
        description={
          today
            ? "Nothing on the book for tonight. Walk-ins go straight to a table."
            : "Bookings for that night will show here."
        }
        action={
          today ? (
            <Button variant="primary" onClick={onWalkIn}>
              Walk-in
            </Button>
          ) : (
            <Button variant="secondary" onClick={onToday}>
              Back to today
            </Button>
          )
        }
      />
    </div>
  );
}
