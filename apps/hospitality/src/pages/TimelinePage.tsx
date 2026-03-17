import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@mbe/auth/react";
import { createApiClient } from "@mbe/api-client";
import type { Reservation, Table, Venue, TableStatus, UpdateReservationRequest } from "@mbe/types";
import { TimelineGrid } from "../components/timeline";
import { CancelReservationDialog } from "../components/timeline/CancelReservationDialog";
import { EditReservationDrawer } from "../components/timeline/EditReservationDrawer";
import { WalkInDialog } from "../components/timeline/WalkInDialog";
import { useReservationEvents } from "../hooks/useReservationEvents";
import styles from "./TimelinePage.module.css";

function getStatusBadgeClass(status: Reservation["status"]): string {
  switch (status) {
    case "CONFIRMED":
      return styles.statusConfirmed;
    case "PENDING":
      return styles.statusPending;
    case "COMPLETED":
      return styles.statusCompleted;
    case "CANCELLED":
      return styles.statusCancelled;
    default:
      return styles.statusNoShow;
  }
}

export function TimelinePage() {
  const { accessToken } = useAuth();

  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showEditDrawer, setShowEditDrawer] = useState(false);
  const [showWalkInDialog, setShowWalkInDialog] = useState(false);

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: import.meta.env.VITE_API_URL ?? "",
        getAccessToken: () => accessToken,
      }),
    [accessToken]
  );

  // Real-time updates via SSE
  const { isConnected } = useReservationEvents({
    venueId: selectedVenueId ?? undefined,
    enabled: !!selectedVenueId,
    onReservationCreated: useCallback(
      (reservation: Reservation) => {
        // Only add if it matches our current date
        if (reservation.date === selectedDate) {
          setReservations((prev) => [...prev, reservation]);
        }
      },
      [selectedDate]
    ),
    onReservationUpdated: useCallback((reservation: Reservation) => {
      setReservations((prev) =>
        prev.map((r) => (r.id === reservation.id ? reservation : r))
      );
    }, []),
    onReservationCancelled: useCallback((reservation: Reservation) => {
      setReservations((prev) =>
        prev.map((r) => (r.id === reservation.id ? reservation : r))
      );
    }, []),
    onHoldConfirmed: useCallback(
      (reservation: Reservation) => {
        if (reservation.date === selectedDate) {
          setReservations((prev) => [...prev, reservation]);
        }
      },
      [selectedDate]
    ),
    onTableUpdated: useCallback((table: Table) => {
      setTables((prev) => prev.map((t) => (t.id === table.id ? table : t)));
    }, []),
  });

  // Fetch venues on mount
  useEffect(() => {
    async function fetchVenues() {
      try {
        const response = await api.venues.list({ limit: 50 });
        setVenues(response.data);
        if (response.data.length > 0) {
          setSelectedVenueId(response.data[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load venues");
      }
    }
    fetchVenues();
  }, [api]);

  // Fetch tables and reservations when venue or date changes
  useEffect(() => {
    if (!selectedVenueId) return;

    async function fetchData() {
      setIsLoading(true);
      setError(null);

      try {
        const [tablesResponse, reservationsResponse] = await Promise.all([
          api.tables.list({ venueId: selectedVenueId!, limit: 100 }),
          api.reservations.list({
            venueId: selectedVenueId!,
            date: selectedDate,
            limit: 200,
          }),
        ]);

        // Sort tables by priority, then by name
        const sortedTables = tablesResponse.data.sort((a, b) => {
          if (a.priority !== b.priority) return b.priority - a.priority;
          return (a.tableNumber || a.name).localeCompare(b.tableNumber || b.name);
        });

        setTables(sortedTables);
        setReservations(reservationsResponse.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [api, selectedVenueId, selectedDate]);

  const handlePreviousDay = useCallback(() => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() - 1);
    setSelectedDate(date.toISOString().split("T")[0]);
  }, [selectedDate]);

  const handleNextDay = useCallback(() => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + 1);
    setSelectedDate(date.toISOString().split("T")[0]);
  }, [selectedDate]);

  const handleToday = useCallback(() => {
    setSelectedDate(new Date().toISOString().split("T")[0]);
  }, []);

  const handleReservationClick = useCallback((reservation: Reservation) => {
    setSelectedReservation(reservation);
  }, []);

  const handleSeat = async (reservation: Reservation) => {
    const updated = await api.reservations.update(reservation.id, { status: "CONFIRMED" });
    await api.tables.updateStatus(reservation.tableId, "OCCUPIED");
    setReservations((prev) => prev.map((r) => (r.id === reservation.id ? updated : r)));
    setTables((prev) =>
      prev.map((t) => (t.id === reservation.tableId ? { ...t, status: "OCCUPIED" as const } : t))
    );
    setSelectedReservation(null);
  };

  const handleCancel = async (reason: string, note: string) => {
    if (!selectedReservation) return;
    await api.reservations.cancelWithReason(selectedReservation.id, {
      cancellationReason: reason,
      cancellationNote: note,
    });
    setReservations((prev) =>
      prev.map((r) =>
        r.id === selectedReservation.id ? { ...r, status: "CANCELLED" as const } : r
      )
    );
    setShowCancelDialog(false);
    setSelectedReservation(null);
  };

  const handleEdit = async (id: string, data: UpdateReservationRequest) => {
    const updated = await api.reservations.update(id, data);
    setReservations((prev) => prev.map((r) => (r.id === id ? updated : r)));
    setSelectedReservation(updated);
  };

  const handleWalkIn = async (data: {
    partySize: number;
    tableId: string;
    venueId: string;
    guestName?: string;
  }) => {
    const reservation = await api.reservations.walkIn(data);
    setReservations((prev) => [...prev, reservation]);
    setTables((prev) =>
      prev.map((t) => (t.id === data.tableId ? { ...t, status: "OCCUPIED" as const } : t))
    );
  };

  const handleTableStatusChange = async (tableId: string, status: TableStatus) => {
    await api.tables.updateStatus(tableId, status);
    setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, status } : t)));
  };

  // Format date for display
  const formattedDate = new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const isToday = selectedDate === new Date().toISOString().split("T")[0];

  // Stats
  const stats = useMemo(() => {
    const confirmed = reservations.filter((r) => r.status === "CONFIRMED").length;
    const pending = reservations.filter((r) => r.status === "PENDING").length;
    const totalCovers = reservations
      .filter((r) => r.status !== "CANCELLED" && r.status !== "NO_SHOW")
      .reduce((sum, r) => sum + r.partySize, 0);
    return { confirmed, pending, totalCovers, total: reservations.length };
  }, [reservations]);

  return (
    <div className={styles.root}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <h1 className={styles.title}>Timeline</h1>

          {/* Venue selector */}
          {venues.length > 1 && (
            <select
              value={selectedVenueId ?? ""}
              onChange={(e) => setSelectedVenueId(e.target.value)}
              className={styles.venueSelect}
            >
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Date navigation */}
        <div className={styles.dateNav}>
          <div className={styles.dateNavLeft}>
            <button
              onClick={handlePreviousDay}
              className={styles.navButton}
              aria-label="Previous day"
            >
              <svg
                className={styles.navIcon}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <div className={styles.dateLabel}>{formattedDate}</div>
            <button
              onClick={handleNextDay}
              className={styles.navButton}
              aria-label="Next day"
            >
              <svg
                className={styles.navIcon}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
            {!isToday && (
              <button onClick={handleToday} className={styles.todayButton}>
                Today
              </button>
            )}
            <button
              onClick={() => setShowWalkInDialog(true)}
              className={styles.walkInButton}
            >
              Walk-in
            </button>
          </div>

          {/* Stats */}
          <div className={styles.statsRow}>
            {/* Live indicator */}
            <div className={styles.liveIndicator}>
              <span
                className={`${styles.liveDot} ${isConnected ? styles.liveDotConnected : styles.liveDotOffline}`}
              />
              <span className={isConnected ? styles.liveTextConnected : styles.liveTextOffline}>
                {isConnected ? "Live" : "Offline"}
              </span>
            </div>
            <div className={styles.statItem}>
              Reservations:{" "}
              <span className={styles.statValue}>{stats.total}</span>
            </div>
            <div className={styles.statItem}>
              Covers:{" "}
              <span className={styles.statValue}>{stats.totalCovers}</span>
            </div>
            <div>
              <span className={styles.statConfirmed}>{stats.confirmed}</span>
              <span className={styles.statItem}> confirmed</span>
            </div>
            {stats.pending > 0 && (
              <div>
                <span className={styles.statPending}>{stats.pending}</span>
                <span className={styles.statItem}> pending</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className={styles.content}>
        {/* Timeline */}
        <div className={styles.timelineArea}>
          {isLoading ? (
            <div className={styles.loadingWrapper}>
              <div className={styles.spinner} />
            </div>
          ) : error ? (
            <div className={styles.errorBox}>{error}</div>
          ) : tables.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyStateText}>No tables configured for this venue.</p>
              <p className={styles.emptyStateHint}>Add tables in the Floor Plans section.</p>
            </div>
          ) : (
            <TimelineGrid
              tables={tables}
              reservations={reservations}
              date={selectedDate}
              onReservationClick={handleReservationClick}
              selectedReservationId={selectedReservation?.id}
              onTableStatusChange={handleTableStatusChange}
            />
          )}
        </div>

        {/* Sidebar - Reservation details */}
        {selectedReservation && (
          <div className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
              <h2 className={styles.sidebarTitle}>Reservation Details</h2>
              <button
                onClick={() => setSelectedReservation(null)}
                className={styles.closeButton}
                aria-label="Close reservation details"
              >
                <svg
                  className={styles.closeIcon}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className={styles.detailsStack}>
              <div>
                <span className={styles.detailLabel}>Guest</span>
                <div className={styles.detailValue}>
                  {selectedReservation.guestName || "Guest"}
                </div>
              </div>

              {selectedReservation.guestEmail && (
                <div>
                  <span className={styles.detailLabel}>Email</span>
                  <div className={styles.detailValueSecondary}>
                    {selectedReservation.guestEmail}
                  </div>
                </div>
              )}

              {selectedReservation.guestPhone && (
                <div>
                  <span className={styles.detailLabel}>Phone</span>
                  <div className={styles.detailValueSecondary}>
                    {selectedReservation.guestPhone}
                  </div>
                </div>
              )}

              <div>
                <span className={styles.detailLabel}>Time</span>
                <div className={styles.detailValue}>
                  {new Date(selectedReservation.startTime).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })}
                  {" - "}
                  {new Date(selectedReservation.endTime).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </div>
              </div>

              <div>
                <span className={styles.detailLabel}>Party Size</span>
                <div className={styles.detailValue}>
                  {selectedReservation.partySize}{" "}
                  {selectedReservation.partySize === 1 ? "guest" : "guests"}
                </div>
              </div>

              <div>
                <span className={styles.detailLabel}>Table</span>
                <div className={styles.detailValue}>
                  {selectedReservation.table?.tableNumber ||
                    selectedReservation.table?.name ||
                    "Unassigned"}
                </div>
              </div>

              <div>
                <span className={styles.detailLabel}>Status</span>
                <span
                  className={`${styles.statusBadge} ${getStatusBadgeClass(selectedReservation.status)}`}
                >
                  {selectedReservation.status}
                </span>
              </div>

              {selectedReservation.notes && (
                <div>
                  <span className={styles.detailLabel}>Notes</span>
                  <div className={styles.notesValue}>{selectedReservation.notes}</div>
                </div>
              )}

              <div className={styles.actionsDivider}>
                <button
                  className={styles.actionButtonPrimary}
                  onClick={() => setShowEditDrawer(true)}
                >
                  Edit Reservation
                </button>
                {selectedReservation.status === "CONFIRMED" && (
                  <button
                    className={styles.actionButtonSeat}
                    onClick={() => handleSeat(selectedReservation)}
                  >
                    Seat Guest
                  </button>
                )}
                {selectedReservation.status !== "CANCELLED" && (
                  <button
                    className={styles.actionButtonCancel}
                    onClick={() => setShowCancelDialog(true)}
                  >
                    Cancel Reservation
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      {showCancelDialog && selectedReservation && (
        <CancelReservationDialog
          reservationId={selectedReservation.id}
          guestName={selectedReservation.guestName}
          onConfirm={handleCancel}
          onClose={() => setShowCancelDialog(false)}
        />
      )}
      {showEditDrawer && selectedReservation && (
        <EditReservationDrawer
          reservation={selectedReservation}
          tables={tables}
          onSave={handleEdit}
          onClose={() => setShowEditDrawer(false)}
        />
      )}
      {showWalkInDialog && selectedVenueId && (
        <WalkInDialog
          tables={tables}
          venueId={selectedVenueId}
          onConfirm={handleWalkIn}
          onClose={() => setShowWalkInDialog(false)}
        />
      )}
    </div>
  );
}
