import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@mbe/auth/react";
import { Stat, Button, Skeleton } from "@mattbutlerengineering/rialto";
import { PageHeader } from "../components/PageHeader";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner";
import { ReservationList, ActivityFeed } from "../components/dashboard";
import { useDashboardStatsQuery } from "../hooks/useDashboardStatsQuery.js";
import { useSSEStatus } from "../hooks/useSSEStatus.js";
import { useSSEEventFeed } from "../hooks/useSSEEventFeed.js";
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

  const handleRetry = useCallback(() => {
    refetch();
  }, [refetch]);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Welcome back${user?.name ? `, ${user.name}` : ""}`}
      />

      {error && <ErrorRetryBanner error={error.message} onRetry={handleRetry} />}

      {isLoading ? (
        <StatsLoading />
      ) : (
        <div className={styles.statsRow}>
          <Stat label="Today's Reservations" value={stats.totalReservations} />
          <Stat label="Expected Covers" value={stats.expectedCovers} />
          <Stat label="Upcoming (2 hrs)" value={stats.upcomingCount} />
          <Stat
            label="Cancellation Rate"
            value={`${stats.cancellationRate}%`}
            delta={
              stats.cancellationTrend === "neutral"
                ? undefined
                : stats.cancellationTrend === "up"
                  ? "High"
                  : "Low"
            }
            trend={stats.cancellationTrend}
          />
        </div>
      )}

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
