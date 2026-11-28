import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router";
import {
  Badge,
  DatePicker,
  Heading,
  Select,
  Skeleton,
  Stack,
  Text,
} from "@mattbutlerengineering/rialto";
import { resolveDay } from "@mbe/availability";
import type { AvailabilityConfig, DayTraceResult, TracedTime } from "@mbe/types";
import {
  availabilityPath,
  EXPLAIN_PARTY_MAX,
  readExplainAddress,
} from "../components/availability/availability-address.js";
import { minuteText } from "../components/availability/closure-band.js";
import { DayBody } from "../components/availability/AvailabilityDayDrawer.js";
import {
  destinationOf,
  destinationPath,
  groupByService,
  reasonText,
  summaryText,
} from "../components/availability/explain-day.js";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner.js";
import { PageHeader } from "../components/PageHeader.js";
import { useVenueFloorPlanSections } from "../hooks/useFloorPlans.js";
import { useAvailabilityScope, type AvailabilityScope } from "../hooks/useAvailabilityScope.js";
import { useDayTrace } from "../hooks/useDayTrace.js";
import { useFocusAfter } from "../hooks/useFocusAfter.js";
import { useVenueFormat } from "../hooks/useVenueFormat.js";
import { describeApiError } from "../lib/describe-api-error.js";
import styles from "./AvailabilityExplainPage.module.css";

