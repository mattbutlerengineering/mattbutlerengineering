import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@mbe/auth/react";
import { createApiClient } from "@mbe/api-client";
import type { Reservation, Table, Venue } from "@mbe/types";
import { TimelineGrid } from "../components/timeline";
import { useReservationEvents } from "../hooks/useReservationEvents";

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
    onReservationCreated: useCallback((reservation: Reservation) => {
      // Only add if it matches our current date
      if (reservation.date === selectedDate) {
        setReservations((prev) => [...prev, reservation]);
      }
    }, [selectedDate]),
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
    onHoldConfirmed: useCallback((reservation: Reservation) => {
      if (reservation.date === selectedDate) {
        setReservations((prev) => [...prev, reservation]);
      }
    }, [selectedDate]),
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
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b bg-white">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Timeline</h1>

          {/* Venue selector */}
          {venues.length > 1 && (
            <select
              value={selectedVenueId ?? ""}
              onChange={(e) => setSelectedVenueId(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md"
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePreviousDay}
              className="p-2 hover:bg-gray-100 rounded-md"
              aria-label="Previous day"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="text-lg font-medium">{formattedDate}</div>
            <button
              onClick={handleNextDay}
              className="p-2 hover:bg-gray-100 rounded-md"
              aria-label="Next day"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {!isToday && (
              <button
                onClick={handleToday}
                className="ml-2 px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md"
              >
                Today
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-6 text-sm">
            {/* Live indicator */}
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected ? "bg-green-500 animate-pulse" : "bg-gray-300"
                }`}
              />
              <span className={isConnected ? "text-green-600" : "text-gray-400"}>
                {isConnected ? "Live" : "Offline"}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Reservations:</span>{" "}
              <span className="font-medium">{stats.total}</span>
            </div>
            <div>
              <span className="text-gray-500">Covers:</span>{" "}
              <span className="font-medium">{stats.totalCovers}</span>
            </div>
            <div>
              <span className="text-blue-600 font-medium">{stats.confirmed}</span>
              <span className="text-gray-500"> confirmed</span>
            </div>
            {stats.pending > 0 && (
              <div>
                <span className="text-yellow-600 font-medium">{stats.pending}</span>
                <span className="text-gray-500"> pending</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Timeline */}
        <div className="flex-1 p-4 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : error ? (
            <div className="bg-red-50 text-red-600 p-4 rounded-md">{error}</div>
          ) : tables.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="mb-2">No tables configured for this venue.</p>
              <p className="text-sm">Add tables in the Floor Plans section.</p>
            </div>
          ) : (
            <TimelineGrid
              tables={tables}
              reservations={reservations}
              date={selectedDate}
              onReservationClick={handleReservationClick}
              selectedReservationId={selectedReservation?.id}
            />
          )}
        </div>

        {/* Sidebar - Reservation details */}
        {selectedReservation && (
          <div className="w-80 border-l bg-white p-4 overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-medium text-gray-900">Reservation Details</h2>
              <button
                onClick={() => setSelectedReservation(null)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Guest</label>
                <div className="font-medium">{selectedReservation.guestName || "Guest"}</div>
              </div>

              {selectedReservation.guestEmail && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Email</label>
                  <div className="text-sm">{selectedReservation.guestEmail}</div>
                </div>
              )}

              {selectedReservation.guestPhone && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Phone</label>
                  <div className="text-sm">{selectedReservation.guestPhone}</div>
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-500 mb-1">Time</label>
                <div className="font-medium">
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
                <label className="block text-xs text-gray-500 mb-1">Party Size</label>
                <div className="font-medium">
                  {selectedReservation.partySize} {selectedReservation.partySize === 1 ? "guest" : "guests"}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Table</label>
                <div className="font-medium">
                  {selectedReservation.table?.tableNumber || selectedReservation.table?.name || "Unassigned"}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Status</label>
                <span
                  className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                    selectedReservation.status === "CONFIRMED"
                      ? "bg-blue-100 text-blue-800"
                      : selectedReservation.status === "PENDING"
                      ? "bg-yellow-100 text-yellow-800"
                      : selectedReservation.status === "COMPLETED"
                      ? "bg-green-100 text-green-800"
                      : selectedReservation.status === "CANCELLED"
                      ? "bg-gray-100 text-gray-600"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {selectedReservation.status}
                </span>
              </div>

              {selectedReservation.notes && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Notes</label>
                  <div className="text-sm text-gray-700 bg-gray-50 p-2 rounded">
                    {selectedReservation.notes}
                  </div>
                </div>
              )}

              <div className="pt-4 border-t space-y-2">
                <button className="w-full px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">
                  Edit Reservation
                </button>
                {selectedReservation.status === "CONFIRMED" && (
                  <button className="w-full px-4 py-2 text-sm border border-green-600 text-green-600 rounded-md hover:bg-green-50">
                    Seat Guest
                  </button>
                )}
                {selectedReservation.status !== "CANCELLED" && (
                  <button className="w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md">
                    Cancel Reservation
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
