import { useMemo, useState } from "react";
import type { Reservation, Table } from "@mbe/types";
import { Button, Card, Stack, Text, Tag } from "@mattbutlerengineering/rialto";
import styles from "./TimelineMobileView.module.css";

export type StatusFilter = "ALL" | "CONFIRMED" | "PENDING" | "CANCELLED";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "CONFIRMED", label: "Seated" },
  { value: "PENDING", label: "Upcoming" },
  { value: "CANCELLED", label: "Cancelled" },
];

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatSlotLabel(isoString: string): string {
  const d = new Date(isoString);
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return minutes === 0
    ? `${displayHour}:00 ${ampm}`
    : `${displayHour}:${String(minutes).padStart(2, "0")} ${ampm}`;
}

function getSlotKey(isoString: string): string {
  const d = new Date(isoString);
  // Round down to nearest 30 min slot
  const slot = d.getMinutes() < 30 ? 0 : 30;
  return `${d.getHours()}:${String(slot).padStart(2, "0")}`;
}

function getSlotLabel(isoString: string): string {
  const d = new Date(isoString);
  const slot = d.getMinutes() < 30 ? 0 : 30;
  const slotDate = new Date(d);
  slotDate.setMinutes(slot, 0, 0);
  return formatSlotLabel(slotDate.toISOString());
}

function statusVariant(status: Reservation["status"]): "default" | "accent" | "success" | "error" {
  switch (status) {
    case "CONFIRMED":
      return "accent";
    case "PENDING":
      return "default";
    case "COMPLETED":
      return "success";
    case "CANCELLED":
    case "NO_SHOW":
      return "error";
    default:
      return "default";
  }
}

function statusLabel(status: Reservation["status"]): string {
  switch (status) {
    case "CONFIRMED":
      return "Confirmed";
    case "PENDING":
      return "Pending";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    case "NO_SHOW":
      return "No Show";
    default:
      return status;
  }
}

interface ReservationCardProps {
  reservation: Reservation;
  table: Table | undefined;
  onClick: (reservation: Reservation) => void;
  isSelected: boolean;
}

function ReservationCard({ reservation, table, onClick, isSelected }: ReservationCardProps) {
  const tableLabel = table?.tableNumber || table?.name || "Unassigned";
  const timeLabel = `${formatTime(reservation.startTime)} – ${formatTime(reservation.endTime)}`;

  return (
    <Button
      className={`${styles.card} ${isSelected ? styles.cardSelected : ""}`}
      onClick={() => onClick(reservation)}
      aria-label={`${reservation.guestName || "Guest"}, party of ${reservation.partySize}, ${timeLabel}, table ${tableLabel}`}
      type="button"
    >
      <Stack direction="row" align="center" justify="between" gap="sm" className={styles.cardRow}>
        <Stack gap="2xs" className={styles.cardMain}>
          <Text variant="label" className={styles.guestName}>
            {reservation.guestName || "Guest"}
          </Text>
          <Stack direction="row" gap="xs" align="center" wrap>
            <Text variant="caption" className={styles.cardMeta}>
              {timeLabel}
            </Text>
            <Text variant="caption" className={styles.cardMetaDot}>
              ·
            </Text>
            <Text variant="caption" className={styles.cardMeta}>
              {reservation.partySize} {reservation.partySize === 1 ? "guest" : "guests"}
            </Text>
            <Text variant="caption" className={styles.cardMetaDot}>
              ·
            </Text>
            <Text variant="caption" className={styles.cardMeta}>
              {tableLabel}
            </Text>
          </Stack>
        </Stack>
        <Tag variant={statusVariant(reservation.status)}>{statusLabel(reservation.status)}</Tag>
      </Stack>
    </Button>
  );
}

export interface TimelineMobileViewProps {
  reservations: Reservation[];
  tables: Table[];
  onReservationClick: (reservation: Reservation) => void;
  selectedReservationId?: string | null;
}

export function TimelineMobileView({
  reservations,
  tables,
  onReservationClick,
  selectedReservationId,
}: TimelineMobileViewProps) {
  const [activeFilter, setActiveFilter] = useState<StatusFilter>("ALL");

  const tableMap = useMemo(() => {
    const m = new Map<string, Table>();
    for (const t of tables) m.set(t.id, t);
    return m;
  }, [tables]);

  const filtered = useMemo(() => {
    if (activeFilter === "ALL") return reservations;
    return reservations.filter((r) => {
      if (activeFilter === "CONFIRMED") return r.status === "CONFIRMED" || r.status === "COMPLETED";
      if (activeFilter === "PENDING") return r.status === "PENDING";
      if (activeFilter === "CANCELLED") return r.status === "CANCELLED" || r.status === "NO_SHOW";
      return true;
    });
  }, [reservations, activeFilter]);

  // Group by 30-min slot key, sorted chronologically
  const slots = useMemo(() => {
    const grouped = new Map<string, { label: string; reservations: Reservation[] }>();
    const sorted = [...filtered].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
    for (const r of sorted) {
      const key = getSlotKey(r.startTime);
      if (!grouped.has(key)) {
        grouped.set(key, { label: getSlotLabel(r.startTime), reservations: [] });
      }
      grouped.get(key)!.reservations.push(r);
    }
    return Array.from(grouped.entries()).sort(([a], [b]) => {
      const [ah, am] = a.split(":").map(Number);
      const [bh, bm] = b.split(":").map(Number);
      return ah! * 60 + (am ?? 0) - (bh! * 60 + (bm ?? 0));
    });
  }, [filtered]);

  return (
    <Stack gap="sm" className={styles.root}>
      {/* Status filter chips */}
      <Stack direction="row" gap="xs" wrap className={styles.filterRow}>
        {STATUS_FILTERS.map(({ value, label }) => (
          <Tag key={value} onClick={() => setActiveFilter(value)} selected={activeFilter === value}>
            {label}
          </Tag>
        ))}
      </Stack>

      {/* Time slot groups */}
      {slots.length === 0 ? (
        <Card variant="flat" className={styles.emptyCard}>
          <Text variant="body" className={styles.emptyText}>
            No reservations
          </Text>
        </Card>
      ) : (
        slots.map(([key, { label, reservations: slotReservations }]) => (
          <Stack key={key} gap="xs">
            <Text variant="label" className={styles.slotLabel}>
              {label}
            </Text>
            <Stack gap="xs">
              {slotReservations.map((r) => (
                <ReservationCard
                  key={r.id}
                  reservation={r}
                  table={tableMap.get(r.tableId)}
                  onClick={onReservationClick}
                  isSelected={r.id === selectedReservationId}
                />
              ))}
            </Stack>
          </Stack>
        ))
      )}
    </Stack>
  );
}
