import { useState, useMemo, useCallback, useId } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
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
import { useStaffTonight } from "../hooks/useStaffTonight.js";
import { useBriefing, type BriefingEntry } from "../hooks/useBriefing.js";
import { useSSEEventFeed } from "../hooks/useSSESync.js";
import { useStatusMessage } from "../hooks/useStatusMessage.js";
import { describeApiError } from "../lib/describe-api-error.js";
import { formatWallHour, formatWallHourRange } from "../utils/format.js";
import { ordinalVisitLabel } from "../i18n/ordinal-visit.js";
import { useVenueFormat } from "../hooks/useVenueFormat.js";
import { deviceDate, deviceHour } from "../utils/service-day.js";
import { specialRequestsText } from "../utils/reservation-display.js";
import {
  getSegmentLabel,
  getSegmentVariant,
  isAllergyTag,
  segmentText,
} from "../components/crm/guest-signals.js";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner.js";
import { LiveStatus } from "../components/LiveStatus.js";
import { PageHeader } from "../components/PageHeader.js";
import styles from "./BriefingPage.module.css";

/* ── Time slot segments ─────────────────────────── */

/**
 * Bucket boundaries as local 24h hours. `segmentForHour` and the filter labels
 * below are both derived from these, so the wording cannot drift from the
 * bucketing again (#5276): the labels used to read "Dinner (6–8 PM)" / "Late
 * (after 8 PM)" against an 18:00–20:59 / ≥21:00 split, so a Host filtering
 * Late at 20:30 got "No late seatings tonight." while a 20:30 party sat on the
 * book under Dinner. ux.md:89 owns the split; only the printed hours were wrong.
 */
const EARLY_END_HOUR = 18;
const LATE_START_HOUR = 21;

function timeSegments(t: TFunction, locale: string) {
  return [
    { id: "all", label: t("briefing.segments.all") },
    {
      id: "early",
      label: t("briefing.segments.early", { hour: formatWallHour(EARLY_END_HOUR, locale) }),
    },
    {
      id: "dinner",
      label: t("briefing.segments.dinner", {
        range: formatWallHourRange(EARLY_END_HOUR, LATE_START_HOUR, locale),
      }),
    },
    {
      id: "late",
      label: t("briefing.segments.late", { hour: formatWallHour(LATE_START_HOUR, locale) }),
    },
  ] as const;
}

type TimeSegmentId = "all" | "early" | "dinner" | "late";

export type BriefingSegment = "early" | "dinner" | "late";

/**
 * Bucket a local hour of day (0–23) into the door's vocabulary: Early before 18:00,
 * Dinner 18:00–20:59, Late from 21:00 (ux.md Screen 1). Pure; the caller supplies
 * `deviceHour(startTime)` so segment and printed time read the same clock (audit A2).
 */
export function segmentForHour(hour: number): BriefingSegment {
  if (hour < EARLY_END_HOUR) return "early";
  if (hour < LATE_START_HOUR) return "dinner";
  return "late";
}

function segmentForEntry(entry: BriefingEntry): BriefingSegment {
  return segmentForHour(deviceHour(new Date(entry.startTime)));
}

/* ── Loading skeleton ────────────────────────────── */

function BriefingLoadingSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true">
      <Text as="span" className={styles.srOnly}>
        {t("briefing.loading")}
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

const OCCASIONS = ["birthday", "anniversary", "business", "date_night", "other"] as const;
const SEATINGS = ["booth", "patio", "bar", "window", "quiet"] as const;

function occasionText(t: TFunction, value: string): string {
  const known = OCCASIONS.find((o) => o === value);
  return known ? t(`reservations.occasion.${known}`) : value.replace(/_/g, " ");
}

function seatingText(t: TFunction, value: string): string {
  const known = SEATINGS.find((o) => o === value);
  return known ? t(`reservations.seating.${known}`) : value.replace(/_/g, " ");
}

