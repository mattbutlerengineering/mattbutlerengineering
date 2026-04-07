import { Card, Text, Badge, Skeleton } from "@mbe/rialto";
import type { Reservation } from "@mbe/types";
import styles from "../../pages/HomePage.module.css";

const STATUS_VARIANT: Record<string, "neutral" | "success" | "warning" | "error"> = {
  PENDING: "warning",
  CONFIRMED: "success",
  CANCELLED: "error",
  COMPLETED: "neutral",
  NO_SHOW: "error",
};

function formatTime(time: string): string {
  const date = new Date(time);
  if (!isNaN(date.getTime())) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  // Fallback for plain HH:mm strings
  const [hours, minutes] = time.split(":");
  const h = parseInt(hours, 10);
  const suffix = h >= 12 ? "pm" : "am";
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${display}:${minutes}${suffix}`;
}

interface ReservationListProps {
  readonly reservations: readonly Reservation[];
  readonly isLoading: boolean;
}

export function ReservationList({ reservations, isLoading }: ReservationListProps) {
  if (isLoading) {
    return (
      <Card title="Today's Reservations">
        <Skeleton variant="rect" height={120} width="100%" />
      </Card>
    );
  }

  const active = reservations.filter(
    (r) => r.status !== "CANCELLED" && r.status !== "NO_SHOW"
  );

  if (active.length === 0) {
    return (
      <Card title="Today's Reservations">
        <Text variant="body" color="secondary">
          No reservations today
        </Text>
      </Card>
    );
  }

  const sorted = [...active].sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <Card title="Today's Reservations">
      <ul className={styles.reservationList}>
        {sorted.map((r) => (
          <li key={r.id} className={styles.reservationItem}>
            <span className={styles.reservationTime}>{formatTime(r.startTime)}</span>
            <div className={styles.reservationDetails}>
              <div className={styles.reservationGuest}>
                {r.guestName ?? "Walk-in"}
              </div>
              <div className={styles.reservationMeta}>
                Party of {r.partySize}
              </div>
            </div>
            <Badge variant={STATUS_VARIANT[r.status] ?? "neutral"} size="sm">
              {r.status}
            </Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
