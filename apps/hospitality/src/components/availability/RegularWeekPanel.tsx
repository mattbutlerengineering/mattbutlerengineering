import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Stack, Text } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { DraftPreview } from "./DraftPreview.js";
import { LeaveGuard } from "./LeaveGuard.js";
import type { QuickSetupDraft } from "./quick-setup-draft.js";
import { useWeekdayName } from "./quick-setup-field-helpers.js";
import { QuickSetupForm } from "./QuickSetupForm.js";
import {
  BlockedReason,
  ConflictReviewPanel,
  OwnChangesChoice,
  SaveFailure,
  useWeekdaySummary,
} from "./ScheduleFormParts.js";
import { useRegularWeekEdit } from "./use-regular-week-edit.js";
import styles from "./RegularWeekPanel.module.css";

export interface RegularWeekPanelProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  /** Today on the venue clock: every save from here starts then. */
  readonly today: string;
  readonly onStale: () => void;
  /** Starting later…: the draft as it is (the saved week when untouched), for the drawer. */
  readonly onStartLater: (draft: QuickSetupDraft) => void;
  /** The form has edits that are not saved; the page asks before the layer goes. */
  readonly onDirtyChange?: (dirty: boolean) => void;
}

/**
 * The regular week where it lives (ux.md F6): the onboarding week form with its guest preview,
 * editable in place and applied from today. It is the drawer's logic (`useRegularWeekEdit`, with
 * the start pinned to today) in another frame, not a second save.
 *
 * The hook keeps the version its draft was built on, so after this panel's own save the body is
 * rebuilt from the refreshed config once the state has reached the saved version.
 */
export function RegularWeekPanel(props: RegularWeekPanelProps) {
  const { state } = props;
  const [epoch, setEpoch] = useState(0);
  const [awaiting, setAwaiting] = useState<number | null>(null);
  if (awaiting !== null && state.version >= awaiting) {
    setAwaiting(null);
    setEpoch((n) => n + 1);
  }
  return (
    <RegularWeekPanelBody
      key={`${props.venueId}:${epoch}`}
      {...props}
      settling={awaiting !== null}
      onSaved={(version) => setAwaiting(version)}
      onDiscard={() => setEpoch((n) => n + 1)}
    />
  );
}

interface BodyProps extends RegularWeekPanelProps {
  /** Saved; the refreshed config has not arrived yet. */
  readonly settling: boolean;
  readonly onSaved: (version: number) => void;
  readonly onDiscard: () => void;
}

function RegularWeekPanelBody(props: BodyProps) {
  const { venueId, state, today, onStale, onStartLater, onDirtyChange, settling } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const dayName = useWeekdayName();
  const summarize = useWeekdaySummary();
  const blockedId = useId();
  const {
    draft,
    edit,
    conflictMode,
    setConflictMode,
    saver,
    review,
    dirty,
    weekdays,
    dates,
    own,
    issues,
    outside,
    closedDays,
    focusDate,
    block,
    blockedText,
    blocked,
    previewChanges,
    scopeConflicts,
    submit,
  } = useRegularWeekEdit({
    venueId,
    state,
    today,
    onStale,
    fixedStart: today,
    onSaved: (saved) => props.onSaved(saved.version),
    onGone: props.onDiscard,
  });
  const unsaved = dirty && !settling;
  useEffect(() => {
    onDirtyChange?.(unsaved);
    return () => onDirtyChange?.(false);
  }, [unsaved, onDirtyChange]);

  const todayText = format.formatCalendarDate(today, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div data-testid="week-panel">
      <Stack gap="md">
        {review.review ? (
          <ConflictReviewPanel
            review={review.review}
            onReapply={review.reapply}
            onDiscard={review.discard}
          />
        ) : (
          <SaveFailure messages={saver.failure} stranded={saver.stranded} />
        )}
        <QuickSetupForm draft={draft} onChange={edit} issues={issues} />
        {dirty && (
          <>
            {weekdays.length > 0 && (
              <Text variant="caption" color="secondary">
                {t("availabilitySchedules.regularWeek.becomes", { days: summarize(weekdays) })}
              </Text>
            )}
            {closedDays.length > 0 && (
              <Text variant="caption" color="secondary">
                {t("availabilitySchedules.regularWeek.closedDays", {
                  count: closedDays.length,
                  days: new Intl.ListFormat(format.locale, { type: "conjunction" }).format(
                    closedDays.map((day) => dayName(day))
                  ),
                })}
              </Text>
            )}
            {outside.map((schedule) => (
              <Text key={schedule.name} variant="caption" color="secondary">
                {t("availabilitySchedules.regularWeek.outside", {
                  days: summarize(schedule.weekdays),
                  name: schedule.name,
                })}
              </Text>
            ))}
            <OwnChangesChoice
              count={dates.length > 1 ? own.length : 0}
              value={conflictMode}
              onChange={setConflictMode}
            />
            <DraftPreview
              venueId={venueId}
              changes={previewChanges}
              scopeConflicts={scopeConflicts}
              dates={dates}
              focusDate={focusDate}
              baseVersion={review.baselineVersion}
              idle={block === "conflict" ? "conflict" : "fields"}
            />
          </>
        )}
        <div className={styles.footer}>
          <Text variant="caption" color="secondary" className={styles.apply}>
            {t("availabilitySchedules.layer.appliesFrom", { date: todayText })}
          </Text>
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => onStartLater(draft)}>
              {t("availabilitySchedules.layer.startLater")}
            </Button>
            {unsaved && (
              <>
                <Button variant="secondary" onClick={props.onDiscard}>
                  {t("availabilitySchedules.layer.discard")}
                </Button>
                <Button
                  variant="primary"
                  disabled={blocked}
                  aria-describedby={blocked ? blockedId : undefined}
                  isLoading={saver.isPending}
                  onClick={() => void submit()}
                >
                  {t("availabilitySchedules.save")}
                </Button>
              </>
            )}
          </div>
          {unsaved && <BlockedReason id={blockedId} reason={blockedText} />}
        </div>
        <LeaveGuard active={unsaved} date={null} title={t("availabilitySchedules.discard.title")} />
      </Stack>
    </div>
  );
}
