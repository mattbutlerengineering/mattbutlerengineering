import { Button, Text } from "@mbe/rialto";
import type { Reservation } from "@mbe/types";
import styles from "./ConfirmationView.module.css";

export interface ConfirmationViewProps {
  reservation: Reservation;
  onNewBooking: () => void;
}

export function ConfirmationView({ reservation, onNewBooking }: ConfirmationViewProps) {
  // Format date for display
  const formattedDate = new Date(reservation.date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // Format time for display
  const formattedTime = new Date(reservation.startTime).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <div className={styles.container}>
      {/* Success icon with animation */}
      <div className={styles.iconWrapper}>
        <div className={styles.accentBurst} aria-hidden="true">
          <span className={styles.burstDot} />
          <span className={styles.burstDot} />
          <span className={styles.burstDot} />
          <span className={styles.burstDot} />
        </div>
        <svg
          className={styles.icon}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            className={styles.checkPath}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>

      <div>
        <Text variant="display" as="h2" align="center">
          Reservation Confirmed!
        </Text>
        <Text variant="caption" color="secondary" align="center">
          We look forward to seeing you.
        </Text>
      </div>

      {/* Reservation details */}
      <div className={styles.detailsCard}>
        <Text variant="label" as="h3" className={styles.detailsTitle}>
          Reservation Details
        </Text>
        <dl className={styles.detailsList}>
          <div className={styles.detailRow}>
            <Text variant="caption" color="secondary" as="dt">
              Confirmation #
            </Text>
            <Text variant="caption" as="dd" mono>
              {reservation.id.slice(-8).toUpperCase()}
            </Text>
          </div>
          <div className={styles.detailRow}>
            <Text variant="caption" color="secondary" as="dt">
              Date
            </Text>
            <Text variant="caption" as="dd">
              {formattedDate}
            </Text>
          </div>
          <div className={styles.detailRow}>
            <Text variant="caption" color="secondary" as="dt">
              Time
            </Text>
            <Text variant="caption" as="dd">
              {formattedTime}
            </Text>
          </div>
          <div className={styles.detailRow}>
            <Text variant="caption" color="secondary" as="dt">
              Party Size
            </Text>
            <Text variant="caption" as="dd">
              {reservation.partySize} {reservation.partySize === 1 ? "guest" : "guests"}
            </Text>
          </div>
          {reservation.guestName && (
            <div className={styles.detailRow}>
              <Text variant="caption" color="secondary" as="dt">
                Name
              </Text>
              <Text variant="caption" as="dd">
                {reservation.guestName}
              </Text>
            </div>
          )}
          {reservation.table && (
            <div className={styles.detailRow}>
              <Text variant="caption" color="secondary" as="dt">
                Table
              </Text>
              <Text variant="caption" as="dd">
                {reservation.table.tableNumber || reservation.table.name}
              </Text>
            </div>
          )}
        </dl>
      </div>

      {/* Contact info note */}
      {(reservation.guestEmail || reservation.guestPhone) && (
        <Text variant="caption" color="secondary" align="center">
          A confirmation has been sent to{" "}
          {reservation.guestEmail || reservation.guestPhone}.
        </Text>
      )}

      {/* Actions */}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onNewBooking} className={styles.fullWidth}>
          Make Another Reservation
        </Button>
      </div>
    </div>
  );
}
