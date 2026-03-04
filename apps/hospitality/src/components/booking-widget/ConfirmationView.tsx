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
      {/* Success icon */}
      <div className={styles.iconWrapper}>
        <svg
          className={styles.icon}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>

      <div>
        <h2 className={styles.heading}>Reservation Confirmed!</h2>
        <p className={styles.subheading}>We look forward to seeing you.</p>
      </div>

      {/* Reservation details */}
      <div className={styles.detailsCard}>
        <h3 className={styles.detailsTitle}>Reservation Details</h3>
        <dl className={styles.detailsList}>
          <div className={styles.detailRow}>
            <dt className={styles.detailLabel}>Confirmation #</dt>
            <dd className={styles.detailValue}>{reservation.id.slice(-8).toUpperCase()}</dd>
          </div>
          <div className={styles.detailRow}>
            <dt className={styles.detailLabel}>Date</dt>
            <dd className={styles.detailValueNormal}>{formattedDate}</dd>
          </div>
          <div className={styles.detailRow}>
            <dt className={styles.detailLabel}>Time</dt>
            <dd className={styles.detailValueNormal}>{formattedTime}</dd>
          </div>
          <div className={styles.detailRow}>
            <dt className={styles.detailLabel}>Party Size</dt>
            <dd className={styles.detailValueNormal}>
              {reservation.partySize} {reservation.partySize === 1 ? "guest" : "guests"}
            </dd>
          </div>
          {reservation.guestName && (
            <div className={styles.detailRow}>
              <dt className={styles.detailLabel}>Name</dt>
              <dd className={styles.detailValueNormal}>{reservation.guestName}</dd>
            </div>
          )}
          {reservation.table && (
            <div className={styles.detailRow}>
              <dt className={styles.detailLabel}>Table</dt>
              <dd className={styles.detailValueNormal}>
                {reservation.table.tableNumber || reservation.table.name}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Contact info note */}
      {(reservation.guestEmail || reservation.guestPhone) && (
        <p className={styles.contactNote}>
          A confirmation has been sent to{" "}
          {reservation.guestEmail || reservation.guestPhone}.
        </p>
      )}

      {/* Actions */}
      <div className={styles.actions}>
        <button onClick={onNewBooking} className={styles.secondaryButton}>
          Make Another Reservation
        </button>
      </div>
    </div>
  );
}
