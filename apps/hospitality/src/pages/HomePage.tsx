import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@mbe/auth/react";
import { Stat, Button, Skeleton } from "@mattbutlerengineering/rialto";
import { PageHeader } from "../components/PageHeader";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner";
import { ReservationList, ActivityFeed } from "../components/dashboard";
import { useVenue } from "../contexts/VenueContext.js";
import { useDashboardStats } from "../hooks/useDashboardStats";
import { useReservationEvents, type ReservationEvent } from "../hooks/useReservationEvents";
import styles from "./HomePage.module.css";

const MAX_FEED_ITEMS = 5;

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
  const { selectedVenueId } = useVenue();
  const { reservations, stats, isLoading, error, refetch } = useDashboardStats();
  const [feedEvents, setFeedEvents] = useState<readonly ReservationEvent[]>([]);

  const handleEvent = useCallback((event: ReservationEvent) => {
    setFeedEvents((prev) => [event, ...prev].slice(0, MAX_FEED_ITEMS));
  }, []);

  const { isConnected } = useReservationEvents({
    venueId: selectedVenueId ?? undefined,
    onReservationCreated: (data) =>
      handleEvent({
        type: "reservation:created",
        venueId: "",
        timestamp: new Date().toISOString(),
        data,
      }),
    onReservationUpdated: (data) =>
      handleEvent({
        type: "reservation:updated",
        venueId: "",
        timestamp: new Date().toISOString(),
        data,
      }),
    onReservationCancelled: (data) =>
      handleEvent({
        type: "reservation:cancelled",
        venueId: "",
        timestamp: new Date().toISOString(),
        data,
      }),
    onTableUpdated: (data) =>
      handleEvent({
        type: "table:updated",
        venueId: "",
        timestamp: new Date().toISOString(),
        data,
      }),
  });

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Welcome back${user?.name ? `, ${user.name}` : ""}`}
      />

      {error && <ErrorRetryBanner error={error} onRetry={refetch} />}

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
