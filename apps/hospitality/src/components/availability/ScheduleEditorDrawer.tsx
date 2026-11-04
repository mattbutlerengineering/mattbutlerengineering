import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, DatePicker, Drawer, Input, Stack, Text } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfig, AvailabilityConfigState, ScopeConflictMode } from "@mbe/types";
import { useAvailabilityUndo } from "../../hooks/useAvailabilityUndo.js";
import { useViewport } from "../../hooks/useViewport.js";
import { reapplyWeek, weekKey } from "./change-week-draft.js";
import {
  coveredDays,
  draftFromConfig,
  emptyDraft,
  issueMessage,
  validateDraft,
  type QuickSetupDraft,
} from "./quick-setup-draft.js";
import { useWeekdayName } from "./quick-setup-field-helpers.js";
import {
  buildEditScheduleChanges,
  buildNewScheduleChanges,
  overlappingSchedules,
  datesOfUse,
  scheduleSaveBlock,
  type Winner,
} from "./schedule-changes.js";
import { ownChangeDates, scheduleReach, scopeDates } from "./scope-dates.js";
import {
  BlockedReason,
  ConflictReviewPanel,
  OverlapChoice,
  OwnChangesChoice,
  SaveFailure,
  ScheduleDraftGuard,
} from "./ScheduleFormParts.js";
import { DraftPreview, previewIds } from "./DraftPreview.js";
import { NameSuggestionChip } from "./NameSuggestionChip.js";
import { QuickSetupForm } from "./QuickSetupForm.js";
import { useConflictReview } from "./use-conflict-review.js";
import { useDiscardGuard } from "./use-discard-guard.js";
import { useScheduleSave } from "./use-schedule-save.js";
import styles from "./ScheduleFormParts.module.css";

export type ScheduleEditorMode = "new" | "duplicate" | "edit";

export interface ScheduleEditorDrawerProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  readonly timezone: string;
  /** Today on the venue clock. */
  readonly today: string;
  readonly mode: ScheduleEditorMode;
  /** The schedule being edited or copied. */
  readonly sourceScheduleId?: string;
  readonly onStale: () => void;
  readonly onClose: () => void;
}

/**
 * New, duplicate and edit for a schedule (ux.md F3). The services are quick setup's rows, with
 * their own days and different-hours blocks. A new or copied schedule is used on the days its
 * services run, over optional dates, and settles who wins an overlap; an edit keeps its use and
 * changes the schedule everywhere it runs.
 */
