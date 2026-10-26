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
import { venueDate } from "../utils/service-day.js";
import { useVenueFormat } from "../hooks/useVenueFormat.js";
import { useVenueTeam } from "../hooks/useVenueTeam.js";
import { describeApiError } from "../lib/describe-api-error.js";
import { AvailabilityCalendar } from "../components/availability/AvailabilityCalendar.js";
import { AvailabilityQuickSetup } from "../components/availability/AvailabilityQuickSetup.js";
import { AvailabilitySelectionBar } from "../components/availability/AvailabilitySelectionBar.js";
import { AvailabilityDayDrawer } from "../components/availability/AvailabilityDayDrawer.js";
import {
  shiftAnchor,
  visibleDates,
  type CalendarView,
} from "../components/availability/calendar-dates.js";
import { DiscardChangesDialog } from "../components/availability/DiscardChangesDialog.js";
import { LeaveGuard } from "../components/availability/LeaveGuard.js";
import { useDiscardGuard } from "../components/availability/use-discard-guard.js";
import { datesUsingSchedule, weekdayDatesInMonth } from "../components/availability/selection.js";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner.js";
import { PageHeader } from "../components/PageHeader.js";
import styles from "./AvailabilityPage.module.css";

const EMPTY: string[] = [];

/** What the drawer shows: one date, or the dates picked in the selection bar (`fixedDates`). */
interface OpenTarget {
  readonly date: string | null;
  readonly fixedDates?: readonly string[];
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
  const today = venueDate(useNow(), timeZone);

  const [view, setView] = useState<CalendarView>("month");
  // `null` follows today until the viewer navigates.
  const [chosenAnchor, setChosenAnchor] = useState<string | null>(null);
  const [target, setTarget] = useState<OpenTarget>(CLOSED);
  const openDate = target.date;
  const anchor = chosenAnchor ?? today;
  // Moving off a day with an unsaved draft asks first (ux.md F2 step 6), selection actions included.
  const guard = useDiscardGuard<OpenTarget>(setTarget);
  // Picked days belong to one venue; derive "none" on a venue switch rather than clearing in an effect.
  const [picked, setPicked] = useState<{ venueId: string | null; dates: string[] }>({
    venueId: selectedVenueId,
    dates: [],
  });
  const selection = picked.venueId === selectedVenueId ? picked.dates : EMPTY;
  const setSelection = (dates: string[]) => setPicked({ venueId: selectedVenueId, dates });
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

  const failure = days.error ? describeApiError(days.error) : null;
  const drawerFailure = config.error ? describeApiError(config.error).detail : null;

  return (
    <Stack gap="md">
      <PageHeader title={t("availability.title")} description={t("availability.description")} />
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
        <DropdownMenu
          trigger={<Button variant="secondary">{t("availability.selection.selectMenu")}</Button>}
          items={selectItems}
        />
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
        canEdit={team?.viewerRole === "manager"}
        onEditHours={editSelection}
        onClear={() => setSelection([])}
      />
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
              }
            : undefined
        }
        onClose={() => guard.request(CLOSED)}
      />
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
