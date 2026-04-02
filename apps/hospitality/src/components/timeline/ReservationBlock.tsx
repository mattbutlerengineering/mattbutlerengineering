import type { Reservation, ReservationStatus } from "@mbe/types";
import styles from "./ReservationBlock.module.css";

export interface ReservationBlockProps {
  reservation: Reservation;
  style: { left: number; width: number };
  isSelected?: boolean;
  onClick?: () => void;
}

const STATUS_CLASS: Record<ReservationStatus, string> = {
  PENDING: styles.statusPending,
  CONFIRMED: styles.statusConfirmed,
  CANCELLED: styles.statusCancelled,
  COMPLETED: styles.statusCompleted,
  NO_SHOW: styles.statusNoShow,
};

export function ReservationBlock({
  reservation,
  style,
  isSelected = false,
  onClick,
}: ReservationBlockProps) {
  const statusClass = STATUS_CLASS[reservation.status];

  // Format time for display
  const formatTime = (isoTime: string) => {
    return new Date(isoTime).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const startTime = formatTime(reservation.startTime);
  const guestName = reservation.guestName || "Guest";

  return (
    <button
      type="button"
      onClick={onClick}
      className={[styles.block, statusClass, isSelected ? styles.blockSelected : ""].join(" ")}
      style={{
        left: style.left,
        width: Math.max(style.width - 4, 40), // Minimum width for visibility
      }}
      title={`${guestName} - ${reservation.partySize} guests at ${startTime}`}
      aria-label={`${guestName}, party of ${reservation.partySize}, ${startTime}, ${reservation.status.toLowerCase()}`}
      aria-pressed={isSelected}
    >
      <div className={styles.content}>
        <div className={styles.guestName}>{guestName}</div>
        <div className={styles.details}>
          {reservation.partySize} · {startTime}
        </div>
      </div>
    </button>
  );
}
