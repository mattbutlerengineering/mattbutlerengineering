import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { EndOfServiceSummary } from "@mbe/types";
import {
  Card,
  EmptyState,
  Heading,
  IconButton,
  Input,
  Skeleton,
  SkeletonGroup,
  Stat,
  Text,
} from "@mattbutlerengineering/rialto";
import { useVenue } from "../contexts/VenueContext.js";
import { useLastServiceDate } from "../hooks/useLastServiceDate.js";
import { useEndOfService } from "../hooks/useEndOfService.js";
import { useStatusMessage } from "../hooks/useStatusMessage.js";
import { useVenueFormat } from "../hooks/useVenueFormat.js";
import { describeApiError } from "../lib/describe-api-error.js";
import { addDays, deviceDate } from "../utils/service-day.js";
import { formatCount } from "../utils/format.js";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner.js";
import { LiveStatus } from "../components/LiveStatus.js";
import { ChevronLeftIcon, ChevronRightIcon } from "./timeline-icons.js";
import { PageHeader } from "../components/PageHeader.js";
import styles from "./NightSummaryPage.module.css";

function NightLoadingSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true">
      <Text as="span" className={styles.srOnly}>
        {t("night.loading")}
      </Text>
      <SkeletonGroup>
        <div className={styles.figures}>
          <Skeleton variant="card" width="100%" height={120} className={styles.lead} />
          <Skeleton variant="card" width="100%" height={120} />
          <Skeleton variant="card" width="100%" height={120} />
        </div>
      </SkeletonGroup>
    </div>
  );
}

/** Covers get the lead tile; turns and no-shows follow. Turned away joins once it is reported. */
function NightFigures({ summary, locale }: { summary: EndOfServiceSummary; locale: string }) {
  const { t } = useTranslation();
  return (
    <div className={styles.figures}>
      <Stat
        className={styles.lead}
        size="lg"
        label={t("night.covers")}
        value={formatCount(summary.covers, locale)}
      />
      <Stat
        size="md"
        label={t("night.tableTurns")}
        value={formatCount(summary.tableTurns, locale)}
      />
      <Stat size="md" label={t("night.noShows")} value={formatCount(summary.noShows, locale)} />
      {summary.turnedAway !== null && (
        <Stat
          size="md"
          label={t("night.turnedAway")}
          value={formatCount(summary.turnedAway, locale)}
        />
      )}
    </div>
  );
}

/**
 * The night in numbers: the closing summary a host reads before the chairs go up.
 * Counts only. "Turned away" appears once the Lost Demand Ledger reports it
 * (`turnedAway` is null until then), so no tile ever sits empty.
 */
export function NightSummaryPage() {
  const { selectedVenueId } = useVenue();
  const { t } = useTranslation();
  const fmt = useVenueFormat();
  const [searchParams, setSearchParams] = useSearchParams();
  const last = useLastServiceDate(selectedVenueId);
  const { status, announce } = useStatusMessage();

  // No ?date: the service day that last opened. Until the venue's hours load there is no honest
  // answer, so nothing is fetched; the calendar date is used only once reading the hours failed.
  const hoursFailed = last.date === null && last.status === "error";
  const fallbackDate = hoursFailed ? deviceDate(new Date()) : null;
  const latestDate = last.date ?? fallbackDate;
  const selectedDate = searchParams.get("date") ?? latestDate;

  const {
    data: summary,
    isLoading,
    error: queryError,
    refetch,
  } = useEndOfService({
    date: selectedDate ?? "",
    venueId: selectedVenueId ?? "",
    enabled: Boolean(selectedVenueId && selectedDate),
  });

  const errorDescription = queryError ? describeApiError(queryError) : null;
  const dateLabel = selectedDate ? fmt.formatServiceDate(selectedDate) : "";
  const loaded = selectedDate !== null && !isLoading && !errorDescription && summary != null;
  const loadedDate = loaded ? summary.date : null;

  // Every date change (and a successful retry) is spoken once its figures land.
  useEffect(() => {
    if (loadedDate) announce(t("night.loaded", { date: fmt.formatServiceDate(loadedDate) }));
  }, [loadedDate, announce, fmt, t]);

  const goTo = (date: string) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("date", date);
      return next;
    });
  const quiet = loaded && summary.covers === 0 && summary.tableTurns === 0 && summary.noShows === 0;

  return (
    <div>
      <PageHeader title={t("night.title")} description={t("night.description")} />
      <LiveStatus status={status} />

      <div className={styles.toolbar}>
        <IconButton
          icon={<ChevronLeftIcon />}
          aria-label={t("night.previous")}
          variant="secondary"
          className={styles.step}
          disabled={!selectedDate}
          onClick={() => selectedDate && goTo(addDays(selectedDate, -1))}
        />
        <Input
          aria-label={t("night.serviceDate")}
          type="date"
          value={selectedDate ?? ""}
          onChange={(e) => e.target.value && goTo(e.target.value)}
        />
        <IconButton
          icon={<ChevronRightIcon />}
          aria-label={t("night.next")}
          variant="secondary"
          className={styles.step}
          disabled={!selectedDate || !latestDate || selectedDate >= latestDate}
          onClick={() => selectedDate && goTo(addDays(selectedDate, 1))}
        />
      </div>

      {hoursFailed && !searchParams.get("date") && (
        <Text variant="caption" color="secondary" className={styles.note}>
          {t("night.hoursUnknown")}
        </Text>
      )}

      {errorDescription && (
        <div className={styles.banner}>
          <ErrorRetryBanner
            title={t("night.loadError")}
            error={errorDescription.detail}
            details={errorDescription.raw}
            onRetry={() => void refetch()}
          />
        </div>
      )}

      {(isLoading || selectedDate === null) && <NightLoadingSkeleton />}

      {loaded && quiet && (
        <EmptyState
          variant="flat"
          heading={t("night.empty.heading", { date: dateLabel })}
          description={t("night.empty.description")}
        />
      )}

      {loaded && !quiet && (
        <Card>
          <div className={styles.results}>
            <Heading level={2} size={4}>
              {dateLabel}
            </Heading>
            <NightFigures summary={summary} locale={fmt.locale} />
          </div>
        </Card>
      )}
    </div>
  );
}
