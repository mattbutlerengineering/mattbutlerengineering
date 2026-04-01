import { useState, useEffect } from "react";
import { useAuth } from "@mbe/auth/react";
import { createApiClient } from "@mbe/api-client";
import type { Reservation, ReservationStatus } from "@mbe/types";
import { Alert, Badge, Card, EmptyState, Input, Skeleton, Stack, Table, Text } from "@mbe/rialto";
import styles from "./ReservationsPage.module.css";

const STATUS_VARIANT: Record<ReservationStatus, "neutral" | "accent" | "success" | "warning" | "error"> = {
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

  type Row = Record<string, unknown>;
  const asReservation = (row: Row) => row as unknown as Reservation;

  const columns = [
    {
      key: "time",
      header: "Time",
      render: (row: Row) => {
        const r = asReservation(row);
        return (
          <Text variant="body" as="span">
            {formatTime(r.startTime)} - {formatTime(r.endTime)}
          </Text>
        );
      },
    },
    {
      key: "guest",
      header: "Guest",
      render: (row: Row) => {
        const r = asReservation(row);
        return (
          <Stack gap="2xs">
            <Text variant="label">{r.guestName ?? "Guest"}</Text>
            {r.guestEmail && (
              <Text variant="caption" color="secondary">
                {r.guestEmail}
              </Text>
            )}
          </Stack>
        );
      },
    },
    {
      key: "partySize",
      header: "Party Size",
      render: (row: Row) => (
        <Text variant="body" as="span">
          {asReservation(row).partySize}
        </Text>
      ),
    },
    {
      key: "table",
      header: "Table",
      render: (row: Row) => {
        const r = asReservation(row);
        return (
          <Text variant="body" as="span">
            {r.table?.name ?? r.tableId}
          </Text>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      render: (row: Row) => {
        const r = asReservation(row);
        return (
          <Badge variant={STATUS_VARIANT[r.status]} size="sm" dot>
            {STATUS_LABEL[r.status]}
          </Badge>
        );
      },
    },
    {
      key: "notes",
      header: "Notes",
      render: (row: Row) => (
        <Text variant="caption" color="secondary" truncate>
          {asReservation(row).notes ?? "-"}
        </Text>
      ),
    },
  ];

  return (
    <Stack gap="lg" className={styles.container}>
      <Stack direction="row" align="center" justify="between">
        <Text variant="display" as="h1">
          Reservations
        </Text>
        <Input
          type="date"
          label="Date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className={styles.dateInput}
        />
      </Stack>

      {isLoading && (
        <Card variant="flat">
          <Stack gap="sm" aria-busy="true">
            <Skeleton variant="text" lines={5} width="100%" />
          </Stack>
        </Card>
      )}

      {error && (
        <Alert variant="error" title="Error loading reservations">
          {error}
        </Alert>
      )}

      {!isLoading && !error && reservations.length === 0 && (
        <EmptyState
          heading="No reservations"
          description={`No reservations found for ${selectedDate}.`}
          variant="elevated"
        />
      )}

      {!isLoading && !error && reservations.length > 0 && (
        <Card variant="flat" className={styles.tableCard}>
          <Table
            columns={columns}
            data={reservations as unknown as Row[]}
            rowKey={(row) => asReservation(row).id}
            striped
          />
        </Card>
      )}
    </Stack>
  );
}
