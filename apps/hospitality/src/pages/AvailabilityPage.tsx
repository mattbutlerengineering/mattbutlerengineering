import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { Skeleton, Stack, Text } from "@mattbutlerengineering/rialto";
import { resolveDay } from "@mbe/availability";
import { useVenue } from "../contexts/VenueContext.js";
import { useAvailabilityConfig, useAvailabilityDays } from "../hooks/useAvailability.js";
import { useVenueFloorPlanSections } from "../hooks/useFloorPlans.js";
import { useNow } from "../hooks/useNow.js";
import { minutesOfDayIn, venueDate } from "../utils/service-day.js";
import { useVenueFormat } from "../hooks/useVenueFormat.js";
import { useManagerAccess } from "../hooks/useIsManager.js";
import { useVenueTeam } from "../hooks/useVenueTeam.js";
import { useViewport } from "../hooks/useViewport.js";
import { describeApiError } from "../lib/describe-api-error.js";
import { AvailabilityCalendar } from "../components/availability/AvailabilityCalendar.js";
import { AvailabilityHistoryDrawer } from "../components/availability/AvailabilityHistoryDrawer.js";
import { BookingRulesDrawer } from "../components/availability/BookingRulesDrawer.js";
import { StrandedRevertDialog } from "../components/availability/StrandedRevertDialog.js";
import { AvailabilityMigrationBanner } from "../components/availability/AvailabilityMigrationBanner.js";
import { AvailabilityQuickSetup } from "../components/availability/AvailabilityQuickSetup.js";
import { AvailabilitySelectionBar } from "../components/availability/AvailabilitySelectionBar.js";
import { AvailabilityToolbar } from "../components/availability/AvailabilityToolbar.js";
import { scheduleNameText } from "../components/availability/day-summary.js";
import { AvailabilityDayDrawer } from "../components/availability/AvailabilityDayDrawer.js";
import { AvailabilityHeaderActions } from "../components/availability/AvailabilityHeaderActions.js";
import { AvailabilityScheduleControls } from "../components/availability/AvailabilityScheduleControls.js";
import {
  parseAvailabilityEntry,
  type AvailabilityTab,
} from "../components/availability/availability-address.js";
import { ScheduleEditorDrawer } from "../components/availability/ScheduleEditorDrawer.js";
import {
  REGULAR_WEEK_HEADING_ID,
  SchedulesTab,
  type ScheduleEditorTarget,
} from "../components/availability/SchedulesTab.js";
import { SpecialDatesTab } from "../components/availability/SpecialDatesTab.js";
import {
  shiftAnchor,
  visibleDates,
  type CalendarView,
} from "../components/availability/calendar-dates.js";
import { ClearChangesDialog } from "../components/availability/ClearChangesDialog.js";
import { UseScheduleDialog } from "../components/availability/UseScheduleDialog.js";
import { ownSingleDateRules } from "../components/availability/selection-actions.js";
import { CloseDialog } from "../components/availability/CloseDialog.js";
import { GoToDateDialog } from "../components/availability/GoToDateDialog.js";
import { shownOnlinePause } from "../components/availability/close-draft.js";
import { OnlinePausedBanner } from "../components/availability/OnlinePausedBanner.js";
import { TodayLine } from "../components/availability/TodayLine.js";
import { RegularWeekLine } from "../components/availability/RegularWeekLine.js";
import { NextHolidayNudge } from "../components/availability/NextHolidayNudge.js";
import { DiscardChangesDialog } from "../components/availability/DiscardChangesDialog.js";
import { LeaveGuard } from "../components/availability/LeaveGuard.js";
import { useDiscardGuard } from "../components/availability/use-discard-guard.js";
import {
  datesUsingSchedule,
  futureDates,
  weekdayDatesInMonth,
} from "../components/availability/selection.js";
import { pickHoursSource } from "../components/availability/selection-hours.js";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner.js";
import { PageHeader } from "../components/PageHeader.js";
import { periodLabel, weekSummary } from "../components/availability/period.js";
import { ServicesFilterSelect } from "../components/availability/ServicesFilterSelect.js";
import {
  filterableServices,
  resolveServiceFilter,
} from "../components/availability/service-filter.js";
import { deviceTimeZone, formatTimeZoneName, sameTimeZone } from "../utils/format.js";
import styles from "./AvailabilityPage.module.css";

