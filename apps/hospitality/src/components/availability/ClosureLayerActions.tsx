import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState } from "@mbe/types";
import { useClosureSummaries } from "../../hooks/useClosures.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { CloseDialog } from "./CloseDialog.js";
import { skipInitialFocus, waitingProps } from "./draft-wait.js";
import { ReopenClosureDialog } from "./ReopenClosureDialog.js";
import { closureSubject, DATE_FORMAT } from "./rule-subjects.js";
import { isSeries } from "./series-edit.js";
import { SeriesEditDialog } from "./SeriesEditDialog.js";
import type { SpecialDateRule } from "./special-dates.js";

export interface ClosureLayerActionsProps {
  readonly rule: SpecialDateRule;
  readonly date: string;
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  readonly timezone: string;
  readonly today: string;
  readonly waiting: boolean;
  readonly reasonId: string;
  readonly onFinished: () => void;
  readonly onStale: () => void;
}

type Step = "reopen" | "series" | { readonly editDate: string } | null;

/**
 * Remove (reopen) and, on a repeating closure, Edit dates… for the closure behind a layer: the
 * Special dates tab's own dialogs, opened on this date, so the count, the notice and the stranded
 * check are the ones already there.
 */
export function ClosureLayerActions(props: ClosureLayerActionsProps) {
  const { rule, date, venueId, state, today, waiting, reasonId, onFinished, onStale } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const summaries = useClosureSummaries({ venueId });
  const [step, setStep] = useState<Step>(null);
  const rules = state.config.dateRules;
  const summary = summaries.data?.find((s) => s.ruleId === rule.id);
  const cancelled = summaries.error || !summaries.data ? null : (summary?.cancelled ?? 0);
  const label = format.formatCalendarDate(date, DATE_FORMAT);

  return (
    <>
      {isSeries(rule) && (
        <Button
          variant="ghost"
          size="sm"
          {...skipInitialFocus}
          {...waitingProps(waiting, reasonId)}
          aria-label={t("availabilitySpecial.series.editDatesFor", { date: label })}
          onClick={() => {
            if (!waiting) setStep("series");
          }}
        >
          {t("availabilitySpecial.series.editDates")}
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        {...skipInitialFocus}
        {...waitingProps(waiting, reasonId)}
        aria-label={t("availabilitySpecial.removeClosureFor", { date: label })}
        onClick={() => {
          if (!waiting) setStep("reopen");
        }}
      >
        {t("availabilitySpecial.remove")}
      </Button>
      {step === "reopen" && (
        <ReopenClosureDialog
          venueId={venueId}
          ruleId={rule.id}
          subject={closureSubject(rule, format, t)}
          cancelled={cancelled}
          notifiable={summary?.upcomingCancelled ?? null}
          countFailed={summaries.error != null}
          subjectIsSpan={rule.endsOn !== rule.startsOn || rule.repeat != null}
          onRetryCount={() => void summaries.refetch()}
          rules={rules}
          rule={rule}
          today={today}
          services={state.config.venueServices}
          editedDates={rules.filter((r) => r.seriesId === rule.id).length}
          isSeriesEdit={rule.seriesId != null && rules.some((r) => r.id === rule.seriesId)}
          onDone={onFinished}
          onClose={() => setStep(null)}
        />
      )}
      {step === "series" && (
        <SeriesEditDialog
          venueId={venueId}
          state={state}
          series={rule}
          timezone={props.timezone}
          today={today}
          initialDate={date}
          onStale={onStale}
          onSaved={onFinished}
          onEditDate={(_series, editDate) => setStep({ editDate })}
          onClose={() => setStep(null)}
        />
      )}
      {typeof step === "object" && step !== null && (
        <CloseDialog
          venueId={venueId}
          state={state}
          timezone={props.timezone}
          today={today}
          initialDate={step.editDate}
          series={rule}
          onClose={() => setStep(null)}
        />
      )}
    </>
  );
}
