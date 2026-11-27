import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Button, Text } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfig } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { useViewport } from "../../hooks/useViewport.js";
import type { DecidedHoliday } from "./holiday-decisions.js";
import { useOpenAsUsual, useWeekRows } from "./use-week-changes.js";
import { weekChangeRowText } from "./week-changes-text.js";
import type { WeekChangeRow } from "./week-changes-view.js";
import styles from "./WeekChanges.module.css";

export interface WeekChangesProps {
  readonly venueId: string;
  readonly config: AvailabilityConfig;
  /** Opens a date in the day drawer. */
  readonly onOpenDay: (date: string) => void;
  /** Shows Special dates, where Upcoming holidays plans them. */
  readonly onPlanHolidays: () => void;
  /** Section names by id, so a section closure reads "Bar closed". */
  readonly sectionNames?: ReadonlyMap<string, string>;
}

interface HolidayRowProps {
  readonly holiday: DecidedHoliday;
  readonly text: string;
  readonly status: "pending" | "failed" | undefined;
  readonly onOpenAsUsual: () => void;
  readonly onPlan: () => void;
}

function HolidayRow({ holiday, text, status, onOpenAsUsual, onPlan }: HolidayRowProps) {
  const { t } = useTranslation();
  const retryRef = useRef<HTMLButtonElement>(null);
  const failed = status === "failed";
  const wasFailedRef = useRef(failed);
  // Retry replaces the pressed Open as usual, so it takes focus; never on mount.
  useEffect(() => {
    if (failed && !wasFailedRef.current) retryRef.current?.focus();
    wasFailedRef.current = failed;
  }, [failed]);
  return (
    <li role="group" aria-label={text} className={styles.holiday} data-date={holiday.date}>
      <Text variant="body">{text}</Text>
      <div className={styles.actions}>
        {failed ? (
          <>
            <Text variant="caption" color="secondary">
              {t("availability.weekChanges.saveFailed")}
            </Text>
            <Button ref={retryRef} variant="secondary" size="sm" onClick={onOpenAsUsual}>
              {t("availabilitySpecial.holidays.retry")}
            </Button>
          </>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            // Not native disabled: that would blur the focused button while it is pending.
            aria-disabled={status === "pending"}
            aria-busy={status === "pending" || undefined}
            onClick={onOpenAsUsual}
          >
            {t("availabilitySpecial.holidays.choice.openAsUsual")}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onPlan}>
          {t("availability.holidayNudge.plan")}
        </Button>
      </div>
    </li>
  );
}

/** A change's line, which shows its first date. */
function DayRow({ text, onOpen }: { readonly text: string; readonly onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <li>
      <Button
        variant="ghost"
        size="sm"
        className={styles.day}
        aria-label={t("availability.weekChanges.openDay", { change: text })}
        onClick={onOpen}
      >
        {text}
      </Button>
    </li>
  );
}

/** The first control of the list's `index`th row. */
const rowControl = (list: HTMLElement | null, index: number) =>
  list?.querySelectorAll(":scope > li")[index]?.querySelector<HTMLElement>("button") ?? null;

/** Calls `focus` when `value` turns true, never on mount. */
function useFocusOnTrue(value: boolean, focus: () => void) {
  const wasRef = useRef(value);
  useEffect(() => {
    if (value && !wasRef.current) focus();
    wasRef.current = value;
  });
}

interface Leaving {
  readonly date: string;
  readonly index: number;
}

/**
 * After a Manager's Open as usual, the row leaves once the decisions are read again: focus goes to
 * the control now in its place, else the row before it, else the "nothing else" caption, else the
 * heading. Never to the page, and never taken back from where the Manager moved it meanwhile.
 */
function useFocusAfterLeave(
  visible: readonly WeekChangeRow[],
  refs: {
    list: RefObject<HTMLUListElement | null>;
    empty: RefObject<HTMLElement | null>;
    heading: RefObject<HTMLElement | null>;
  }
) {
  const leavingRef = useRef<Leaving | null>(null);
  useEffect(() => {
    const target = leavingRef.current;
    if (!target || visible.some((r) => "holiday" in r && r.date === target.date)) return;
    leavingRef.current = null;
    // Focus was lost with the row; if the Manager moved it elsewhere meanwhile, it stays there.
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    const control =
      rowControl(refs.list.current, target.index) ??
      rowControl(refs.list.current, target.index - 1);
    (control ?? refs.empty.current ?? refs.heading.current)?.focus();
  });
  return leavingRef;
}

/**
 * Calendar, "Next 7 days" (#9658): what changes at the venue from tomorrow for a week, one line
 * each, read as Special dates reads them; a line shows its first date. A Manager also sees the
 * holidays in the week nothing has decided yet, with Open as usual and Plan holidays. Nothing
 * renders when nothing changes, unless the Manager's own decision just emptied it: then one quiet
 * line says so and holds focus. On a phone it starts as one count line with Show.
 */
export function WeekChanges(props: WeekChangesProps) {
  const { venueId, config, onOpenDay, onPlanHolidays, sectionNames } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const headingId = useId();
  const onPhone = useViewport() === "phone";
  const [opened, setOpened] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [acted, setActed] = useState(false);
  const headingRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const emptyRef = useRef<HTMLElement>(null);
  const { rows, first, more, decisions } = useWeekRows(venueId, config);
  const { statusOf, openAsUsual } = useOpenAsUsual(venueId, decisions);
  const visible = showAll ? rows : first;
  const leavingRef = useFocusAfterLeave(visible, {
    list: listRef,
    empty: emptyRef,
    heading: headingRef,
  });
  // The pressed button is gone: Show N more hands focus to the first row it revealed, Show to
  // the heading.
  useFocusOnTrue(showAll, () => rowControl(listRef.current, first.length)?.focus());
  useFocusOnTrue(opened, () => headingRef.current?.focus());
  if (rows.length === 0 && !acted) return null;

  const title = t("availability.weekChanges.title");
  if (onPhone && !opened && rows.length > 0) {
    return (
      <section aria-label={title} className={styles.collapsed}>
        <Text variant="caption" color="secondary">
          {t("availability.weekChanges.collapsed", { count: rows.length })}
        </Text>
        <Button variant="ghost" size="sm" onClick={() => setOpened(true)}>
          {t("availability.weekChanges.show")}
        </Button>
      </section>
    );
  }

  const ctx = { t, format, config, sectionNames };
  const item = (row: WeekChangeRow, index: number) => {
    const text = weekChangeRowText(row, ctx);
    if (row.action.type === "openDay") {
      const { date } = row.action;
      return <DayRow key={row.key} text={text} onOpen={() => onOpenDay(date)} />;
    }
    const { holiday } = row.action;
    const status = statusOf(holiday.date);
    const press = () => {
      if (status === "pending") return;
      setActed(true);
      leavingRef.current = { date: holiday.date, index };
      const name = t(`availabilitySpecial.holidays.name.${holiday.id}`);
      void openAsUsual(holiday, name, { onFailed: () => (leavingRef.current = null) });
    };
    return (
      <HolidayRow
        key={row.key}
        holiday={holiday}
        text={text}
        status={status}
        onOpenAsUsual={press}
        onPlan={onPlanHolidays}
      />
    );
  };

  return (
    <section aria-labelledby={headingId} className={styles.week}>
      <Text
        ref={headingRef}
        as="h2"
        variant="caption"
        color="secondary"
        id={headingId}
        tabIndex={-1}
        className={styles.target}
      >
        {title}
      </Text>
      {rows.length === 0 ? (
        <Text
          ref={emptyRef}
          variant="caption"
          color="secondary"
          tabIndex={-1}
          className={styles.target}
        >
          {t("availability.weekChanges.empty")}
        </Text>
      ) : (
        <ul ref={listRef} className={styles.list}>
          {visible.map(item)}
        </ul>
      )}
      {!showAll && more > 0 && (
        <Button variant="ghost" size="sm" className={styles.more} onClick={() => setShowAll(true)}>
          {t("availability.weekChanges.more", { count: more })}
        </Button>
      )}
    </section>
  );
}
