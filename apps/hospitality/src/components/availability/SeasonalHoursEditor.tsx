import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, DatePicker, Input, Stack, Text } from "@mattbutlerengineering/rialto";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { pruneAlsoApply } from "./also-apply.js";
import { AlsoApplyTo } from "./AlsoApplyTo.js";
import { DraftPreview } from "./DraftPreview.js";
import { EditorSaveBar } from "./EditorSaveBar.js";
import { draftRows, FormConflictDialog } from "./FormConflictDialog.js";
import { LeaveGuard } from "./LeaveGuard.js";
import { NameSuggestionChip } from "./NameSuggestionChip.js";
import { focusFirstInvalid } from "./quick-setup-field-helpers.js";
import { previewOverlapReason } from "./quick-setup-validate.js";
import { QuickSetupForm } from "./QuickSetupForm.js";
import { storedKeptByName } from "./schedule-changes.js";
import { OverlapChoice, SaveFailure } from "./ScheduleFormParts.js";
import { useRefusedPress } from "./use-refused-press.js";
import { useScheduleEditor, type ScheduleEditorInput } from "./use-schedule-editor.js";
import styles from "./SeasonalHoursEditor.module.css";

export interface SeasonalHoursEditorProps extends Omit<ScheduleEditorInput, "onClose"> {
  /** The refresh of the config failed, as the page words it; a conflict being reviewed says so. */
  readonly refreshError: string | null;
  /** Saved, or the Manager chose to leave a schedule that is gone: the page returns to the list. */
  readonly onDone: () => void;
}

const NO_ISSUES: readonly never[] = [];

/**
 * The Seasonal hours editor's form (availability-hub ux.md, "Seasonal hours"): name, typed dates,
 * the name suggestion, the services, "Also apply to" on an edit, and the save bar with the overlap
 * choice in view. The state is `useScheduleEditor`'s, the same the drawer on today's page uses.
 */
