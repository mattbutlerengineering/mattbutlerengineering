import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { weekdayIndexOf } from "@mbe/availability";
import type { AvailabilityConfig, AvailabilityConfigState, ScopeConflictMode } from "@mbe/types";
import { useAvailabilityUndo } from "../../hooks/useAvailabilityUndo.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { editedWeekday, outsideSchedules, reapplyWeek, weekKey } from "./change-week-draft.js";
import { previewIds } from "./DraftPreview.js";
import {
  coveredDays,
  draftFromConfig,
  issueMessage,
  validateDraft,
  type QuickSetupDraft,
} from "./quick-setup-draft.js";
import { useWeekdayName } from "./quick-setup-field-helpers.js";
import {
  buildRegularWeekChanges,
  datesOfUse,
  overlappingSchedules,
  scheduleSaveBlock,
  type Winner,
} from "./schedule-changes.js";
import { ownChangeDates } from "./scope-dates.js";
import { useConflictReview } from "./use-conflict-review.js";
import { useScheduleSave } from "./use-schedule-save.js";

/** The regular week as it is edited: `decodeWeek` through quick setup's presentation. */
const weekOf = (config: AvailabilityConfig): QuickSetupDraft =>
  draftFromConfig(config, () => crypto.randomUUID());

export interface RegularWeekEditInput {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  /** Today on the venue clock. */
  readonly today: string;
  readonly onStale: () => void;
  /** The change was saved (and Undo offered); the frame decides what happens next. */
  readonly onSaved?: () => void;
  /** The regular week the draft is based on is gone and the Manager chose to discard. */
  readonly onGone?: () => void;
  /**
   * Pins the start to this date: the Manager picks none, it never counts as an edit and a save
   * is never blocked for lack of one. There is then no end date either.
   */
  readonly fixedStart?: string;
  /** Replaces the saved regular week as the starting draft (it is dirty when it differs). */
  readonly initialDraft?: QuickSetupDraft;
}

/**
 * Everything stateful and derived in changing the regular week (ux.md F-UW, S14): the draft, its
 * dates, the conflict review, the save block and `submit()` with Undo. The frames (the drawer,
 * the Availability week panel) only lay it out.
 */
