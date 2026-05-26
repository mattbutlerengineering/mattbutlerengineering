import { useState, useMemo, useReducer, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
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
} from "@mattbutlerengineering/rialto";
import type { ReservationStatus } from "@mbe/types";
import { useVenue } from "../contexts/VenueContext.js";
import { useReservations } from "../hooks/useReservations.js";
import { ordinalVisit } from "../utils/ordinal.js";
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
  const { selectedVenueId } = useVenue();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedDate = searchParams.get("date") ?? new Date().toLocaleDateString("en-CA");
  const statusFilter = searchParams.get("status") ?? "all";
  const [searchQuery, setSearchQuery] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const {
    data: reservations,
    isLoading,
    error: queryError,
  } = useReservations({
    date: selectedDate,
    venueId: selectedVenueId ?? undefined,
    limit: 50,
  });

  const error = queryError?.message ?? null;

  /* Keep the "Updated Xs ago" display current by forcing re-render every 5s */
  const [, forceDisplayTick] = useReducer((c: number) => c + 1, 0);

  useEffect(() => {
    if (!reservations) return;
    setLastUpdated(new Date());
  }, [reservations]);

  useEffect(() => {
    if (!lastUpdated) return;
    const id = setInterval(forceDisplayTick, 5_000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  const lastUpdatedDisplay = lastUpdated ? formatRelativeTime(lastUpdated) : "";

  const displayReservations = reservations ?? [];

  const stats = useMemo(() => {
    const confirmed = displayReservations.filter((r) => r.status === "CONFIRMED").length;
    const pending = displayReservations.filter((r) => r.status === "PENDING").length;
    const cancelled = displayReservations.filter((r) => r.status === "CANCELLED").length;
    return { total: displayReservations.length, confirmed, pending, cancelled };
  }, [displayReservations]);

  const filteredReservations = useMemo(() => {
    let result = displayReservations;
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
  }, [displayReservations, statusFilter, searchQuery]);

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading && displayReservations.length === 0) {
    return <ReservationsLoadingSkeleton />;
  }

  return (
    <div className={styles.container}>
      <PageHeader title="Reservations" description="View and manage reservations" />

      {lastUpdatedDisplay && (
        <div className={styles.statusBar}>
          <Text variant="caption" color="secondary">
            Updated {lastUpdatedDisplay}
          </Text>
        </div>
      )}

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
        <div style={{ marginBlock: "var(--rialto-space-md)" }}>
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      <Text className={styles.srOnly} aria-live="polite" role="status">
        {`${filteredReservations.length} reservation${
          filteredReservations.length !== 1 ? "s" : ""
        } shown`}
      </Text>

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
            {/* eslint-disable mbe-local/prefer-rialto-components -- HTML table elements are correct here; Rialto Table has a different API */}
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
                      {reservation.guest && reservation.guest.visitCount > 1 && (
                        <Badge variant="accent" size="sm">
                          {ordinalVisit(reservation.guest.visitCount)}
                        </Badge>
                      )}
                    </td>
                    <td className={styles.td}>{reservation.partySize}</td>
                    <td className={styles.td}>{reservation.table?.name ?? reservation.tableId}</td>
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
            {/* eslint-enable mbe-local/prefer-rialto-components */}
          </div>
        </Card>
      )}
    </div>
  );
}
