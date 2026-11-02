import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton, Stack, Text } from "@mattbutlerengineering/rialto";
import { resolveDay } from "@mbe/availability";
import { useVenue } from "../contexts/VenueContext.js";
import { useAvailabilityConfig, useAvailabilityDays } from "../hooks/useAvailability.js";
import { useNow } from "../hooks/useNow.js";
import { minutesOfDayIn, venueDate } from "../utils/service-day.js";
import { useVenueFormat } from "../hooks/useVenueFormat.js";
import { useVenueTeam } from "../hooks/useVenueTeam.js";
import { useViewport } from "../hooks/useViewport.js";
import { describeApiError } from "../lib/describe-api-error.js";
import { AvailabilityCalendar } from "../components/availability/AvailabilityCalendar.js";
import { AvailabilityHistoryDrawer } from "../components/availability/AvailabilityHistoryDrawer.js";
import { AvailabilityMigrationBanner } from "../components/availability/AvailabilityMigrationBanner.js";
import { AvailabilityQuickSetup } from "../components/availability/AvailabilityQuickSetup.js";
import { AvailabilitySelectionBar } from "../components/availability/AvailabilitySelectionBar.js";
import { AvailabilityToolbar } from "../components/availability/AvailabilityToolbar.js";
import { ChangeRegularWeekDrawer } from "../components/availability/ChangeRegularWeekDrawer.js";
import { scheduleNameText } from "../components/availability/day-summary.js";
import { AvailabilityDayDrawer } from "../components/availability/AvailabilityDayDrawer.js";
import {
  AvailabilityScheduleControls,
  type AvailabilityTab,
} from "../components/availability/AvailabilityScheduleControls.js";
import { SchedulesTab } from "../components/availability/SchedulesTab.js";
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
import { shownOnlinePause } from "../components/availability/close-draft.js";
import { OnlinePausedBanner } from "../components/availability/OnlinePausedBanner.js";
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
import { deviceTimeZone, formatTimeZoneName, sameTimeZone } from "../utils/format.js";
import styles from "./AvailabilityPage.module.css";

const EMPTY: string[] = [];

