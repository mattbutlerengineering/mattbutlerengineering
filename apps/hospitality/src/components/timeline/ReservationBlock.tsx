import { memo } from "react";
import { useTranslation } from "react-i18next";
import { StatusLED } from "@mattbutlerengineering/rialto";
import type { Reservation, ReservationStatus } from "@mbe/types";
import { RESERVATION_STATUS_KEYS } from "./status-keys.js";
import { visitLabel } from "./visit-label.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import styles from "./ReservationBlock.module.css";

export interface ReservationBlockProps {
  reservation: Reservation;
  style: { left: number; width: number };
  isSelected?: boolean;
  isFocused?: boolean;
  /** The party is on its table now (derived by the page, ux.md Decision (a)). */
  isSeated?: boolean;
  onClick?: (reservation: Reservation) => void;
  /**
   * Draws the block without any interaction: a labelled `div` with the same look, no click, no
   * focus stop. For views that show simulated or otherwise non-actionable bookings.
   */
  readOnly?: boolean;
}

const STATUS_CLASS: Record<ReservationStatus, string> = {
  PENDING: styles.statusPending ?? "",
  CONFIRMED: styles.statusConfirmed ?? "",
  CANCELLED: styles.statusCancelled ?? "",
  COMPLETED: styles.statusCompleted ?? "",
  NO_SHOW: styles.statusNoShow ?? "",
};

function ReservationBlockComponent({
  reservation,
  style,
  isSelected = false,
  isFocused = false,
  isSeated = false,
  onClick,
  readOnly = false,
}: ReservationBlockProps) {
  const fmt = useVenueFormat();
  const { t } = useTranslation();
  const statusClass = STATUS_CLASS[reservation.status];

  const startTime = fmt.formatTime(reservation.startTime);
  const guestName = reservation.guestName || t("timeline.guest");
  const visitCount =
    reservation.guest && reservation.guest.visitCount > 1 ? reservation.guest.visitCount : null;
  const visitText = visitCount !== null ? visitLabel(visitCount, t, fmt.locale) : null;
  const title = [
    t("timeline.block.title", {
      guest: guestName,
      party: t("timeline.guests", { count: reservation.partySize }),
      time: startTime,
    }),
    visitText,
  ]
    .filter(Boolean)
    .join(" · ");
  const spokenLabel = [
    guestName,
    t("timeline.partyOf", { count: reservation.partySize }),
    startTime,
    t(RESERVATION_STATUS_KEYS[reservation.status]).toLocaleLowerCase(fmt.locale),
    isSeated ? t("timeline.block.seatedWord") : null,
    visitText,
  ]
    .filter(Boolean)
    .join(", ");
  const handleClick = () => onClick?.(reservation);

  const className = [
    styles.block,
    statusClass,
    isSelected ? styles.blockSelected : "",
    isFocused ? styles.blockFocused : "",
  ].join(" ");
  const testId = `reservation-block-${reservation.id}`;
  const blockStyle = { left: style.left, width: style.width };
  const content = (
    <div className={styles.content}>
      <div className={styles.guestName} data-truncate>
        {isSeated && <StatusLED variant="success" size="xs" className={styles.seatedLed} />}
        <span>{guestName}</span>
      </div>
      <div className={styles.details} data-truncate>
        {reservation.partySize} · {startTime}
        {visitText !== null && ` · ${visitText}`}
      </div>
    </div>
  );

  if (readOnly) {
    return (
      <div
        role="group"
        data-testid={testId}
        className={className}
        style={blockStyle}
        title={title}
        aria-label={spokenLabel}
      >
        {content}
      </div>
    );
  }

  return (
    /* eslint-disable mbe-local/prefer-rialto-components -- timeline block uses custom CSS module classes that require a native button element */
    <button
      type="button"
      data-testid={testId}
      onClick={handleClick}
      className={className}
      style={blockStyle}
      title={title}
      aria-label={spokenLabel}
      aria-pressed={isSelected}
    >
      {content}
    </button>
    /* eslint-enable mbe-local/prefer-rialto-components */
  );
}

function arePropsEqual(prev: ReservationBlockProps, next: ReservationBlockProps): boolean {
  return (
    prev.reservation === next.reservation &&
    prev.style.left === next.style.left &&
    prev.style.width === next.style.width &&
    prev.isSelected === next.isSelected &&
    prev.isFocused === next.isFocused &&
    prev.isSeated === next.isSeated &&
    prev.onClick === next.onClick &&
    prev.readOnly === next.readOnly
  );
}

export const ReservationBlock = memo(ReservationBlockComponent, arePropsEqual);
