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

const OUTCOME_COPY: Partial<Record<WaitlistStatus, { heading: string; body: string }>> = {
  notified: {
    heading: "Your table is ready",
    body: "Please check in with the host now - we can only hold it for a few minutes.",
  },
  seated: { heading: "You've been seated", body: "Enjoy your visit." },
  expired: {
    heading: "Your spot has expired",
    body: "We couldn't hold your table in time. You can join the waitlist again or make a reservation.",
  },
  cancelled: {
    heading: "Your waitlist spot was cancelled",
    body: "You can join the waitlist again or make a reservation.",
  },
};

export function WaitlistConfirmationView({
  position,
  estimatedWaitMinutes,
  status = "waiting",
  onNewBooking,
}: WaitlistConfirmationViewProps) {
  const outcome = OUTCOME_COPY[status];
  if (outcome) {
    return (
      <div className={styles.container}>
        <Heading className={styles.heading}>{outcome.heading}</Heading>
        <Text className={styles.smsNote}>{outcome.body}</Text>
        <Button variant="ghost" onClick={onNewBooking} type="button">
          Make a Reservation Instead
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Heading className={styles.heading}>Added to Waitlist</Heading>

      <div className={styles.details}>
        <div className={styles.positionCard}>
          <Text className={styles.positionLabel}>Your position</Text>
          <Text className={styles.positionNumber}>#{position}</Text>
        </div>
        <div className={styles.waitCard}>
          <Text className={styles.waitLabel}>Estimated wait</Text>
          <Text className={styles.waitTime}>
            {estimatedWaitMinutes === null ? "Estimate unavailable" : `${estimatedWaitMinutes} min`}
          </Text>
        </div>
      </div>

      <Text className={styles.smsNote}>
        We&apos;ll send you an SMS when your table is ready. Please keep your phone nearby.
      </Text>

      <Button variant="ghost" onClick={onNewBooking} type="button">
        Make a Reservation Instead
      </Button>
    </div>
  );
}
