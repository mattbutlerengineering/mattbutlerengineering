import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Alert,
  Button,
  EmptyState,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
  useToast,
} from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, ClosureSummary, DateRule } from "@mbe/types";
import { useClosureSummaries, useRetryClosureRefunds } from "../../hooks/useClosures.js";
import { useVenueFormat, type VenueFormat } from "../../hooks/useVenueFormat.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import { CallListDialog } from "./CallListDialog.js";
import { CloseDialog } from "./CloseDialog.js";
import { ReopenClosureDialog } from "./ReopenClosureDialog.js";
import { SeriesEditDialog } from "./SeriesEditDialog.js";
import { isSeries, skippedDates } from "./series-edit.js";
import {
  orphanRefundRules,
  specialDateRows,
  type SpecialDateRule,
  type SpecialDatesFilter,
} from "./special-dates.js";
import styles from "./SpecialDatesTab.module.css";

export interface SpecialDatesTabProps {
  readonly venueId: string;
  /** The loaded config: its date rules are the list, and series edits save against its version. */
  readonly state: AvailabilityConfigState;
  readonly timezone: string;
  /** Today on the venue clock. */
  readonly today: string;
  /** A concurrent change was refused; reload the config. */
  readonly onStale: () => void;
  /** Only a Manager can reopen or retry refunds; a Host views the list and the call list. */
  readonly isManager: boolean;
}

const FILTERS: readonly SpecialDatesFilter[] = [
  "all",
  "closures",
  "special_hours",
  "repeating",
  "past",
];

const DATE_FORMAT = { weekday: "short", month: "short", day: "numeric" } as const;

function rangeLabel(rule: SpecialDateRule, format: VenueFormat, t: TFunction): string {
  const from = format.formatCalendarDate(rule.startsOn, DATE_FORMAT);
  if (rule.endsOn == null) return t("availabilitySpecial.untilReopened", { from });
  if (rule.endsOn === rule.startsOn) return from;
  return t("availabilitySpecial.range", {
    from,
    to: format.formatCalendarDate(rule.endsOn, DATE_FORMAT),
  });
}

interface RowProps {
  readonly title: string;
  readonly detail: string;
  readonly message?: string | null;
  readonly summary: ClosureSummary | undefined;
  readonly isManager: boolean;
  readonly retrying: boolean;
  readonly onRetry: (ruleId: string) => void;
  readonly onCallList: (ruleId: string) => void;
  readonly ruleId: string;
  /** Present when the row can be reopened (a closure, not special hours). */
  readonly onRemove?: () => void;
  /** Present on a repeating closure: Edit dates… (ux.md F-SER). */
  readonly onEditDates?: () => void;
}

