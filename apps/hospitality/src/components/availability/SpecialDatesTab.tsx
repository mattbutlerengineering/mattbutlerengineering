import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Alert,
  Button,
  ConfirmDialog,
  EmptyState,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
  useToast,
} from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, ClosureSummary, DateRule } from "@mbe/types";
import { useAvailabilityUndo } from "../../hooks/useAvailabilityUndo.js";
import { useClosureSummaries, useRetryClosureRefunds } from "../../hooks/useClosures.js";
import { useVenueFormat, type VenueFormat } from "../../hooks/useVenueFormat.js";
import { formatCurrencyFromCents } from "../../utils/format.js";
import { addDays } from "../../utils/service-day.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import { AddSpecialDatesSheet } from "./AddSpecialDatesSheet.js";
import { CallListDialog } from "./CallListDialog.js";
import { CloseDialog } from "./CloseDialog.js";
import { ReopenClosureDialog } from "./ReopenClosureDialog.js";
import { SeriesEditDialog } from "./SeriesEditDialog.js";
import { isSeries, restoreDate, skipRows } from "./series-edit.js";
import { SpecialHoursEditDrawer } from "./SpecialHoursEditDrawer.js";
import { useScheduleSave } from "./use-schedule-save.js";
import {
  coversManyDates,
  hoursEditDate,
  orphanRefundRules,
  refundFailureLabel,
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
  if (rule.endsOn == null) {
    // Hours are not "reopened": an open-ended hours rule just runs from its start on.
    return t(
      rule.kind === "closure" ? "availabilitySpecial.untilReopened" : "availabilitySpecial.fromOn",
      { from }
    );
  }
  if (rule.endsOn === rule.startsOn) return from;
  return t("availabilitySpecial.range", {
    from,
    to: format.formatCalendarDate(rule.endsOn, DATE_FORMAT),
  });
}

/** 2026-01-04 is a Sunday; weekday index n is that date plus n days. */
const SUNDAY = "2026-01-04";

/** What removing a special-hours rule takes away, named whole: "for Thu, Dec 31", a range, or a repeat. */
function hoursSubject(rule: SpecialDateRule, format: VenueFormat, t: TFunction): string {
  if (rule.repeat != null) {
    const days = rule.repeat.weekdays.map((d) =>
      format.formatCalendarDate(addDays(SUNDAY, d), { weekday: "long" })
    );
    return t("availabilitySpecial.hours.subjectRepeat", {
      days: new Intl.ListFormat(format.locale, { type: "conjunction" }).format(days),
    });
  }
  return t("availabilitySpecial.hours.subjectDates", { dates: rangeLabel(rule, format, t) });
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
  /** Skipped dates of a repeating closure, each with a Restore. */
  readonly skips?: readonly { readonly id: string; readonly label: string }[];
  readonly onRestore?: (skipId: string) => void;
  /** Present on an upcoming special-hours row: Edit hours / Remove (ux.md F6 step 1). */
  readonly hours?: {
    /** The one date Edit opens on, formatted; null when no covered date is left (no Edit). */
    readonly label: string | null;
    /** The whole rule, named: "for Thu, Dec 31", "for A to B", "every Friday". */
    readonly subject: string;
    /** The rule covers more than one date, so Edit says it reaches only `label`. */
    readonly many: boolean;
    readonly onEdit: () => void;
    readonly onRemove: () => void;
  };
}

