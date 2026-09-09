import { useCallback } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@mbe/auth/react";
import { Button, NeonSign, Skeleton } from "@mattbutlerengineering/rialto";
import { PageHeader } from "../components/PageHeader";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner";
import { ReservationList, ActivityFeed, StatRow } from "../components/dashboard";
import { useVenue } from "../contexts/VenueContext.js";
import { useDashboardStatsQuery } from "../hooks/useDashboardStatsQuery.js";
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const { reservations, stats, isLoading, error, refetch } = useDashboardStatsQuery();
  const { isConnected } = useSSEStatus();
  const feedEvents = useSSEEventFeed({ maxItems: 5 });
  const { selectedVenue } = useVenue();
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

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Welcome back${user?.name ? `, ${user.name}` : ""}`}
        aside={
          openState && (
            <NeonSign state={openState.state} aria-label={formatVenueOpenLabel(openState)} />
          )
        }
      />

      {error && <ErrorRetryBanner error={error.message} onRetry={handleRetry} />}

      {isLoading ? <StatsLoading /> : <StatRow stats={stats} />}

      <div className={styles.actionsRow}>
        <Button variant="secondary" size="sm" onClick={() => navigate("/timeline")}>
          New Walk-In
        </Button>
        <Button variant="secondary" size="sm" onClick={() => navigate("/floor-plans")}>
          View Floor Plan
        </Button>
        <Button variant="secondary" size="sm" onClick={() => navigate("/guests")}>
          Guest Lookup
        </Button>
        <Button variant="secondary" size="sm" onClick={() => navigate("/booking-widget")}>
          Booking Widget
        </Button>
      </div>

      <div className={styles.contentGrid}>
        <ReservationList reservations={reservations} isLoading={isLoading} />
        <ActivityFeed events={feedEvents} isConnected={isConnected} />
      </div>
    </div>
  );
}
