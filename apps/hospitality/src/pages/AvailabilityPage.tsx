import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, SegmentedControl, Skeleton, Stack, Text } from "@mattbutlerengineering/rialto";
import { resolveDay } from "@mbe/availability";
import { useVenue } from "../contexts/VenueContext.js";
import { useAvailabilityConfig, useAvailabilityDays } from "../hooks/useAvailability.js";
import { useNow } from "../hooks/useNow.js";
import { venueDate } from "../utils/service-day.js";
import { useVenueTeam } from "../hooks/useVenueTeam.js";
import { describeApiError } from "../lib/describe-api-error.js";
import { AvailabilityCalendar } from "../components/availability/AvailabilityCalendar.js";
import { AvailabilityHistoryDrawer } from "../components/availability/AvailabilityHistoryDrawer.js";
import { AvailabilityMigrationBanner } from "../components/availability/AvailabilityMigrationBanner.js";
import { AvailabilityQuickSetup } from "../components/availability/AvailabilityQuickSetup.js";
import { AvailabilityDayDrawer } from "../components/availability/AvailabilityDayDrawer.js";
import {
  shiftAnchor,
  visibleDates,
  type CalendarView,
} from "../components/availability/calendar-dates.js";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner.js";
import { PageHeader } from "../components/PageHeader.js";
import styles from "./AvailabilityPage.module.css";

/**
 * Availability → Calendar (read-only, #7514): the venue's month or week with what governs each
 * day, and a drawer that explains a day. Managers and Hosts see the same thing here; editing
 * arrives with the drawer-editing slice and will be Manager-only (F-HOST).
 */
export function AvailabilityPage() {
  const { t } = useTranslation();
  const { selectedVenueId, selectedVenue } = useVenue();
  const timeZone = selectedVenue?.ianaTimezone ?? "";
  const today = venueDate(useNow(), timeZone);

  const [view, setView] = useState<CalendarView>("month");
  // `null` follows today until the viewer navigates.
  const [chosenAnchor, setChosenAnchor] = useState<string | null>(null);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const anchor = chosenAnchor ?? today;

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
        <Button variant="secondary" onClick={() => setHistoryOpen(true)}>
          {t("availability.historyButton")}
        </Button>
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
      {config.data?.source === "legacy" && (
        <AvailabilityMigrationBanner key={selectedVenueId} venueId={selectedVenueId} />
      )}
      {failure && (
        <ErrorRetryBanner
          title={t("availability.loadError")}
          error={failure.detail}
          details={failure.raw}
          onRetry={() => void days.refetch()}
        />
      )}
      <AvailabilityCalendar
        view={view}
        anchor={anchor}
        today={today}
        days={days.data ?? undefined}
        isLoading={days.isLoading}
        selectedDate={openDate}
        onOpenDay={setOpenDate}
        onAnchorChange={setChosenAnchor}
      />
      <AvailabilityDayDrawer
        date={openDate}
        day={resolved}
        isLoading={config.isLoading}
        error={drawerFailure}
        viewerRole={team?.viewerRole}
        onClose={() => setOpenDate(null)}
      />
      <AvailabilityHistoryDrawer
        open={historyOpen}
        venueId={selectedVenueId}
        viewerRole={team?.viewerRole}
        onClose={() => setHistoryOpen(false)}
        onOpenDay={(date) => {
          setHistoryOpen(false);
          setOpenDate(date);
          setChosenAnchor(date);
        }}
      />
    </Stack>
  );
}
