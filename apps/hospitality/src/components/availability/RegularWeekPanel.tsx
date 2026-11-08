import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Stack, Text } from "@mattbutlerengineering/rialto";
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
  /**
   * A save made elsewhere (the Starting later… drawer) that supersedes whatever is in the form:
   * once the state reaches this version the form starts again from the saved week, edits or not.
   */
  readonly resetAtVersion?: number;
  /** The refresh of the config failed (the page's read), so a settling save stops waiting for it. */
  readonly refreshError?: string | null;
}

/**
 * The regular week where it lives (ux.md F6): the onboarding week form with its guest preview,
 * editable in place and applied from today. It is the drawer's logic (`useRegularWeekEdit`, with
 * the start pinned to today) in another frame, not a second save.
 *
 * The hook keeps the version its draft was built on, so the body is rebuilt from the config
 * whenever the saved week moved under it and there is nothing to lose: the form is clean and no
 * conflict is being reviewed (a colleague's save, Undo, another editor). After this panel's own
 * save, or a save the page tells it about, the form starts again once the state has reached that
 * version, edits or not. A colleague's save while the form is dirty goes through conflict review.
 * Mounted per venue (the page keys it), so nothing here outlives a venue switch.
 */
export function RegularWeekPanel(props: RegularWeekPanelProps) {
  const { state, resetAtVersion, refreshError } = props;
  const { t } = useTranslation();
  const [seed, setSeed] = useState({ version: state.version, epoch: 0 });
  // The version this panel's own save returned, until the config has caught up with it.
  const [awaiting, setAwaiting] = useState<number | null>(null);
  const [status, setStatus] = useState({ dirty: false, reviewing: false });
  const forced = Math.max(awaiting ?? 0, resetAtVersion ?? 0);
  const restart = () => {
    setSeed((was) => ({ version: state.version, epoch: was.epoch + 1 }));
    setAwaiting(null);
    setStatus({ dirty: false, reviewing: false });
  };
  if (forced > seed.version && state.version >= forced) {
    restart();
  } else if (
    awaiting === null &&
    state.version !== seed.version &&
    !status.dirty &&
    !status.reviewing
  ) {
    restart();
  } else if (awaiting !== null && refreshError) {
    // The refresh failed: stop waiting for it and say so instead of hiding Save for good.
    setAwaiting(null);
  }
  return (
    <>
      {refreshError && (
        <Alert variant="error" title={t("availability.loadError")}>
          {refreshError}
        </Alert>
      )}
      <RegularWeekPanelBody
        key={`${props.venueId}:${seed.epoch}`}
        {...props}
        settling={awaiting !== null}
        onSaved={(version) => setAwaiting(version)}
        onDiscard={restart}
        onStatus={setStatus}
      />
    </>
  );
}

interface BodyProps extends RegularWeekPanelProps {
  /** Saved; the refreshed config has not arrived yet. */
  readonly settling: boolean;
  readonly onSaved: (version: number) => void;
  readonly onDiscard: () => void;
  readonly onStatus: (status: { dirty: boolean; reviewing: boolean }) => void;
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
    onStale,
    fixedStart: today,
    onSaved: (saved) => props.onSaved(saved.version),
    onGone: props.onDiscard,
  });
  const unsaved = dirty && !settling;
  const reviewing = review.review !== null;
  const { onStatus } = props;
  useEffect(() => {
    onStatus({ dirty, reviewing });
  }, [dirty, reviewing, onStatus]);
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
              title={t("availabilitySchedules.layer.whatChanges")}
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
