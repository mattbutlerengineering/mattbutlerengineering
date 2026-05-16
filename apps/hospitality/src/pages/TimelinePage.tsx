import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@mbe/auth/react";
import { createApiClient } from "@mbe/api-client";
import { Drawer, Button, Stack, Text, Card } from "@mattbutlerengineering/rialto";
import type { Reservation, TableStatus, UpdateReservationRequest } from "@mbe/types";
import { TimelineGrid } from "../components/timeline";
import { CancelReservationDialog } from "../components/timeline/CancelReservationDialog";
import { EditReservationDrawer } from "../components/timeline/EditReservationDrawer";
import { WalkInDialog } from "../components/timeline/WalkInDialog";
import { useVenue } from "../contexts/VenueContext.js";
import { useReservationData } from "../contexts/ReservationDataContext.js";
import { PageHeader } from "../components/PageHeader";
import styles from "./TimelinePage.module.css";

const MOBILE_BREAKPOINT = "(max-width: 768px)";

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(MOBILE_BREAKPOINT).matches : false
  );

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_BREAKPOINT);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return isMobile;
}

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

interface ReservationDetailsProps {
  reservation: Reservation;
  onEdit: () => void;
  onSeat: () => void;
  onCancel: () => void;
}

function ReservationDetails({ reservation, onEdit, onSeat, onCancel }: ReservationDetailsProps) {
  return (
    <Stack gap="lg" className={styles.detailsStack}>
      <div>
        <Text variant="label" color="secondary">Guest</Text>
        <Text variant="display" as="div">
          {reservation.guestName || "Guest"}
        </Text>
      </div>

      {reservation.guestEmail && (
        <div>
          <Text variant="label" color="secondary">Email</Text>
          <Text variant="body" as="div">
            {reservation.guestEmail}
          </Text>
        </div>
      )}

      {reservation.guestPhone && (
        <div>
          <Text variant="label" color="secondary">Phone</Text>
          <Text variant="body" as="div">
            {reservation.guestPhone}
          </Text>
        </div>
      )}

      <div>
        <Text variant="label" color="secondary">Time</Text>
        <Text variant="body" as="div">
          {new Date(reservation.startTime).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          })}
          {" - "}
          {new Date(reservation.endTime).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          })}
        </Text>
      </div>

      <div>
        <Text variant="label" color="secondary">Party Size</Text>
        <Text variant="body" as="div">
          {reservation.partySize}{" "}
          {reservation.partySize === 1 ? "guest" : "guests"}
        </Text>
      </div>

      <div>
        <Text variant="label" color="secondary">Table</Text>
        <Text variant="body" as="div">
          {reservation.table?.tableNumber ||
            reservation.table?.name ||
            "Unassigned"}
        </Text>
      </div>

      <div>
        <Text variant="label" color="secondary">Status</Text>
        <Text
          className={`${styles.statusBadge} ${getStatusBadgeClass(reservation.status)}`}
        >
          {reservation.status}
        </Text>
      </div>

      {reservation.notes && (
        <div>
          <Text variant="label" color="secondary">Notes</Text>
          <Text variant="body" as="div" className={styles.notesValue}>{reservation.notes}</Text>
        </div>
      )}

      <Stack gap="sm" className={styles.actionsDivider}>
        <Button
          variant="primary"
          onClick={onEdit}
          className={styles.fullWidth}
        >
          Edit Reservation
        </Button>
        {reservation.status === "CONFIRMED" && (
          <Button
            variant="secondary"
            onClick={onSeat}
            className={styles.fullWidth}
          >
            Seat Guest
          </Button>
        )}
        {reservation.status !== "CANCELLED" && (
          <Button
            variant="ghost"
            onClick={onCancel}
            className={styles.fullWidth}
          >
            Cancel Reservation
          </Button>
        )}
      </Stack>
    </Stack>
  );
}