/** The Close dialog (F5): `date` pre-fills "one date"; `pause` starts on pausing online booking. */
interface Closing {
  readonly date: string | null;
  readonly pause: boolean;
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
    </div>
  );
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [tab, setTab] = useState<AvailabilityTab>("calendar");
  // A range drag holds the selection bar as it was, so the grid does not move under the pointer.
  const [barDuringDrag, setBarDuringDrag] = useState<string[] | null>(null);
  const [selectionAction, setSelectionAction] = useState<"use" | "clear" | null>(null);
  // Select days: a tap picks a day, so a phone needs no long press to start a selection.
  const [selecting, setSelecting] = useState(false);
  const [changingWeek, setChangingWeek] = useState(false);
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
  const setSelection = (dates: string[]) =>
    setPicked({ venueId: selectedVenueId, dates: futureDates(dates, today) });
  // Moving off a day with an unsaved draft asks first (ux.md F2 step 6), selection actions included.
  // Opening a single day drops the selection, but only once the guard lets the move happen.
  const guard = useDiscardGuard<OpenTarget>(({ closing: nextClosing, ...next }) => {
    setTarget(next);
    if (next.date !== null && !next.fixedDates) setSelection([]);
    if (nextClosing) setClosing(nextClosing);
  });
  // Compare services' unsaved rows are lost when the Schedules tab goes, so leaving it asks first.
  const [schedulesDirty, setSchedulesDirty] = useState(false);
  const tabGuard = useDiscardGuard<AvailabilityTab>(
    (next) => {
      setSchedulesDirty(false);
      setTab(next);
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
  const source = config.data?.source;
  const wasEmpty = useRef(false);

  // Quick setup's save swaps the card, and the focused Save with it, for the calendar.
  useEffect(() => {
    if (source === "empty") {
      wasEmpty.current = true;
    } else if (source && wasEmpty.current) {
      wasEmpty.current = false;
      if (document.activeElement === document.body) focusCalendar(rootRef.current, null);
    }
  }, [source, rootRef]);

  useEffect(() => {
    if (focusAfterBulk.current === null) return;
    const date = focusAfterBulk.current;
    focusAfterBulk.current = null;
    focusCalendar(rootRef.current, date);
  });
  const teamRead = useVenueTeam({ venueId: selectedVenueId });
  const team = teamRead.data;
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

  if (!selectedVenueId) {
    return (
      <Stack gap="md">
        <PageHeader title={t("availability.title")} description={t("availability.description")} />
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
        <PageHeader title={t("availability.title")} description={t("availability.description")} />
        {team?.viewerRole === "manager" ? (
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
  const selectItems = [
    // The grid has Ctrl-click and drag; the agenda list has only this and a long press.
    ...(viewport !== "desktop"
      ? [
          {
            id: "select-days",
            label: t("availability.selection.selectDays"),
            onSelect: () => setSelecting(true),
          },
        ]
      : []),
    {
      id: "weekday",
      label: t("availability.selection.weekdayInMonth", {
        weekday: format.formatCalendarDate(anchor, { weekday: "long" }),
        month: format.formatCalendarDate(anchor, { month: "long" }),
      }),
      onSelect: () => setSelection(weekdayDatesInMonth(anchor)),
    },
    ...(anchorSchedule
      ? [
          {
            id: "schedule",
            label: t("availability.selection.usingSchedule", {
              schedule: scheduleNameText(anchorSchedule.name, t),
            }),
            onSelect: () => setSelection(datesUsingSchedule(days.data ?? [], anchorSchedule.id)),
          },
        ]
      : []),
  ];

  // Leaving the calendar with an unsaved draft asks first; the tab changes on the next try.
  const changeTab = (next: AvailabilityTab) =>
    guard.dirty
      ? guard.request(CLOSED)
      : tab === "schedules"
        ? tabGuard.request(next)
        : setTab(next);

  const scheduleControls =
    team?.viewerRole && config.data ? (
      <AvailabilityScheduleControls
        venueId={selectedVenueId}
        isManager={team.viewerRole === "manager"}
        state={config.data}
        today={today}
        tab={tab}
        onTabChange={changeTab}
        onStale={() => void config.refetch()}
      />
    ) : null;

  if (tab === "schedules" && scheduleControls && config.data) {
    return (
      <Stack gap="md">
        <PageHeader title={t("availability.title")} description={t("availability.description")} />
        {scheduleControls}
        <SchedulesTab
          venueId={selectedVenueId}
          state={config.data}
          timezone={timeZone}
          today={today}
          onStale={() => void config.refetch()}
          onDirtyChange={setSchedulesDirty}
        />
        <DiscardChangesDialog
          open={tabGuard.pending !== null}
          date={null}
          title={t("availabilitySchedules.discard.title")}
          onDiscard={tabGuard.confirmDiscard}
          onKeepEditing={tabGuard.keepEditing}
        />
      </Stack>
    );
  }

  if (tab === "special" && scheduleControls && config.data) {
    return (
      <Stack gap="md">
        <PageHeader title={t("availability.title")} description={t("availability.description")} />
        {scheduleControls}
        <SpecialDatesTab
          venueId={selectedVenueId}
          state={config.data}
          timezone={timeZone}
          today={today}
          onStale={() => void config.refetch()}
          reloadError={config.error ? describeApiError(config.error).detail : null}
          isManager={team?.viewerRole === "manager"}
        />
      </Stack>
    );
  }

  const isManager = team?.viewerRole === "manager";
  // Every Manager action below opens on the config: with none loaded it could open nothing.
  const canAct = isManager && !!config.data;
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
  const pause = config.data
    ? shownOnlinePause(config.data.config, timeZone, today, minutesOfDayIn(now, timeZone))
    : null;
  const drawerFailure = config.error ? describeApiError(config.error).detail : null;

  const summary = weekSummary(anchor, days.data ?? undefined, t);
  const device = deviceTimeZone();
  const showVenueTime = timeZone !== "" && device !== "" && !sameTimeZone(device, timeZone);

  return (
    <Stack gap="md">
      <PageHeader title={t("availability.title")} description={t("availability.description")} />
      <div className={styles.controlsRow}>
        {scheduleControls}
        {(summary || showVenueTime) && (
          <div className={styles.summaryRow}>
            {summary && (
              <Text variant="caption" color="secondary">
                {summary}
              </Text>
            )}
            {showVenueTime && (
              <Text variant="caption" color="secondary">
                {t("availability.venueTime", {
                  zone: formatTimeZoneName(now, timeZone, format.locale),
                })}
              </Text>
            )}
          </div>
        )}
      </div>
      <AvailabilityToolbar
        viewport={viewport}
        view={view}
        onViewChange={setView}
        period={periodLabel(view, anchor, t, format)}
        onPrevious={() => setChosenAnchor(shiftAnchor(view, anchor, -1))}
        onNext={() => setChosenAnchor(shiftAnchor(view, anchor, 1))}
        onToday={() => setChosenAnchor(null)}
        onHistory={() => setHistoryOpen(true)}
        selectItems={selectItems}
        onClose={canAct ? () => setClosing({ date: null, pause: false }) : undefined}
        onPause={canAct && !pause ? () => setClosing({ date: null, pause: true }) : undefined}
        onChangeRegularWeek={canAct ? () => setChangingWeek(true) : undefined}
        onCreateSchedule={
          canAct && activeScheduleCount < 2 ? () => changeTab("schedules") : undefined
        }
      />
      {(config.data?.source === "legacy" || config.data?.migrated) && (
        <AvailabilityMigrationBanner key={selectedVenueId} venueId={selectedVenueId} />
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
      <AvailabilitySelectionBar
        selection={barDuringDrag ?? selection}
        canEdit={canAct}
        onEditHours={editSelection}
        onClear={clearSelection}
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
        onAnchorChange={setChosenAnchor}
      />
      <AvailabilityDayDrawer
        date={openDate}
        day={resolved}
        isLoading={config.isLoading}
        error={drawerFailure}
        viewerRole={team?.viewerRole}
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
              }
            : undefined
        }
        onClose={() => guard.request(CLOSED)}
      />
      <AvailabilityHistoryDrawer
        open={historyOpen}
        venueId={selectedVenueId}
        viewerRole={team?.viewerRole}
        onClose={() => setHistoryOpen(false)}
        onOpenDay={(date) => {
          setHistoryOpen(false);
          guard.request({ date });
          setChosenAnchor(date);
        }}
      />
      {changingWeek && config.data && (
        <ChangeRegularWeekDrawer
          venueId={selectedVenueId}
          state={config.data}
          today={today}
          onStale={() => void config.refetch()}
          onClose={() => setChangingWeek(false)}
        />
      )}
      {closing && config.data && (
        <CloseDialog
          venueId={selectedVenueId}
          state={config.data}
          timezone={timeZone}
          today={today}
          initialDate={closing.date}
          pauseOnline={closing.pause}
          onClose={() => setClosing(null)}
        />
      )}
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
