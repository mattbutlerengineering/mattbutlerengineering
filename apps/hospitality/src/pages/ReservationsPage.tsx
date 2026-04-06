import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@mbe/auth/react";
import { createApiClient } from "@mbe/api-client";
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Input,
  SegmentedControl,
  Skeleton,
  SkeletonGroup,
  Stat,
  Text,
} from "@mbe/rialto";
import type { ReservationStatus } from "@mbe/types";
import { useVenue } from "../contexts/VenueContext.js";
import { useReservationData } from "../contexts/ReservationDataContext.js";
import { PageHeader } from "../components/PageHeader";
import styles from "./ReservationsPage.module.css";

/* ── Status → Badge mapping ────────────────── */

const STATUS_BADGE_VARIANT: Record<ReservationStatus, "warning" | "success" | "error" | "neutral"> =
  {
    PENDING: "warning",
    CONFIRMED: "success",
    CANCELLED: "error",
    COMPLETED: "neutral",
    NO_SHOW: "error",
  };

const STATUS_LABEL: Record<ReservationStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
  NO_SHOW: "No Show",
};

/* ── Status filter segments ────────────────── */

const STATUS_SEGMENTS = [
  { id: "all", label: "All" },
  { id: "CONFIRMED", label: "Confirmed" },
  { id: "PENDING", label: "Pending" },
  { id: "CANCELLED", label: "Cancelled" },
] as const;

/* ── Loading skeleton ───────────────────────── */

function ReservationsLoadingSkeleton() {
  return (
    <div className={styles.container}>
      <PageHeader title="Reservations" description="View and manage reservations" />
      <SkeletonGroup>
        <Skeleton variant="card" width="100%" height={300} />
      </SkeletonGroup>
    </div>
  );
}

/* ── Relative time formatter ────────────────── */

