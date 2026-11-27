import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Text, useToast } from "@mattbutlerengineering/rialto";
import { addDays, weekChanges } from "@mbe/availability";
import type { AvailabilityConfig } from "@mbe/types";
import {
  useClearHolidayDecision,
  useHolidayDecisions,
  useSetHolidayDecision,
} from "../../hooks/useHolidayDecisions.js";
import { useManagerAccess } from "../../hooks/useIsManager.js";
import { useNow } from "../../hooks/useNow.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { useViewport } from "../../hooks/useViewport.js";
import { currentServiceDate } from "../../utils/current-service-date.js";
import { venueDate } from "../../utils/service-day.js";
import { holidayStates, HOLIDAY_HORIZON_DAYS, type DecidedHoliday } from "./holiday-decisions.js";
import { useHolidayCountry } from "./use-holidays.js";
import { weekChangeRowText } from "./week-changes-text.js";
import { weekChangeRows, type WeekChangeRow } from "./week-changes-view.js";
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

type SavePhase = "saving" | "failed";

/** Open as usual from a row: the same save, toast and Undo as Upcoming holidays. */
function useOpenAsUsual(venueId: string) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const set = useSetHolidayDecision();
  const clear = useClearHolidayDecision();
  const [phases, setPhases] = useState<ReadonlyMap<string, SavePhase>>(() => new Map());
  const setPhase = (date: string, phase: SavePhase | null) =>
    setPhases((prev) => {
      const next = new Map(prev);
      if (phase === null) next.delete(date);
      else next.set(date, phase);
      return next;
    });

  const openAsUsual = async (holiday: DecidedHoliday, name: string): Promise<void> => {
    const serviceDate = holiday.date;
    setPhase(serviceDate, "saving");
    try {
      await set.mutateAsync({ venueId, serviceDate, decision: "open_as_usual" });
    } catch {
      setPhase(serviceDate, "failed");
      return;
    }
    setPhase(serviceDate, null);
    toast({
      title: t("availabilitySpecial.holidays.openAsUsualToast", { name }),
      action: {
        label: t("availability.undo.action"),
        onClick: () =>
          void clear.mutateAsync({ venueId, serviceDate }).catch(() => {
            // The mark stays: the holiday reads Open as usual in Special dates, which is true.
          }),
      },
    });
  };
  return { phases, openAsUsual };
}

interface HolidayRowProps {
  readonly holiday: DecidedHoliday;
  readonly text: string;
  readonly phase: SavePhase | undefined;
  readonly onOpenAsUsual: () => void;
  readonly onPlan: () => void;
}

function HolidayRow({ holiday, text, phase, onOpenAsUsual, onPlan }: HolidayRowProps) {
  const { t } = useTranslation();
  return (
    <li role="group" aria-label={text} className={styles.holiday} data-date={holiday.date}>
      <Text variant="body">{text}</Text>
      <div className={styles.actions}>
        {phase === "failed" ? (
          <>
            <Text variant="caption" color="secondary">
              {t("availability.weekChanges.saveFailed")}
            </Text>
            <Button variant="secondary" size="sm" onClick={onOpenAsUsual}>
              {t("availabilitySpecial.holidays.retry")}
            </Button>
          </>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            disabled={phase === "saving"}
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

/** A change's line, which opens its first date. */
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

/** The week's rows: undefined holidays while they are unknown, so none is offered as undecided. */
function useWeekRows(venueId: string, config: AvailabilityConfig) {
  const format = useVenueFormat();
  const access = useManagerAccess();
  const country = useHolidayCountry();
  const now = useNow();
  const today = venueDate(now, format.timeZone);
  // Tomorrow on, by service day: today is TodayLine's.
  const from = addDays(currentServiceDate(config, format.timeZone, now), 1);
  // The params Special dates and the holiday nudge read with, so the three share one request.
  const decisions = useHolidayDecisions({
    venueId,
    from: today,
    to: addDays(today, HOLIDAY_HORIZON_DAYS),
  });
  const isManager = access.isManager && !access.isPending;
  return useMemo(
    () =>
      weekChangeRows({
        changes: weekChanges(config, from),
        holidays:
          country && decisions.data
            ? holidayStates(country, from, config, decisions.data)
            : undefined,
        from,
        isManager,
      }),
    [config, from, country, decisions.data, isManager]
  );
}

/**
 * Calendar, "Next 7 days" (#9658): what changes at the venue from tomorrow for a week, one line
 * each, read as Special dates reads them; a line opens its first date. A Manager also sees the
 * holidays in the week nothing has decided yet, with Open as usual and Plan holidays. Nothing
 * renders when nothing changes. On a phone it starts as one count line with Show.
 */
export function WeekChanges({
  venueId,
  config,
  onOpenDay,
  onPlanHolidays,
  sectionNames,
}: WeekChangesProps) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const headingId = useId();
  const onPhone = useViewport() === "phone";
  const [opened, setOpened] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const { rows, first, more } = useWeekRows(venueId, config);
  const { phases, openAsUsual } = useOpenAsUsual(venueId);
  if (rows.length === 0) return null;

  const title = t("availability.weekChanges.title");
  if (onPhone && !opened) {
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
  const item = (row: WeekChangeRow) => {
    const text = weekChangeRowText(row, ctx);
    if (row.action.type === "holiday") {
      const { holiday } = row.action;
      const name = t(`availabilitySpecial.holidays.name.${holiday.id}`);
      return (
        <HolidayRow
          key={row.key}
          holiday={holiday}
          text={text}
          phase={phases.get(holiday.date)}
          onOpenAsUsual={() => void openAsUsual(holiday, name)}
          onPlan={onPlanHolidays}
        />
      );
    }
    const { date } = row.action;
    return <DayRow key={row.key} text={text} onOpen={() => onOpenDay(date)} />;
  };

  return (
    <section aria-labelledby={headingId} className={styles.week}>
      <Text as="h2" variant="caption" color="secondary" id={headingId}>
        {title}
      </Text>
      <ul className={styles.list}>{(showAll ? rows : first).map(item)}</ul>
      {!showAll && more > 0 && (
        <Button variant="ghost" size="sm" className={styles.more} onClick={() => setShowAll(true)}>
          {t("availability.weekChanges.more", { count: more })}
        </Button>
      )}
    </section>
  );
}
