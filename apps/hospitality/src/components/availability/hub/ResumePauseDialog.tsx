import { useTranslation } from "react-i18next";
import type { AvailabilityConfigState } from "@mbe/types";
import { useClosureSummaries } from "../../../hooks/useClosures.js";
import { useVenueFormat } from "../../../hooks/useVenueFormat.js";
import { ReopenClosureDialog } from "../ReopenClosureDialog.js";
import { closureKindOf, closureSubject } from "../rule-subjects.js";
import type { SpecialDateRule } from "../special-dates.js";

export interface ResumePauseDialogProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  /** The pause, as the config holds it. */
  readonly rule: SpecialDateRule;
  readonly today: string;
  readonly onClose: () => void;
}

/**
 * Resume online booking, asked once, from the hub's row 4. It is the Reopen dialog the Closures
 * page uses, so guests the pause cancelled can be told in the same words.
 */
export function ResumePauseDialog({
  venueId,
  state,
  rule,
  today,
  onClose,
}: ResumePauseDialogProps) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const summaries = useClosureSummaries({ venueId });
  const summary = summaries.data?.find((s) => s.ruleId === rule.id);
  const { dateRules, venueServices } = state.config;
  return (
    <ReopenClosureDialog
      venueId={venueId}
      ruleId={rule.id}
      subject={closureSubject(rule, format, t)}
      closes={closureKindOf(rule)}
      cancelled={summaries.error || !summaries.data ? null : (summary?.cancelled ?? 0)}
      notifiable={summary?.upcomingCancelled ?? null}
      countFailed={summaries.error != null}
      subjectIsSpan={rule.endsOn !== rule.startsOn || rule.repeat != null}
      onRetryCount={() => void summaries.refetch()}
      rules={dateRules}
      rule={rule}
      today={today}
      services={venueServices}
      onClose={onClose}
    />
  );
}
