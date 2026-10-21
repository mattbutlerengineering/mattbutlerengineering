import { useVenueFormat } from "../hooks/useVenueFormat.js";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useAuth } from "@mbe/auth/react";
import { Button, NeonSign, Skeleton } from "@mattbutlerengineering/rialto";
import { PageHeader } from "../components/PageHeader";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner";
import { describeApiError } from "../lib/describe-api-error.js";
import {
  ReservationList,
  ActivityFeed,
  LapsingGuestsWidget,
  DepositExposureWidget,
  StatRow,
} from "../components/dashboard";
import { useVenue } from "../contexts/VenueContext.js";
import { useDashboardStatsQuery } from "../hooks/useDashboardStatsQuery.js";
import { useLapsingGuests, useSendWinBack } from "../hooks/useGuests.js";
import { useNow } from "../hooks/useNow.js";
import { useSSEStatus, useSSEEventFeed } from "../hooks/useSSESync.js";
import { deriveVenueOpenState } from "../utils/venueOpenState.js";
import { formatVenueOpenLabel } from "../utils/venueOpenLabel.js";
import styles from "./HomePage.module.css";

function StatsLoading() {
  return (
    <div className={styles.skeletonStats}>
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className={styles.skeletonStat} />
      ))}
    </div>
  );
}

export function HomePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { reservations, stats, isLoading, error, refetch } = useDashboardStatsQuery();
  const loadFailure = error ? describeApiError(error) : null;
  const { isConnected } = useSSEStatus();
  const feedEvents = useSSEEventFeed({ maxItems: 5 });
  const { selectedVenue, selectedVenueId } = useVenue();
  const fmt = useVenueFormat();
  const {
    data: lapsingGuests = [],
    error: lapsingError,
    refetch: refetchLapsing,
  } = useLapsingGuests(selectedVenueId);
  const lapsingFailure = lapsingError ? describeApiError(lapsingError) : null;
  const sendWinBack = useSendWinBack();
  const now = useNow();
  // Render-time derivation on the venue's own clock; `null` means "no sign".
  const openState = selectedVenue
    ? deriveVenueOpenState({
        operatingHours: selectedVenue.operatingHours,
        ianaTimezone: selectedVenue.ianaTimezone,
        now,
      })
    : null;

  const handleRetry = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleSendWinBack = useCallback(
    (guestId: string) => {
      sendWinBack.mutate(guestId);
    },
    [sendWinBack]
  );

  return (
    <div>
      <PageHeader
        title={t("home.title")}
        description={user?.name ? t("home.welcomeNamed", { name: user.name }) : t("home.welcome")}
        aside={
          openState && (
            <NeonSign
              state={openState.state}
              aria-label={formatVenueOpenLabel(openState, fmt.formatLocalTime)}
            />
          )
        }
      />

      <div data-testid="primary-content">
        {loadFailure && (
          <ErrorRetryBanner
            title={t("home.loadFailed")}
            error={loadFailure.detail}
            details={loadFailure.raw}
            onRetry={handleRetry}
          />
        )}

        {isLoading ? <StatsLoading /> : <StatRow stats={stats} />}

        <div className={styles.actionsRow}>
          <Button variant="secondary" size="sm" onClick={() => navigate("/timeline?walkin=true")}>
            {t("home.actions.walkIn")}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate("/floor-plans")}>
            {t("home.actions.floorPlan")}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate("/guests")}>
            {t("home.actions.guestLookup")}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate("/booking-widget")}>
            {t("home.actions.bookingWidget")}
          </Button>
        </div>

        <div className={styles.contentGrid}>
          <ReservationList reservations={reservations} isLoading={isLoading} />
          <ActivityFeed events={feedEvents} isConnected={isConnected} />
        </div>

        <div className={styles.dashboardWidgets}>
          {lapsingFailure ? (
            <ErrorRetryBanner
              title={t("home.lapsingLoadFailed")}
              error={lapsingFailure.detail}
              details={lapsingFailure.raw}
              onRetry={refetchLapsing}
            />
          ) : (
            <LapsingGuestsWidget guests={lapsingGuests} onSendWinBack={handleSendWinBack} />
          )}
          {!isLoading && (
            <DepositExposureWidget
              depositAtRiskCount={stats.depositAtRiskCount}
              noShowExposureCents={stats.noShowExposureCents}
              currency={fmt.currency}
            />
          )}
        </div>
      </div>
    </div>
  );
}