export function TimelinePage() {
  const { accessToken } = useAuth();
  const { selectedVenueId } = useVenue();
  const {
    reservations: sharedReservations,
    tables,
    isConnected,
    setReservations: setSharedReservations,
    setTables,
    addReservation,
    updateReservation,
  } = useReservationData();

  const [searchParams, setSearchParams] = useSearchParams();
  const todayStr = useMemo(() => new Date().toLocaleDateString("en-CA"), []);
  const selectedDate = searchParams.get("date") ?? todayStr;
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showEditDrawer, setShowEditDrawer] = useState(false);
  const [showWalkInDialog, setShowWalkInDialog] = useState(false);
  const isMobile = useIsMobile();

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: import.meta.env.VITE_API_URL ?? "",
        getAccessToken: () => accessToken,
      }),
    [accessToken]
  );

  // Table updates and hold confirmations are now handled by the shared
  // ReservationDataContext — no separate useReservationEvents needed.

  // Filter shared reservations to the selected date
  const reservations = useMemo(
    () => sharedReservations.filter((r) => r.date === selectedDate),
    [sharedReservations, selectedDate]
  );

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
        setSharedReservations(reservationsResponse.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [api, selectedVenueId, selectedDate, setSharedReservations]);

  const handlePreviousDay = useCallback(() => {
    const prev = new Date(selectedDate + "T00:00:00");
    prev.setDate(prev.getDate() - 1);
    const newDate = prev.toLocaleDateString("en-CA");
    setSearchParams((p) => {
      const next = new URLSearchParams(p);
      next.set("date", newDate);
      return next;
    });
  }, [selectedDate, setSearchParams]);

  const handleNextDay = useCallback(() => {
    const next = new Date(selectedDate + "T00:00:00");
    next.setDate(next.getDate() + 1);
    const newDate = next.toLocaleDateString("en-CA");
    setSearchParams((p) => {
      const params = new URLSearchParams(p);
      params.set("date", newDate);
      return params;
    });
  }, [selectedDate, setSearchParams]);

  const handleToday = useCallback(() => {
    setSearchParams((p) => {
      const next = new URLSearchParams(p);
      next.set("date", new Date().toLocaleDateString("en-CA"));
      return next;
    });
  }, [setSearchParams]);

  const handleReservationClick = useCallback((reservation: Reservation) => {
    setSelectedReservation(reservation);
  }, []);

  const handleSeat = async (reservation: Reservation) => {
    try {
      const updated = await api.reservations.update(reservation.id, { status: "CONFIRMED" });
      await api.tables.updateStatus(reservation.tableId, "OCCUPIED");
      updateReservation(updated);
      setTables((prev) =>
        prev.map((t) =>
          t.id === reservation.tableId ? { ...t, status: "OCCUPIED" as const } : t
        )
      );
      setSelectedReservation(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to seat guest");
    }
  };

  const handleCancel = async (reason: string, note: string) => {
    if (!selectedReservation) return;
    try {
      await api.reservations.cancelWithReason(selectedReservation.id, {
        cancellationReason: reason,
        cancellationNote: note,
      });
      updateReservation({ ...selectedReservation, status: "CANCELLED" as const });
      setShowCancelDialog(false);
      setSelectedReservation(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel reservation");
    }
  };

  const handleEdit = async (id: string, data: UpdateReservationRequest) => {
    try {
      const updated = await api.reservations.update(id, data);
      updateReservation(updated);
      setSelectedReservation(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update reservation");
    }
  };

  const handleWalkIn = async (data: {
    partySize: number;
    tableId: string;
    venueId: string;
    guestName?: string;
  }) => {
    try {
      const reservation = await api.reservations.walkIn(data);
      addReservation(reservation);
      setTables((prev) =>
        prev.map((t) => (t.id === data.tableId ? { ...t, status: "OCCUPIED" as const } : t))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create walk-in");
    }
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

  const isToday = selectedDate === todayStr;

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
          <PageHeader title="Timeline" description="Real-time reservation view" />
        </div>

        {/* Date navigation */}
        <div className={styles.dateNav}>
          <div className={styles.dateNavLeft}>
            <Button
              variant="ghost"
              size="sm"
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
            </Button>
            <div className={styles.dateLabel}>{formattedDate}</div>
            <Button
              variant="ghost"
              size="sm"
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
            </Button>
            {!isToday && (
              <Button variant="secondary" size="sm" onClick={handleToday} className={styles.todayButton}>
                Today
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowWalkInDialog(true)}
              className={styles.walkInButton}
            >
              Walk-in
            </Button>
          </div>

          {/* Stats */}
          <div className={styles.statsRow}>
            {/* Live indicator */}
            <div className={styles.liveIndicator}>
              <Text
                className={`${styles.liveDot} ${isConnected ? styles.liveDotConnected : styles.liveDotOffline}`}
              />
              <Text className={isConnected ? styles.liveTextConnected : styles.liveTextOffline}>
                {isConnected ? "Live" : "Offline"}
              </Text>
            </div>
            <div className={styles.statItem}>
              Reservations:{" "}
              <Text className={styles.statValue}>{stats.total}</Text>
            </div>
            <div className={styles.statItem}>
              Covers:{" "}
              <Text className={styles.statValue}>{stats.totalCovers}</Text>
            </div>
            <div>
              <Text className={styles.statConfirmed}>{stats.confirmed}</Text>
              <Text className={styles.statItem}> confirmed</Text>
            </div>
            {stats.pending > 0 && (
              <div>
                <Text className={styles.statPending}>{stats.pending}</Text>
                <Text className={styles.statItem}> pending</Text>
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
            <div className={styles.loadingWrapper} aria-busy="true">
              <div className={styles.spinner} aria-label="Loading" role="status" />
            </div>
          ) : error ? (
            <div className={styles.errorBox} role="alert">{error}</div>
          ) : tables.length === 0 ? (
            <div className={styles.emptyState}>
              <Text className={styles.emptyStateText}>No tables configured for this venue.</Text>
              <Text className={styles.emptyStateHint}>Add tables in the Floor Plans section.</Text>
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

        {/* Sidebar - Reservation details (hidden on mobile via CSS) */}
        {selectedReservation && (
          <Card className={styles.sidebar} variant="elevated">
            <div className={styles.sidebarHeader}>
              <Text variant="display" as="h2" className={styles.sidebarTitle}>Reservation Details</Text>
              <Button
                variant="ghost"
                size="sm"
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
              </Button>
            </div>

            <ReservationDetails
              reservation={selectedReservation}
              onEdit={() => setShowEditDrawer(true)}
              onSeat={() => handleSeat(selectedReservation)}
              onCancel={() => setShowCancelDialog(true)}
            />
          </Card>
        )}
      </div>

      {/* Mobile drawer for reservation details */}
      {isMobile && (
        <Drawer
          side="right"
          size="default"
          open={!!selectedReservation}
          onClose={() => setSelectedReservation(null)}
          title="Reservation Details"
        >
          {selectedReservation && (
            <ReservationDetails
              reservation={selectedReservation}
              onEdit={() => setShowEditDrawer(true)}
              onSeat={() => handleSeat(selectedReservation)}
              onCancel={() => setShowCancelDialog(true)}
            />
          )}
        </Drawer>
      )}

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