function SpecialDateItem(props: RowProps) {
  const { title, detail, message, summary, isManager, retrying, ruleId } = props;
  const { t } = useTranslation();
  const refundCount = (summary?.refundFailed ?? 0) + (summary?.refundPending ?? 0);

  return (
    <li className={styles.item}>
      <div className={styles.summary}>
        <Text variant="body">{title}</Text>
        <Text variant="caption" color="secondary">
          {detail}
        </Text>
        {message && <Text variant="caption">{`“${message}”`}</Text>}
        {summary && summary.total > 0 && (
          <Text variant="caption" color="secondary">
            {t("availabilitySpecial.counts", {
              sent: summary.sent,
              rebooked: summary.rebooked,
              unreachable: summary.unreachable,
            })}
          </Text>
        )}
        {summary && summary.refundFailed > 0 && (
          <Text variant="caption" color="error">
            {t("availabilitySpecial.refundFailed", { count: summary.refundFailed })}
          </Text>
        )}
        {summary && summary.refundFailed === 0 && summary.refundPending > 0 && (
          <Text variant="caption" color="secondary">
            {t("availabilitySpecial.refundPending", { count: summary.refundPending })}
          </Text>
        )}
      </div>
      <div className={styles.actions}>
        {summary && summary.unreachable > 0 && (
          <Button variant="secondary" onClick={() => props.onCallList(ruleId)}>
            {t("availabilitySpecial.callListOpen")}
          </Button>
        )}
        {isManager && refundCount > 0 && (
          <Button variant="secondary" isLoading={retrying} onClick={() => props.onRetry(ruleId)}>
            {t("availabilitySpecial.retry")}
          </Button>
        )}
        {isManager && props.onEditDates && (
          <Button variant="ghost" onClick={props.onEditDates}>
            {t("availabilitySpecial.series.editDates")}
          </Button>
        )}
        {isManager && props.onRemove && (
          <Button variant="ghost" onClick={props.onRemove}>
            {t("availabilitySpecial.remove")}
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * Availability → Special dates (ux.md S6b, F6): every closure and special-hours date with what
 * became of the bookings it touched, the call list, reopening, and refund retry.
 */
export function SpecialDatesTab(props: SpecialDatesTabProps) {
  const { venueId, state, timezone, today, onStale, isManager } = props;
  const rules = state.config.dateRules;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const { toast } = useToast();
  const summaries = useClosureSummaries({ venueId });
  const retry = useRetryClosureRefunds();
  const [filter, setFilter] = useState<SpecialDatesFilter>("all");
  const [callListFor, setCallListFor] = useState<string | null>(null);
  const [reopening, setReopening] = useState<SpecialDateRule | null>(null);
  const [editingSeries, setEditingSeries] = useState<DateRule | null>(null);
  const [editingDate, setEditingDate] = useState<{ series: DateRule; date: string } | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const rows = specialDateRows(rules, today, filter);
  const summaryOf = (ruleId: string) => summaries.data?.find((s) => s.ruleId === ruleId);
  const orphans =
    filter === "all"
      ? orphanRefundRules(
          summaries.data ?? [],
          rules.filter((r) => r.kind === "closure" || r.kind === "special_hours").map((r) => r.id)
        )
      : [];

  const retryRefunds = async (ruleId: string) => {
    setRetryingId(ruleId);
    try {
      const { enqueued } = await retry.mutateAsync({ venueId, ruleId });
      toast({ title: t("availabilitySpecial.retried", { count: enqueued }), variant: "success" });
    } catch (error) {
      toast({
        title: t("availabilitySpecial.retryError"),
        description: describeApiError(error).detail,
        variant: "error",
      });
    } finally {
      setRetryingId(null);
    }
  };

  const skippedLabel = (seriesId: string): string | null => {
    const dates = skippedDates(rules, seriesId);
    return dates.length === 0
      ? null
      : t("availabilitySpecial.series.skipped", {
          dates: dates.map((d) => format.formatCalendarDate(d, DATE_FORMAT)).join(", "),
        });
  };

  const shared = {
    isManager,
    onRetry: (ruleId: string) => void retryRefunds(ruleId),
    onCallList: setCallListFor,
  };

  return (
    <Stack gap="md">
      <SegmentedControl
        aria-label={t("availabilitySpecial.filterLabel")}
        segments={FILTERS.map((id) => ({
          id,
          label: t(`availabilitySpecial.filter.${id}`),
        }))}
        value={filter}
        onChange={(id) => setFilter(id as SpecialDatesFilter)}
      />
      {summaries.error && <Alert variant="error">{describeApiError(summaries.error).detail}</Alert>}
      {summaries.isLoading ? (
        <Skeleton variant="text" lines={3} />
      ) : rows.length === 0 && orphans.length === 0 ? (
        <EmptyState
          size="sm"
          heading={t("availabilitySpecial.empty.title")}
          description={t("availabilitySpecial.empty.description")}
        />
      ) : (
        <ul className={styles.list}>
          {rows.map(({ rule }) => (
            <SpecialDateItem
              key={rule.id}
              {...shared}
              ruleId={rule.id}
              title={rangeLabel(rule, format, t)}
              detail={[
                rule.kind === "closure"
                  ? t("availabilitySpecial.kind.closure")
                  : t("availabilitySpecial.kind.specialHours"),
                rule.repeat ? t("availabilitySpecial.repeating") : null,
                skippedLabel(rule.id),
              ]
                .filter(Boolean)
                .join(" · ")}
              message={rule.guestMessage}
              summary={summaryOf(rule.id)}
              retrying={retryingId === rule.id}
              onRemove={rule.kind === "closure" ? () => setReopening(rule) : undefined}
              onEditDates={isSeries(rule) ? () => setEditingSeries(rule) : undefined}
            />
          ))}
          {orphans.map((summary) => (
            <SpecialDateItem
              key={summary.ruleId}
              {...shared}
              ruleId={summary.ruleId}
              title={t("availabilitySpecial.ended.title")}
              detail={t("availabilitySpecial.ended.detail")}
              summary={summary}
              retrying={retryingId === summary.ruleId}
            />
          ))}
        </ul>
      )}
      {callListFor && (
        <CallListDialog
          venueId={venueId}
          ruleId={callListFor}
          onClose={() => setCallListFor(null)}
        />
      )}
      {editingSeries && (
        <SeriesEditDialog
          venueId={venueId}
          state={state}
          series={editingSeries}
          today={today}
          onStale={onStale}
          onEditDate={(series, date) => {
            setEditingSeries(null);
            setEditingDate({ series, date });
          }}
          onClose={() => setEditingSeries(null)}
        />
      )}
      {editingDate && (
        <CloseDialog
          venueId={venueId}
          state={state}
          timezone={timezone}
          today={today}
          initialDate={editingDate.date}
          series={editingDate.series}
          onClose={() => setEditingDate(null)}
        />
      )}
      {reopening && (
        <ReopenClosureDialog
          venueId={venueId}
          ruleId={reopening.id}
          dateLabel={format.formatCalendarDate(reopening.startsOn, DATE_FORMAT)}
          cancelled={summaryOf(reopening.id)?.cancelled ?? 0}
          onClose={() => setReopening(null)}
        />
      )}
    </Stack>
  );
}
