import { useState, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  Badge,
  Button,
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
import { useStatusMessage } from "../hooks/useStatusMessage.js";
import { describeApiError } from "../lib/describe-api-error.js";
import { ordinalVisit } from "../utils/ordinal.js";
import { formatServiceDate, formatTime } from "../utils/format.js";
import { localDateString, localHour } from "../utils/local-clock.js";
import {
  getSegmentLabel,
  getSegmentVariant,
  isAllergyTag,
} from "../components/crm/guest-signals.js";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner.js";
import { LiveStatus } from "../components/LiveStatus.js";
import { PageHeader } from "../components/PageHeader.js";
import styles from "./BriefingPage.module.css";

/* ── Time slot segments ─────────────────────────── */

const TIME_SEGMENTS = [
  { id: "all", label: "All" },
  { id: "early", label: "Early (before 6 PM)" },
  { id: "dinner", label: "Dinner (6–8 PM)" },
  { id: "late", label: "Late (after 8 PM)" },
] as const;

type TimeSegmentId = (typeof TIME_SEGMENTS)[number]["id"];

export type BriefingSegment = "early" | "dinner" | "late";

/**
 * Bucket a local hour of day (0–23) into the door's vocabulary: Early before 18:00,
 * Dinner 18:00–20:59, Late from 21:00 (ux.md Screen 1). Pure; the caller supplies
 * `localHour(startTime)` so segment and printed time read the same clock (audit A2).
 */
export function segmentForHour(hour: number): BriefingSegment {
  if (hour < 18) return "early";
  if (hour < 21) return "dinner";
  return "late";
}

function segmentForEntry(entry: BriefingEntry): BriefingSegment {
  return segmentForHour(localHour(new Date(entry.startTime)));
}

/* ── Loading skeleton ────────────────────────────── */

function BriefingLoadingSkeleton() {
  return (
    <div role="status" aria-busy="true">
      <Text as="span" className={styles.srOnly}>
        Loading tonight&apos;s briefing…
      </Text>
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
  const segmentLabel = guest ? getSegmentLabel(guest.visitCount, guest.tags) : null;

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
          <div className={styles.cardHeader}>
            <Text variant="body" color="primary">
              {entry.guestName ?? guest?.name ?? "Guest"}
            </Text>
            {segmentLabel && (
              <Badge variant={getSegmentVariant(segmentLabel)} size="sm">
                {segmentLabel}
              </Badge>
            )}
          </div>
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
              {guest.dietaryRestrictions.map((restriction) =>
                isAllergyTag(restriction) ? (
                  <Tag key={restriction} variant="error">
                    {`Allergy: ${restriction}`}
                  </Tag>
                ) : (
                  <Tag key={restriction} variant="default">
                    {restriction}
                  </Tag>
                )
              )}
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
            {guest.staffNotes[0]?.text}
          </Text>
        )}
      </div>
    </Card>
  );
}

/* ── Main component ──────────────────────────────── */

export function BriefingPage() {
  const { selectedVenueId } = useVenue();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedDate = searchParams.get("date") ?? localDateString(new Date());
  const [timeSlot, setTimeSlot] = useState<TimeSegmentId>("all");
  const { status, announce } = useStatusMessage();

  // Subscribe to SSE so reservation events auto-refresh the query via React Query invalidation
  useSSEEventFeed({ maxItems: 0 });

  const {
    data: entries,
    isLoading,
    error: queryError,
    refetch,
  } = useBriefing({
    date: selectedDate,
    venueId: selectedVenueId ?? "",
    enabled: Boolean(selectedVenueId),
  });

  const errorDescription = queryError ? describeApiError(queryError) : null;
  const dateLabel = formatServiceDate(selectedDate);

  const handleRetry = useCallback(async () => {
    const result = await refetch();
    if (!result.error) announce(`Briefing for ${dateLabel} loaded.`);
  }, [refetch, announce, dateLabel]);

  const displayEntries = entries ?? [];

  const filtered = useMemo(() => {
    if (timeSlot === "all") return displayEntries;
    return displayEntries.filter((entry) => segmentForEntry(entry) === timeSlot);
  }, [displayEntries, timeSlot]);

  const showLoading = isLoading && displayEntries.length === 0;
  const loaded = !isLoading && !errorDescription;

  return (
    <div className={styles.container}>
      <PageHeader title="Tonight's Service" description="Service briefing for your team" />
      <LiveStatus status={status} />

      <div className={styles.toolbar}>
        <SegmentedControl
          segments={[...TIME_SEGMENTS]}
          value={timeSlot}
          onChange={(value) => setTimeSlot(value as TimeSegmentId)}
          size="sm"
        />
        <Input
          aria-label="Service date"
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

      {errorDescription && (
        <div className={styles.banner}>
          <ErrorRetryBanner
            title="Couldn't load tonight's briefing."
            error={errorDescription.detail}
            details={errorDescription.raw}
            onRetry={handleRetry}
          />
        </div>
      )}

      {showLoading && <BriefingLoadingSkeleton />}

      {loaded && displayEntries.length === 0 && (
        <EmptyState
          variant="flat"
          heading={`Nothing on the book for ${dateLabel}.`}
          description="Change the date, or seat walk-ins from the Timeline."
          action={
            <Button variant="secondary" onClick={() => navigate("/timeline")}>
              Open Timeline
            </Button>
          }
        />
      )}

      {loaded && displayEntries.length > 0 && filtered.length === 0 && timeSlot !== "all" && (
        <EmptyState size="sm" variant="flat" heading={`No ${timeSlot} seatings tonight.`} />
      )}

      {loaded && filtered.length > 0 && (
        <div className={styles.cards}>
          {filtered.map((entry) => (
            <BriefingCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
