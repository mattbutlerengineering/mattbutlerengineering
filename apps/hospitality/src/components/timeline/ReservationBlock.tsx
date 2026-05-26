import type { Reservation, ReservationStatus } from "@mbe/types";
import { ordinalVisit } from "../../utils/ordinal.js";
import styles from "./ReservationBlock.module.css";

export interface ReservationBlockProps {
  reservation: Reservation;
  style: { left: number; width: number };
  isSelected?: boolean;
  isFocused?: boolean;
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
  isFocused = false,
  onClick,
}: ReservationBlockProps) {
  const statusClass = STATUS_CLASS[reservation.status];

  const formatTime = (isoTime: string) => {
    return new Date(isoTime).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const startTime = formatTime(reservation.startTime);
  const guestName = reservation.guestName || "Guest";
  const visitCount =
    reservation.guest && reservation.guest.visitCount > 1 ? reservation.guest.visitCount : null;
  const visitLabel = visitCount !== null ? ordinalVisit(visitCount) : null;

  return (
    /* eslint-disable mbe-local/prefer-rialto-components -- timeline block uses custom CSS module classes that require a native button element */
    <button
      type="button"
      onClick={onClick}
      className={[
        styles.block,
        statusClass,
        isSelected ? styles.blockSelected : "",
        isFocused ? styles.blockFocused : "",
      ].join(" ")}
      style={{
        left: style.left,
        width: style.width,
      }}
      title={`${guestName} - ${reservation.partySize} guests at ${startTime}${visitLabel ? ` · ${visitLabel}` : ""}`}
      aria-label={`${guestName}, party of ${reservation.partySize}, ${startTime}, ${reservation.status.toLowerCase()}${visitLabel ? `, ${visitLabel}` : ""}`}
      aria-pressed={isSelected}
    >
      <div className={styles.content}>
        <div className={styles.guestName}>{guestName}</div>
        <div className={styles.details}>
          {reservation.partySize} · {startTime}
          {visitLabel !== null && ` · ${visitLabel}`}
        </div>
      </div>
    </button>
    /* eslint-enable mbe-local/prefer-rialto-components */
  );
}
