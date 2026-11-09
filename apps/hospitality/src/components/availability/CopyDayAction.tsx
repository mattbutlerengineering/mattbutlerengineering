import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Dialog, Stack, Text } from "@mattbutlerengineering/rialto";
import { addDays, weekdayIndexOf, type ResolvedDay } from "@mbe/availability";
import type { AvailabilityConfigState } from "@mbe/types";
import { useAvailabilityUndo } from "../../hooks/useAvailabilityUndo.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { ChangeRegularWeekDrawer } from "./ChangeRegularWeekDrawer.js";
import {
  buildCopySingleDates,
  copyWeekDraft,
  regularSameWeekdays,
  splitCopyTargets,
  thisWeekTargets,
} from "./copy-week-draft.js";
import { waitingProps } from "./draft-wait.js";
import type { QuickSetupDraft } from "./quick-setup-draft.js";
import { DayPicker } from "./quick-setup-fields.js";
import { useWeekdayName } from "./quick-setup-field-helpers.js";
import { BlockedReason, SaveFailure } from "./ScheduleFormParts.js";
import { namedServiceHoursText } from "./service-hours.js";
import { useScheduleSave } from "./use-schedule-save.js";
import copyStyles from "./CopyDayAction.module.css";
import styles from "./ScheduleFormParts.module.css";

export interface CopyDayActionProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  readonly timezone: string;
  readonly date: string;
  readonly day: ResolvedDay;
  readonly onStale: () => void;
  /** Today on the venue clock: a copy never reaches dates before it. */
  readonly today: string;
  /** An editor is open, or a reload is due: saving a copy now would conflict with a save of ours. */
  readonly waiting?: boolean;
  /** The element that says why Copy is waiting. */
  readonly reasonId?: string;
}

/** Change regular week, opened from Copy with the copied hours already in the chosen weekdays. */
interface WeekPrefill {
  readonly draft: QuickSetupDraft;
  readonly startsOn: string;
}

/**
 * Copy to other days (ux.md F2): the day's hours carried to chosen weekdays. The primary button
 * writes one-off special hours on the dates of this week; "Every week…" opens the regular week
 * with those weekdays already changed. The sentence under the days says what the primary does.
 */
