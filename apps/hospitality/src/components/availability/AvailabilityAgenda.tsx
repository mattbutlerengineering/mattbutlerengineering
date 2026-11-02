import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@mattbutlerengineering/rialto";
import type { AvailabilityDaySummary } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { presentDay } from "./day-summary.js";
import type { DateGestureHandlers } from "./useDateSelection.js";
import styles from "./AvailabilityAgenda.module.css";

export interface AvailabilityAgendaProps {
  /** The dates to list, in order; one row each. */
  readonly dates: readonly string[];
  /** The list's accessible name, including the period on show. */
  readonly label: string;
  readonly byDate: ReadonlyMap<string, AvailabilityDaySummary>;
  readonly today: string;
  readonly selectedDate?: string | null;
  /** The days whose drawer draft holds unsaved edits; each row shows a dot. */
  readonly draftDates?: readonly string[];
  readonly picked: ReadonlySet<string>;
  readonly isLoading: boolean;
  /** The read failed: a day with no summary is not still on its way. */
  readonly loadFailed?: boolean;
  /** Click and long-press handlers for one row (see `useDateSelection`). */
  readonly handlersFor: (date: string) => DateGestureHandlers;
  /** Space on a row: add it to the selection or take it out, the same key as the grid. */
  readonly onToggle: (date: string) => void;
}

/** Enter opens a row; Space picks it. Firefox clicks on Space's keyup, so that is stopped too. */
function spaceHandlers(onSpace: () => void) {
  return {
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key !== " ") return;
      event.preventDefault();
      onSpace();
    },
    onKeyUp: (event: KeyboardEvent) => {
      if (event.key === " ") event.preventDefault();
    },
  };
}

/**
 * Phone and tablet fallback for the calendar grid (ux.md S2): one row per day, each opening
 * the day drawer, with the weekday and date always visible. A plain list of buttons, so
 * Tab walks the days in order and no grid roles are promised on a stacked layout.
 */
export function AvailabilityAgenda(props: AvailabilityAgendaProps) {
  const { dates, byDate, today, selectedDate, draftDates, picked, isLoading, handlersFor } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();

  return (
    <ul className={styles.agenda} aria-label={props.label}>
      {dates.map((date) => {
        const summary = byDate.get(date);
        const view = presentDay(date, summary, false, t, format);
        const shownDate = format.formatCalendarDate(date, {
          weekday: "short",
          month: "short",
          day: "numeric",
        });
        // Starts with the date as the row shows it, so what is heard matches what is seen.
        const name = t("availability.calendar.cellName", {
          date: shownDate,
          details: view.accessibleDetails,
        });
        return (
          <li key={date} className={styles.item}>
            <button
              type="button"
              className={[
                styles.row,
                date === selectedDate ? styles.selected : "",
                picked.has(date) ? styles.picked : "",
              ]
                .filter(Boolean)
                .join(" ")}
              data-date={date}
              aria-current={date === today ? "date" : undefined}
              aria-label={
                (picked.has(date) ? t("availability.selection.selectedName", { name }) : name) +
                (draftDates?.includes(date) ? `, ${t("availability.calendar.draftName")}` : "")
              }
              {...handlersFor(date)}
              {...spaceHandlers(() => props.onToggle(date))}
            >
              {draftDates?.includes(date) && (
                <span className={styles.draftDot} data-draft-dot aria-hidden="true" />
              )}
              <span className={styles.date} aria-hidden="true">
                {shownDate}
              </span>{" "}
              {isLoading || !summary ? (
                !props.loadFailed && <Skeleton variant="text" width="100%" height={16} />
              ) : (
                <span className={styles.details} aria-hidden="true">
                  <span className={styles.label}>{view.label} </span>
                  {view.count && <span className={styles.meta}>{view.count} </span>}
                  {view.bands.map((b) => (
                    <span key={b.key} className={styles.band}>
                      {b.text}{" "}
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
