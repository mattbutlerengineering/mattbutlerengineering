import { useState, useCallback, useRef } from "react";
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Input,
  Skeleton,
  SkeletonGroup,
  Stack,
  Text,
} from "@mattbutlerengineering/rialto";
import type { BriefingReservation } from "@mbe/api-client";
import { useVenue } from "../contexts/VenueContext.js";
import { useBriefing } from "../hooks/useBriefing.js";
import { useReservationEvents } from "../hooks/useReservationEvents.js";
import { PageHeader } from "../components/PageHeader.js";
import styles from "./BriefingPage.module.css";

/* ── Helpers ────────────────────────────────── */

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDateInput(date: Date): string {
  return date.toLocaleDateString("en-CA"); // YYYY-MM-DD
}

/* ── Occasion badge ─────────────────────────── */

const OCCASION_LABELS: Record<string, string> = {
  birthday: "Birthday",
  anniversary: "Anniversary",
  business: "Business",
  date_night: "Date Night",
  other: "Special",
};

function OccasionBadge({ occasion }: { readonly occasion: string | null }) {
  if (!occasion || occasion === "none") return null;
  const label = OCCASION_LABELS[occasion] ?? occasion;
  return (
    <Badge variant="warning" size="sm">
      {label}
    </Badge>
  );
}

/* ── Dietary flags ──────────────────────────── */

function DietaryFlags({ restrictions }: { readonly restrictions: string[] | null }) {
  if (!restrictions || restrictions.length === 0) return null;
  return (
    <div className={styles.dietaryFlags}>
      {restrictions.map((r) => (
        <Badge key={r} variant="error" size="sm">
          {r}
        </Badge>
      ))}
    </div>
  );
}

/* ── Reservation card ───────────────────────── */

