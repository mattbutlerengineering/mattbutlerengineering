import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, DatePicker, Drawer, Input, Stack, Text } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfig, AvailabilityConfigState, ScopeConflictMode } from "@mbe/types";
import { useAvailabilityUndo } from "../../hooks/useAvailabilityUndo.js";
import { useViewport } from "../../hooks/useViewport.js";
import {
  alsoApplyChangedSince,
  alsoApplyOptions,
  alsoApplyScheduleIds,
  buildAlsoApplyChanges,
  pruneAlsoApply,
  type AlsoApplyPicks,
} from "./also-apply.js";
import { reapplyWeek, weekKey } from "./change-week-draft.js";
import {
  coveredDays,
  draftFromConfig,
  emptyDraft,
  issueMessage,
  scheduleDays,
  validateDraft,
  type QuickSetupDraft,
} from "./quick-setup-draft.js";
import { useWeekdayName } from "./quick-setup-field-helpers.js";
import {
  buildEditScheduleChanges,
  buildNewScheduleChanges,
  overlappingSchedules,
  datesOfUse,
  replacesRegularWeek,
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
import { AlsoApplyTo } from "./AlsoApplyTo.js";
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
  /**
   * New schedule only: start from the regular week's services (Add a schedule…). The days stay
   * empty until Starting is set, then follow the regular week while the Manager leaves them be.
   */
  readonly seed?: "regular";
  readonly onStale: () => void;
  readonly onClose: () => void;
}

const NO_ISSUES: readonly never[] = [];

/**
 * New, duplicate and edit for a schedule (ux.md F3). The services are quick setup's rows, with
 * their own days and different-hours blocks. A new or copied schedule is used on the days its
 * services run, over optional dates, and settles who wins an overlap; an edit keeps its use and
 * changes the schedule everywhere it runs.
 */