export function SeasonalHoursEditor(props: SeasonalHoursEditorProps) {
  const { venueId, today, sourceScheduleId, onStale, refreshError, onDone } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const scopeId = useId();
  // The leave prompt's Save: its route change goes ahead by itself, so no return to the list.
  const viaPromptRef = useRef(false);
  const [leaving, setLeaving] = useState(false);
  // Nothing is left to lose (saved, or discarded for a schedule that is gone).
  const [done, setDone] = useState(false);
  const [finished, setFinished] = useState(false);
  const [revealed, setRevealed] = useState(false);
  // The page leaves only after the render that drops the leave guard, or the guard would stop it.
  const goBack = useEffectEvent(onDone);
  useEffect(() => {
    if (finished) goBack();
  }, [finished]);
  const finish = () => {
    setDone(true);
    if (!viaPromptRef.current) setFinished(true);
  };
  const e = useScheduleEditor({ ...props, onClose: finish });
  const { editing, review, saver, draft, issues } = e;
  // The first service is open on arrival, so the form starts in reach of the save bar after it.
  const [initialOpenId] = useState(() => draft.services[0]?.id ?? null);
  const shown = e.draftTouched || revealed ? issues : NO_ISSUES;
  // A problem in a field the Manager can be taken to; a conflict or a missing name is a reason.
  const hasProblem = e.block === null && issues.length > 0;
  const { refuse } = useRefusedPress({
    onRefused: () => setRevealed(true),
    focusFirstProblem: () => focusFirstInvalid(shown, scopeId),
  });
  const unsaved = e.dirty && !done;
  const save = () => (hasProblem ? refuse() : void e.submit());
  const saveAndLeave = async (): Promise<boolean> => {
    if (e.blocked) {
      if (hasProblem) refuse();
      return false;
    }
    viaPromptRef.current = true;
    setLeaving(true);
    const saved = await e.submit();
    viaPromptRef.current = false;
    if (!saved) setLeaving(false);
    return saved;
  };
  const discard = () => {
    e.reset();
    setRevealed(false);
  };
  const bar = (
    <EditorSaveBar
      dirty={unsaved}
      saving={saver.isPending}
      reach={{ kind: "dates", count: e.dates.length }}
      hasProblem={hasProblem}
      blockedReason={e.block ? t(`availabilitySchedules.blocked.${e.block}`) : null}
      specialHours={{
        count: e.dates.length > 1 ? e.own.length : 0,
        value: e.conflictMode,
        onChange: e.setConflictMode,
      }}
      onSave={save}
      onDiscard={discard}
      onRefused={refuse}
    >
      {/* In the pinned bar, so what a save also touches stays in view beside Save. */}
      <AlsoApplyTo
        options={e.alsoOptions}
        picks={pruneAlsoApply(e.alsoOptions, e.picks)}
        onChange={e.setPicks}
      />
      <OverlapChoice
        name={e.trimmed || t("availabilitySchedules.thisSchedule")}
        others={e.overlaps}
        value={e.winner}
        onChange={e.setWinner}
      />
    </EditorSaveBar>
  );

  return (
    <div className={styles.editor} data-testid="seasonal-editor">
      <div className={styles.layout}>
        <Stack gap="md">
          {!review.review && <SaveFailure messages={saver.failure} stranded={saver.stranded} />}
          <Input
            label={t("availabilitySchedules.name")}
            value={e.name}
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
                  value={e.startsOn}
                  max={e.endsOn ?? undefined}
                  locale={format.locale}
                  onChange={e.setStartsOn}
                />
                <DatePicker
                  label={t("availabilitySchedules.endsOn")}
                  placeholder={t("availabilitySchedules.noEnd")}
                  value={e.endsOn}
                  min={e.startsOn ?? undefined}
                  locale={format.locale}
                  onChange={e.setEndsOn}
                />
                {e.endsOn !== null && (
                  <Button variant="ghost" size="sm" onClick={() => e.setEndsOn(null)}>
                    {t("availabilitySchedules.noEnd")}
                  </Button>
                )}
              </div>
              {/* Below the dates it is drawn from, so choosing them never moves a picker. */}
              <NameSuggestionChip
                startsOn={e.startsOn}
                endsOn={e.endsOn}
                name={e.name}
                onUse={e.setName}
              />
            </>
          )}
          <Text variant="caption" color="secondary">
            {e.weekdays.length === 0 && !editing
              ? t("availabilitySchedules.impactNone")
              : e.alsoIds.length > 0
                ? t("availabilitySchedules.compare.impact", {
                    schedules: t("availabilitySchedules.compare.impactSchedules", {
                      count: e.alsoIds.length + 1,
                    }),
                    dates: t("availabilitySchedules.compare.impactDates", {
                      count: e.dates.length,
                    }),
                  })
                : t("availabilitySchedules.impact", { count: e.dates.length })}
          </Text>
          <QuickSetupForm
            draft={draft}
            onChange={e.changeDraft}
            // A New schedule opens on an empty service: its fields wait for the Manager to start
            // on it, or to press Save, before they say what is missing.
            issues={shown}
            idScope={scopeId}
            // An edit falls back to this schedule's stored rows; a new schedule stores none yet.
            storedKept={editing ? storedKeptByName(e.config, sourceScheduleId) : undefined}
            fixedDays={editing}
            collapsible
            initialOpenId={initialOpenId}
            afterOpenService={bar}
            hidePreview
          />
        </Stack>
        <Stack gap="md" className={styles.aside}>
          <DraftPreview
            venueId={venueId}
            changes={e.previewChanges}
            scopeConflicts={e.dates.length > 1 ? e.conflictMode : "replace"}
            dates={editing && sourceScheduleId ? e.reach : e.dates}
            scope={editing ? { from: today } : undefined}
            baseVersion={review.baselineVersion}
            idle={e.block === "conflict" ? "conflict" : e.dirty ? "fields" : "untouched"}
            fieldsReason={previewOverlapReason(issues, draft, t, (day) => e.dayName(day))}
          />
        </Stack>
      </div>
      <FormConflictDialog
        saver={saver}
        review={review.review}
        rows={draftRows(draft)}
        alsoApply={e.alsoApplySince ?? undefined}
        reloadError={refreshError}
        onReload={onStale}
        onReapply={review.reapply}
        onStartOver={review.discard}
        onDiscard={finish}
      />
      <LeaveGuard
        active={unsaved || leaving}
        date={null}
        title={t("availabilitySchedules.discard.title")}
        onSave={saveAndLeave}
      />
    </div>
  );
}
