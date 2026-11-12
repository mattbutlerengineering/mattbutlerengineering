import { memo } from "react";
import { useTranslation } from "react-i18next";
import { StatusLED } from "@mattbutlerengineering/rialto";
import type { Reservation, ReservationStatus } from "@mbe/types";
import { RESERVATION_STATUS_KEYS } from "./status-keys.js";
import { visitLabel } from "./visit-label.js";
import { GuestSignalBadgeChip, useGuestSignalBadgeLabel } from "./GuestSignalBadgeChip.js";
import type { GuestSignalBadge } from "./guest-signal-badge.js";
import { InviteRsvpChip } from "./InviteRsvpChip.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { clockHourOfInstant } from "../../utils/clock-hour.js";
import styles from "./ReservationBlock.module.css";

export interface ReservationBlockProps {
  reservation: Reservation;
  style: { left: number; width: number };
  isSelected?: boolean;
  isFocused?: boolean;
  /** The party is on its table now (derived by the page, ux.md Decision (a)). */
  isSeated?: boolean;
  /** The party said it is running late (On My Way); null/absent = no badge. */
  guestSignalBadge?: GuestSignalBadge | null;
  onClick?: (reservation: Reservation) => void;
}

const STATUS_CLASS: Record<ReservationStatus, string> = {
  PENDING: styles.statusPending ?? "",
  CONFIRMED: styles.statusConfirmed ?? "",
  CANCELLED: styles.statusCancelled ?? "",
  COMPLETED: styles.statusCompleted ?? "",
  NO_SHOW: styles.statusNoShow ?? "",
};

/** Placeholder so the label hook runs unconditionally; its output is used only with a real badge. */
/** Horizontal gap between the block's left edge and its badge, and the badge's right margin. */
const CHIP_INSET = 8;

const NO_BADGE: GuestSignalBadge = { minutes: 0, eta: new Date(0).toISOString(), held: false };

function ReservationBlockComponent({
  reservation,
  style,
  isSelected = false,
  isFocused = false,
  isSeated = false,
  guestSignalBadge = null,
  onClick,
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
      count: clockHourOfInstant(reservation.startTime, fmt),
    }),
    visitText,
  ]
    .filter(Boolean)
    .join(" · ");
  const lateLabel = useGuestSignalBadgeLabel(guestSignalBadge ?? NO_BADGE);
  const overrideReason = reservation.overrideReason?.trim() || null;
  const spokenLabel = [
    guestName,
    t("timeline.partyOf", { count: reservation.partySize }),
    startTime,
    t(RESERVATION_STATUS_KEYS[reservation.status]).toLocaleLowerCase(fmt.locale),
    isSeated ? t("timeline.block.seatedWord") : null,
    guestSignalBadge ? lateLabel : null,
    visitText,
    overrideReason ? t("timeline.block.overrideLabel", { reason: overrideReason }) : null,
  ]
    .filter(Boolean)
    .join(", ");
  const handleClick = () => onClick?.(reservation);

  return (
    <>
      {/* eslint-disable-next-line mbe-local/prefer-rialto-components -- timeline block uses custom CSS module classes that require a native button element */}
      <button
        type="button"
        data-testid={`reservation-block-${reservation.id}`}
        onClick={handleClick}
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
        title={title}
        aria-label={spokenLabel}
        aria-pressed={isSelected}
      >
        <div className={styles.content}>
          <div className={styles.guestName} data-truncate>
            {isSeated && <StatusLED variant="success" size="xs" className={styles.seatedLed} />}
            <span>{guestName}</span>
          </div>
          <div className={styles.details} data-truncate>
            {reservation.partySize} · {startTime}
            {visitText !== null && ` · ${visitText}`}
          </div>
          <InviteRsvpChip rsvp={reservation.inviteRsvp} className={styles.inviteRsvp} />
          {overrideReason !== null && (
            <div className={styles.overrideTag} data-truncate title={overrideReason}>
              {t("timeline.block.overrideTag")}
            </div>
          )}
        </div>
      </button>
      {/* Sibling, not a child: a button's children are presentational, and a status region must be
          exposed to be announced. It sits in the block's bottom strip, clear of the name/details. */}
      {guestSignalBadge && (
        <GuestSignalBadgeChip
          badge={guestSignalBadge}
          className={styles.guestSignalBadge}
          style={{ left: style.left + CHIP_INSET, maxWidth: style.width - 2 * CHIP_INSET }}
        />
      )}
    </>
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
    prev.guestSignalBadge?.minutes === next.guestSignalBadge?.minutes &&
    prev.guestSignalBadge?.eta === next.guestSignalBadge?.eta &&
    prev.guestSignalBadge?.held === next.guestSignalBadge?.held &&
    prev.onClick === next.onClick
  );
}

export const ReservationBlock = memo(ReservationBlockComponent, arePropsEqual);
