import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { DatePicker, Text } from "@mattbutlerengineering/rialto";
import { useVenueFormat } from "../../../hooks/useVenueFormat.js";
import { availabilityPath } from "../availability-address.js";
import type { DateAnswer } from "./date-answer.js";
import { dateSentence } from "./date-sentence.js";
import styles from "./Hub.module.css";

export interface DateCheckProps {
  /** The date being checked, `YYYY-MM-DD`; `null` when the field is empty or its text is no date. */
  readonly date: string | null;
  readonly onDateChange: (date: string | null) => void;
  /** What happens on `date`; `null` with no date. */
  readonly answer: DateAnswer | null;
  /** Today in the venue's time zone: the month the calendar opens on. */
  readonly today: string;
}

/**
 * The hub's date check (availability-hub ux.md, "Hub"): a date typed or picked, and one sentence
 * saying what happens that day and which rule decided it. Text that is no date is the field's own
 * problem to show; nothing is answered for it.
 */
export function DateCheck({ date, onDateChange, answer, today }: DateCheckProps) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const longDate =
    date && format.formatCalendarDate(date, { weekday: "short", month: "short", day: "numeric" });
  return (
    <section className={styles.check}>
      <div className={styles.checkField}>
        <DatePicker
          label={t("availabilityHub.dateCheck.label")}
          value={date}
          onChange={onDateChange}
          editable
          defaultMonth={today}
          locale={format.locale}
        />
        <Link to={availabilityPath({ view: "calendar" })} className={styles.link}>
          {t("availabilityHub.hub.openCalendar")}
        </Link>
      </div>
      {/* Always mounted, so a screen reader hears the sentence when it arrives. */}
      <div className={styles.answer} aria-live="polite" data-testid="hub-date-answer">
        {answer && date && (
          <>
            <Text variant="body" color="primary">
              {dateSentence(answer, { t, format })}
            </Text>
            <Link
              to={availabilityPath({ view: "calendar", date })}
              aria-label={t("availabilityHub.dateCheck.openDateName", { date: longDate })}
              className={styles.link}
            >
              {t("availabilityHub.dateCheck.openDate")}
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