function SpecialDateItem(props: RowProps) {
  const { title, detail, message, summary, isManager, retrying, ruleId } = props;
  const { t } = useTranslation();
  const refundCount = (summary?.refundFailed ?? 0) + (summary?.refundPending ?? 0);
  const format = useVenueFormat();
  const failures = summary?.refundFailures ?? [];

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
            {failures.length > 0
              ? t("availabilitySpecial.refundFailedNamed", {
                  names: failures
                    .map((f) =>
                      refundFailureLabel(
                        f,
                        (cents, currency) =>
                          formatCurrencyFromCents(cents, currency, format.locale),
                        t("availabilitySpecial.callList.unnamed")
                      )
                    )
                    .join(", "),
                })
              : t("availabilitySpecial.refundFailed", { count: summary.refundFailed })}
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
        {isManager &&
          props.skips?.map((skip) => (
            <Button key={skip.id} variant="ghost" onClick={() => props.onRestore?.(skip.id)}>
              {t("availabilitySpecial.series.restoreDate", { date: skip.label })}
            </Button>
          ))}
        {isManager && props.hours && (
          <>
            {props.hours.label != null && (
              <Button
                variant="ghost"
                aria-label={
                  props.hours.many
                    ? undefined
                    : t("availabilitySpecial.hours.editFor", { date: props.hours.label })
                }
                onClick={props.hours.onEdit}
              >
                {props.hours.many
                  ? t("availabilitySpecial.hours.editOnly", { date: props.hours.label })
                  : t("availabilitySpecial.hours.edit")}
              </Button>
            )}
            <Button
              variant="ghost"
              aria-label={t("availabilitySpecial.hours.removeFor", {
                subject: props.hours.subject,
              })}
              onClick={props.hours.onRemove}
            >
              {t("availabilitySpecial.remove")}
            </Button>
          </>
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
  const [adding, setAdding] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [editingHours, setEditingHours] = useState<string | null>(null);
  const [removingHours, setRemovingHours] = useState<SpecialDateRule | null>(null);
  const offerUndo = useAvailabilityUndo();
  const rowSave = useScheduleSave(onStale, "availabilitySpecial.rowStranded");

  const rows = specialDateRows(rules, today, filter);
  const editDateOf = (rule: DateRule) => hoursEditDate(rule, today);
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

  const skipsOf = (seriesId: string) =>
    skipRows(rules, seriesId).map((r) => ({
      id: r.id,
      label: format.formatCalendarDate(r.startsOn, DATE_FORMAT),
    }));
  const skippedLabel = (seriesId: string): string | null => {
    const skips = skipsOf(seriesId);
    return skips.length === 0
      ? null
      : t("availabilitySpecial.series.skipped", { dates: skips.map((s) => s.label).join(", ") });
  };

  // Restoring re-closes the date and removing hours changes it, so the server's
  // stranded-bookings check guards both: a refusal shows above the list and nothing is cancelled.
  const restoreSkip = async (skipId: string) => {
    const skip = rules.find((r) => r.id === skipId);
    if (!skip) return;
    if (await rowSave.save(venueId, state, restoreDate(skip), "keep")) {
      const date = format.formatCalendarDate(skip.startsOn, DATE_FORMAT);
      toast({ title: t("availabilitySpecial.series.restoredToast", { date }), variant: "success" });
    }
  };
  const removeHours = async (rule: SpecialDateRule) => {
    setRemovingHours(null);
    const changes = { upsert: {}, remove: { dateRules: [rule.id] } };
    const saved = await rowSave.save(venueId, state, changes, "keep");
    if (saved) {
      const subject = hoursSubject(rule, format, t);
      offerUndo({
        venueId,
        saved,
        title: t("availabilitySpecial.hours.removedToast", { subject }),
      });
    }
  };

  const shared = {
    isManager,
    onRetry: (ruleId: string) => void retryRefunds(ruleId),
    onCallList: setCallListFor,
  };

  return (
    <Stack gap="md">
      <div className={styles.toolbar}>
        <SegmentedControl
          aria-label={t("availabilitySpecial.filterLabel")}
          segments={FILTERS.map((id) => ({
            id,
            label: t(`availabilitySpecial.filter.${id}`),
          }))}
          value={filter}
          onChange={(id) => setFilter(id as SpecialDatesFilter)}
        />
        {isManager && (
          <Button variant="primary" onClick={() => setAdding(true)}>
            {t("availabilitySpecial.add.open")}
          </Button>
        )}
      </div>
      {rowSave.failure.length > 0 && (
        <Alert variant="error">
          {rowSave.failure.map((message) => (
            <div key={message}>{message}</div>
          ))}
        </Alert>
      )}
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
          {rows.map(({ rule, past }) => (
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
              skips={isSeries(rule) ? skipsOf(rule.id) : undefined}
              onRestore={(skipId) => void restoreSkip(skipId)}
              hours={
                rule.kind === "special_hours" && !past
                  ? {
                      label:
                        editDateOf(rule) &&
                        format.formatCalendarDate(editDateOf(rule)!, DATE_FORMAT),
                      subject: hoursSubject(rule, format, t),
                      many: coversManyDates(rule),
                      onEdit: () => {
                        const date = editDateOf(rule);
                        if (date) setEditingHours(date);
                      },
                      onRemove: () => setRemovingHours(rule),
                    }
                  : undefined
              }
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
      {adding && (
        <AddSpecialDatesSheet
          venueId={venueId}
          state={state}
          timezone={timezone}
          today={today}
          onStale={onStale}
          onClose={() => setAdding(false)}
        />
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
          timezone={timezone}
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
      {editingHours && (
        <SpecialHoursEditDrawer
          venueId={venueId}
          state={state}
          timezone={timezone}
          today={today}
          date={editingHours}
          onStale={onStale}
          onClose={() => setEditingHours(null)}
        />
      )}
      {removingHours && (
        <ConfirmDialog
          open
          variant="destructive"
          title={t("availabilitySpecial.hours.removeTitle", {
            subject: hoursSubject(removingHours, format, t),
          })}
          description={t(
            coversManyDates(removingHours)
              ? "availabilitySpecial.hours.removeDescriptionMany"
              : "availabilitySpecial.hours.removeDescription"
          )}
          confirmLabel={t("availabilitySpecial.remove")}
          cancelLabel={t("availabilitySpecial.hours.keep")}
          onConfirm={() => void removeHours(removingHours)}
          onCancel={() => setRemovingHours(null)}
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
