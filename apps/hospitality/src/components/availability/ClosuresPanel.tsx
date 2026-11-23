import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Skeleton, Text, useToast } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, ClosureSummary, DateRule } from "@mbe/types";
import type { AvailabilityScope } from "../../hooks/useAvailabilityScope.js";
import { useClosureSummaries, useRetryClosureRefunds } from "../../hooks/useClosures.js";
import { useVenueFloorPlanSections } from "../../hooks/useFloorPlans.js";
import { useNow } from "../../hooks/useNow.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import { minutesOfDayIn } from "../../utils/service-day.js";
import { CallListDialog } from "./CallListDialog.js";
import { CloseDialog } from "./CloseDialog.js";
import { ClosureListItem } from "./ClosureListItem.js";
import { closuresList, type ClosureListRow, type EarlierClosureRow } from "./closures-list.js";
import { closureRowDate, closureRowTitle, earlierRowTitle } from "./closures-page-text.js";
import { EditClosureDialog } from "./EditClosureDialog.js";
import { ReopenClosureDialog } from "./ReopenClosureDialog.js";
import { closureKindOf, closureSubject, DATE_FORMAT } from "./rule-subjects.js";
import { restoreDate } from "./series-edit.js";
import { SeriesEditDialog } from "./SeriesEditDialog.js";
import type { SpecialDateRule } from "./special-dates.js";
import { useScheduleSave } from "./use-schedule-save.js";
import { StrandedBookings } from "./StrandedBookings.js";
import styles from "./ClosuresPanel.module.css";

interface PanelProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  readonly scope: AvailabilityScope;
}

type Row = ClosureListRow | EarlierClosureRow;

/**
 * The Closures and pauses list (ux.md): what is closed or paused now, what is to come, and refunds
 * still open for what is over. A Manager edits, reopens or resumes; a Host reads and opens the
 * call list.
 */
