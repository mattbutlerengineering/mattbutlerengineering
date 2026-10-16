import { useTranslation } from "react-i18next";
import { Button, Card, Text } from "@mattbutlerengineering/rialto";
import type { LapsingGuest } from "@mbe/types";
import styles from "./LapsingGuestsWidget.module.css";

interface LapsingGuestsWidgetProps {
  readonly guests: readonly LapsingGuest[];
  readonly onSendWinBack: (guestId: string) => void;
}

export function LapsingGuestsWidget({ guests, onSendWinBack }: LapsingGuestsWidgetProps) {
  const { t } = useTranslation();
  return (
    <Card title={t("home.lapsing.title")}>
      {guests.length === 0 ? (
        <Text variant="body" color="secondary">
          {t("home.lapsing.empty")}
        </Text>
      ) : (
        <ul className={styles.list} aria-label={t("home.lapsing.listLabel")}>
          {guests.map((guest) => (
            <li key={guest.guestId} className={styles.item}>
              <div className={styles.info}>
                <Text className={styles.name} data-truncate title={guest.name}>
                  {guest.name}
                </Text>
                <Text className={styles.meta}>
                  {t("home.lapsing.cadence", {
                    every: t("home.lapsing.every", { count: Math.round(guest.avgFrequencyDays) }),
                    overdue: t("home.lapsing.overdue", { count: Math.round(guest.daysOverdue) }),
                  })}
                </Text>
              </div>
              {guest.communicationPreference !== "transactional_only" && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onSendWinBack(guest.guestId)}
                  aria-label={t("home.lapsing.sendWinBackTo", { name: guest.name })}
                >
                  {t("home.lapsing.sendWinBack")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