export function useRegularWeekEdit(input: RegularWeekEditInput) {
  const { venueId, state, onStale, onSaved, onGone, fixedStart, initialDraft } = input;
  const { config } = state;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const dayName = useWeekdayName();
  const offerUndo = useAvailabilityUndo();
  const saver = useScheduleSave(onStale);

  const regular = config.schedules.find((s) => s.isRegular && !s.archivedAt);
  const [draft, setDraft] = useState<QuickSetupDraft>(() => initialDraft ?? weekOf(config));
  /** The weekday the Manager touched last: the preview opens on it. */
  const [edited, setEdited] = useState<number | null>(null);
  const [pickedStart, setStartsOn] = useState<string | null>(null);
  const [pickedEnd, setEndsOn] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [winner, setWinner] = useState<Winner>("new");
  const [conflictMode, setConflictMode] = useState<ScopeConflictMode>("keep");

  const pinned = fixedStart !== undefined;
  const startsOn = pinned ? fixedStart : pickedStart;
  const endsOn = pinned ? null : pickedEnd;

  const edit = (next: QuickSetupDraft) => {
    setEdited((was) => editedWeekday(draft, next) ?? was);
    setDraft(next);
  };

  const review = useConflictReview({
    kind: "regularWeek",
    state,
    // The hook keeps the regular week the edit opened on, so a colleague's newer regular week
    // is compared with, not mistaken for, where these rows came from.
    scheduleId: regular?.id,
    // The week is merged below, by service name, with its days and blocks; the hook's own
    // per-row merge is for the schedule editors.
    services: [],
    name: null,
    conflicted: saver.conflicted,
    clearConflict: saver.clearConflict,
    apply: ({ baseline }) =>
      edit(reapplyWeek({ base: weekOf(baseline), draft, latest: weekOf(state.config) })),
    startOver: () => {
      setDraft(weekOf(state.config));
      setEdited(null);
      setName("");
      setStartsOn(null);
      setEndsOn(null);
      setWinner("new");
      setConflictMode("keep");
    },
    onGone: onGone ?? (() => undefined),
  });
  const baselineWeek = useMemo(() => weekOf(review.baseline), [review.baseline]);
  const dirty =
    name.trim() !== "" ||
    (!pinned && startsOn !== null) ||
    endsOn !== null ||
    weekKey(draft) !== weekKey(baselineWeek);

  const weekdays = useMemo(() => coveredDays(draft), [draft]);
  const dates = useMemo(
    () => (startsOn ? datesOfUse({ weekdays, startsOn, endsOn }, startsOn) : []),
    [weekdays, startsOn, endsOn]
  );
  const own = useMemo(() => ownChangeDates(config, dates, null), [config, dates]);
  const overlaps = useMemo(
    () =>
      startsOn && endsOn
        ? overlappingSchedules(config, { weekdays, startsOn, endsOn }).map((s) => s.name)
        : [],
    [config, weekdays, startsOn, endsOn]
  );
  const issues = useMemo(() => validateDraft(draft), [draft]);
  const outside = useMemo(() => outsideSchedules(config), [config]);
  const closedDays = baselineWeek.days.filter((day) => !weekdays.includes(day));
  const focusDate =
    edited === null ? undefined : dates.find((date) => weekdayIndexOf(date) === edited);

  const trimmed = name.trim();
  const block = scheduleSaveBlock({
    conflicted: saver.conflicted,
    name,
    services: draft.services,
    startsOn,
    endsOn,
    startRequired: !pinned,
    nameRequired: endsOn !== null,
  });
  const firstIssue = issues[0];
  const blockedText = block
    ? t(`availabilitySchedules.blocked.${block === "nameRequired" ? "nameRequiredPeriod" : block}`)
    : firstIssue
      ? issueMessage(firstIssue, draft, t, (day) => dayName(day))
      : null;
  const blocked = blockedText !== null;
  const previewChanges = useMemo(
    () =>
      blocked || !startsOn
        ? null
        : buildRegularWeekChanges({
            config,
            name: trimmed,
            draft,
            startsOn,
            endsOn,
            winner,
            makeId: previewIds(),
          }),
    [blocked, config, trimmed, draft, startsOn, endsOn, winner]
  );
  const startText = startsOn
    ? format.formatCalendarDate(startsOn, { month: "short", day: "numeric" })
    : "";
  const scopeConflicts: ScopeConflictMode = dates.length > 1 ? conflictMode : "replace";

  const submit = async () => {
    if (!startsOn) return;
    const changes = buildRegularWeekChanges({
      config,
      name: trimmed,
      draft,
      startsOn,
      endsOn,
      winner,
      makeId: () => crypto.randomUUID(),
    });
    // Checked against the version the draft was built from, so a change made since is a
    // conflict the Manager reviews, not something this save quietly rebases.
    const saved = await saver.save(
      venueId,
      { ...state, version: review.baselineVersion },
      changes,
      scopeConflicts
    );
    if (!saved) return;
    offerUndo({
      venueId,
      saved,
      title:
        endsOn === null
          ? t("availabilitySchedules.regularWeek.savedWeek", { date: startText })
          : t("availabilitySchedules.regularWeek.saved", { name: trimmed, date: startText }),
    });
    onSaved?.();
  };

  return {
    draft,
    edit,
    startsOn,
    setStartsOn,
    endsOn,
    setEndsOn,
    name,
    setName,
    winner,
    setWinner,
    conflictMode,
    setConflictMode,
    saver,
    review,
    dirty,
    weekdays,
    dates,
    own,
    overlaps,
    issues,
    outside,
    closedDays,
    focusDate,
    trimmed,
    block,
    blockedText,
    blocked,
    previewChanges,
    scopeConflicts,
    startText,
    submit,
  };
}