function BriefingCard({ reservation }: { readonly reservation: BriefingReservation }) {
  const guest = reservation.guest;
  const guestName = guest?.name ?? reservation.guestName ?? "Unknown Guest";
  const hasAllergies =
    guest?.dietaryRestrictions != null && guest.dietaryRestrictions.length > 0;

  return (
    <Card className={`${styles.card} ${hasAllergies ? styles.cardAllergies : ""}`}>
      <Stack gap="sm">
        {/* Header row: time + party size */}
        <div className={styles.cardHeader}>
          <div className={styles.timeGroup}>
            <Text variant="label" color="secondary">
              {formatTime(reservation.startTime)}
            </Text>
            <Text variant="label" color="secondary">
              &ndash;
            </Text>
            <Text variant="label" color="secondary">
              {formatTime(reservation.endTime)}
            </Text>
          </div>
          <Badge variant={reservation.status === "CONFIRMED" ? "success" : "warning"} size="sm">
            {reservation.status === "CONFIRMED" ? "Confirmed" : "Pending"}
          </Badge>
        </div>

        {/* Guest name + party size */}
        <div className={styles.guestRow}>
          <Text variant="body" color="primary" className={styles.guestName}>
            {guestName}
          </Text>
          <Text variant="caption" color="secondary">
            {reservation.partySize} {reservation.partySize === 1 ? "cover" : "covers"}
          </Text>
        </div>

        {/* Table assignment */}
        {reservation.tableName && (
          <Text variant="caption" color="secondary">
            {reservation.tableName}
          </Text>
        )}

        {/* Badges row: occasion + seating preference */}
        <div className={styles.badgeRow}>
          <OccasionBadge occasion={reservation.occasion} />
          {reservation.seatingPreference && reservation.seatingPreference !== "no_preference" && (
            <Badge variant="neutral" size="sm">
              {reservation.seatingPreference}
            </Badge>
          )}
        </div>

        {/* Dietary restrictions */}
        {hasAllergies && (
          <div>
            <Text variant="caption" color="secondary" className={styles.dietaryLabel}>
              Dietary:
            </Text>
            <DietaryFlags restrictions={guest?.dietaryRestrictions ?? null} />
          </div>
        )}

        {/* CRM data */}
        {guest && (
          <div className={styles.crmSection}>
            <Text variant="caption" color="secondary">
              {guest.visitCount === 0
                ? "First visit"
                : `${guest.visitCount} visit${guest.visitCount === 1 ? "" : "s"}`}
              {guest.lastVisit
                ? ` · Last: ${new Date(guest.lastVisit).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                : ""}
            </Text>
            {guest.tags && guest.tags.length > 0 && (
              <div className={styles.tagRow}>
                {guest.tags.map((tag) => (
                  <Badge key={tag} variant="neutral" size="sm">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Staff notes excerpt */}
        {guest?.staffNotes && guest.staffNotes.length > 0 && (
          <Text variant="caption" color="secondary" className={styles.staffNote}>
            {guest.staffNotes[0].text}
          </Text>
        )}

        {/* Reservation notes */}
        {reservation.notes && (
          <Text variant="caption" color="secondary" className={styles.reservationNote}>
            Note: {reservation.notes}
          </Text>
        )}
      </Stack>
    </Card>
  );
}

/* ── Time slot group ────────────────────────── */

function timeSlotKey(isoString: string): string {
  const d = new Date(isoString);
  const h = d.getHours();
  const m = d.getMinutes();
  // Round down to nearest 30 min
  const slotMinute = m < 30 ? 0 : 30;
  return `${String(h).padStart(2, "0")}:${String(slotMinute).padStart(2, "0")}`;
}

function formatSlotLabel(slotKey: string): string {
  const [h, m] = slotKey.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

interface TimeSlot {
  key: string;
  label: string;
  reservations: BriefingReservation[];
  totalCovers: number;
}

function groupByTimeSlot(reservations: BriefingReservation[]): TimeSlot[] {
  const map = new Map<string, BriefingReservation[]>();

  for (const r of reservations) {
    const key = timeSlotKey(r.startTime);
    const existing = map.get(key) ?? [];
    map.set(key, [...existing, r]);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rsvps]) => ({
      key,
      label: formatSlotLabel(key),
      reservations: rsvps,
      totalCovers: rsvps.reduce((sum, r) => sum + r.partySize, 0),
    }));
}

/* ── Loading skeleton ───────────────────────── */

function BriefingLoadingSkeleton() {
  return (
    <div className={styles.container}>
      <PageHeader title="Tonight&apos;s Service" description="Pre-service guest intelligence" />
      <SkeletonGroup>
        <Skeleton variant="card" width="100%" height={200} />
        <Skeleton variant="card" width="100%" height={200} />
      </SkeletonGroup>
    </div>
  );
}

/* ── Main page ──────────────────────────────── */

export function BriefingPage() {
  const { selectedVenueId } = useVenue();
  const [selectedDate, setSelectedDate] = useState<string>(formatDateInput(new Date()));
  const [timeFilter, setTimeFilter] = useState<string>("");

  const { data, isLoading, error, refetch } = useBriefing({
    venueId: selectedVenueId ?? undefined,
    date: selectedDate,
    enabled: Boolean(selectedVenueId),
  });

  // SSE: update briefing on reservation changes using refs to avoid reconnect
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  const handleReservationChange = useCallback(() => {
    refetchRef.current();
  }, []);

  useReservationEvents({
    venueId: selectedVenueId ?? undefined,
    onReservationCreated: handleReservationChange,
    onReservationUpdated: handleReservationChange,
    onReservationCancelled: handleReservationChange,
    enabled: Boolean(selectedVenueId),
  });

  if (isLoading) {
    return <BriefingLoadingSkeleton />;
  }

  const reservations = data?.reservations ?? [];

  // Filter by time slot if a filter is active
  const filtered = timeFilter
    ? reservations.filter((r) => timeSlotKey(r.startTime) >= timeFilter)
    : reservations;

  const timeSlots = groupByTimeSlot(filtered);
  const totalCovers = filtered.reduce((sum, r) => sum + r.partySize, 0);
  const confirmedCount = filtered.filter((r) => r.status === "CONFIRMED").length;

  return (
    <div className={styles.container} data-testid="briefing-page">
      <PageHeader
        title="Tonight's Service"
        description="Pre-service guest intelligence briefing"
      />

      {error && (
        <Alert variant="error">Failed to load briefing. Please try again.</Alert>
      )}

      {/* Controls */}
      <div className={styles.controls}>
        <Input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          aria-label="Select date"
        />
        <Input
          type="time"
          value={timeFilter}
          onChange={(e) => setTimeFilter(e.target.value)}
          placeholder="Filter from time..."
          aria-label="Filter by start time"
        />
      </div>

      {/* Summary stats */}
      {reservations.length > 0 && (
        <div className={styles.stats}>
          <Text variant="caption" color="secondary">
            {filtered.length} reservation{filtered.length === 1 ? "" : "s"} &middot; {totalCovers} covers &middot; {confirmedCount} confirmed
          </Text>
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && !isLoading && !error && (
        <EmptyState
          heading="No reservations"
          description={
            timeFilter
              ? "No reservations match the selected time filter."
              : `No upcoming reservations for ${selectedDate}.`
          }
        />
      )}

      {/* Time slot groups */}
      {timeSlots.map((slot) => (
        <section key={slot.key} className={styles.slotSection} data-testid="time-slot">
          <div className={styles.slotHeader}>
            <Text variant="label" color="primary">
              {slot.label}
            </Text>
            <Text variant="caption" color="secondary">
              {slot.reservations.length} {slot.reservations.length === 1 ? "party" : "parties"} &middot; {slot.totalCovers} covers
            </Text>
          </div>
          <div className={styles.cardList}>
            {slot.reservations.map((r) => (
              <BriefingCard key={r.id} reservation={r} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
