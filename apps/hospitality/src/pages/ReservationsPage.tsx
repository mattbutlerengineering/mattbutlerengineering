import { useState, useReducer, useEffect } from "react";
import { useNavigate } from "react-router";
import { z } from "zod";
import type { CreateReservationRequest } from "@mbe/types";
import { useUrlParams } from "../hooks/use-url-params.js";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  SegmentedControl,
  Skeleton,
  SkeletonGroup,
  Stat,
  Text,
} from "@mattbutlerengineering/rialto";
import { useVenue } from "../contexts/VenueContext.js";
import { useReservationDisplay } from "../hooks/useReservationDisplay.js";
import { useTables } from "../hooks/useTables.js";
import { useCreateReservation } from "../hooks/useReservations.js";
import { NewReservationDialog } from "../components/reservations/NewReservationDialog.js";
import {
  STATUS_BADGE_VARIANT,
  STATUS_LABEL,
  formatReservationTime,
} from "../utils/reservation-display.js";
import { ordinalVisit } from "../utils/ordinal.js";
import { PageHeader } from "../components/PageHeader";
import styles from "./ReservationsPage.module.css";

/* ── URL filter schema ──────────────────────── */

const reservationsFilterSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .default(new Date().toLocaleDateString("en-CA")),
  status: z.enum(["all", "CONFIRMED", "PENDING", "CANCELLED"]).default("all"),
});

const RESERVATIONS_DEFAULTS = reservationsFilterSchema.parse({});

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
  const { params, setParam } = useUrlParams(reservationsFilterSchema, RESERVATIONS_DEFAULTS);
  const selectedDate = params.date;
  const statusFilter = params.status;
  const [searchQuery, setSearchQuery] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showNewReservationDialog, setShowNewReservationDialog] = useState(false);

  const {
    data,
    stats,
    filteredData: filteredReservations,
    isLoading,
    error: queryError,
  } = useReservationDisplay({
    date: selectedDate,
    venueId: selectedVenueId ?? undefined,
    statusFilter,
    searchQuery,
  });

  const { data: tables } = useTables({
    venueId: selectedVenueId ?? undefined,
    limit: 100,
    enabled: !!selectedVenueId,
  });
  const { mutateAsync: createReservation } = useCreateReservation();

  const error = queryError?.message ?? null;

  const handleCreateReservation = async (reservationData: CreateReservationRequest) => {
    await createReservation(reservationData);
    setShowNewReservationDialog(false);
  };

  /* Keep the "Updated Xs ago" display current by forcing re-render every 5s */
  const [, forceDisplayTick] = useReducer((c: number) => c + 1, 0);

  useEffect(() => {
    if (!data) return;
    setLastUpdated(new Date());
  }, [data]);

  useEffect(() => {
    if (!lastUpdated) return;
    const id = setInterval(forceDisplayTick, 5_000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  const lastUpdatedDisplay = lastUpdated ? formatRelativeTime(lastUpdated) : "";

  if (isLoading && (data === undefined || data.length === 0)) {
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
            setParam("status", value as typeof params.status);
          }}
          size="sm"
        />
        <Input
          aria-label="Search by guest name"
          placeholder="Search by guest name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <Input
          aria-label="Filter by date"
          type="date"
          value={selectedDate}
          onChange={(e) => {
            setParam("date", e.target.value);
          }}
        />
        <Button
          variant="primary"
          size="sm"
          onClick={() => setShowNewReservationDialog(true)}
          disabled={!selectedVenueId}
        >
          New reservation
        </Button>
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
                      {formatReservationTime(reservation.startTime)} -{" "}
                      {formatReservationTime(reservation.endTime)}
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

      {showNewReservationDialog && selectedVenueId && (
        <NewReservationDialog
          tables={tables ?? []}
          venueId={selectedVenueId}
          defaultDate={selectedDate}
          onConfirm={handleCreateReservation}
          onClose={() => setShowNewReservationDialog(false)}
        />
      )}
    </div>
  );
}