export function ScheduleEditorDrawer(props: ScheduleEditorDrawerProps) {
  const viewport = useViewport();
  const { venueId, state, timezone, today, mode, sourceScheduleId, seed, onStale, onClose } = props;
  const { config } = state;
  const { t } = useTranslation();
  const dayName = useWeekdayName();
  const offerUndo = useAvailabilityUndo();
  const saver = useScheduleSave(onStale);

  const source = config.schedules.find((s) => s.id === sourceScheduleId);
  // A copy starts with no days, as a new schedule does: it is used where the Manager says. Seeded
  // with the source's days it would save as an undated assignment that outranks the regular week
  // on every day, and a schedule only a Use schedule rule runs has no days of its own to copy.
  const regular = config.schedules.find((s) => s.isRegular && !s.archivedAt);
  const seedDraft = (from: AvailabilityConfig): QuickSetupDraft => {
    // Add a schedule…: the regular week's services, no days (they follow once Starting is set).
    if (mode === "new" && seed === "regular" && regular) {
      return { ...draftFromConfig(from, () => crypto.randomUUID(), regular.id), days: [] };
    }
    if (!source) return emptyDraft(crypto.randomUUID());
    const seeded = draftFromConfig(from, () => crypto.randomUUID(), source.id);
    return mode === "duplicate" ? { ...seeded, days: [] } : seeded;
  };
  const [initialName] = useState(() =>
    mode === "edit"
      ? (source?.name ?? "")
      : mode === "duplicate"
        ? t("availabilitySchedules.copyName", { name: source?.name ?? "" })
        : ""
  );
  const [initialDraft] = useState(() => seedDraft(config));
  const [name, setName] = useState(initialName);
  const [rawDraft, setDraft] = useState<QuickSetupDraft>(initialDraft);
  // The Manager has chosen days themselves; until then a seeded schedule's days follow the regular week.
  const [daysTouched, setDaysTouched] = useState(false);
  const regularDays = useMemo(
    () => (regular ? coveredDays(draftFromConfig(config, () => "seed", regular.id)) : []),
    [config, regular]
  );
  const followsRegular = mode === "new" && seed === "regular" && !daysTouched;
  const [startsOn, setStartsOn] = useState<string | null>(null);
  const [endsOn, setEndsOn] = useState<string | null>(null);
  // With Starting set and the days untouched, the seeded days are the regular week's: so a dateless
  // schedule can never save with days (it would outrank the regular week on every day).
  const draft = useMemo(
    () => (followsRegular && startsOn ? { ...rawDraft, days: regularDays } : rawDraft),
    [followsRegular, startsOn, rawDraft, regularDays]
  );
  const changeDraft = (next: QuickSetupDraft) => {
    if (!followsRegular || !startsOn) {
      if (seed === "regular" && next.days.join() !== rawDraft.days.join()) setDaysTouched(true);
      setDraft(next);
      return;
    }
    // Still the followed days: keep them unset in the draft; any other days are the Manager's.
    const sameDays = next.days.join() === regularDays.join();
    if (!sameDays) setDaysTouched(true);
    setDraft(sameDays ? { ...next, days: rawDraft.days } : next);
  };
  const [winner, setWinner] = useState<Winner>("new");
  const [conflictMode, setConflictMode] = useState<ScopeConflictMode>("keep");
  // The other schedules the edited times also go to, per service (ux.md F-X step 4).
  const [picks, setPicks] = useState<AlsoApplyPicks>({});
  // The picks the last save sent. A lost race blocks Save, which takes the options (and so the
  // groups) away until the Manager answers, so the review names these, not what is offered now.
  const [sent, setSent] = useState<AlsoApplyPicks>({});
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
      if (next.discarded) {
        setDraft(seedDraft(state.config));
        setPicks({});
      } else if (!gone) {
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
      setDaysTouched(false);
      setName(initialName);
      setStartsOn(null);
      setEndsOn(null);
      setWinner("new");
      setConflictMode("keep");
      setPicks({});
    },
    onGone: onClose,
  });
  const baselineDraft = useMemo(
    () => (editing ? seedDraft(review.baseline) : initialDraft),
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps -- seedDraft reads only `source`, fixed by the ids below
    [editing, review.baseline, initialDraft, sourceScheduleId]
  );
  const draftTouched = weekKey(rawDraft) !== weekKey(baselineDraft);
  const dirty =
    name !== (editing ? review.baselineName : initialName) ||
    draftTouched ||
    startsOn !== null ||
    endsOn !== null;
  // Escape, the backdrop and Cancel all ask first while there is something to lose.
  const guard = useDiscardGuard<void>(onClose, dirty);
  // A new or copied schedule is used on the days its services run.
  const weekdays = useMemo(() => coveredDays(draft), [draft]);
  const useOn = useMemo(() => ({ weekdays, startsOn, endsOn }), [weekdays, startsOn, endsOn]);
  const overlaps = useMemo(
    () => (editing ? [] : overlappingSchedules(config, useOn).map((s) => s.name)),
    [editing, config, useOn]
  );

  const issues = useMemo(
    () =>
      validateDraft(
        draft,
        editing && sourceScheduleId ? { within: scheduleDays(config, sourceScheduleId, true) } : {}
      ),
    [draft, editing, sourceScheduleId, config]
  );
  const trimmed = name.trim();
  const block = scheduleSaveBlock({
    conflicted: saver.conflicted,
    name,
    services: draft.services,
    startsOn,
    endsOn,
    // A copy of the regular week saved with no end would take it over for good.
    replacesRegularWeek: !editing && replacesRegularWeek(config, useOn, today),
  });
  const firstIssue = issues[0];
  const blockedText = block
    ? t(`availabilitySchedules.blocked.${block}`)
    : firstIssue
      ? issueMessage(firstIssue, draft, t, (day) => dayName(day))
      : null;
  const blocked = blockedText !== null;
  const blockedId = useId();
  // The schedule's own edit, built the way Save builds it.
  const editChanges = useMemo(() => {
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
  // Services whose times the edit changed that other schedules run too.
  const alsoOptions = useMemo(
    () =>
      editChanges && editing && sourceScheduleId
        ? alsoApplyOptions(config, editChanges, sourceScheduleId)
        : [],
    [editChanges, editing, sourceScheduleId, config]
  );
  const alsoIds = useMemo(() => alsoApplyScheduleIds(alsoOptions, picks), [alsoOptions, picks]);
  const previewChanges = useMemo(
    () =>
      editChanges && editing && sourceScheduleId
        ? buildAlsoApplyChanges(config, editChanges, sourceScheduleId, picks)
        : editChanges,
    [editChanges, editing, sourceScheduleId, config, picks]
  );
  // Every schedule the save writes: the edited one and each picked, so the dates in scope, the
  // own-changes choice and the preview cover them all.
  const writtenIds = useMemo(
    () => (editing && sourceScheduleId ? [sourceScheduleId, ...alsoIds] : []),
    [editing, sourceScheduleId, alsoIds]
  );
  const dates = useMemo(
    () =>
      editing && sourceScheduleId
        ? [
            ...new Set(
              writtenIds.flatMap((scheduleId) =>
                scopeDates({ kind: "schedule", scheduleId }, { config, timezone, today })
              )
            ),
          ]
        : datesOfUse(useOn, today),
    [editing, sourceScheduleId, writtenIds, config, timezone, today, useOn]
  );
  const own = useMemo(() => ownChangeDates(config, dates, null), [config, dates]);
  // What the preview reaches: each schedule's week plus the dates a use_schedule rule sends to it.
  const reach = useMemo(
    () =>
      [
        ...new Set(
          writtenIds.flatMap((scheduleId) => scheduleReach(scheduleId, { config, timezone, today }))
        ),
      ].sort(),
    [writtenIds, config, timezone, today]
  );

  const submit = async () => {
    const makeId = () => crypto.randomUUID();
    const edited =
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
    const changes =
      editing && sourceScheduleId
        ? buildAlsoApplyChanges(config, edited, sourceScheduleId, picks)
        : edited;
    // Checked against the version the draft was built from, so a change made since is a
    // conflict the Manager reviews, not something this save quietly rebases.
    setSent(pruneAlsoApply(alsoOptions, picks));
    const saved = await saver.save(
      venueId,
      { ...state, version: review.baselineVersion },
      changes,
      dates.length > 1 ? conflictMode : "replace"
    );
    if (!saved) return;
    offerUndo({
      venueId,
      saved,
      title:
        alsoIds.length > 0
          ? t("availabilitySchedules.compare.saved", { count: alsoIds.length + 1 })
          : t("availabilitySchedules.saved", { name: trimmed }),
    });
    onClose();
  };

  // The picked schedules a colleague changed or removed, said apart from this schedule's own lines.
  const alsoApplySince = useMemo(
    () => (review.review && editing ? alsoApplyChangedSince(review.baseline, config, sent) : null),
    [review.review, review.baseline, editing, config, sent]
  );

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
              alsoApply={alsoApplySince ?? undefined}
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
            onChange={changeDraft}
            // A New schedule opens on an empty service: its fields wait for the Manager to start
            // on it before they say what is missing. Save's own reason is shown either way.
            issues={draftTouched ? issues : NO_ISSUES}
            inDrawer
            fixedDays={editing}
          />
          <AlsoApplyTo
            options={alsoOptions}
            picks={pruneAlsoApply(alsoOptions, picks)}
            onChange={setPicks}
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
