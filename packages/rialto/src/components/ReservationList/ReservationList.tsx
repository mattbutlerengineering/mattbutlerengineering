import { forwardRef, type HTMLAttributes } from "react";
import { useRialtoLocale } from "../../i18n/RialtoLocaleProvider";
import { cn } from "../../utils/class-composer";
import { Badge } from "../Badge/Badge";
import { displayClockTime, normalizeReservationStatus } from "../booking-vocabulary";
import styles from "./ReservationList.module.css";

/**
 * One booking row in a `ReservationList`.
 *
 * @example
 * const row: ReservationListRow = {
 *   time: "7:30 PM",
 *   guest: "Maria Garcia",
 *   partySize: 4,
 *   status: "CONFIRMED",
 * };
 */
export interface ReservationListRow {
  /** Display text, such as "7:30 PM"; a bare 24-hour "19:30" shows in the locale's clock. */
  time: string;
  /** Guest name. Absent or blank shows the locale's Walk-in word. */
  guest?: string;
  partySize: number;
  /** Raw status value (e.g. "CONFIRMED", "no-show"). An unknown value shows as written, in neutral. */
  status: string;
}

/**
 * Display-only list of bookings as aligned rows: time, guest (or Walk-in),
 * party size in words, and the status word in its Badge tone. Rows render in
 * the order given; nothing in it is focusable.
 *
 * @example
 * <ReservationList
 *   reservations={[
 *     { time: "6:00 PM", guest: "Lee Family", partySize: 2, status: "CONFIRMED" },
 *     { time: "8:15 PM", partySize: 3, status: "PENDING" },
 *   ]}
 * />
 */
export interface ReservationListProps extends HTMLAttributes<HTMLUListElement> {
  reservations: ReservationListRow[];
}

export const ReservationList = forwardRef<HTMLUListElement, ReservationListProps>(
  ({ reservations, className, ...props }, ref) => {
    const { locale, messages } = useRialtoLocale();

    return (
      <ul
        ref={ref}
        aria-label={messages.reservations}
        className={cn(styles.list, className)}
        {...props}
      >
        {reservations.map((row, i) => {
          const { key, tone } = normalizeReservationStatus(row.status);
          const guest = row.guest?.trim() ? row.guest : messages.walkIn;
          return (
            <li key={i} className={styles.row}>
              <span className={styles.time}>{displayClockTime(row.time, locale)}</span>
              <span className={styles.who}>
                <span className={styles.guest}>{guest}</span>
                <span className={styles.party}>{messages.partyOf(row.partySize)}</span>
              </span>
              <Badge variant={tone} size="sm" className={styles.status}>
                {key ? messages.reservationStatus[key] : row.status}
              </Badge>
            </li>
          );
        })}
      </ul>
    );
  }
);
ReservationList.displayName = "ReservationList";