export function ScheduleEditorDrawer(props: ScheduleEditorDrawerProps) {
  const viewport = useViewport();
  const { venueId, state, timezone, today, mode, sourceScheduleId, onStale, onClose } = props;
  const { config } = state;
  const { t } = useTranslation();
  const dayName = useWeekdayName();
  const offerUndo = useAvailabilityUndo();
  const saver = useScheduleSave(onStale);

  const source = config.schedules.find((s) => s.id === sourceScheduleId);
  const seedDraft = (from: AvailabilityConfig): QuickSetupDraft =>
    source
      ? draftFromConfig(from, () => crypto.randomUUID(), source.id)
      : emptyDraft(crypto.randomUUID());
  const [initialName] = useState(() =>
    mode === "edit"
      ? (source?.name ?? "")
      : mode === "duplicate"
        ? t("availabilitySchedules.copyName", { name: source?.name ?? "" })
        : ""
  );
  const [initialDraft] = useState(() => seedDraft(config));
  const [name, setName] = useState(initialName);
  const [draft, setDraft] = useState<QuickSetupDraft>(initialDraft);
  const [startsOn, setStartsOn] = useState<string | null>(null);
  const [endsOn, setEndsOn] = useState<string | null>(null);
  const [winner, setWinner] = useState<Winner>("new");
  const [conflictMode, setConflictMode] = useState<ScopeConflictMode>("keep");

  const editing = mode === "edit";
  const review = useConflictReview({
    kind: editing ? "edit" : "draft",
    state,
    scheduleId: sourceScheduleId,
    // The week is merged below, by service name, with its days and blocks; the hook's own
    // per-row merge is for drafts made of `DraftService` rows.
    services: [],
    name: editing ? name : null,
    conflicted: saver.conflicted,
    clearConflict: saver.clearConflict,
    apply: (next) => {
      const gone = !state.config.schedules.some((s) => s.id === sourceScheduleId);
      if (next.discarded) setDraft(seedDraft(state.config));
      else if (!gone) {
        setDraft(
          reapplyWeek({
            base: seedDraft(next.baseline),
            draft,
            latest: seedDraft(state.config),
          })
        );
      }
      if (next.name !== null) setName(next.name);
    },
    startOver: () => {
      setDraft(seedDraft(state.config));
      setName(initialName);
      setStartsOn(null);
      setEndsOn(null);
      setWinner("new");
      setConflictMode("keep");
    },
    onGone: onClose,
  });
  const baselineDraft = useMemo(
    () => (editing ? seedDraft(review.baseline) : initialDraft),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seedDraft reads only `source`, fixed by the ids below
    [editing, review.baseline, initialDraft, sourceScheduleId]
  );
  const dirty =
    name !== (editing ? review.baselineName : initialName) ||
    weekKey(draft) !== weekKey(baselineDraft) ||
    startsOn !== null ||
    endsOn !== null;
  // Escape, the backdrop and Cancel all ask first while there is something to lose.
  const guard = useDiscardGuard<void>(onClose, dirty);
  // A new or copied schedule is used on the days its services run.
  const weekdays = useMemo(() => coveredDays(draft), [draft]);
  const useOn = useMemo(() => ({ weekdays, startsOn, endsOn }), [weekdays, startsOn, endsOn]);
  const dates = useMemo(
    () =>
      editing && sourceScheduleId
        ? scopeDates(
            { kind: "schedule", scheduleId: sourceScheduleId },
            { config, timezone, today }
          )
        : datesOfUse(useOn, today),
    [editing, sourceScheduleId, config, timezone, today, useOn]
  );
  const own = useMemo(() => ownChangeDates(config, dates, null), [config, dates]);
  // What the preview reaches: the schedule's week plus the dates a use_schedule rule sends to it.
  const reach = useMemo(
    () =>
      editing && sourceScheduleId
        ? scheduleReach(sourceScheduleId, { config, timezone, today })
        : [],
    [editing, sourceScheduleId, config, timezone, today]
  );
  const overlaps = useMemo(
    () => (editing ? [] : overlappingSchedules(config, useOn).map((s) => s.name)),
    [editing, config, useOn]
  );

  const issues = useMemo(() => validateDraft(draft), [draft]);
  const trimmed = name.trim();
  const block = scheduleSaveBlock({
    conflicted: saver.conflicted,
    name,
    services: draft.services,
    startsOn,
    endsOn,
  });
  const firstIssue = issues[0];
  const blockedText = block
    ? t(`availabilitySchedules.blocked.${block}`)
    : firstIssue
      ? issueMessage(firstIssue, draft, t, (day) => dayName(day))
      : null;
  const blocked = blockedText !== null;
  const blockedId = useId();
  const previewChanges = useMemo(() => {
    if (blocked || !dirty) return null;
    const makeId = previewIds();
    return editing && sourceScheduleId
      ? buildEditScheduleChanges({
          config,
          scheduleId: sourceScheduleId,
          name: trimmed,
          draft,
          makeId,
          baseline: review.baseline,
        })
      : buildNewScheduleChanges({ config, name: trimmed, draft, useOn, winner, makeId });
  }, [
    blocked,
    dirty,
    editing,
    sourceScheduleId,
    config,
    trimmed,
    draft,
    review.baseline,
    useOn,
    winner,
  ]);

  const submit = async () => {
    const makeId = () => crypto.randomUUID();
    const changes =
      editing && sourceScheduleId
        ? buildEditScheduleChanges({
            config,
            scheduleId: sourceScheduleId,
            name: trimmed,
            draft,
            makeId,
            baseline: review.baseline,
          })
        : buildNewScheduleChanges({ config, name: trimmed, draft, useOn, winner, makeId });
    // Checked against the version the draft was built from, so a change made since is a
    // conflict the Manager reviews, not something this save quietly rebases.
    const saved = await saver.save(
      venueId,
      { ...state, version: review.baselineVersion },
      changes,
      dates.length > 1 ? conflictMode : "replace"
    );
    if (!saved) return;
    offerUndo({ venueId, saved, title: t("availabilitySchedules.saved", { name: trimmed }) });
    onClose();
  };

  const title =
    mode === "edit"
      ? t("availabilitySchedules.editTitle", { name: source?.name ?? "" })
      : mode === "duplicate"
        ? t("availabilitySchedules.duplicateTitle")
        : t("availabilitySchedules.newTitle");

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
            <Button variant="secondary" onClick={() => guard.request()}>
              {t("availabilitySchedules.cancel")}
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
          </div>
        }
      >
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
          <Input
            label={t("availabilitySchedules.name")}
            value={name}
            maxLength={60}
            required
            onChange={(e) => setName(e.target.value)}
          />
          {!editing && (
            <>
              <div className={styles.dates}>
                <DatePicker
                  label={t("availabilitySchedules.startsOn")}
                  placeholder={t("availabilitySchedules.noStart")}
                  value={startsOn}
                  max={endsOn ?? undefined}
                  onChange={setStartsOn}
                />
                <DatePicker
                  label={t("availabilitySchedules.endsOn")}
                  placeholder={t("availabilitySchedules.noEnd")}
                  value={endsOn}
                  min={startsOn ?? undefined}
                  onChange={setEndsOn}
                />
                {endsOn !== null && (
                  <Button variant="ghost" size="sm" onClick={() => setEndsOn(null)}>
                    {t("availabilitySchedules.noEnd")}
                  </Button>
                )}
              </div>
              {/* Below the dates it is drawn from, so choosing them never moves a picker. */}
              <NameSuggestionChip startsOn={startsOn} endsOn={endsOn} name={name} onUse={setName} />
            </>
          )}
          <Text variant="caption" color="secondary">
            {weekdays.length === 0 && !editing
              ? t("availabilitySchedules.impactNone")
              : t("availabilitySchedules.impact", { count: dates.length })}
          </Text>
          <QuickSetupForm
            draft={draft}
            onChange={setDraft}
            issues={issues}
            inDrawer
            fixedDays={editing}
          />
          <OverlapChoice
            name={trimmed || t("availabilitySchedules.thisSchedule")}
            others={overlaps}
            value={winner}
            onChange={setWinner}
          />
          <OwnChangesChoice
            count={dates.length > 1 ? own.length : 0}
            value={conflictMode}
            onChange={setConflictMode}
          />
          <DraftPreview
            venueId={venueId}
            changes={previewChanges}
            scopeConflicts={dates.length > 1 ? conflictMode : "replace"}
            dates={editing && sourceScheduleId ? reach : dates}
            scope={editing ? { from: today } : undefined}
            baseVersion={review.baselineVersion}
            idle={block === "conflict" ? "conflict" : dirty ? "fields" : "untouched"}
          />
        </Stack>
      </Drawer>
      <ScheduleDraftGuard
        dirty={dirty}
        asking={guard.pending !== null}
        onDiscard={guard.confirmDiscard}
        onKeepEditing={guard.keepEditing}
      />
    </>
  );
}
