import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Input,
  SegmentedControl,
  Skeleton,
  SkeletonGroup,
  Stack,
  Tag,
  Text,
} from "@mattbutlerengineering/rialto";
import { useVenue } from "../contexts/VenueContext.js";
import { useBriefing, type BriefingEntry } from "../hooks/useBriefing.js";
import { useSSEEventFeed } from "../hooks/useSSESync.js";
import { ordinalVisit } from "../utils/ordinal.js";
import { PageHeader } from "../components/PageHeader";
import styles from "./BriefingPage.module.css";

/* ── Time slot segments ─────────────────────────── */

const TIME_SEGMENTS = [
  { id: "all", label: "All" },
  { id: "early", label: "Early (before 6 PM)" },
  { id: "dinner", label: "Dinner (6–8 PM)" },
  { id: "late", label: "Late (after 8 PM)" },
] as const;

type TimeSegmentId = (typeof TIME_SEGMENTS)[number]["id"];

function getSegmentForTime(isoString: string): "early" | "dinner" | "late" {
  const hour = new Date(isoString).getUTCHours();
  if (hour < 18) return "early";
  if (hour < 20) return "dinner";
  return "late";
}

/* ── Time formatter ──────────────────────────────── */

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ── Loading skeleton ────────────────────────────── */

function BriefingLoadingSkeleton() {
  return (
    <div className={styles.container}>
      <PageHeader title="Tonight's Service" description="Service briefing for your team" />
      <SkeletonGroup>
        <Skeleton variant="card" width="100%" height={120} />
        <Skeleton variant="card" width="100%" height={120} />
        <Skeleton variant="card" width="100%" height={120} />
      </SkeletonGroup>
    </div>
  );
}

/* ── Reservation card ────────────────────────────── */

function BriefingCard({ entry }: { entry: BriefingEntry }) {
  const { guest } = entry;
  const hasAllergy =
    guest?.dietaryRestrictions &&
    guest.dietaryRestrictions.some(
      (d) =>
        d.toLowerCase().includes("allergy") ||
        d.toLowerCase().includes("nut") ||
        d.toLowerCase().includes("shellfish")
    );

  return (
    <Card>
      <div className={styles.cardInner}>
        <div className={styles.cardHeader}>
          <Text variant="label" color="primary">
            {formatTime(entry.startTime)}
          </Text>
          <Badge variant="neutral" size="sm">
            {entry.partySize} {entry.partySize === 1 ? "cover" : "covers"}
          </Badge>
          {entry.table && (
            <Badge variant="neutral" size="sm">
              {entry.table.name}
            </Badge>
          )}
          {entry.occasion && entry.occasion !== "none" && (
            <Badge variant="accent" size="sm">
              {entry.occasion.replace(/_/g, " ")}
            </Badge>
          )}
        </div>

        <div className={styles.cardBody}>
          <Text variant="body" color="primary">
            {entry.guestName ?? guest?.name ?? "Guest"}
          </Text>
          {guest && guest.visitCount > 1 && (
            <Text variant="caption" color="secondary">
              {ordinalVisit(guest.visitCount)}
            </Text>
          )}
          {entry.seatingPreference && entry.seatingPreference !== "no_preference" && (
            <Text variant="caption" color="secondary">
              Prefers: {entry.seatingPreference.replace(/_/g, " ")}
            </Text>
          )}
        </div>

        {guest?.dietaryRestrictions && guest.dietaryRestrictions.length > 0 && (
          <div className={styles.dietary}>
            <Stack direction="row" gap="xs" wrap>
              {guest.dietaryRestrictions.map((d) => (
                <Tag key={d} variant={hasAllergy ? "error" : "accent"}>
                  {d}
                </Tag>
              ))}
            </Stack>
          </div>
        )}

        {entry.notes && (
          <Text variant="caption" color="secondary" className={styles.notes}>
            {entry.notes}
          </Text>
        )}

        {guest?.staffNotes && guest.staffNotes.length > 0 && (
          <Text variant="caption" color="secondary" className={styles.notes}>
            {guest.staffNotes[0].text}
          </Text>
        )}
      </div>
    </Card>
  );
}

/* ── Main component ──────────────────────────────── */

export function BriefingPage() {
  const { selectedVenueId } = useVenue();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedDate = searchParams.get("date") ?? new Date().toLocaleDateString("en-CA");
  const [timeSlot, setTimeSlot] = useState<TimeSegmentId>("all");

  // Subscribe to SSE so reservation events auto-refresh the query via React Query invalidation
  useSSEEventFeed({ maxItems: 0 });

  const {
    data: entries,
    isLoading,
    error: queryError,
  } = useBriefing({
    date: selectedDate,
    venueId: selectedVenueId ?? "",
    enabled: Boolean(selectedVenueId),
  });

  const error = queryError?.message ?? null;

  const displayEntries = entries ?? [];

  const filtered = useMemo(() => {
    if (timeSlot === "all") return displayEntries;
    return displayEntries.filter((e) => getSegmentForTime(e.startTime) === timeSlot);
  }, [displayEntries, timeSlot]);

  if (isLoading && displayEntries.length === 0) {
    return <BriefingLoadingSkeleton />;
  }

  return (
    <div className={styles.container}>
      <PageHeader title="Tonight's Service" description="Service briefing for your team" />

      <div className={styles.toolbar}>
        <SegmentedControl
          segments={[...TIME_SEGMENTS]}
          value={timeSlot}
          onChange={(value) => setTimeSlot(value as TimeSegmentId)}
          size="sm"
        />
        <Input
          type="date"
          value={selectedDate}
          onChange={(e) => {
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.set("date", e.target.value);
              return next;
            });
          }}
        />
      </div>

      {error && (
        <div style={{ marginBlock: "var(--rialto-space-md)" }}>
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <div aria-live="polite" role="status">
          <EmptyState
            heading="No reservations"
            description={`No reservations for ${selectedDate}.`}
          />
        </div>
      )}

      {!isLoading && !error && filtered.length > 0 && (
        <div className={styles.cards} aria-live="polite">
          {filtered.map((entry) => (
            <BriefingCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
