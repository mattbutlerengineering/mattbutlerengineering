import { useTranslation } from "react-i18next";
import { Skeleton } from "@mattbutlerengineering/rialto";
import type { AvailabilityDaySummary } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { presentDay } from "./day-summary.js";
import styles from "./AvailabilityAgenda.module.css";

export interface AvailabilityAgendaProps {
  /** The dates to list, in order; one row each. */
  readonly dates: readonly string[];
  readonly byDate: ReadonlyMap<string, AvailabilityDaySummary>;
  readonly today: string;
  readonly selectedDate?: string | null;
  /** The day whose drawer holds an unsaved draft; its row shows a dot. */
  readonly draftDate?: string | null;
  readonly isLoading: boolean;
  readonly onOpenDay: (date: string) => void;
}

/**
 * Phone and tablet fallback for the calendar grid (ux.md S2): one row per day, each opening
 * the day drawer, with the weekday and date always visible. A plain list of buttons, so
 * Tab walks the days in order and no grid roles are promised on a stacked layout.
 */
export function AvailabilityAgenda(props: AvailabilityAgendaProps) {
  const { dates, byDate, today, selectedDate, draftDate, isLoading, onOpenDay } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();

  return (
    <ul className={styles.agenda} aria-label={t("availability.calendar.label")}>
      {dates.map((date) => {
        const summary = byDate.get(date);
        const view = presentDay(date, summary, false, t, format);
        return (
          <li key={date} className={styles.item}>
            <button
              type="button"
              className={[styles.row, date === selectedDate ? styles.selected : ""]
                .filter(Boolean)
                .join(" ")}
              data-date={date}
              aria-current={date === today ? "date" : undefined}
              aria-label={
                date === draftDate
                  ? `${view.accessibleName}, ${t("availability.calendar.draftName")}`
                  : view.accessibleName
              }
              onClick={() => onOpenDay(date)}
            >
              {date === draftDate && (
                <span className={styles.draftDot} data-draft-dot aria-hidden="true" />
              )}
              <span className={styles.date} aria-hidden="true">
                {format.formatCalendarDate(date, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </span>
              {isLoading || !summary ? (
                <Skeleton variant="text" width="100%" height={16} />
              ) : (
                <span className={styles.details} aria-hidden="true">
                  <span className={styles.label}>{summary.label}</span>
                  {view.count && <span className={styles.meta}>{view.count}</span>}
                  {view.bands.map((b) => (
                    <span key={b.key} className={styles.band}>
                      {b.text}
                    </span>
                  ))}
                  {view.onlineOff && (
                    <span className={styles.meta}>{t("availability.calendar.onlineOff")}</span>
                  )}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
