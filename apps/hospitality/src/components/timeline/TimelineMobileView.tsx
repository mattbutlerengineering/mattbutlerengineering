import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Reservation, Table } from "@mbe/types";
import { Button, Card, Stack, StatusLED, Text, Tag } from "@mattbutlerengineering/rialto";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { minutesOfDayIn } from "../../utils/service-day.js";
import { RESERVATION_STATUS_KEYS } from "./status-keys.js";
import styles from "./TimelineMobileView.module.css";

export type StatusFilter = "ALL" | "CONFIRMED" | "PENDING" | "CANCELLED";

const STATUS_FILTERS = [
  { value: "ALL", labelKey: "timeline.mobile.all" },
  { value: "CONFIRMED", labelKey: "timeline.status.confirmed" },
  { value: "PENDING", labelKey: "timeline.mobile.upcoming" },
  { value: "CANCELLED", labelKey: "timeline.status.cancelled" },
] as const satisfies readonly { value: StatusFilter; labelKey: string }[];

/** The 30-minute slot an instant falls in, on the venue clock, as "H:00" / "H:30". */
function getSlotKey(isoString: string, timeZone: string): string {
  const minutes = minutesOfDayIn(new Date(isoString), timeZone);
  const slot = minutes % 60 < 30 ? 0 : 30;
  return `${Math.floor(minutes / 60)}:${String(slot).padStart(2, "0")}`;
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

interface ReservationCardProps {
  reservation: Reservation;
  table: Table | undefined;
  onClick: (reservation: Reservation) => void;
  isSelected: boolean;
  /** A fact about the floor, not the booking (ux Decision a): the page derives it. */
  seated: boolean;
}

function ReservationCard({
  reservation,
  table,
  onClick,
  isSelected,
  seated,
}: ReservationCardProps) {
  const fmt = useVenueFormat();
  const { t } = useTranslation();
  const guest = reservation.guestName || t("timeline.guest");
  const tableLabel = table?.tableNumber || table?.name || t("timeline.mobile.unassigned");
  const timeLabel = `${fmt.formatTime(reservation.startTime)} – ${fmt.formatTime(reservation.endTime)}`;
  const spokenLabel = t("timeline.mobile.cardLabel", {
    guest,
    size: reservation.partySize,
    time: timeLabel,
    table: tableLabel,
  });

  return (
    <Button
      className={`${styles.card} ${isSelected ? styles.cardSelected : ""}`}
      onClick={() => onClick(reservation)}
      aria-label={seated ? `${spokenLabel}, ${t("timeline.block.seatedWord")}` : spokenLabel}
      type="button"
      // `useFocusAfter`'s target after seat / cancel / walk-in on phone (B3.2, #5271) — without
      // this, the card that success unmounted (dialog/drawer) has nowhere to hand focus back to.
      data-testid={`reservation-block-${reservation.id}`}
    >
      <Stack direction="row" align="center" justify="between" gap="sm" className={styles.cardRow}>
        <Stack gap="2xs" className={styles.cardMain}>
          <Text variant="label" className={styles.guestName} data-truncate title={guest}>
            {guest}
          </Text>
          <Stack direction="row" gap="xs" align="center" wrap>
            <Text variant="caption" className={styles.cardMeta}>
              {timeLabel}
            </Text>
            <Text variant="caption" className={styles.cardMetaDot}>
              ·
            </Text>
            <Text variant="caption" className={styles.cardMeta}>
              {t("timeline.guests", { count: reservation.partySize })}
            </Text>
            <Text variant="caption" className={styles.cardMetaDot}>
              ·
            </Text>
            <Text variant="caption" className={styles.cardMeta}>
              {tableLabel}
            </Text>
          </Stack>
        </Stack>
        <Stack direction="row" gap="xs" align="center">
          {seated && <StatusLED variant="success" size="xs" label={t("timeline.mobile.seated")} />}
          <Tag variant={statusVariant(reservation.status)}>
            {t(RESERVATION_STATUS_KEYS[reservation.status])}
          </Tag>
        </Stack>
      </Stack>
    </Button>
  );
}

export interface TimelineMobileViewProps {
  reservations: Reservation[];
  tables: Table[];
  onReservationClick: (reservation: Reservation) => void;
  selectedReservationId?: string | null;
  /** Ids of the parties seated right now (`seatedReservationIds`); a card is marked only when listed. */
  seatedIds?: ReadonlySet<string>;
}

export function TimelineMobileView({
  reservations,
  tables,
  onReservationClick,
  selectedReservationId,
  seatedIds,
}: TimelineMobileViewProps) {
  const { timeZone, formatLocalTime } = useVenueFormat();
  const { t } = useTranslation();
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
      const key = getSlotKey(r.startTime, timeZone);
      if (!grouped.has(key)) {
        grouped.set(key, { label: formatLocalTime(key), reservations: [] });
      }
      grouped.get(key)!.reservations.push(r);
    }
    return Array.from(grouped.entries()).sort(([a], [b]) => {
      const [ah, am] = a.split(":").map(Number);
      const [bh, bm] = b.split(":").map(Number);
      return ah! * 60 + (am ?? 0) - (bh! * 60 + (bm ?? 0));
    });
  }, [filtered, timeZone, formatLocalTime]);

  return (
    <Stack gap="sm" className={styles.root}>
      {/* Status filter chips */}
      <Stack direction="row" gap="xs" wrap className={styles.filterRow}>
        {STATUS_FILTERS.map(({ value, labelKey }) => (
          <Tag key={value} onClick={() => setActiveFilter(value)} selected={activeFilter === value}>
            {t(labelKey)}
          </Tag>
        ))}
      </Stack>

      {/* Time slot groups */}
      {slots.length === 0 ? (
        <Card variant="flat" className={styles.emptyCard}>
          <Text variant="body" className={styles.emptyText}>
            {t("timeline.mobile.empty")}
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
                  seated={seatedIds?.has(r.id) ?? false}
                />
              ))}
            </Stack>
          </Stack>
        ))
      )}
    </Stack>
  );
}
