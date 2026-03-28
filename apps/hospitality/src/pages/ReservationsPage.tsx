import { useState, useEffect } from "react";
import { useAuth } from "@mbe/auth/react";
import { createApiClient } from "@mbe/api-client";
import type { Reservation, ReservationStatus } from "@mbe/types";
import styles from "./ReservationsPage.module.css";

const STATUS_BADGE_CLASS: Record<ReservationStatus, string> = {
  PENDING: styles.badgePending,
  CONFIRMED: styles.badgeConfirmed,
  CANCELLED: styles.badgeCancelled,
  COMPLETED: styles.badgeCompleted,
  NO_SHOW: styles.badgeNoShow,
};

export function ReservationsPage() {
  const { accessToken } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });

  useEffect(() => {
    async function fetchReservations() {
      setIsLoading(true);
      setError(null);

      try {
        const api = createApiClient({
          baseUrl: import.meta.env.VITE_API_URL ?? "",
          getAccessToken: () => accessToken,
        });

        const response = await api.reservations.list({
          date: selectedDate,
          limit: 50,
        });

        setReservations(response.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load reservations");
      } finally {
        setIsLoading(false);
      }
    }

    fetchReservations();
  }, [selectedDate, accessToken]);

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Reservations</h1>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className={styles.dateInput}
        />
      </div>

      {isLoading && (
        <div className={styles.loadingWrapper} aria-busy="true">
          <div className={styles.spinner} aria-label="Loading" role="status" />
        </div>
      )}

      {error && <div className={styles.errorBox} role="alert">{error}</div>}

      {!isLoading && !error && reservations.length === 0 && (
        <div className={styles.emptyState}>No reservations for {selectedDate}</div>
      )}

      {!isLoading && !error && reservations.length > 0 && (
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
              {reservations.map((reservation) => (
                <tr key={reservation.id}>
                  <td className={styles.td}>
                    {formatTime(reservation.startTime)} - {formatTime(reservation.endTime)}
                  </td>
                  <td className={styles.td}>
                    <div className={styles.guestName}>{reservation.guestName ?? "Guest"}</div>
                    {reservation.guestEmail && (
                      <div className={styles.guestEmail}>{reservation.guestEmail}</div>
                    )}
                  </td>
                  <td className={styles.td}>{reservation.partySize}</td>
                  <td className={styles.td}>
                    {reservation.table?.name ?? reservation.tableId}
                  </td>
                  <td className={styles.td}>
                    <span className={`${styles.badge} ${STATUS_BADGE_CLASS[reservation.status]}`}>
                      {reservation.status}
                    </span>
                  </td>
                  <td className={styles.tdMuted}>{reservation.notes ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
