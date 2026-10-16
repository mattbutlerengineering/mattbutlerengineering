import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, Text, Badge, Skeleton } from "@mattbutlerengineering/rialto";
import type { Reservation } from "@mbe/types";
import { RESERVATION_STATUS_KEYS } from "../timeline/status-keys.js";
import { useVenueFormat, type VenueFormat } from "../../hooks/useVenueFormat.js";
import styles from "../../pages/HomePage.module.css";

const STATUS_VARIANT: Record<string, "neutral" | "success" | "warning" | "error"> = {
  PENDING: "warning",
  CONFIRMED: "success",
  CANCELLED: "error",
  COMPLETED: "neutral",
  NO_SHOW: "error",
};

function formatTime(time: string, fmt: VenueFormat): string {
  const date = new Date(time);
  if (!isNaN(date.getTime())) {
    return fmt.formatTime(time);
  }
  // Fallback for plain HH:mm strings
  return fmt.formatLocalTime(time);
}

interface ReservationListProps {
  readonly reservations: readonly Reservation[];
  readonly isLoading: boolean;
}

export const ReservationList = memo(function ReservationList({
  reservations,
  isLoading,
}: ReservationListProps) {
  const fmt = useVenueFormat();
  const { t } = useTranslation();
  const title = t("home.reservations.title");
  const sorted = useMemo(() => {
    const active = reservations.filter((r) => r.status !== "CANCELLED" && r.status !== "NO_SHOW");
    return [...active].sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [reservations]);

  if (isLoading) {
    return (
      <Card title={title}>
        <Skeleton variant="rect" height={120} width="100%" />
      </Card>
    );
  }

  if (sorted.length === 0) {
    return (
      <Card title={title}>
        <Text variant="body" color="secondary">
          {t("home.reservations.empty")}
        </Text>
      </Card>
    );
  }

  return (
    <Card title={title}>
      <ul className={styles.reservationList}>
        {sorted.map((r) => {
          const guest = r.guestName ?? t("home.reservations.walkIn");
          return (
            <li key={r.id} className={styles.reservationItem}>
              <Text className={styles.reservationTime}>{formatTime(r.startTime, fmt)}</Text>
              <div className={styles.reservationDetails}>
                <div className={styles.reservationGuest} data-truncate title={guest}>
                  {guest}
                </div>
                <div className={styles.reservationMeta}>
                  {t("home.reservations.partyOf", { count: r.partySize })}
                </div>
              </div>
              <Badge variant={STATUS_VARIANT[r.status] ?? "neutral"} size="sm">
                {t(RESERVATION_STATUS_KEYS[r.status])}
              </Badge>
            </li>
          );
        })}
      </ul>
    </Card>
  );
});
