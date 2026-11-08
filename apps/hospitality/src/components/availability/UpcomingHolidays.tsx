import { useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Collapsible, Heading, Skeleton, Text } from "@mattbutlerengineering/rialto";
import { addDays } from "@mbe/availability";
import type { AvailabilityConfigState } from "@mbe/types";
import { useHolidayDecisions } from "../../hooks/useHolidayDecisions.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { HolidayLine } from "./HolidayLine.js";
import { holidayStates, HOLIDAY_HORIZON_DAYS } from "./holiday-decisions.js";
import { USUALLY_CLOSED } from "./holidays.js";
import { useHolidayCountry } from "./use-holidays.js";
import { useHolidayDecision, type HolidayFlow, type NamedHoliday } from "./use-holiday-decision.js";
import styles from "./UpcomingHolidays.module.css";

/** Undecided holidays shown before "Show N more". */
const FIRST_SHOWN = 5;

export interface UpcomingHolidaysProps extends HolidayFlow {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  /** Today on the venue clock. */
  readonly today: string;
  /** Only a Manager decides; a Host reads the decisions. */
  readonly isManager: boolean;
  /** A concurrent change was refused; reload the config. */
  readonly onStale: () => void;
  /** Opens a date in the day drawer, for a holiday a rule this flow does not own decides. */
  readonly onOpenDay: (date: string) => void;
}

/** Groups consecutive holidays by their month. */
function byMonth(holidays: readonly NamedHoliday[]): { month: string; holidays: NamedHoliday[] }[] {
  return holidays.reduce<{ month: string; holidays: NamedHoliday[] }[]>((groups, h) => {
    const month = h.date.slice(0, 7);
    const last = groups.at(-1);
    return last?.month === month
      ? [...groups.slice(0, -1), { month, holidays: [...last.holidays, h] }]
      : [...groups, { month, holidays: [h] }];
  }, []);
}

/**
 * Special dates (ux.md F1): the holidays of the next twelve months, grouped by month, each with
 * Closed, Open as usual or Special hours…; the ones decided fold into Decided with a Change. A
 * decision is the venue's, shared by everyone: Closed and Special hours are date rules, Open as
 * usual is a decision the server stores (`useHolidayDecisions`). A holiday is never drawn
 * undecided because the decisions could not be read: that shows the failure and no lines. A
 * Host sees the same panel read-only. Nothing renders for a country the calendar does not know.
 */
export function UpcomingHolidays(props: UpcomingHolidaysProps) {
  const { venueId, state, today, isManager, onStale, onOpenDay, ...flow } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const headingId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const country = useHolidayCountry();
  const decisions = useHolidayDecisions({
    venueId,
    from: today,
    to: addDays(today, HOLIDAY_HORIZON_DAYS),
  });
  const [showAll, setShowAll] = useState(false);
  const [decidedOpen, setDecidedOpen] = useState(false);
  // Lines turned back into the three choices by Change.
  const [changing, setChanging] = useState<ReadonlySet<string>>(() => new Set());
  const { statuses, busy, decide, closeMany, retry } = useHolidayDecision({
    venueId,
    state,
    onStale,
    flow,
    // The line has left the list; the panel keeps focus rather than dropping it to the page.
    onDecided: () => sectionRef.current?.focus(),
  });

  const holidays = useMemo<NamedHoliday[]>(
    () =>
      country && decisions.data
        ? holidayStates(country, today, state.config, decisions.data).map((h) => ({
            ...h,
            name: t(`availabilitySpecial.holidays.name.${h.id}`),
            dateLabel: format.formatCalendarDate(h.date, {
              weekday: "short",
              month: "short",
              day: "numeric",
            }),
          }))
        : [],
    [country, today, state.config, decisions.data, format, t]
  );
  if (!country) return null;

  const undecided = holidays.filter((h) => h.state.kind === "undecided");
  const decided = holidays.filter((h) => h.state.kind !== "undecided");
  const shown = showAll ? undecided : undecided.slice(0, FIRST_SHOWN);
  const usual = undecided.filter((h) => USUALLY_CLOSED.has(h.id));
  const list = new Intl.ListFormat(format.locale, { style: "long", type: "conjunction" });
  const usualNames = list.format(usual.map((h) => h.name));
  const year = today.slice(0, 4);

  const line = (holiday: NamedHoliday) => (
    <HolidayLine
      key={`${holiday.id}-${holiday.date}`}
      holiday={holiday}
      isManager={isManager}
      changing={changing.has(holiday.date) || statuses.has(holiday.date)}
      status={statuses.get(holiday.date)}
      blocked={busy}
      onChoose={(choice) => {
        setChanging((prev) => new Set([...prev].filter((d) => d !== holiday.date)));
        decide(holiday, choice);
      }}
      onChange={() => setChanging((prev) => new Set([...prev, holiday.date]))}
      onRetry={() => retry(holiday)}
      onOpenDay={() => onOpenDay(holiday.date)}
    />
  );

  return (
    <section ref={sectionRef} tabIndex={-1} className={styles.holidays} aria-labelledby={headingId}>
      {/* Level 2: the page's h1 is the last heading above it (axe heading-order). */}
      <Heading level={2} size={6} id={headingId}>
        {t("availabilitySpecial.holidays.heading")}
      </Heading>
      {decisions.data == null && decisions.error ? (
        <Alert variant="error">
          <Text>{t("availabilitySpecial.holidays.loadError")}</Text>
          <Button variant="secondary" size="sm" onClick={() => void decisions.refetch()}>
            {t("availabilitySpecial.holidays.retry")}
          </Button>
        </Alert>
      ) : decisions.data == null ? (
        <Skeleton variant="text" lines={4} />
      ) : (
        <>
          {isManager && usual.length >= 2 && (
            <div className={styles.usual}>
              <Text variant="caption" color="secondary">
                {t("availabilitySpecial.holidays.usualClosedLine", { names: usualNames })}
              </Text>
              <Button
                variant="secondary"
                size="sm"
                className={styles.choice}
                disabled={busy}
                onClick={() =>
                  closeMany(
                    usual,
                    t("availabilitySpecial.holidays.closedToast", { names: usualNames })
                  )
                }
              >
                {t("availabilitySpecial.holidays.closeUsual", { count: usual.length })}
              </Button>
            </div>
          )}
          {byMonth(shown).map(({ month, holidays: inMonth }) => (
            <div key={month} className={styles.month}>
              <Heading level={3} size={6}>
                {format.formatCalendarDate(`${month}-01`, {
                  month: "long",
                  ...(month.startsWith(year) ? {} : { year: "numeric" }),
                })}
              </Heading>
              <ul className={styles.list}>{inMonth.map(line)}</ul>
            </div>
          ))}
          {!showAll && undecided.length > FIRST_SHOWN && (
            <Button
              variant="ghost"
              size="sm"
              className={`${styles.more} ${styles.choice}`}
              onClick={() => setShowAll(true)}
            >
              {t("availabilitySpecial.holidays.showMore", {
                count: undecided.length - FIRST_SHOWN,
              })}
            </Button>
          )}
          {decided.length > 0 && (
            <Collapsible
              open={decidedOpen}
              onOpenChange={setDecidedOpen}
              headingTag="h3"
              trigger={t("availabilitySpecial.holidays.decided", { count: decided.length })}
            >
              <ul className={styles.list}>{decided.map(line)}</ul>
            </Collapsible>
          )}
        </>
      )}
    </section>
  );
}