const PARTY_OPTIONS = Array.from({ length: EXPLAIN_PARTY_MAX }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

/**
 * `availability/explain` (#10047): pick a date and a party size, read the rules that set the
 * day's hours and the outcome of every time the engine considers, each removed time with the rule
 * that removed it and the screen that edits that rule. Date and party size live in the address.
 */
export function AvailabilityExplainPage() {
  const { t } = useTranslation();
  const scope = useAvailabilityScope();
  const navigate = useNavigate();
  const address = readExplainAddress(useLocation());
  const date = address.date ?? scope.today;
  const { partySize } = address;
  const { focusAfter } = useFocusAfter();
  useEffect(() => focusAfter({ kind: "pageHeading" }), [focusAfter]);

  const go = (next: { date?: string; partySize?: number }) =>
    void navigate(availabilityPath({ view: "explain", date, partySize, ...next }), {
      replace: true,
    });

  return (
    <div className={styles.page}>
      <PageHeader
        title={t("availabilityExplain.title")}
        description={t("availabilityExplain.description")}
        aside={
          <Link to={availabilityPath({ view: "hub" })} className={styles.link}>
            {t("availabilityHub.seasonal.back")}
          </Link>
        }
      />
      {scope.venueId ? (
        <>
          <div className={styles.controls}>
            <DatePicker
              label={t("availabilityExplain.dateLabel")}
              value={date}
              onChange={(next) => next && go({ date: next })}
            />
            <Select
              label={t("availabilityExplain.partySizeLabel")}
              options={PARTY_OPTIONS}
              value={String(partySize)}
              onChange={(next) => go({ partySize: Number(next) })}
            />
          </div>
          <TraceBody venueId={scope.venueId} date={date} partySize={partySize} scope={scope} />
        </>
      ) : (
        <Text variant="body" color="secondary">
          {t("availability.noVenue")}
        </Text>
      )}
    </div>
  );
}

AvailabilityExplainPage.displayName = "AvailabilityExplainPage";

function TraceBody(props: {
  readonly venueId: string;
  readonly date: string;
  readonly partySize: number;
  readonly scope: AvailabilityScope;
}) {
  const { venueId, date, partySize, scope } = props;
  const { t } = useTranslation();
  const trace = useDayTrace({ venueId, date, partySize });
  if (trace.error && !trace.data) {
    const failure = describeApiError(trace.error);
    return (
      <ErrorRetryBanner
        title={t("availabilityExplain.loadError")}
        error={failure.detail}
        details={failure.raw}
        onRetry={() => void trace.refetch()}
      />
    );
  }
  if (!trace.data) {
    return (
      <div role="status" aria-label={t("availabilityExplain.loading")}>
        <Skeleton variant="text" lines={6} />
      </div>
    );
  }
  return (
    <TraceResult
      venueId={venueId}
      result={trace.data}
      past={date < scope.today}
      isManager={scope.isManager}
      stale={trace.isPlaceholderData === true}
      config={scope.state?.config ?? null}
      timezone={scope.timezone}
    />
  );
}

function TraceResult(props: {
  readonly venueId: string;
  readonly result: DayTraceResult;
  readonly past: boolean;
  readonly isManager: boolean;
  readonly stale: boolean;
  /** The config and zone the day's layers resolve against, as the day drawer resolves them. */
  readonly config: AvailabilityConfig | null;
  readonly timezone: string;
}) {
  const { venueId, result, past, isManager, stale, config, timezone } = props;
  const { t } = useTranslation();
  const day = useMemo(
    () => (config ? resolveDay({ timezone, config }, result.serviceDate) : null),
    [config, timezone, result.serviceDate]
  );
  const sections = useVenueFloorPlanSections({ venueId });
  const sectionNames = useMemo(
    () => new Map((sections.data ?? []).map((s) => [s.id, s.name])),
    [sections.data]
  );
  const groups = groupByService(result.times);
  return (
    <Stack gap="md" aria-busy={stale}>
      {past && (
        <Text variant="caption" color="secondary">
          {t("availabilityExplain.pastDate")}
        </Text>
      )}
      <section aria-labelledby="explain-rules">
        <Heading level={2} size={4} id="explain-rules">
          {t("availabilityExplain.rulesHeading")}
        </Heading>
        {day ? (
          <DayBody
            day={day}
            date={result.serviceDate}
            dateRules={config?.dateRules}
            sectionNames={sectionNames}
            alwaysShowStack
          />
        ) : (
          <Skeleton variant="text" lines={3} />
        )}
      </section>
      <section aria-labelledby="explain-times">
        <Heading level={2} size={4} id="explain-times">
          {t("availabilityExplain.timesHeading")}
        </Heading>
        {result.times.length === 0 ? (
          <Text variant="body" color="secondary">
            {t("availabilityExplain.closedAllDay")}
          </Text>
        ) : (
          <Stack gap="md">
            <Text variant="body" color="primary" role="status">
              {summaryText(result.times, result.partySize, t)}
            </Text>
            {groups.map((group) => (
              <div key={group.serviceId}>
                <Heading level={3} size={5}>
                  {group.serviceName}
                </Heading>
                <ul className={styles.times}>
                  {group.times.map((time) => (
                    <TimeRow
                      key={`${time.serviceId}-${time.minute}`}
                      time={time}
                      date={result.serviceDate}
                      isManager={isManager}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </Stack>
        )}
      </section>
    </Stack>
  );
}

function TimeRow(props: {
  readonly time: TracedTime;
  readonly date: string;
  readonly isManager: boolean;
}) {
  const { time, date, isManager } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const label = minuteText(time.minute, t, format);
  const reason = time.reason;
  const destination = reason ? destinationOf(reason) : null;
  // Regular hours is an editor's page: a Host who followed it would land on the hub.
  const linked = destination !== null && (isManager || destination !== "regularHours");
  const linkText = destination ? t(`availabilityExplain.link.${destination}`) : "";
  return (
    <li className={styles.time} data-outcome={time.outcome}>
      <Text as="span" variant="label" color="primary">
        {label}
      </Text>
      <Badge variant={time.outcome === "bookable" ? "success" : "warning"}>
        {t(`availabilityExplain.outcome.${time.outcome}`)}
      </Badge>
      {reason && (
        <Text as="span" variant="body" color="secondary" className={styles.reason}>
          {reasonText(reason, time, t, format)}
        </Text>
      )}
      {linked && destination && (
        <Link
          to={destinationPath(destination, time, date)}
          className={styles.link}
          aria-label={t("availabilityExplain.link.label", { link: linkText, time: label })}
        >
          {linkText}
        </Link>
      )}
    </li>
  );
}
