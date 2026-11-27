import { useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button, DatePicker, Drawer, Input, Stack, Text } from "@mattbutlerengineering/rialto";
import { useAvailabilityUndo } from "../../hooks/useAvailabilityUndo.js";
import { useViewport } from "../../hooks/useViewport.js";
import { pruneAlsoApply } from "./also-apply.js";
import { previewOverlapReason } from "./quick-setup-validate.js";
import { storedKeptByName } from "./schedule-changes.js";
import {
  BlockedReason,
  OverlapChoice,
  OwnChangesChoice,
  SaveFailure,
  ScheduleDraftGuard,
} from "./ScheduleFormParts.js";
import { AlsoApplyTo } from "./AlsoApplyTo.js";
import { DraftPreview } from "./DraftPreview.js";
import { draftRows, FormConflictDialog } from "./FormConflictDialog.js";
import { NameSuggestionChip } from "./NameSuggestionChip.js";
import { QuickSetupForm } from "./QuickSetupForm.js";
import { useDiscardGuard } from "./use-discard-guard.js";
import { useScheduleEditor, type ScheduleEditorInput } from "./use-schedule-editor.js";
import styles from "./ScheduleFormParts.module.css";

export type { ScheduleEditorMode } from "./use-schedule-editor.js";

export interface ScheduleEditorDrawerProps extends Omit<ScheduleEditorInput, "offerUndo"> {
  /** The reload of the config failed (the page's read); a conflict being reviewed says so. */
  readonly refreshError?: string | null;
}

const NO_ISSUES: readonly never[] = [];

/**
 * New, duplicate and edit for a schedule (ux.md F3) in a drawer; the state is
 * `useScheduleEditor`'s, shared with the Seasonal hours editor page.
 */
export function ScheduleEditorDrawer(props: ScheduleEditorDrawerProps) {
  const viewport = useViewport();
  const { venueId, today, sourceScheduleId, onStale, onClose } = props;
  const { t } = useTranslation();
  const offerUndo = useAvailabilityUndo();
  const e = useScheduleEditor({
    ...props,
    offerUndo: (title, saved) => offerUndo({ venueId, title, saved }),
  });
  const {
    config,
    editing,
    review,
    saver,
    name,
    startsOn,
    endsOn,
    draft,
    draftTouched,
    dirty,
    weekdays,
    issues,
    trimmed,
    block,
    blockedText,
    blocked,
    alsoOptions,
    alsoIds,
    picks,
    dates,
    own,
    reach,
    title,
    dayName,
  } = e;
  // Escape, the backdrop and Cancel all ask first while there is something to lose.
  const guard = useDiscardGuard<void>(onClose, dirty);
  const blockedId = useId();
  // Cancel is always there: it takes focus when a conflict's answer leaves Save disabled.
  const cancelRef = useRef<HTMLButtonElement>(null);
  const submit = () => void e.submit();

  return (
    <>
      <Drawer
        open
        onClose={() => guard.request()}
        title={title}
        size={viewport === "phone" ? "full" : "wide"}
        footer={
          <div className={styles.footer}>
            <BlockedReason id={blockedId} reason={blockedText} />
            <Button ref={cancelRef} variant="secondary" onClick={() => guard.request()}>
              {t("availabilitySchedules.cancel")}
            </Button>
            <Button
              variant="primary"
              disabled={blocked}
              aria-describedby={blocked ? blockedId : undefined}
              isLoading={saver.isPending}
              onClick={submit}
            >
              {t("availabilitySchedules.save")}
            </Button>
          </div>
        }
      >
        <Stack gap="md">
          {!review.review && <SaveFailure messages={saver.failure} stranded={saver.stranded} />}
          <Input
            label={t("availabilitySchedules.name")}
            value={name}
            maxLength={60}
            required
            onChange={(event) => e.setName(event.target.value)}
          />
          {!editing && (
            <>
              <div className={styles.dates}>
                <DatePicker
                  label={t("availabilitySchedules.startsOn")}
                  placeholder={t("availabilitySchedules.noStart")}
                  value={startsOn}
                  max={endsOn ?? undefined}
                  onChange={e.setStartsOn}
                />
                <DatePicker
                  label={t("availabilitySchedules.endsOn")}
                  placeholder={t("availabilitySchedules.noEnd")}
                  value={endsOn}
                  min={startsOn ?? undefined}
                  onChange={e.setEndsOn}
                />
                {endsOn !== null && (
                  <Button variant="ghost" size="sm" onClick={() => e.setEndsOn(null)}>
                    {t("availabilitySchedules.noEnd")}
                  </Button>
                )}
              </div>
              {/* Below the dates it is drawn from, so choosing them never moves a picker. */}
              <NameSuggestionChip
                startsOn={startsOn}
                endsOn={endsOn}
                name={name}
                onUse={e.setName}
              />
            </>
          )}
          <Text variant="caption" color="secondary">
            {weekdays.length === 0 && !editing
              ? t("availabilitySchedules.impactNone")
              : alsoIds.length > 0
                ? t("availabilitySchedules.compare.impact", {
                    schedules: t("availabilitySchedules.compare.impactSchedules", {
                      count: alsoIds.length + 1,
                    }),
                    dates: t("availabilitySchedules.compare.impactDates", { count: dates.length }),
                  })
                : t("availabilitySchedules.impact", { count: dates.length })}
          </Text>
          <QuickSetupForm
            draft={draft}
            onChange={e.changeDraft}
            // A New schedule opens on an empty service: its fields wait for the Manager to start
            // on it before they say what is missing. Save's own reason is shown either way.
            issues={draftTouched ? issues : NO_ISSUES}
            // An edit falls back to this schedule's stored rows; a new schedule stores none yet.
            storedKept={editing ? storedKeptByName(config, sourceScheduleId) : undefined}
            inDrawer
            fixedDays={editing}
            collapsible={viewport === "phone"}
          />
          <AlsoApplyTo
            options={alsoOptions}
            picks={pruneAlsoApply(alsoOptions, picks)}
            onChange={e.setPicks}
          />
          <OverlapChoice
            name={trimmed || t("availabilitySchedules.thisSchedule")}
            others={e.overlaps}
            value={e.winner}
            onChange={e.setWinner}
          />
          <OwnChangesChoice
            count={dates.length > 1 ? own.length : 0}
            value={e.conflictMode}
            onChange={e.setConflictMode}
          />
          <DraftPreview
            venueId={venueId}
            changes={e.previewChanges}
            scopeConflicts={dates.length > 1 ? e.conflictMode : "replace"}
            dates={editing && sourceScheduleId ? reach : dates}
            scope={editing ? { from: today } : undefined}
            baseVersion={review.baselineVersion}
            idle={block === "conflict" ? "conflict" : dirty ? "fields" : "untouched"}
            fieldsReason={previewOverlapReason(issues, draft, t, (day) => dayName(day))}
          />
        </Stack>
      </Drawer>
      <FormConflictDialog
        saver={saver}
        review={review.review}
        rows={draftRows(draft)}
        alsoApply={e.alsoApplySince ?? undefined}
        reloadError={props.refreshError}
        onReload={onStale}
        onReapply={review.reapply}
        onStartOver={review.discard}
        onDiscard={onClose}
        returnFocus={cancelRef}
      />
      <ScheduleDraftGuard
        dirty={dirty}
        asking={guard.pending !== null}
        onDiscard={guard.confirmDiscard}
        onKeepEditing={guard.keepEditing}
      />
    </>
  );
}
