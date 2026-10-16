import { useTranslation } from "react-i18next";
import { Button, Text, Heading } from "@mattbutlerengineering/rialto";
import type { WaitlistStatus } from "@mbe/types";
import styles from "./WaitlistConfirmationView.module.css";

export interface WaitlistConfirmationViewProps {
  position: number;
  /** null = no estimate could be computed; rendered as "Estimate unavailable", never "0 min". */
  estimatedWaitMinutes: number | null;
  /** Where the party stands; anything but `waiting` replaces the queue numbers with a message. */
  status?: WaitlistStatus;
  onNewBooking: () => void;
}

const OUTCOME_KEYS = {
  notified: {
    heading: "bookingWidget.waitlist.outcomes.notifiedHeading",
    body: "bookingWidget.waitlist.outcomes.notifiedBody",
  },
  seated: {
    heading: "bookingWidget.waitlist.outcomes.seatedHeading",
    body: "bookingWidget.waitlist.outcomes.seatedBody",
  },
  expired: {
    heading: "bookingWidget.waitlist.outcomes.expiredHeading",
    body: "bookingWidget.waitlist.outcomes.expiredBody",
  },
  cancelled: {
    heading: "bookingWidget.waitlist.outcomes.cancelledHeading",
    body: "bookingWidget.waitlist.outcomes.cancelledBody",
  },
} as const;

function outcomeKeys(status: WaitlistStatus) {
  return status in OUTCOME_KEYS ? OUTCOME_KEYS[status as keyof typeof OUTCOME_KEYS] : undefined;
}

export function WaitlistConfirmationView({
  position,
  estimatedWaitMinutes,
  status = "waiting",
  onNewBooking,
}: WaitlistConfirmationViewProps) {
  const { t } = useTranslation();
  const outcome = outcomeKeys(status);
  if (outcome) {
    return (
      <div className={styles.container}>
        <Heading className={styles.heading}>{t(outcome.heading)}</Heading>
        <Text className={styles.smsNote}>{t(outcome.body)}</Text>
        <Button variant="ghost" onClick={onNewBooking} type="button">
          {t("bookingWidget.waitlist.reserveInstead")}
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Heading className={styles.heading}>{t("bookingWidget.waitlist.added")}</Heading>

      <div className={styles.details}>
        <div className={styles.positionCard}>
          <Text className={styles.positionLabel}>{t("bookingWidget.waitlist.position")}</Text>
          <Text className={styles.positionNumber}>#{position}</Text>
        </div>
        <div className={styles.waitCard}>
          <Text className={styles.waitLabel}>{t("bookingWidget.waitlist.estimatedWait")}</Text>
          <Text className={styles.waitTime}>
            {estimatedWaitMinutes === null
              ? t("bookingWidget.waitlist.estimateUnavailable")
              : t("bookingWidget.waitlist.waitMinutes", { minutes: estimatedWaitMinutes })}
          </Text>
        </div>
      </div>

      <Text className={styles.smsNote}>{t("bookingWidget.waitlist.smsNote")}</Text>

      <Button variant="ghost" onClick={onNewBooking} type="button">
        {t("bookingWidget.waitlist.reserveInstead")}
      </Button>
    </div>
  );
}
