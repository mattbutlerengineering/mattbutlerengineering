import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@mbe/auth/react";
import { createApiClient } from "@mbe/api-client";
import { Drawer, Button, Badge, DataList, Stack, Heading, Text, Divider, Alert, EmptyState } from "@mattbutlerengineering/rialto";
import type { Reservation, Table, TableStatus, UpdateReservationRequest } from "@mbe/types";
import { TimelineGrid } from "../components/timeline";
import { CancelReservationDialog } from "../components/timeline/CancelReservationDialog";
import { EditReservationDrawer } from "../components/timeline/EditReservationDrawer";
import { WalkInDialog } from "../components/timeline/WalkInDialog";
import { useReservationEvents } from "../hooks/useReservationEvents";
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

interface ReservationDetailsProps {
  reservation: Reservation;
  onEdit: () => void;
  onSeat: () => void;
  onCancel: () => void;
}

function ReservationDetails({ reservation, onEdit, onSeat, onCancel }: ReservationDetailsProps) {
  const detailItems = [
    { label: "Guest", value: reservation.guestName || "Guest" },
    { label: "Email", value: reservation.guestEmail ?? "Not provided" },
    { label: "Phone", value: reservation.guestPhone ?? "Not provided" },
    {
      label: "Time",
      value: `${new Date(reservation.startTime).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })} - ${new Date(reservation.endTime).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })}`,
    },
    { label: "Party Size", value: `${reservation.partySize} ${reservation.partySize === 1 ? "guest" : "guests"}` },
    {
      label: "Table",
      value: reservation.table?.tableNumber || reservation.table?.name || "Unassigned",
    },
    {
      label: "Status",
      value: (
        <Badge
          color={
            reservation.status === "CONFIRMED"
              ? "success"
              : reservation.status === "PENDING"
                ? "warning"
                : reservation.status === "CANCELLED"
                  ? "neutral"
                  : "error"
          }
          size="sm"
        >
          {reservation.status}
        </Badge>
      ),
    },
  ];

  return (
    <Stack gap="lg" className={styles.detailsStack}>
      <DataList items={detailItems} orientation="vertical" />

      {reservation.notes && (
        <Stack gap="xs">
          <Text variant="label" color="secondary">
            Notes
          </Text>
          <Text variant="body" className={styles.notesValue}>
            {reservation.notes}
          </Text>
        </Stack>
      )}

      <Divider />

      <Stack gap="sm">
        <Button variant="primary" onClick={onEdit}>
          Edit Reservation
        </Button>
        {reservation.status === "CONFIRMED" && (
          <Button variant="secondary" onClick={onSeat}>
            Seat Guest
          </Button>
        )}
        {reservation.status !== "CANCELLED" && (
          <Button variant="ghost" onClick={onCancel}>
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
    isConnected,
    setReservations: setSharedReservations,
    addReservation,
    updateReservation,
  } = useReservationData();

  const [tables, setTables] = useState<Table[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedDate = searchParams.get("date") ?? new Date().toLocaleDateString("en-CA");
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

  // SSE for table updates and hold confirmations (reservation events handled by context)
  useReservationEvents({
    venueId: selectedVenueId ?? undefined,
    enabled: !!selectedVenueId,
    onHoldConfirmed: useCallback(
      (reservation: Reservation) => {
        if (reservation.date === selectedDate) {
          addReservation(reservation);
        }
      },
      [selectedDate, addReservation]
    ),
    onTableUpdated: useCallback((table: Table) => {
      setTables((prev) => prev.map((t) => (t.id === table.id ? table : t)));
    }, []),
  });

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

  const isToday = selectedDate === new Date().toLocaleDateString("en-CA");

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
      <Stack gap="md" className={styles.header}>
        <PageHeader title="Timeline" description="Real-time reservation view" />

        {/* Date navigation */}
        <Stack direction="row" justify="between" align="center" wrap gap="md" className={styles.dateNav}>
          <Stack direction="row" align="center" gap="sm">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePreviousDay}
              aria-label="Previous day"
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Button>
            <Text variant="body" style={{ fontWeight: "var(--rialto-weight-medium)" }} className={styles.dateLabel}>{formattedDate}</Text>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNextDay}
              aria-label="Next day"
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Button>
            {!isToday && (
              <Button variant="secondary" size="sm" onClick={handleToday}>
                Today
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={() => setShowWalkInDialog(true)}>
              Walk-in
            </Button>
          </Stack>

          {/* Stats */}
          <Stack direction="row" align="center" gap="md" className={styles.statsRow}>
            {/* Live indicator */}
            <Stack direction="row" align="center" gap="2xs" className={styles.liveIndicator}>
              <span
                className={`${styles.liveDot} ${isConnected ? styles.liveDotConnected : styles.liveDotOffline}`}
              />
              <Text variant="caption" color={isConnected ? "success" : "tertiary"}>
                {isConnected ? "Live" : "Offline"}
              </Text>
            </Stack>
            <Text variant="caption" color="secondary">
              Reservations: <Text as="span" color="primary" style={{ fontWeight: "var(--rialto-weight-medium)" }}>{stats.total}</Text>
            </Text>
            <Text variant="caption" color="secondary">
              Covers: <Text as="span" color="primary" style={{ fontWeight: "var(--rialto-weight-medium)" }}>{stats.totalCovers}</Text>
            </Text>
            <Badge color="success" size="sm">{stats.confirmed} confirmed</Badge>
            {stats.pending > 0 && (
              <Badge color="warning" size="sm">{stats.pending} pending</Badge>
            )}
          </Stack>
        </Stack>
      </Stack>

      {/* Main content */}
      <div className={styles.content}>
        {/* Timeline */}
        <div className={styles.timelineArea}>
          {isLoading ? (
            <div className={styles.loadingWrapper} aria-busy="true">
              <div className={styles.spinner} aria-label="Loading" role="status" />
            </div>
          ) : error ? (
            <Alert variant="error">{error}</Alert>
          ) : tables.length === 0 ? (
            <EmptyState
              heading="No tables configured"
              description="Add tables in the Floor Plans section to start taking reservations."
            />
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
          <aside className={styles.sidebar}>
            <Stack direction="row" justify="between" align="center" className={styles.sidebarHeader}>
              <Heading level={3}>Reservation Details</Heading>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedReservation(null)}
                aria-label="Close reservation details"
              >
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Button>
            </Stack>

            <ReservationDetails
              reservation={selectedReservation}
              onEdit={() => setShowEditDrawer(true)}
              onSeat={() => handleSeat(selectedReservation)}
              onCancel={() => setShowCancelDialog(true)}
            />
          </aside>
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
