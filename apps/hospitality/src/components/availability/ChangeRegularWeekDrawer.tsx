import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, DatePicker, Drawer, Input, Stack, Text } from "@mattbutlerengineering/rialto";
import { weekdayIndexOf } from "@mbe/availability";
import type { AvailabilityConfig, AvailabilityConfigState, ScopeConflictMode } from "@mbe/types";
import { useAvailabilityUndo } from "../../hooks/useAvailabilityUndo.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { useViewport } from "../../hooks/useViewport.js";
import { editedWeekday, outsideSchedules, reapplyWeek, weekKey } from "./change-week-draft.js";
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
  overlappingSchedules,
  datesOfUse,
  scheduleSaveBlock,
  type Winner,
} from "./schedule-changes.js";
import { ownChangeDates } from "./scope-dates.js";
import {
  BlockedReason,
  ConflictReviewPanel,
  OverlapChoice,
  OwnChangesChoice,
  SaveFailure,
  ScheduleDraftGuard,
  useWeekdaySummary,
} from "./ScheduleFormParts.js";
import { DraftPreview, previewIds } from "./DraftPreview.js";
import { NameSuggestionChip } from "./NameSuggestionChip.js";
import { QuickSetupForm } from "./QuickSetupForm.js";
import { useConflictReview } from "./use-conflict-review.js";
import { useDiscardGuard } from "./use-discard-guard.js";
import { useScheduleSave } from "./use-schedule-save.js";
import styles from "./ScheduleFormParts.module.css";

export interface ChangeRegularWeekDrawerProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  /** Today on the venue clock. */
  readonly today: string;
  readonly onStale: () => void;
  readonly onClose: () => void;
  /** Where "Open Schedules" goes (the line about days a schedule of the Manager's runs). */
  readonly onOpenSchedules?: () => void;
}

/** The regular week as the drawer edits it: `decodeWeek` through quick setup's presentation. */
const weekOf = (config: AvailabilityConfig): QuickSetupDraft =>
  draftFromConfig(config, () => crypto.randomUUID());

/**
 * Change regular week (ux.md F-UW, S14): the regular week's services, days and different-hours
 * blocks from a start date, until an end date (a named period; then the regular week returns by
 * itself) or with no end (this becomes the regular week, named by nothing). The days the change
 * covers follow the services: a weekday no service runs on is closed, and one the week never ran
 * can be opened. Where a period meets another dated schedule the Manager chooses which wins.
 */
export function ChangeRegularWeekDrawer(props: ChangeRegularWeekDrawerProps) {
  const viewport = useViewport();
  const { venueId, state, today, onStale, onClose, onOpenSchedules } = props;
  const { config } = state;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const dayName = useWeekdayName();
  const offerUndo = useAvailabilityUndo();
  const saver = useScheduleSave(onStale);
  const summarize = useWeekdaySummary();

  const regular = config.schedules.find((s) => s.isRegular && !s.archivedAt);
  const [draft, setDraft] = useState<QuickSetupDraft>(() => weekOf(config));
  /** The weekday the Manager touched last: the preview opens on it. */
  const [edited, setEdited] = useState<number | null>(null);
  const [startsOn, setStartsOn] = useState<string | null>(null);
  const [endsOn, setEndsOn] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [winner, setWinner] = useState<Winner>("new");
  const [conflictMode, setConflictMode] = useState<ScopeConflictMode>("keep");

  const edit = (next: QuickSetupDraft) => {
    setEdited((was) => editedWeekday(draft, next) ?? was);
    setDraft(next);
  };

  const review = useConflictReview({
    kind: "regularWeek",
    state,
    // The hook keeps the regular week this drawer opened on, so a colleague's newer regular week
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
    onGone: onClose,
  });
  const baselineWeek = useMemo(() => weekOf(review.baseline), [review.baseline]);
  const dirty =
    name.trim() !== "" ||
    startsOn !== null ||
    endsOn !== null ||
    weekKey(draft) !== weekKey(baselineWeek);
  // Escape, the backdrop and Cancel all ask first while there is something to lose.
  const guard = useDiscardGuard<boolean>((openSchedules) => {
    onClose();
    if (openSchedules) onOpenSchedules?.();
  }, dirty);

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
    startRequired: true,
    nameRequired: endsOn !== null,
  });
  const firstIssue = issues[0];
  const blockedText = block
    ? t(`availabilitySchedules.blocked.${block === "nameRequired" ? "nameRequiredPeriod" : block}`)
    : firstIssue
      ? issueMessage(firstIssue, draft, t, (day) => dayName(day))
      : null;
  const blocked = blockedText !== null;
  const blockedId = useId();
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
      dates.length > 1 ? conflictMode : "replace"
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
    onClose();
  };

  return (
    <>
      <Drawer
        open
        onClose={() => guard.request(false)}
        title={t("availabilitySchedules.regularWeek.title")}
        size={viewport === "phone" ? "full" : "wide"}
        footer={
          <div className={styles.footer}>
            <BlockedReason id={blockedId} reason={blockedText} />
            <Button variant="secondary" onClick={() => guard.request(false)}>
              {t("availabilitySchedules.cancel")}
            </Button>
            <Button
              variant="primary"
              disabled={blocked}
              aria-describedby={blocked ? blockedId : undefined}
              isLoading={saver.isPending}
              onClick={() => void submit()}
            >
              {startsOn
                ? t("availabilitySchedules.regularWeek.save", { date: startText })
                : t("availabilitySchedules.save")}
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
          <div className={styles.dates}>
            <DatePicker
              label={t("availabilitySchedules.startsOn")}
              value={startsOn}
              min={today}
              max={endsOn ?? undefined}
              onChange={setStartsOn}
            />
            <DatePicker
              label={t("availabilitySchedules.endsOn")}
              placeholder={t("availabilitySchedules.regularWeek.noEnd")}
              value={endsOn}
              min={startsOn ?? today}
              onChange={setEndsOn}
            />
            {endsOn !== null && (
              <Button variant="ghost" size="sm" onClick={() => setEndsOn(null)}>
                {t("availabilitySchedules.noEnd")}
              </Button>
            )}
          </div>
          {endsOn === null && (
            <Text variant="caption" color="secondary">
              {t("availabilitySchedules.regularWeek.noEnd")}
            </Text>
          )}
          {weekdays.length > 0 && (
            <Text variant="caption" color="secondary">
              {t(
                endsOn === null
                  ? "availabilitySchedules.regularWeek.becomes"
                  : "availabilitySchedules.regularWeek.appliesTo",
                { days: summarize(weekdays) }
              )}
            </Text>
          )}
          {endsOn === null && closedDays.length > 0 && (
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
              {onOpenSchedules && (
                <>
                  {" "}
                  <Button variant="ghost" size="sm" onClick={() => guard.request(true)}>
                    {t("availabilitySchedules.regularWeek.openSchedules")}
                  </Button>
                </>
              )}
            </Text>
          ))}
          {endsOn !== null && (
            <>
              <Input
                label={t("availabilitySchedules.name")}
                value={name}
                maxLength={60}
                required
                onChange={(e) => setName(e.target.value)}
              />
              <NameSuggestionChip startsOn={startsOn} endsOn={endsOn} name={name} onUse={setName} />
            </>
          )}
          {startsOn && (
            <Text variant="caption" color="secondary">
              {t("availabilitySchedules.impact", { count: dates.length })}
            </Text>
          )}
          <QuickSetupForm draft={draft} onChange={edit} issues={issues} inDrawer />
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
            dates={dates}
            focusDate={focusDate}
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