function BriefingCard({ entry }: { entry: BriefingEntry }) {
  const fmt = useVenueFormat();
  const { t, i18n } = useTranslation();
  const requestsLabelId = useId();
  const { guest } = entry;
  const requests = specialRequestsText(entry.notes);
  const segmentLabel = guest ? getSegmentLabel(guest.visitCount, guest.tags) : null;

  return (
    <Card>
      <div className={styles.cardInner}>
        <div className={styles.cardHeader}>
          <Text variant="label" color="primary">
            {fmt.formatTime(entry.startTime)}
          </Text>
          <Badge variant="neutral" size="sm">
            {t("briefing.covers", { count: entry.partySize })}
          </Badge>
          {entry.table && (
            <Badge variant="neutral" size="sm">
              {entry.table.name}
            </Badge>
          )}
          {entry.occasion && entry.occasion !== "none" && (
            <Badge variant="accent" size="sm">
              {occasionText(t, entry.occasion)}
            </Badge>
          )}
        </div>

        <div className={styles.cardBody}>
          <div className={styles.cardHeader}>
            <Text variant="body" color="primary">
              {entry.guestName ?? guest?.name ?? t("briefing.guest")}
            </Text>
            {segmentLabel && (
              <Badge variant={getSegmentVariant(segmentLabel)} size="sm">
                {segmentText(segmentLabel, t)}
              </Badge>
            )}
          </div>
          {guest && guest.visitCount > 1 && (
            <Text variant="caption" color="secondary">
              {ordinalVisitLabel(t, i18n.language, guest.visitCount)}
            </Text>
          )}
          {entry.seatingPreference && entry.seatingPreference !== "no_preference" && (
            <Text variant="caption" color="secondary">
              {t("briefing.prefers", { seating: seatingText(t, entry.seatingPreference) })}
            </Text>
          )}
        </div>

        {guest?.dietaryRestrictions && guest.dietaryRestrictions.length > 0 && (
          <div className={styles.dietary}>
            <Stack direction="row" gap="xs" wrap>
              {guest.dietaryRestrictions.map((restriction) =>
                isAllergyTag(restriction) ? (
                  <Tag key={restriction} variant="error">
                    {t("briefing.allergy", { restriction })}
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

        {requests !== null && (
          <Stack gap="2xs" role="group" aria-labelledby={requestsLabelId}>
            <Text id={requestsLabelId} variant="label" color="secondary">
              {t("bookingWidget.specialRequests.label")}
            </Text>
            <Text variant="caption" color="primary" dir="auto" className={styles.requests}>
              {requests}
            </Text>
          </Stack>
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
  const { t } = useTranslation();
  const fmt = useVenueFormat();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tonight = useStaffTonight(selectedVenueId);
  // No ?date: the current service day, which trails the calendar date after midnight.
  const selectedDate = searchParams.get("date") ?? tonight.serviceDate ?? deviceDate(new Date());
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
  const dateLabel = fmt.formatServiceDate(selectedDate);

  const handleRetry = useCallback(async () => {
    const result = await refetch();
    if (!result.error) announce(t("briefing.loaded", { date: dateLabel }));
  }, [refetch, announce, dateLabel, t]);

  const displayEntries = entries ?? [];

  const filtered = useMemo(() => {
    if (timeSlot === "all") return displayEntries;
    return displayEntries.filter((entry) => segmentForEntry(entry) === timeSlot);
  }, [displayEntries, timeSlot]);

  const showLoading = isLoading && displayEntries.length === 0;
  const loaded = !isLoading && !errorDescription;

  return (
    <div className={styles.container}>
      <PageHeader title={t("briefing.title")} description={t("briefing.description")} />
      <LiveStatus status={status} />

      <div className={styles.toolbar}>
        <SegmentedControl
          segments={[...timeSegments(t, fmt.locale)]}
          value={timeSlot}
          onChange={(value) => setTimeSlot(value as TimeSegmentId)}
          size="sm"
        />
        <Input
          aria-label={t("briefing.serviceDate")}
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
            title={t("briefing.loadError")}
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
          heading={t("briefing.empty.heading", { date: dateLabel })}
          description={t("briefing.empty.description")}
          action={
            <Button variant="secondary" onClick={() => navigate("/timeline")}>
              {t("briefing.empty.action")}
            </Button>
          }
        />
      )}

      {loaded && displayEntries.length > 0 && filtered.length === 0 && timeSlot !== "all" && (
        <EmptyState size="sm" variant="flat" heading={t(`briefing.noSeatings.${timeSlot}`)} />
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