export function ClosuresPanel({ venueId, state, scope }: PanelProps) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const { toast } = useToast();
  const now = useNow();
  const summaries = useClosureSummaries({ venueId });
  const retry = useRetryClosureRefunds();
  const sections = useVenueFloorPlanSections({ venueId });
  const rowSave = useScheduleSave(scope.refresh, "availabilitySpecial.rowStranded");
  const [callListFor, setCallListFor] = useState<string | null>(null);
  const [reopening, setReopening] = useState<SpecialDateRule | null>(null);
  const [editing, setEditing] = useState<DateRule | null>(null);
  const [editingSeries, setEditingSeries] = useState<DateRule | null>(null);
  const [editingDate, setEditingDate] = useState<{ series: DateRule; date: string } | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const { config } = state;
  const rules = config.dateRules;
  const sectionNames = useMemo(
    () => new Map((sections.data ?? []).map((section) => [section.id, section.name])),
    [sections.data]
  );
  const list = closuresList({
    config,
    sectionNames,
    timezone: scope.timezone,
    today: scope.today,
    nowMinute: minutesOfDayIn(now, scope.timezone),
    summaries: summaries.error ? null : (summaries.data ?? null),
  });
  const ctx = { t, format };
  const ruleOf = (id: string): SpecialDateRule | undefined =>
    rules.find((r): r is SpecialDateRule => r.id === id && r.kind === "closure");
  const summaryOf = (ruleId: string): ClosureSummary | undefined =>
    summaries.data?.find((s) => s.ruleId === ruleId);
  /**
   * Guests the closure cancelled. `null` when the counts failed to load: a closure with no summary
   * row cancelled no one, but a failed read says nothing about it.
   */
  const cancelledOf = (ruleId: string): number | null =>
    summaries.error || !summaries.data ? null : (summaryOf(ruleId)?.cancelled ?? 0);

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

  // Restoring re-closes the date, so the server's stranded-bookings check guards it.
  const restoreSkip = async (skipId: string) => {
    const skip = rules.find((r) => r.id === skipId);
    if (!skip) return;
    const saved = await rowSave.save(venueId, state, restoreDate(skip), "keep");
    if (saved) {
      const date = format.formatCalendarDate(skip.startsOn, DATE_FORMAT);
      scope.offerUndo(t("availabilitySpecial.series.restoredToast", { date }), saved);
    }
  };

  const itemOf = (row: Row) => {
    const rule = ruleOf(row.ruleId);
    const earlier = row.group === "earlier";
    const open = !earlier && rule !== undefined;
    return (
      <ClosureListItem
        key={row.ruleId}
        title={earlier ? earlierRowTitle(row, ctx) : closureRowTitle(row, scope.today, ctx)}
        subject={closureRowDate(row, ctx)}
        summary={row.outcomes}
        isManager={scope.isManager}
        pause={!earlier && row.pause}
        retrying={retryingId === row.ruleId}
        onEdit={!earlier && !row.pause && row.editable && rule ? () => setEditing(rule) : undefined}
        onEditDates={!earlier && row.series && rule ? () => setEditingSeries(rule) : undefined}
        skips={
          !earlier && row.series
            ? row.series.skipped.map((skip) => ({
                id: skip.skipId,
                label: format.formatCalendarDate(skip.date, DATE_FORMAT),
              }))
            : undefined
        }
        onRestore={(skipId) => void restoreSkip(skipId)}
        onReopen={open && rule ? () => setReopening(rule) : undefined}
        onCallList={() => setCallListFor(row.ruleId)}
        onRetry={() => void retryRefunds(row.ruleId)}
      />
    );
  };

  const groups = [
    { id: "now", rows: list.now },
    { id: "upcoming", rows: list.upcoming },
    { id: "earlier", rows: list.earlier },
  ] as const;
  const empty = groups.every((group) => group.rows.length === 0);

  return (
    <div className={styles.panel}>
      {rowSave.failure.length > 0 && (
        <Alert variant="error">
          {rowSave.failure.map((message) => (
            <div key={message}>{message}</div>
          ))}
        </Alert>
      )}
      {/* Outside the alert, which would read every row aloud. */}
      {rowSave.failure.length > 0 && <StrandedBookings reservations={rowSave.stranded} />}
      {summaries.error && <Alert variant="error">{describeApiError(summaries.error).detail}</Alert>}
      {summaries.isLoading && <Skeleton variant="text" lines={3} />}
      {empty && !summaries.isLoading ? (
        <Text variant="body" color="secondary">
          {t("availabilityHub.closuresPage.empty")}
        </Text>
      ) : (
        groups
          .filter((group) => group.rows.length > 0)
          .map((group) => (
            <section key={group.id} className={styles.group}>
              <Text as="h2" variant="label">
                {t(`availabilityHub.closuresPage.group.${group.id}`)}
              </Text>
              <ul className={styles.list}>{group.rows.map(itemOf)}</ul>
            </section>
          ))
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
          timezone={scope.timezone}
          today={scope.today}
          onStale={scope.refresh}
          onEditDate={(series, date) => {
            setEditingSeries(null);
            setEditingDate({ series, date });
          }}
          onClose={() => setEditingSeries(null)}
        />
      )}
      {editing && (
        <EditClosureDialog
          venueId={venueId}
          state={state}
          timezone={scope.timezone}
          today={scope.today}
          rule={editing}
          onClose={() => setEditing(null)}
        />
      )}
      {editingDate && (
        <CloseDialog
          venueId={venueId}
          state={state}
          timezone={scope.timezone}
          today={scope.today}
          initialDate={editingDate.date}
          series={editingDate.series}
          onClose={() => setEditingDate(null)}
        />
      )}
      {reopening && (
        <ReopenClosureDialog
          venueId={venueId}
          ruleId={reopening.id}
          subject={closureSubject(reopening, format, t)}
          closes={closureKindOf(reopening, sectionNames)}
          cancelled={cancelledOf(reopening.id)}
          notifiable={summaryOf(reopening.id)?.upcomingCancelled ?? null}
          countFailed={summaries.error != null}
          subjectIsSpan={reopening.endsOn !== reopening.startsOn || reopening.repeat != null}
          canPickDate={
            scope.isManager &&
            reopening.repeat == null &&
            reopening.endsOn != null &&
            reopening.endsOn > reopening.startsOn
          }
          onRetryCount={() => void summaries.refetch()}
          rules={rules}
          rule={reopening}
          today={scope.today}
          services={config.venueServices}
          editedDates={rules.filter((r) => r.seriesId === reopening.id).length}
          isSeriesEdit={
            reopening.seriesId != null && rules.some((r) => r.id === reopening.seriesId)
          }
          onClose={() => setReopening(null)}
        />
      )}
    </div>
  );
}
