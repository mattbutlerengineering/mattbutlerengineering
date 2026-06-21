import { Button, Text, Heading } from "@mattbutlerengineering/rialto";
import styles from "./WaitlistConfirmationView.module.css";

export interface WaitlistConfirmationViewProps {
  position: number;
  estimatedWaitMinutes: number;
  onNewBooking: () => void;
}

export function WaitlistConfirmationView({
  position,
  estimatedWaitMinutes,
  onNewBooking,
}: WaitlistConfirmationViewProps) {
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
          <Text className={styles.waitTime}>{estimatedWaitMinutes} min</Text>
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