export function CopyDayAction(props: CopyDayActionProps) {
  const { venueId, state, timezone, date, day, onStale, today, waiting = false, reasonId } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const dayName = useWeekdayName();
  const offerUndo = useAvailabilityUndo();
  const saver = useScheduleSave(onStale);
  const [open, setOpen] = useState(false);
  const [weekdays, setWeekdays] = useState<readonly number[]>([]);
  const [prefill, setPrefill] = useState<WeekPrefill | null>(null);
  const weekBlockedId = useId();
  const everyBlockedId = useId();

  const source = weekdayIndexOf(date);
  const list = (items: readonly string[], type: Intl.ListFormatType = "conjunction") =>
    new Intl.ListFormat(format.locale, { type }).format(items);
  const short = (weekday: number) => dayName(weekday, "short");
  const dateText = (d: string) =>
    format.formatCalendarDate(d, { weekday: "short", month: "short", day: "numeric" });
  const shortDate = (d: string) => format.formatCalendarDate(d, { month: "short", day: "numeric" });
  const sourceName = dayName(source, "long");
  const heading = format.formatCalendarDate(date, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  // Every week starts with the copied date's week, or today when that week is under way.
  const monday = addDays(date, -((source + 6) % 7));
  const startsOn = monday > today ? monday : today;
  const startText = format.formatCalendarDate(startsOn, { month: "short", day: "numeric" });

  const week = useMemo(() => thisWeekTargets({ date, weekdays, today }), [date, weekdays, today]);
  // At most six dates, each resolved once: cheap enough to settle on every render.
  const split = splitCopyTargets(state.config, timezone, day, week.dates);
  const changedDates = split.changed;
  const sameWeekdays = split.same.map(weekdayIndexOf);
  const closedWeekdays = split.closed.map(weekdayIndexOf);
  const changedWeekdays = changedDates.map(weekdayIndexOf);
  const regularSame = regularSameWeekdays(state.config, timezone, day, weekdays, startsOn);
  const changedRegular = weekdays.filter((weekday) => !regularSame.includes(weekday));

  const allSameText = t("availabilitySchedules.copy.allSame", { weekday: sourceName });
  const closedText = t("availabilitySchedules.copy.closedOn", {
    count: split.closed.length,
    days: list(closedWeekdays.map(short)),
    dates: list(split.closed.map(shortDate)),
  });
  const weekReason =
    weekdays.length === 0
      ? t("availabilitySchedules.copy.blocked.daysRequired")
      : week.dates.length === 0
        ? t("availabilitySchedules.copy.blocked.noDates")
        : changedDates.length > 0
          ? null
          : split.same.length > 0
            ? allSameText
            : closedText;
  const everyReason =
    weekdays.length === 0
      ? t("availabilitySchedules.copy.blocked.daysRequired")
      : changedRegular.length === 0
        ? allSameText
        : null;
  // One line when both buttons wait for the same reason, else one per blocked button.
  const sharedReason = weekReason !== null && weekReason === everyReason;
  const everyDescribedBy = sharedReason ? weekBlockedId : everyBlockedId;

  const hours =
    day.services.length === 0
      ? t("availabilitySchedules.copy.closed")
      : list(
          day.services.map((s) => namedServiceHoursText(s.name, s, { t, format })),
          "unit"
        );
  const changedNames = list(changedWeekdays.map(short));
  const consequence =
    weekReason !== null
      ? null
      : t("availabilitySchedules.copy.consequenceThisWeek", {
          days: changedNames,
          weekday: sourceName,
          hours,
          dates: list(changedDates.map(dateText)),
        });

  const close = () => {
    setOpen(false);
    setWeekdays([]);
    saver.clearFailure();
  };

  const review = () => {
    setPrefill({
      draft: copyWeekDraft(state.config, day, date, changedRegular, () => crypto.randomUUID()),
      startsOn,
    });
    close();
  };

  const submit = async () => {
    const changes = buildCopySingleDates({
      config: state.config,
      source: day,
      date,
      dates: changedDates,
      makeId: () => crypto.randomUUID(),
    });
    // "Replace": these are the hours the Manager asked for on those dates, so another special
    // rule that reaches one of them steps aside there instead of silently winning.
    const saved = await saver.save(venueId, state, changes, "replace");
    if (!saved) return;
    offerUndo({
      venueId,
      saved,
      title: t("availabilitySchedules.copy.copied", {
        weekday: sourceName,
        dates: list(changedDates.map(dateText)),
      }),
    });
    close();
  };

  return (
    <>
      <Button
        variant="secondary"
        {...waitingProps(waiting, reasonId)}
        onClick={() => {
          if (!waiting) setOpen(true);
        }}
      >
        {t("availabilitySchedules.copy.action")}
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title={t("availabilitySchedules.copy.title", { date: heading })}
        footer={
          <div className={styles.footer}>
            <BlockedReason id={weekBlockedId} reason={weekReason} />
            {!sharedReason && <BlockedReason id={everyBlockedId} reason={everyReason} />}
            <Button variant="secondary" onClick={close}>
              {t("availabilitySchedules.cancel")}
            </Button>
            <Button
              variant="secondary"
              disabled={everyReason !== null}
              aria-describedby={everyReason ? everyDescribedBy : undefined}
              onClick={review}
            >
              {t("availabilitySchedules.copy.everyWeek")}
            </Button>
            <Button
              variant="primary"
              disabled={weekReason !== null}
              aria-describedby={weekReason ? weekBlockedId : undefined}
              isLoading={saver.isPending}
              onClick={() => void submit()}
            >
              {changedDates.length === 0
                ? t("availabilitySchedules.copy.save")
                : t("availabilitySchedules.copy.saveTo", { days: changedNames })}
            </Button>
          </div>
        }
      >
        <Stack gap="md">
          <SaveFailure messages={saver.failure} stranded={saver.stranded} />
          <DayPicker
            id={`${weekBlockedId}-days`}
            legend={t("availabilitySchedules.copy.days")}
            days={weekdays}
            lockedDays={[source]}
            onChange={setWeekdays}
          />
          <div className={copyStyles.summary} aria-live="polite">
            {consequence && (
              <Text variant="body" color="primary">
                {consequence}
              </Text>
            )}
            {weekReason !== allSameText && sameWeekdays.length > 0 && (
              <Text variant="caption" color="secondary">
                {t("availabilitySchedules.copy.alreadySame", {
                  count: sameWeekdays.length,
                  days: list(sameWeekdays.map(short)),
                })}
              </Text>
            )}
            {split.closed.length > 0 && weekReason !== closedText && (
              <Text variant="caption" color="secondary">
                {closedText}
              </Text>
            )}
            {week.past.length > 0 && (
              <Text variant="caption" color="secondary">
                {t("availabilitySchedules.copy.passed", {
                  count: week.past.length,
                  days: list(week.past.map(short)),
                })}
              </Text>
            )}
            <Text variant="caption" color="secondary">
              {t("availabilitySchedules.copy.everyWeekHint", { date: startText })}
            </Text>
          </div>
        </Stack>
      </Dialog>
      {prefill && (
        <ChangeRegularWeekDrawer
          venueId={venueId}
          state={state}
          today={today}
          onStale={onStale}
          onClose={() => setPrefill(null)}
          initialDraft={prefill.draft}
          initialStartsOn={prefill.startsOn}
        />
      )}
    </>
  );
}