const EMPTY: string[] = [];

/**
 * The Close dialog (F5): `date` pre-fills "one date", `dates` (the selection bar's) "Several
 * dates"; `pause` starts on pausing online booking.
 */
interface Closing {
  readonly date: string | null;
  readonly dates?: readonly string[];
  readonly pause: boolean;
  /** Opens on One section with this section chosen (`?closeSection=`). */
  readonly sectionId?: string;
}

/** Another layer, and what to do once there (Go to date, Compare services, open a day). */
interface TabMove {
  readonly tab: AvailabilityTab;
  readonly then?: "goToDate" | "compare" | { readonly openDay: string };
}

/**
 * What the drawer shows: one date, or the dates picked in the selection bar (`fixedDates`).
 * A move can carry the Close dialog (`closing`), which opens only once the guard lets it through.
 */
interface OpenTarget {
  readonly date: string | null;
  readonly fixedDates?: readonly string[];
  /** With `fixedDates`: the picked dates do not all have the hours of `date`. */
  readonly hoursDiffer?: boolean;
  readonly closing?: Closing;
  /** The schedule whose editor opens once the guard lets the drawer go (Edit on a dated layer). */
  readonly editingSchedule?: string;
}
const CLOSED: OpenTarget = { date: null };

/**
 * Availability → Calendar (read-only, #7514): the venue's month or week with what governs each
 * day, and a drawer that explains a day. Managers and Hosts see the same thing here; only a
 * Manager gets the drawer's editor (F-HOST).
 */
export function AvailabilityPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={rootRef} className={styles.page}>
      <AvailabilityContent rootRef={rootRef} />
      {/* Last, so it paints above any other overlay the tab has open, and on every tab. */}
      <StrandedRevertDialog />
    </div>
  );
}

/** The Regular week heading: where quick setup's save lands once the week panel replaces the card. */
function focusRegularWeekHeading(root: HTMLElement | null): boolean {
  const heading = root?.querySelector<HTMLElement>(`#${REGULAR_WEEK_HEADING_ID}`);
  heading?.focus();
  return !!heading;
}

/** The day to focus, or failing that the calendar's Tab stop, or its first day. */
function focusCalendar(root: HTMLElement | null, date: string | null) {
  const target =
    (date && root?.querySelector<HTMLElement>(`[data-date="${date}"]`)) ||
    root?.querySelector<HTMLElement>('[data-date][tabindex="0"]') ||
    root?.querySelector<HTMLElement>("[data-date]");
  target?.focus();
}

