import { forwardRef, type HTMLAttributes } from "react";
import { useRialtoLocale } from "../../i18n/RialtoLocaleProvider";
import { cn } from "../../utils/class-composer";
import { displayClockTime } from "../booking-vocabulary";
import { Tag } from "../Tag/Tag";
import styles from "./TimeSlots.module.css";

/**
 * Display-only open times for one date and party size: a date line
 * ("{date} · Party of 4") over the times as static Tag-look labels that wrap.
 * With no times it shows one localized "No open times" line, never an empty
 * box. Nothing in it is focusable: it books nothing.
 *
 * @example
 * <TimeSlots date="Friday, Oct 30" partySize={4} times={["6:00 PM", "7:45 PM"]} />
 */
export interface TimeSlotsProps extends HTMLAttributes<HTMLDivElement> {
  /** Display text for the day, such as "Friday, Oct 30". */
  date: string;
  partySize: number;
  /** Open times as display text, in time order; a bare 24-hour "19:30" shows in the locale's clock. Empty shows the no-open-times line. */
  times: string[];
}

export const TimeSlots = forwardRef<HTMLDivElement, TimeSlotsProps>(
  ({ date, partySize, times, className, ...props }, ref) => {
    const { locale, messages } = useRialtoLocale();

    return (
      <div ref={ref} className={cn(styles.root, className)} {...props}>
        <p className={styles.header}>{`${date} · ${messages.partyOf(partySize)}`}</p>
        {times.length > 0 ? (
          <ul aria-label={messages.openTimes} className={styles.times}>
            {times.map((time, i) => (
              <li key={i} className={styles.slot}>
                <Tag>{displayClockTime(time, locale)}</Tag>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>{messages.noOpenTimes}</p>
        )}
      </div>
    );
  }
);
TimeSlots.displayName = "TimeSlots";
