import { Button, Card, Text } from "@mattbutlerengineering/rialto";
import type { LapsingGuest } from "@mbe/types";
import styles from "./LapsingGuestsWidget.module.css";

interface LapsingGuestsWidgetProps {
  readonly guests: readonly LapsingGuest[];
  readonly onSendWinBack: (guestId: string) => void;
}

export function LapsingGuestsWidget({ guests, onSendWinBack }: LapsingGuestsWidgetProps) {
  return (
    <Card title="Lapsing Guests">
      {guests.length === 0 ? (
        <Text variant="body" color="secondary">
          No lapsing guests
        </Text>
      ) : (
        <ul className={styles.list} aria-label="Lapsing guests">
          {guests.map((guest) => (
            <li key={guest.guestId} className={styles.item}>
              <div className={styles.info}>
                <Text className={styles.name}>{guest.name}</Text>
                <Text className={styles.meta}>
                  Every {Math.round(guest.avgFrequencyDays)} days &middot;{" "}
                  {Math.round(guest.daysOverdue)} days overdue
                </Text>
              </div>
              {guest.communicationPreference !== "transactional_only" && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onSendWinBack(guest.guestId)}
                  aria-label={`Send win-back to ${guest.name}`}
                >
                  Send win-back
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
