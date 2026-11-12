import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Button,
  Collapsible,
  ConfirmDialog,
  Heading,
  Skeleton,
  Text,
} from "@mattbutlerengineering/rialto";
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
 * Closed, Open as usual or Special hours…; the ones decided fold into Decided with a Change. They
 * sit under the venue's own dates as one line ("5 holidays not planned · Plan holidays") that
 * opens in place. Closing several at once asks first, naming the dates. A
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
  const [expanded, setExpanded] = useState(false);
  const [confirmingOne, setConfirmingOne] = useState<NamedHoliday | null>(null);
  const planRef = useRef<HTMLButtonElement>(null);
  const wasExpanded = useRef(false);
  const [confirming, setConfirming] = useState<readonly NamedHoliday[] | null>(null);
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
  // The pressed button unmounts as the line opens or folds: focus goes to the panel on open, and
  // back to the line's button on Hide, never to the page.
  useEffect(() => {
    if (expanded === wasExpanded.current) return;
    wasExpanded.current = expanded;
    if (expanded) sectionRef.current?.focus();
    else planRef.current?.focus();
  }, [expanded]);
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
        // Replacing a decision with a closure asks first: its toast cannot offer Undo, because
        // tidying the old decision is a second save.
        if (choice === "closed" && holiday.state.kind !== "undecided") {
          setConfirmingOne(holiday);
          return;
        }
        setChanging((prev) => new Set([...prev].filter((d) => d !== holiday.date)));
        decide(holiday, choice);
      }}
      onChange={() => setChanging((prev) => new Set([...prev, holiday.date]))}
      onRetry={() => retry(holiday)}
      onOpenDay={() => onOpenDay(holiday.date)}
    />
  );

  if (decisions.data == null && decisions.error) {
    return (
      <section
        ref={sectionRef}
        tabIndex={-1}
        className={styles.holidays}
        aria-label={t("availabilitySpecial.holidays.heading")}
      >
        <Alert variant="error">
          <Text>{t("availabilitySpecial.holidays.loadError")}</Text>
          <Button variant="secondary" size="sm" onClick={() => void decisions.refetch()}>
            {t("availabilitySpecial.holidays.retry")}
          </Button>
        </Alert>
      </section>
    );
  }
  if (decisions.data == null) {
    return (
      <section
        ref={sectionRef}
        tabIndex={-1}
        className={styles.holidays}
        aria-label={t("availabilitySpecial.holidays.heading")}
      >
        <Skeleton variant="text" lines={1} />
      </section>
    );
  }
  if (holidays.length === 0) return null;

  if (!expanded) {
    return (
      <section
        ref={sectionRef}
        tabIndex={-1}
        className={`${styles.holidays} ${styles.collapsed}`}
        aria-label={t("availabilitySpecial.holidays.heading")}
      >
        <Text variant="body" color="secondary">
          {undecided.length > 0
            ? t("availabilitySpecial.holidays.notPlanned", { count: undecided.length })
            : t("availabilitySpecial.holidays.allPlanned")}
        </Text>
        <Button
          ref={planRef}
          variant="ghost"
          size="sm"
          aria-expanded={false}
          onClick={() => setExpanded(true)}
        >
          {t(
            isManager && undecided.length > 0
              ? "availabilitySpecial.holidays.plan"
              : "availabilitySpecial.holidays.view"
          )}
        </Button>
      </section>
    );
  }

  return (
    <section ref={sectionRef} tabIndex={-1} className={styles.holidays} aria-labelledby={headingId}>
      {/* Level 2: the page's h1 is the last heading above it (axe heading-order). */}
      <div className={styles.headingRow}>
        <Heading level={2} size={6} id={headingId}>
          {t("availabilitySpecial.holidays.heading")}
        </Heading>
        <Button variant="ghost" size="sm" aria-expanded onClick={() => setExpanded(false)}>
          {t("availabilitySpecial.holidays.hide")}
        </Button>
      </div>
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
            onClick={() => setConfirming(usual)}
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
      {confirmingOne && (
        <ConfirmDialog
          open
          title={t("availabilitySpecial.holidays.closeOneTitle", { name: confirmingOne.name })}
          description={t("availabilitySpecial.holidays.closeOneDescription", {
            name: confirmingOne.name,
            date: confirmingOne.dateLabel,
          })}
          confirmLabel={t("availabilitySpecial.holidays.closeOneConfirm", {
            name: confirmingOne.name,
          })}
          cancelLabel={t("availabilitySpecial.holidays.closeManyCancel")}
          onConfirm={() => {
            const holiday = confirmingOne;
            setConfirmingOne(null);
            setChanging((prev) => new Set([...prev].filter((d) => d !== holiday.date)));
            decide(holiday, "closed");
          }}
          onCancel={() => setConfirmingOne(null)}
        />
      )}
      {confirming && (
        <ConfirmDialog
          open
          title={t("availabilitySpecial.holidays.closeManyTitle", { count: confirming.length })}
          description={t("availabilitySpecial.holidays.closeManyDescription", {
            dates: list.format(confirming.map((h) => `${h.name}, ${h.dateLabel}`)),
          })}
          confirmLabel={t("availabilitySpecial.holidays.closeManyConfirm", {
            count: confirming.length,
          })}
          cancelLabel={t("availabilitySpecial.holidays.closeManyCancel")}
          onConfirm={() => {
            const names = list.format(confirming.map((h) => h.name));
            closeMany(confirming, t("availabilitySpecial.holidays.closedToast", { names }));
            setConfirming(null);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </section>
  );
}