function formatRelativeTime(date: Date): string {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

/* ── Main component ─────────────────────────── */

export function ReservationsPage() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const { selectedVenueId } = useVenue();
  const {
    reservations: sharedReservations,
    isConnected,
    setReservations: setSharedReservations,
  } = useReservationData();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedDate = searchParams.get("date") ?? new Date().toLocaleDateString("en-CA");
  const statusFilter = searchParams.get("status") ?? "all";
  const [searchQuery, setSearchQuery] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [lastUpdatedDisplay, setLastUpdatedDisplay] = useState("");

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: import.meta.env.VITE_API_URL ?? "",
        getAccessToken: () => accessToken,
      }),
    [accessToken]
  );

  /* Keep the "Updated Xs ago" display current */
  const lastUpdatedRef = useRef(lastUpdated);
  lastUpdatedRef.current = lastUpdated;

  useEffect(() => {
    if (!lastUpdated) return;
    setLastUpdatedDisplay(formatRelativeTime(lastUpdated));
    const id = setInterval(() => {
      if (lastUpdatedRef.current) {
        setLastUpdatedDisplay(formatRelativeTime(lastUpdatedRef.current));
      }
    }, 5_000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  // Filter shared reservations to the selected date
  const reservations = useMemo(
    () => sharedReservations.filter((r) => r.date === selectedDate),
    [sharedReservations, selectedDate]
  );

  const stats = useMemo(() => {
    const confirmed = reservations.filter((r) => r.status === "CONFIRMED").length;
    const pending = reservations.filter((r) => r.status === "PENDING").length;
    const cancelled = reservations.filter((r) => r.status === "CANCELLED").length;
    return { total: reservations.length, confirmed, pending, cancelled };
  }, [reservations]);

  const filteredReservations = useMemo(() => {
    let result = reservations;
    if (statusFilter !== "all") {
      result = result.filter((r) => r.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (r) =>
          (r.guestName ?? "").toLowerCase().includes(q) ||
          (r.guestEmail ?? "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [reservations, statusFilter, searchQuery]);

  /* ── Fetch reservations when filters change ── */

  useEffect(() => {
    async function fetchReservations() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await api.reservations.list({
          date: selectedDate,
          venueId: selectedVenueId ?? undefined,
          limit: 50,
        });

        setSharedReservations(response.data);
        setLastUpdated(new Date());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load reservations");
      } finally {
        setIsLoading(false);
      }
    }

    fetchReservations();
  }, [api, selectedDate, selectedVenueId, setSharedReservations]);

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading && reservations.length === 0) {
    return <ReservationsLoadingSkeleton />;
  }

  return (
    <div className={styles.container}>
      <PageHeader title="Reservations" description="View and manage reservations" />

      <div className={styles.statusBar}>
        <div className={styles.liveIndicator}>
          <span
            className={`${styles.liveDot} ${isConnected ? styles.liveDotConnected : styles.liveDotOffline}`}
          />
          <span className={isConnected ? styles.liveTextConnected : styles.liveTextOffline}>
            {isConnected ? "Live" : "Offline"}
          </span>
        </div>
        {lastUpdatedDisplay && (
          <Text variant="caption" color="secondary">
            Updated {lastUpdatedDisplay}
          </Text>
        )}
      </div>

      <div className={styles.statsRow} aria-live="polite" role="status">
        <Stat label="Total" value={stats.total} size="sm" />
        <Stat label="Confirmed" value={stats.confirmed} size="sm" />
        <Stat label="Pending" value={stats.pending} size="sm" />
        <Stat label="Cancelled" value={stats.cancelled} size="sm" />
      </div>

      <div className={styles.toolbar}>
        <SegmentedControl
          segments={[...STATUS_SEGMENTS]}
          value={statusFilter}
          onChange={(value) => {
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.set("status", value);
              return next;
            });
          }}
          size="sm"
        />
        <Input
          placeholder="Search by guest name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <Input
          type="date"
          value={selectedDate}
          onChange={(e) => {
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.set("date", e.target.value);
              return next;
            });
          }}
        />
      </div>

      {error && (
        <Alert variant="error" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <span className={styles.srOnly} aria-live="polite" role="status">
        {`${filteredReservations.length} reservation${filteredReservations.length !== 1 ? "s" : ""} shown`}
      </span>

      {!isLoading && !error && filteredReservations.length === 0 && (
        <div aria-live="polite" role="status">
          <EmptyState
            heading="No reservations"
            description={
              searchQuery.trim()
                ? `No reservations matching '${searchQuery.trim()}'.`
                : statusFilter === "all"
                  ? `No reservations found for ${selectedDate}.`
                  : `No ${statusFilter.toLowerCase()} reservations found for ${selectedDate}.`
            }
          />
        </div>
      )}

      {!isLoading && !error && filteredReservations.length > 0 && (
        <Card>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead className={styles.thead}>
                <tr>
                  <th className={styles.th}>Time</th>
                  <th className={styles.th}>Guest</th>
                  <th className={styles.th}>Party Size</th>
                  <th className={styles.th}>Table</th>
                  <th className={styles.th}>Status</th>
                  <th className={styles.th}>Notes</th>
                </tr>
              </thead>
              <tbody className={styles.tbody}>
                {filteredReservations.map((reservation) => (
                  <tr
                    key={reservation.id}
                    onClick={() => navigate(`/timeline?date=${reservation.date}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/timeline?date=${reservation.date}`);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`View ${reservation.guestName ?? "Guest"} reservation on timeline`}
                    style={{ cursor: "pointer" }}
                  >
                    <td className={styles.td}>
                      {formatTime(reservation.startTime)} - {formatTime(reservation.endTime)}
                    </td>
                    <td className={styles.td}>
                      <Text variant="body" color="primary" className={styles.guestName}>
                        {reservation.guestName ?? "Guest"}
                      </Text>
                      {reservation.guestEmail && (
                        <Text variant="caption" color="secondary">
                          {reservation.guestEmail}
                        </Text>
                      )}
                    </td>
                    <td className={styles.td}>{reservation.partySize}</td>
                    <td className={styles.td}>
                      {reservation.table?.name ?? reservation.tableId}
                    </td>
                    <td className={styles.td}>
                      <Badge variant={STATUS_BADGE_VARIANT[reservation.status]}>
                        {STATUS_LABEL[reservation.status]}
                      </Badge>
                    </td>
                    <td className={styles.tdMuted}>{reservation.notes ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
