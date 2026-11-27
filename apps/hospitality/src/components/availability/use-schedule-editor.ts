import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AvailabilityConfig,
  AvailabilityConfigSaveResult,
  AvailabilityConfigState,
  ScopeConflictMode,
} from "@mbe/types";
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
  scheduleDays,
  type QuickSetupDraft,
} from "./quick-setup-draft.js";
import { issueMessage, validateDraft } from "./quick-setup-validate.js";
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
import { previewIds } from "./DraftPreview.js";
import { useConflictReview } from "./use-conflict-review.js";
import { useScheduleSave } from "./use-schedule-save.js";
import { useServiceDate } from "./use-visible-schedules.js";

export type ScheduleEditorMode = "new" | "duplicate" | "edit";

export interface ScheduleEditorInput {
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
  /** Shows the Undo for a save under `title`. */
  readonly offerUndo: (title: string, saved: AvailabilityConfigSaveResult) => void;
  /** The schedule was saved, or it is gone and the Manager chose to leave. */
  readonly onClose: () => void;
}

/**
 * The state of the schedule editor (ux.md F3), shared by the drawer on today's page and the
 * Seasonal hours editor page. The services are quick setup's rows, with their own days and
 * different-hours blocks. A new or copied schedule is used on the days its services run, over
 * optional dates, and settles who wins an overlap; an edit keeps its use and changes the schedule
 * everywhere it runs.
 */
export function useScheduleEditor(props: ScheduleEditorInput) {
  const { venueId, state, timezone, today, mode, sourceScheduleId, seed, onStale, onClose } = props;
  const { offerUndo } = props;
  const { config } = state;
  const { t } = useTranslation();
  const dayName = useWeekdayName();
  const saver = useScheduleSave(onStale);
  // Also apply to… offers only the schedules a Manager can see (#8688).
  const serviceDate = useServiceDate(config, timezone);

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
  // The days a seeded schedule shows are the regular week's only once Starting is set (a dateless
  // schedule with days would outrank the regular week on every day), and only while they are
  // untouched. Before Starting no service shows days either, its own included; the raw draft keeps
  // them for after.
  const draft = useMemo(() => {
    if (!followsRegular) return rawDraft;
    return startsOn
      ? { ...rawDraft, days: regularDays }
      : { ...rawDraft, days: [], services: rawDraft.services.map((s) => ({ ...s, days: null })) };
  }, [followsRegular, startsOn, rawDraft, regularDays]);
  const ownDays = (id: string) => rawDraft.services.find((s) => s.id === id)?.days ?? null;
  const changeDraft = (next: QuickSetupDraft) => {
    if (!followsRegular) {
      if (seed === "regular") setDaysTouched(true);
      setDraft(next);
      return;
    }
    if (!startsOn) {
      // Nothing is shown, so any days now are the Manager's; otherwise the services keep the days
      // the regular week gave them.
      const chosen = next.days.length > 0 || next.services.some((s) => s.days !== null);
      if (chosen) setDaysTouched(true);
      setDraft(
        chosen
          ? next
          : {
              ...next,
              days: rawDraft.days,
              services: next.services.map((s) => ({ ...s, days: ownDays(s.id) })),
            }
      );
      return;
    }
    // Still the followed days: keep them unset in the draft; any other days are the Manager's.
    const sameDays =
      next.days.join() === regularDays.join() &&
      next.services.every((s) => (s.days?.join() ?? null) === (ownDays(s.id)?.join() ?? null));
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
  /** Back to where the form started, as Discard and Start over leave it. */
  const reset = () => {
    setDraft(seedDraft(state.config));
    setDaysTouched(false);
    setName(initialName);
    setStartsOn(null);
    setEndsOn(null);
    setWinner("new");
    setConflictMode("keep");
    setPicks({});
  };
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
    startOver: reset,
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
        ? alsoApplyOptions(config, editChanges, sourceScheduleId, serviceDate)
        : [],
    [editChanges, editing, sourceScheduleId, config, serviceDate]
  );
  const alsoIds = useMemo(() => alsoApplyScheduleIds(alsoOptions, picks), [alsoOptions, picks]);
  const previewChanges = useMemo(
    () =>
      editChanges && editing && sourceScheduleId
        ? buildAlsoApplyChanges(config, editChanges, sourceScheduleId, picks, serviceDate)
        : editChanges,
    [editChanges, editing, sourceScheduleId, config, picks, serviceDate]
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

  /** Resolves `true` once the schedule is saved (and `onClose` has run), `false` when refused. */
  const submit = async (): Promise<boolean> => {
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
        ? buildAlsoApplyChanges(config, edited, sourceScheduleId, picks, serviceDate)
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
    if (!saved) return false;
    offerUndo(
      alsoIds.length > 0
        ? t("availabilitySchedules.compare.saved", { count: alsoIds.length + 1 })
        : t("availabilitySchedules.saved", { name: trimmed }),
      saved
    );
    onClose();
    return true;
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

  return {
    config,
    editing,
    review,
    saver,
    name,
    setName,
    startsOn,
    setStartsOn,
    endsOn,
    setEndsOn,
    draft,
    changeDraft,
    draftTouched,
    dirty,
    reset,
    weekdays,
    overlaps,
    issues,
    trimmed,
    block,
    blockedText,
    blocked,
    alsoOptions,
    alsoIds,
    picks,
    setPicks,
    winner,
    setWinner,
    conflictMode,
    setConflictMode,
    previewChanges,
    dates,
    own,
    reach,
    submit,
    alsoApplySince,
    title,
    dayName,
  };
}
