import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  DropdownMenu,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
} from "@mattbutlerengineering/rialto";
import { resolveDay } from "@mbe/availability";
import { useVenue } from "../contexts/VenueContext.js";
import { useAvailabilityConfig, useAvailabilityDays } from "../hooks/useAvailability.js";
import { useNow } from "../hooks/useNow.js";
import { minutesOfDayIn, venueDate } from "../utils/service-day.js";
import { useVenueFormat } from "../hooks/useVenueFormat.js";
import { useVenueTeam } from "../hooks/useVenueTeam.js";
import { describeApiError } from "../lib/describe-api-error.js";
import { AvailabilityCalendar } from "../components/availability/AvailabilityCalendar.js";
import { AvailabilityHistoryDrawer } from "../components/availability/AvailabilityHistoryDrawer.js";
import { AvailabilityMigrationBanner } from "../components/availability/AvailabilityMigrationBanner.js";
import { AvailabilityQuickSetup } from "../components/availability/AvailabilityQuickSetup.js";
import { AvailabilitySelectionBar } from "../components/availability/AvailabilitySelectionBar.js";
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
import { activeOnlinePause } from "../components/availability/close-draft.js";
import { OnlinePausedBanner } from "../components/availability/OnlinePausedBanner.js";
import { DiscardChangesDialog } from "../components/availability/DiscardChangesDialog.js";
import { LeaveGuard } from "../components/availability/LeaveGuard.js";
import { useDiscardGuard } from "../components/availability/use-discard-guard.js";
import { datesUsingSchedule, weekdayDatesInMonth } from "../components/availability/selection.js";
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
  readonly closing?: Closing;
}
const CLOSED: OpenTarget = { date: null };

/**
 * Availability → Calendar (read-only, #7514): the venue's month or week with what governs each
 * day, and a drawer that explains a day. Managers and Hosts see the same thing here; only a
 * Manager gets the drawer's editor (F-HOST).
 */
