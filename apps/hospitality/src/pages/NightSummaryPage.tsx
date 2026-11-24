import { useCallback } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Card,
  EmptyState,
  Input,
  Skeleton,
  SkeletonGroup,
  Stat,
  Text,
} from "@mattbutlerengineering/rialto";
import { useVenue } from "../contexts/VenueContext.js";
import { useStaffTonight } from "../hooks/useStaffTonight.js";
import { useEndOfService } from "../hooks/useEndOfService.js";
import { useStatusMessage } from "../hooks/useStatusMessage.js";
import { useVenueFormat } from "../hooks/useVenueFormat.js";
import { describeApiError } from "../lib/describe-api-error.js";
import { deviceDate } from "../utils/service-day.js";
import { formatCount } from "../utils/format.js";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner.js";
import { LiveStatus } from "../components/LiveStatus.js";
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
          <Skeleton variant="card" width="100%" height={120} />
          <Skeleton variant="card" width="100%" height={120} />
          <Skeleton variant="card" width="100%" height={120} />
        </div>
      </SkeletonGroup>
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
  const tonight = useStaffTonight(selectedVenueId);
  // No ?date: the current service day, which trails the calendar date after midnight.
  const selectedDate = searchParams.get("date") ?? tonight.serviceDate ?? deviceDate(new Date());
  const { status, announce } = useStatusMessage();

  const {
    data: summary,
    isLoading,
    error: queryError,
    refetch,
  } = useEndOfService({
    date: selectedDate,
    venueId: selectedVenueId ?? "",
    enabled: Boolean(selectedVenueId),
  });

  const errorDescription = queryError ? describeApiError(queryError) : null;
  const dateLabel = fmt.formatServiceDate(selectedDate);

  const handleRetry = useCallback(async () => {
    const result = await refetch();
    if (!result.error) announce(t("night.loaded", { date: dateLabel }));
  }, [refetch, announce, dateLabel, t]);

  const loaded = !isLoading && !errorDescription && summary != null;
  const quiet = loaded && summary.covers === 0 && summary.tableTurns === 0 && summary.noShows === 0;

  return (
    <div>
      <PageHeader title={t("night.title")} description={t("night.description")} />
      <LiveStatus status={status} />

      <div className={styles.toolbar}>
        <Input
          aria-label={t("night.serviceDate")}
          type="date"
          value={selectedDate}
          onChange={(e) => {
            if (!e.target.value) return;
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
            title={t("night.loadError")}
            error={errorDescription.detail}
            details={errorDescription.raw}
            onRetry={handleRetry}
          />
        </div>
      )}

      {isLoading && <NightLoadingSkeleton />}

      {loaded && quiet && (
        <EmptyState
          variant="flat"
          heading={t("night.empty.heading", { date: dateLabel })}
          description={t("night.empty.description")}
        />
      )}

      {loaded && !quiet && (
        <Card>
          <div className={styles.figures}>
            <Stat
              size="lg"
              label={t("night.covers")}
              value={formatCount(summary.covers, fmt.locale)}
            />
            <Stat
              size="lg"
              label={t("night.tableTurns")}
              value={formatCount(summary.tableTurns, fmt.locale)}
            />
            <Stat
              size="lg"
              label={t("night.noShows")}
              value={formatCount(summary.noShows, fmt.locale)}
            />
            {summary.turnedAway !== null && (
              <Stat
                size="lg"
                label={t("night.turnedAway")}
                value={formatCount(summary.turnedAway, fmt.locale)}
              />
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