function AvailabilityContent({ rootRef }: { readonly rootRef: RefObject<HTMLDivElement | null> }) {
  const { t } = useTranslation();
  const viewport = useViewport();
  const { selectedVenueId, selectedVenue } = useVenue();
  const timeZone = selectedVenue?.ianaTimezone ?? "";
  const now = useNow();
  const today = venueDate(now, timeZone);

  const [view, setView] = useState<CalendarView>("month");
  // `null` follows today until the viewer navigates.
  const [chosenAnchor, setChosenAnchor] = useState<string | null>(null);
  const [target, setTarget] = useState<OpenTarget>(CLOSED);
  const openDate = target.date;
  const [closing, setClosing] = useState<Closing | null>(null);
  // The schedule editor and Compare services are the page's: the header ⋯ and the day drawer
  // open them as well as the Schedules layer.
  const [editor, setEditor] = useState<ScheduleEditorTarget | null>(null);
  const [comparing, setComparing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [bookingRulesOpen, setBookingRulesOpen] = useState(false);
  const [goToOpen, setGoToOpen] = useState(false);
  // The day Go to date went to. The dialog hands focus back to its trigger a frame after it
  // closes, so focus moves to the day only once that has happened (see the effect below).
  const [jumpTo, setJumpTo] = useState<string | null>(null);
  // How another page opened this one (?tab=, ?closeSection=, ?action=, ?from=setup), read once on mount.
  const [searchParams, setSearchParams] = useSearchParams();
  const [entry] = useState(() => parseAvailabilityEntry(searchParams));
  // `null` until the viewer picks one: a Manager then lands on Schedules, a Host on Calendar.
  const [chosenTab, setChosenTab] = useState<AvailabilityTab | null>(entry.tab ?? null);
  // A section's Close dialog and an action are not reopened by a refresh, so those params go once read.
  useEffect(() => {
    if (!searchParams.has("closeSection") && !searchParams.has("action")) return;
    const rest = new URLSearchParams(searchParams);
    rest.delete("closeSection");
    rest.delete("action");
    setSearchParams(rest, { replace: true });
  }, [searchParams, setSearchParams]);
  // A range drag holds the selection bar as it was, so the grid does not move under the pointer.
  const [barDuringDrag, setBarDuringDrag] = useState<string[] | null>(null);
  const [selectionAction, setSelectionAction] = useState<"use" | "clear" | null>(null);
  // Select days: a tap picks a day, so a phone needs no long press to start a selection.
  const [selecting, setSelecting] = useState(false);
  // A bulk action's own buttons go with the selection, so focus moves to this day afterwards.
  const focusAfterBulk = useRef<string | null>(null);
  const anchor = chosenAnchor ?? today;
  // Picked days belong to one venue; derive "none" on a venue switch rather than clearing in an effect.
  const [picked, setPicked] = useState<{ venueId: string | null; dates: string[] }>({
    venueId: selectedVenueId,
    dates: [],
  });
  const selection = picked.venueId === selectedVenueId ? picked.dates : EMPTY;
  // Past dates are history, not something to edit (the server settles a save from today on).
  // Which gesture last lost past dates. It belongs to that venue, and moving the calendar drops it
  // (`moveTo`, `changeView`). `count` makes a repeat of the gesture a new announcement.
  const [dropped, setDropped] = useState<{
    venueId: string | null;
    count: number;
  } | null>(null);
  const moveTo = (next: string | null) => {
    setChosenAnchor(next);
    setDropped(null);
  };
  const changeView = (next: CalendarView) => {
    setView(next);
    setDropped(null);
  };
  const setSelection = (dates: string[]) => {
    const kept = futureDates(dates, today);
    // A gesture that lost dates says so, rather than appearing to do nothing.
    setDropped(
      kept.length < dates.length
        ? { venueId: selectedVenueId, count: (dropped?.count ?? 0) + 1 }
        : null
    );
    setPicked({ venueId: selectedVenueId, dates: kept });
  };
  const pastNotice = dropped && dropped.venueId === selectedVenueId ? dropped : null;
  // Moving off a day with an unsaved draft asks first (ux.md F2 step 6), selection actions included.
  // Opening a single day drops the selection, but only once the guard lets the move happen.
  const guard = useDiscardGuard<OpenTarget>(
    ({ closing: nextClosing, editingSchedule: id, ...next }) => {
      setTarget(next);
      if (next.date !== null && !next.fixedDates) setSelection([]);
      if (nextClosing) setClosing(nextClosing);
      // The day drawer hands focus back to its calendar cell a frame after it closes, so the editor
      // opens after that (two frames: the restore is queued once this move has rendered).
      if (id) {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => setEditor({ mode: "edit", sourceId: id }))
        );
      }
    }
  );
  // The week panel's and Compare services' unsaved rows are lost when the Schedules layer goes,
  // so leaving it asks first. Go to date and Compare services move layers, then run.
  const [schedulesDirty, setSchedulesDirty] = useState(false);
  const applyTab = ({ tab: next, then }: TabMove) => {
    setChosenTab(next);
    if (next !== "schedules") setComparing(false);
    if (then === "goToDate") setGoToOpen(true);
    if (then === "compare") setComparing(true);
    // The day opens only once the layer has actually changed, so Keep editing leaves no target behind.
    if (typeof then === "object") {
      guard.request({ date: then.openDay });
      moveTo(then.openDay);
    }
  };
  const access = useManagerAccess();
  const isManager = access.isManager;
  // Role pending: a skeleton for everyone, never the calendar (a Manager would see it flash).
  // Only a Manager has the Schedules layer: a Host who opens ?tab=schedules gets the calendar.
  const tab: AvailabilityTab | "pending" = access.isPending
    ? "pending"
    : chosenTab === "schedules" && !isManager
      ? "calendar"
      : (chosenTab ?? (isManager ? "schedules" : "calendar"));
  const tabGuard = useDiscardGuard<TabMove>(
    (move) => {
      setSchedulesDirty(false);
      applyTab(move);
    },
    tab === "schedules" && schedulesDirty
  );
  const format = useVenueFormat();
  const dates = useMemo(() => visibleDates(view, anchor), [view, anchor]);
  const days = useAvailabilityDays({
    venueId: selectedVenueId,
    from: dates[0] ?? anchor,
    to: dates.at(-1) ?? anchor,
  });
  const config = useAvailabilityConfig({ venueId: selectedVenueId });
  // A section closure is named by its section on the calendar, the drawer and Special dates.
  const sectionRows = useVenueFloorPlanSections({ venueId: selectedVenueId });
  const sectionNames = useMemo(
    () => new Map((sectionRows.data ?? []).map((s) => [s.id, s.name])),
    [sectionRows.data]
  );
  // A closure that closed a service for good leaves it out of the day, so the month's chip reads its name here.
  const serviceNames = useMemo(
    () => new Map((config.data?.config.venueServices ?? []).map((v) => [v.id, v.name])),
    [config.data]
  );
  // The Services filter (2+ services only) is a view, not saved: it narrows how days read and
  // belongs to one venue, so a venue switch derives "All" rather than carrying the id over.
  const [chosenService, setChosenService] = useState<{
    venueId: string | null;
    id: string | null;
  }>({ venueId: selectedVenueId, id: null });
  const filterServices = useMemo(
    () => (config.data ? filterableServices(config.data.config) : []),
    [config.data]
  );
  const serviceFilter = resolveServiceFilter(
    filterServices,
    chosenService.venueId === selectedVenueId ? chosenService.id : null
  );
  const source = config.data?.source;
  const wasEmpty = useRef(false);

  // Quick setup's save swaps the card, and the focused Save with it, for the week panel.
  useEffect(() => {
    if (source === "empty") {
      wasEmpty.current = true;
    } else if (source && wasEmpty.current) {
      wasEmpty.current = false;
      if (document.activeElement === document.body) {
        // On another layer (?tab=calendar) there is no heading: the calendar takes the focus.
        if (!focusRegularWeekHeading(rootRef.current)) focusCalendar(rootRef.current, null);
      }
    }
  }, [source, rootRef]);

  useEffect(() => {
    if (jumpTo === null) return;
    // Registered after the dialog's own restore frame, so it runs after it in the same frame.
    const frame = requestAnimationFrame(() => {
      focusCalendar(rootRef.current, jumpTo);
      setJumpTo(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [jumpTo, rootRef]);

  useEffect(() => {
    if (focusAfterBulk.current === null) return;
    const date = focusAfterBulk.current;
    focusAfterBulk.current = null;
    focusCalendar(rootRef.current, date);
  });
  const teamRead = useVenueTeam({ venueId: selectedVenueId });
  const team = teamRead.data;
  // ?closeSection= opens the Close dialog for that section, once, for a Manager with the config
  // loaded (a Host has no Close dialog). An id the venue does not have opens it with no preselection.
  const entrySection = useRef(entry.closeSection);
  const entryReady = isManager && !!config.data;
  // On a venue with no hours the quick-setup card stands in for the page: the entry is spent, not
  // held back to pop open when that card saves.
  const emptyVenue = config.data?.source === "empty";
  useEffect(() => {
    if (!entryReady || entrySection.current === undefined) return;
    if (!emptyVenue) setClosing({ date: null, pause: false, sectionId: entrySection.current });
    entrySection.current = undefined;
  }, [entryReady, emptyVenue]);
  // ?action=addSchedule opens the seeded schedule editor, once, for a Manager who is on Schedules.
  const entryActionRef = useRef(entry.action);
  useEffect(() => {
    if (!entryReady || entryActionRef.current === undefined) return;
    if (!emptyVenue && tab === "schedules") setEditor({ mode: "new", seed: "regular" });
    entryActionRef.current = undefined;
  }, [entryReady, emptyVenue, tab]);
  // A read that has never answered. A refresh failing over data on hand is the drawer's to say.
  const failedReads = [
    days.error ? days : null,
    !config.data && config.error ? config : null,
    !team && teamRead.error ? teamRead : null,
  ].filter((read) => read !== null);
  const loadFailure = failedReads[0]?.error ? describeApiError(failedReads[0].error) : null;
  const loadFailureBanner = loadFailure && (
    <ErrorRetryBanner
      title={t("availability.loadError")}
      error={loadFailure.detail}
      details={loadFailure.raw}
      onRetry={() => failedReads.forEach((read) => void read.refetch())}
    />
  );

  const resolved = useMemo(
    () =>
      openDate !== null && config.data
        ? resolveDay({ timezone: timeZone, config: config.data.config }, openDate)
        : undefined,
    [openDate, config.data, timeZone]
  );

  // Every Manager action opens on the config: with none loaded it could open nothing.
  const canAct = isManager && !!config.data;
  const pause = config.data
    ? shownOnlinePause(config.data.config, timeZone, today, minutesOfDayIn(now, timeZone))
    : null;

  // Another layer, asking first when this one holds unsaved edits.
  const changeTab = (move: TabMove) => {
    if (guard.dirty) guard.request(CLOSED);
    else if (tab === "schedules" && move.tab !== "schedules") tabGuard.request(move);
    else applyTab(move);
  };
  const regularSchedule = config.data?.config.schedules.find((s) => s.isRegular && !s.archivedAt);
  // A Host keeps History and Go to date; the rest is the Manager's. While the role or the config
  // is read the actions show disabled, and a config that failed to load has nothing to open.
  const headerActions =
    isManager && !config.data && config.error ? null : (
      <AvailabilityHeaderActions
        viewport={viewport}
        pending={access.isPending || (isManager && !canAct)}
        {...(isManager || access.isPending
          ? {
              onClose: () => setClosing({ date: null, pause: false }),
              onPause: !pause ? () => setClosing({ date: null, pause: true }) : undefined,
              onBookingRules: () => setBookingRulesOpen(true),
              onCompareServices: () =>
                tab === "schedules"
                  ? setComparing(true)
                  : changeTab({ tab: "schedules", then: "compare" }),
              onDuplicateRegularWeek: regularSchedule
                ? () => setEditor({ mode: "duplicate", sourceId: regularSchedule.id })
                : undefined,
            }
          : {})}
        onHistory={() => setHistoryOpen(true)}
        onGoToDate={() =>
          tab === "calendar" ? setGoToOpen(true) : changeTab({ tab: "calendar", then: "goToDate" })
        }
      />
    );
  const pageHeader = (actions: ReactNode, description?: ReactNode) => (
    <PageHeader
      title={t("availability.title")}
      description={description ?? t("availability.description")}
      asideBesideTitle
      aside={
        actions || entry.from === "setup" ? (
          <div className={styles.headerAside}>
            {actions}
            {entry.from === "setup" && (
              <Link to="/setup" className={styles.backLink}>
                {t("availability.backToSetup")}
              </Link>
            )}
          </div>
        ) : undefined
      }
    />
  );

  if (!selectedVenueId) {
    return (
      <Stack gap="md">
        {pageHeader(null)}
        <Text variant="body" color="secondary">
          {t("availability.noVenue")}
        </Text>
      </Stack>
    );
  }

  // A venue with no hours sees the quick-setup card instead of an empty calendar (S1).
  if (config.data?.source === "empty") {
    return (
      <Stack gap="md">
        {pageHeader(null)}
        {isManager ? (
          <AvailabilityQuickSetup
            venueId={selectedVenueId}
            state={config.data}
            onStale={() => void config.refetch()}
          />
        ) : team?.viewerRole ? (
          <Text variant="body" color="secondary">
            {t("availability.quickSetup.hostEmpty")}
          </Text>
        ) : teamRead.error ? (
          loadFailureBanner
        ) : (
          <Skeleton variant="text" lines={3} />
        )}
      </Stack>
    );
  }

  const openDay = (date: string) => {
    if (date !== openDate || target.fixedDates) guard.request({ date });
    else if (selection.length > 0) setSelection([]);
  };
  const editSelection = (dates: readonly string[]) => {
    // The rows come from the first picked date that has a service, so a closed Monday picked with
    // an open Friday cannot hide that Friday has hours; the drawer says when the dates differ.
    const loaded = config.data;
    const source = loaded
      ? pickHoursSource(dates, (d) => resolveDay({ timezone: timeZone, config: loaded.config }, d))
      : { date: dates[0] ?? null, differs: false };
    guard.request({ date: source.date, fixedDates: dates, hoursDiffer: source.differs });
  };
  const anchorSummary = days.data?.find((d) => d.serviceDate === anchor);
  // The schedule's own name, not the day's label ("Closed", "Special hours").
  const anchorSchedule = config.data?.config.schedules.find(
    (s) => s.id === anchorSummary?.scheduleId
  );
  const weekdayDates = futureDates(weekdayDatesInMonth(anchor), today);
  const scheduleDates = anchorSchedule
    ? futureDates(datesUsingSchedule(days.data ?? [], anchorSchedule.id), today)
    : [];
  // On a phone these sit in More actions, with no Select… button to say what they do, so they
  // name the verb themselves ("Select every Thursday in November").
  const onPhone = viewport === "phone";
  // Past dates can't be picked, so Select days needs a shown date that is today or later. The
  // phone and tablet month list shows only the anchor month; the grid and a week show `dates`
  // (a straddling week or a padded grid row can reach past the anchor month).
  const shownDates =
    viewport !== "desktop" && view === "month"
      ? dates.filter((d) => d.startsWith(anchor.slice(0, 7)))
      : dates;
  const monthOver = !shownDates.some((d) => d >= today);
  const selectItems = [
    // Every size: the agenda list has only this and a long press, and on the grid it is the way
    // in a Manager can find; its hint there names drag as the faster way.
    ...(monthOver
      ? []
      : [
          {
            id: "select-days",
            label: t("availability.selection.selectDays"),
            onSelect: () => setSelecting(true),
          },
        ]),
    // An entry that would select nothing (a month already over) is not offered.
    ...(weekdayDates.length > 0
      ? [
          {
            id: "weekday",
            label: t(
              onPhone
                ? "availability.selection.selectWeekdayInMonth"
                : "availability.selection.weekdayInMonth",
              {
                weekday: format.formatCalendarDate(anchor, { weekday: "long" }),
                month: format.formatCalendarDate(anchor, { month: "long" }),
              }
            ),
            onSelect: () => setSelection(weekdayDatesInMonth(anchor)),
          },
        ]
      : []),
    ...(anchorSchedule && scheduleDates.length > 0
      ? [
          {
            id: "schedule",
            label: t(
              onPhone
                ? "availability.selection.selectUsingSchedule"
                : "availability.selection.usingSchedule",
              { schedule: scheduleNameText(anchorSchedule.name, t) }
            ),
            onSelect: () => setSelection(datesUsingSchedule(days.data ?? [], anchorSchedule.id)),
          },
        ]
      : []),
  ];
  const activeScheduleCount =
    config.data?.config.schedules.filter((s) => !s.archivedAt).length ?? 0;
  const ownChangeCount = config.data ? ownSingleDateRules(config.data.config, selection).length : 0;
  const clearSelection = () => {
    setSelection([]);
    setSelecting(false);
  };
  // Every bulk action that lands ends the same way: nothing picked, focus on the first day it hit.
  const finishSelectionAction = () => {
    focusAfterBulk.current = selection[0] ?? null;
    setSelectionAction(null);
    clearSelection();
  };
  const drawerFailure = config.error ? describeApiError(config.error).detail : null;

  const summary = weekSummary(anchor, days.data ?? undefined, t, serviceFilter);
  const device = deviceTimeZone();
  const showVenueTime = timeZone !== "" && device !== "" && !sameTimeZone(device, timeZone);

  // In the summary row's spare width, not a row of its own; a phone's agenda names holidays already
  // and has no row to spare above the first day.
  const nudge =
    config.data && isManager && viewport !== "phone" ? (
      <NextHolidayNudge
        venueId={selectedVenueId}
        config={config.data.config}
        today={today}
        onPlan={() => changeTab({ tab: "special" })}
      />
    ) : null;

  // Beside the week summary it narrows; the toolbar is full at 1280 (a phone's holds it instead).
  const beside =
    !onPhone && filterServices.length > 0 ? (
      <ServicesFilterSelect
        services={filterServices}
        value={serviceFilter?.id ?? null}
        onChange={(id) => setChosenService({ venueId: selectedVenueId, id })}
      />
    ) : null;

  const calendarLayer = (
    <Stack gap="md">
      {(summary || showVenueTime || nudge || beside) && (
        <div className={styles.summaryRow}>
          {summary && (
            <Text variant="caption" color="secondary">
              {summary}
            </Text>
          )}
          {beside}
          {showVenueTime && (
            <Text variant="caption" color="secondary">
              {t("availability.venueTime", {
                zone: formatTimeZoneName(now, timeZone, format.locale),
              })}
            </Text>
          )}
          {nudge}
        </div>
      )}
      {/* A phone has no row to spare above the first day (the nudge's rule); a Manager reads the
          week on the Schedules layer, a Host has no other place to read it. */}
      {config.data && !(onPhone && isManager) && (
        <RegularWeekLine config={config.data.config} timeZone={timeZone} now={now} />
      )}
      <AvailabilityToolbar
        viewport={viewport}
        view={view}
        onViewChange={changeView}
        period={periodLabel(view, anchor, t, format)}
        onPrevious={() => moveTo(shiftAnchor(view, anchor, -1))}
        onNext={() => moveTo(shiftAnchor(view, anchor, 1))}
        onToday={() => moveTo(null)}
        services={onPhone ? filterServices : []}
        serviceFilterId={serviceFilter?.id ?? null}
        onServiceFilterChange={(id) => setChosenService({ venueId: selectedVenueId, id })}
        selectItems={selectItems}
      />
      {(config.data?.source === "legacy" || config.data?.migrated) && (
        <AvailabilityMigrationBanner key={selectedVenueId} venueId={selectedVenueId} />
      )}
      <AvailabilitySelectionBar
        // Held back during a drag, like the bar, so the grid does not move under the pointer.
        notice={barDuringDrag === null && pastNotice ? t("availability.selection.pastDates") : null}
        noticeKey={pastNotice?.count}
        selection={barDuringDrag ?? selection}
        canEdit={canAct}
        onEditHours={editSelection}
        onClear={clearSelection}
        onCloseDates={(dates) =>
          guard.request({ date: null, closing: { date: null, dates, pause: false } })
        }
        selecting={selecting}
        onUseSchedule={() => setSelectionAction("use")}
        multipleSchedules={activeScheduleCount > 1}
        onClearChanges={() => setSelectionAction("clear")}
        canClearChanges={ownChangeCount > 0}
      />
      {selectionAction && config.data && selection.length > 0 && (
        <>
          <UseScheduleDialog
            open={selectionAction === "use"}
            venueId={selectedVenueId}
            state={config.data}
            timezone={timeZone}
            dates={selection}
            onClose={() => setSelectionAction(null)}
            onFinished={finishSelectionAction}
            onStale={() => void config.refetch()}
          />
          <ClearChangesDialog
            open={selectionAction === "clear"}
            venueId={selectedVenueId}
            state={config.data}
            dates={selection}
            onClose={() => setSelectionAction(null)}
            onFinished={finishSelectionAction}
            onStale={() => void config.refetch()}
          />
        </>
      )}
      <AvailabilityCalendar
        view={view}
        anchor={anchor}
        today={today}
        days={days.data ?? undefined}
        isLoading={days.isLoading}
        loadFailed={days.error !== null}
        selectedDate={openDate}
        draftDates={guard.dirty && openDate !== null ? (target.fixedDates ?? [openDate]) : EMPTY}
        selection={selection}
        onSelectionChange={setSelection}
        selecting={selecting}
        onDragChange={(dragging) => setBarDuringDrag(dragging ? selection : null)}
        onOpenDay={openDay}
        onAnchorChange={moveTo}
        serviceFilter={serviceFilter}
        sectionNames={sectionNames}
        serviceNames={serviceNames}
        regularScheduleId={regularSchedule?.id ?? null}
      />
      <AvailabilityDayDrawer
        date={openDate}
        day={resolved}
        isLoading={config.isLoading}
        error={drawerFailure}
        viewerRole={team?.viewerRole}
        dateRules={config.data?.config.dateRules}
        sectionNames={sectionNames}
        editing={
          config.data
            ? {
                venueId: selectedVenueId,
                state: config.data,
                timezone: timeZone,
                today,
                onDirtyChange: guard.setDirty,
                hoursDiffer: target.hoursDiffer,
                onFinished: (saved: boolean) => {
                  guard.release(CLOSED);
                  if (saved && target.fixedDates) {
                    focusAfterBulk.current = target.fixedDates[0] ?? null;
                    clearSelection();
                  }
                },
                fixedDates: target.fixedDates,
                onStale: () => void config.refetch(),
                onCloseDay: (date: string) =>
                  guard.request({ date: null, closing: { date, pause: false } }),
                onEditSchedule: (scheduleId: string) =>
                  guard.request({ date: null, editingSchedule: scheduleId }),
              }
            : undefined
        }
        onClose={() => guard.request(CLOSED)}
      />
    </Stack>
  );

  // Until the layer's config has loaded there is nothing to show but a skeleton (or the banner).
  const loading = config.error ? null : <Skeleton variant="text" lines={6} />;
  const layer =
    tab === "pending" ? (
      <Skeleton variant="text" lines={6} />
    ) : tab === "schedules" ? (
      config.data ? (
        <SchedulesTab
          venueId={selectedVenueId}
          state={config.data}
          timezone={timeZone}
          today={today}
          onStale={() => void config.refetch()}
          refreshError={config.error ? describeApiError(config.error).detail : null}
          onDirtyChange={setSchedulesDirty}
          onEditorChange={setEditor}
          comparing={comparing}
          onComparingChange={setComparing}
          onBookingRules={() => setBookingRulesOpen(true)}
        />
      ) : (
        loading
      )
    ) : tab === "special" ? (
      config.data ? (
        <SpecialDatesTab
          venueId={selectedVenueId}
          state={config.data}
          timezone={timeZone}
          today={today}
          onStale={() => void config.refetch()}
          reloadError={config.error ? describeApiError(config.error).detail : null}
          isManager={isManager}
          sectionNames={sectionNames}
          onOpenDay={(date) => changeTab({ tab: "calendar", then: { openDay: date } })}
        />
      ) : (
        loading
      )
    ) : (
      calendarLayer
    );

  return (
    <Stack gap="md">
      {pageHeader(
        headerActions,
        <TodayLine venueId={selectedVenueId} bannerShowsOnline={pause !== null} />
      )}
      {pause && config.data && (
        <OnlinePausedBanner
          venueId={selectedVenueId}
          state={config.data}
          rule={pause}
          canResume={isManager}
        />
      )}
      {loadFailureBanner}
      {tab !== "pending" && (
        <AvailabilityScheduleControls
          isManager={isManager}
          tab={tab}
          onTabChange={(next) => changeTab({ tab: next })}
        />
      )}
      {layer}
      {bookingRulesOpen && <BookingRulesDrawer onClose={() => setBookingRulesOpen(false)} />}
      <AvailabilityHistoryDrawer
        open={historyOpen}
        venueId={selectedVenueId}
        viewerRole={team?.viewerRole}
        onClose={() => setHistoryOpen(false)}
        onOpenDay={(date) => {
          setHistoryOpen(false);
          // The day opens on the Calendar, from whichever layer History was opened on.
          if (tab !== "calendar") {
            changeTab({ tab: "calendar", then: { openDay: date } });
          } else {
            guard.request({ date });
            moveTo(date);
          }
        }}
      />
      <GoToDateDialog
        open={goToOpen}
        initial={anchor}
        onGo={(date) => {
          moveTo(date);
          setJumpTo(date);
        }}
        onClose={() => setGoToOpen(false)}
      />
      {editor && config.data && (
        <ScheduleEditorDrawer
          venueId={selectedVenueId}
          state={config.data}
          timezone={timeZone}
          today={today}
          mode={editor.mode}
          {...(editor.sourceId ? { sourceScheduleId: editor.sourceId } : {})}
          {...(editor.seed ? { seed: editor.seed } : {})}
          onStale={() => void config.refetch()}
          refreshError={config.error ? describeApiError(config.error).detail : null}
          onClose={() => setEditor(null)}
        />
      )}
      {closing && config.data && (
        <CloseDialog
          venueId={selectedVenueId}
          state={config.data}
          timezone={timeZone}
          today={today}
          initialDate={closing.date}
          initialDates={closing.dates}
          pauseOnline={closing.pause}
          initialSectionId={closing.sectionId}
          onSaved={closing.dates ? finishSelectionAction : undefined}
          onClose={() => setClosing(null)}
        />
      )}
      <DiscardChangesDialog
        open={tabGuard.pending !== null}
        date={null}
        title={t("availabilitySchedules.discard.title")}
        onDiscard={tabGuard.confirmDiscard}
        onKeepEditing={tabGuard.keepEditing}
      />
      <DiscardChangesDialog
        open={guard.pending !== null}
        date={openDate}
        title={
          target.fixedDates && target.fixedDates.length > 1
            ? t("availability.discard.titleSelection", { total: target.fixedDates.length })
            : undefined
        }
        onDiscard={guard.confirmDiscard}
        onKeepEditing={guard.keepEditing}
      />
      <LeaveGuard active={guard.dirty} date={openDate} />
    </Stack>
  );
}