export function AvailabilityPage() {
  const { t } = useTranslation();
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
  const [selectionAction, setSelectionAction] = useState<"use" | "clear" | null>(null);
  const anchor = chosenAnchor ?? today;
  // Picked days belong to one venue; derive "none" on a venue switch rather than clearing in an effect.
  const [picked, setPicked] = useState<{ venueId: string | null; dates: string[] }>({
    venueId: selectedVenueId,
    dates: [],
  });
  const selection = picked.venueId === selectedVenueId ? picked.dates : EMPTY;
  const setSelection = (dates: string[]) => setPicked({ venueId: selectedVenueId, dates });
  // Moving off a day with an unsaved draft asks first (ux.md F2 step 6), selection actions included.
  // Opening a single day drops the selection, but only once the guard lets the move happen.
  const guard = useDiscardGuard<OpenTarget>(({ closing: nextClosing, ...next }) => {
    setTarget(next);
    if (next.date !== null && !next.fixedDates) setSelection([]);
    if (nextClosing) setClosing(nextClosing);
  });
  const format = useVenueFormat();

  const dates = useMemo(() => visibleDates(view, anchor), [view, anchor]);
  const days = useAvailabilityDays({
    venueId: selectedVenueId,
    from: dates[0] ?? anchor,
    to: dates.at(-1) ?? anchor,
  });
  const config = useAvailabilityConfig({ venueId: selectedVenueId });
  const { data: team } = useVenueTeam({ venueId: selectedVenueId });

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
  const editSelection = (dates: readonly string[]) =>
    guard.request({ date: dates[0] ?? null, fixedDates: dates });
  const anchorSummary = days.data?.find((d) => d.serviceDate === anchor);
  // The schedule's own name, not the day's label ("Closed", "Special hours").
  const anchorSchedule = config.data?.config.schedules.find(
    (s) => s.id === anchorSummary?.scheduleId
  );
  const selectItems = [
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
            label: t("availability.selection.usingSchedule", { schedule: anchorSchedule.name }),
            onSelect: () => setSelection(datesUsingSchedule(days.data ?? [], anchorSchedule.id)),
          },
        ]
      : []),
  ];

  const scheduleControls =
    team?.viewerRole && config.data ? (
      <AvailabilityScheduleControls
        venueId={selectedVenueId}
        isManager={team.viewerRole === "manager"}
        state={config.data}
        today={today}
        tab={tab}
        // Leaving the calendar with an unsaved draft asks first; the tab changes on the next try.
        onTabChange={(next) => (guard.dirty ? guard.request(CLOSED) : setTab(next))}
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
          isManager={team?.viewerRole === "manager"}
        />
      </Stack>
    );
  }

  const isManager = team?.viewerRole === "manager";
  const activeScheduleCount =
    config.data?.config.schedules.filter((s) => !s.archivedAt).length ?? 0;
  const ownChangeCount = config.data ? ownSingleDateRules(config.data.config, selection).length : 0;
  const finishSelectionAction = () => {
    setSelectionAction(null);
    setSelection([]);
  };
  const pause = config.data
    ? activeOnlinePause(config.data.config.dateRules, today, minutesOfDayIn(now, timeZone))
    : null;
  const failure = days.error ? describeApiError(days.error) : null;
  const drawerFailure = config.error ? describeApiError(config.error).detail : null;

  const summary = weekSummary(anchor, days.data ?? undefined, t);
  const device = deviceTimeZone();
  const showVenueTime = timeZone !== "" && device !== "" && !sameTimeZone(device, timeZone);

  return (
    <Stack gap="md">
      <PageHeader title={t("availability.title")} description={t("availability.description")} />
      {scheduleControls}
      {(summary || showVenueTime) && (
        <div className={styles.summaryRow}>
          {summary && (
            <Text variant="body" color="secondary">
              {summary}
            </Text>
          )}
          {showVenueTime && (
            <Text variant="body" color="secondary">
              {t("availability.venueTime", {
                zone: formatTimeZoneName(now, timeZone, format.locale),
              })}
            </Text>
          )}
        </div>
      )}
      <div className={styles.toolbar}>
        <Button variant="secondary" onClick={() => setChosenAnchor(shiftAnchor(view, anchor, -1))}>
          {t("availability.toolbar.previous")}
        </Button>
        <Button variant="secondary" onClick={() => setChosenAnchor(shiftAnchor(view, anchor, 1))}>
          {t("availability.toolbar.next")}
        </Button>
        <Button variant="secondary" onClick={() => setChosenAnchor(null)}>
          {t("availability.toolbar.today")}
        </Button>
        <Text variant="body" color="primary" aria-live="polite" className={styles.period}>
          {periodLabel(view, anchor, t, format)}
        </Text>
        <Button variant="secondary" onClick={() => setHistoryOpen(true)}>
          {t("availability.historyButton")}
        </Button>
        <DropdownMenu
          trigger={<Button variant="secondary">{t("availability.selection.selectMenu")}</Button>}
          items={selectItems}
        />
        {isManager && (
          <Button variant="secondary" onClick={() => setClosing({ date: null, pause: false })}>
            {t("availability.close.open")}
          </Button>
        )}
        {isManager && !pause && (
          <Button variant="secondary" onClick={() => setClosing({ date: null, pause: true })}>
            {t("availability.paused.open")}
          </Button>
        )}
        <SegmentedControl
          aria-label={t("availability.toolbar.viewLabel")}
          segments={[
            { id: "month", label: t("availability.toolbar.month") },
            { id: "week", label: t("availability.toolbar.week") },
          ]}
          value={view}
          onChange={(id) => setView(id as CalendarView)}
        />
      </div>
      {(config.data?.source === "legacy" || config.data?.migrated) && (
        <AvailabilityMigrationBanner key={selectedVenueId} venueId={selectedVenueId} />
      )}
      {pause && (
        <OnlinePausedBanner venueId={selectedVenueId} ruleId={pause.id} canResume={isManager} />
      )}
      {failure && (
        <ErrorRetryBanner
          title={t("availability.loadError")}
          error={failure.detail}
          details={failure.raw}
          onRetry={() => void days.refetch()}
        />
      )}
      <AvailabilitySelectionBar
        selection={selection}
        canEdit={isManager}
        onEditHours={editSelection}
        onClear={() => setSelection([])}
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
        selectedDate={openDate}
        draftDate={guard.dirty ? openDate : null}
        selection={selection}
        onSelectionChange={setSelection}
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
                onFinished: () => guard.release(CLOSED),
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
        onDiscard={guard.confirmDiscard}
        onKeepEditing={guard.keepEditing}
      />
      <LeaveGuard active={guard.dirty} date={openDate} />
    </Stack>
  );
}
