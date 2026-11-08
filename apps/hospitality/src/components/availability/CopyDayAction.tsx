import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Dialog, Radio, RadioGroup, Stack, Text } from "@mattbutlerengineering/rialto";
import { addDays, resolveDay, weekdayIndexOf, type ResolvedDay } from "@mbe/availability";
import type { AvailabilityConfigState } from "@mbe/types";
import { useAvailabilityUndo } from "../../hooks/useAvailabilityUndo.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { ChangeRegularWeekDrawer } from "./ChangeRegularWeekDrawer.js";
import {
  buildCopySingleDates,
  copyWeekDraft,
  regularSameWeekdays,
  sameHoursAs,
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

type How = "thisWeek" | "everyWeek";

/** Change regular week, opened from Copy with the copied hours already in the chosen weekdays. */
interface WeekPrefill {
  readonly draft: QuickSetupDraft;
  readonly startsOn: string;
}

/**
 * Copy to other days (ux.md F2): the day's hours carried to chosen weekdays, either as one-off
 * special hours on the dates of this week or, for every week, by reviewing the regular week with
 * those weekdays already changed. The sentence under the choices says what the button will do.
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
  const [how, setHow] = useState<How>("thisWeek");
  const [prefill, setPrefill] = useState<WeekPrefill | null>(null);
  const blockedId = useId();

  const source = weekdayIndexOf(date);
  const list = (items: readonly string[], type: Intl.ListFormatType = "conjunction") =>
    new Intl.ListFormat(format.locale, { type }).format(items);
  const short = (weekday: number) => dayName(weekday, "short");
  const dateText = (d: string) =>
    format.formatCalendarDate(d, { weekday: "short", month: "short", day: "numeric" });
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
  const same =
    how === "everyWeek"
      ? regularSameWeekdays(state.config, timezone, day, weekdays, startsOn)
      : week.dates
          .filter((d) => sameHoursAs(day, resolveDay({ timezone, config: state.config }, d)))
          .map(weekdayIndexOf);

  const changed =
    how === "everyWeek"
      ? weekdays.filter((weekday) => !same.includes(weekday))
      : week.dates.filter((d) => !same.includes(weekdayIndexOf(d))).map(weekdayIndexOf);
  const changedDates = week.dates.filter((d) => changed.includes(weekdayIndexOf(d)));

  const block: "daysRequired" | "noDates" | "allSame" | null =
    weekdays.length === 0
      ? "daysRequired"
      : how === "thisWeek" && week.dates.length === 0
        ? "noDates"
        : changed.length === 0
          ? "allSame"
          : null;
  const blockText =
    block === "allSame"
      ? t("availabilitySchedules.copy.allSame", { weekday: sourceName })
      : block && t(`availabilitySchedules.copy.blocked.${block}`);

  const hours =
    day.services.length === 0
      ? t("availabilitySchedules.copy.closed")
      : list(
          day.services.map((s) => namedServiceHoursText(s.name, s, { t, format })),
          "unit"
        );
  const changedNames = list(changed.map(short));
  const consequence =
    block !== null
      ? null
      : how === "thisWeek"
        ? t("availabilitySchedules.copy.consequenceThisWeek", {
            days: changedNames,
            weekday: sourceName,
            hours,
            dates: list(changedDates.map(dateText)),
          })
        : t("availabilitySchedules.copy.consequenceEveryWeek", {
            days: changedNames,
            weekday: sourceName,
            hours,
            date: startText,
          });
  const thisWeekDates = list([
    ...week.dates.map(dateText),
    ...week.past.map((weekday) => `${short(weekday)} ${t("availabilitySchedules.copy.past")}`),
  ]);

  const close = () => {
    setOpen(false);
    setWeekdays([]);
    setHow("thisWeek");
    saver.clearFailure();
  };

  const submit = async () => {
    if (how === "everyWeek") {
      setPrefill({
        draft: copyWeekDraft(state.config, day, date, changed, () => crypto.randomUUID()),
        startsOn,
      });
      close();
      return;
    }
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
            <BlockedReason id={blockedId} reason={blockText} />
            <Button variant="secondary" onClick={close}>
              {t("availabilitySchedules.cancel")}
            </Button>
            <Button
              variant="primary"
              disabled={block !== null}
              aria-describedby={block ? blockedId : undefined}
              isLoading={saver.isPending}
              onClick={() => void submit()}
            >
              {how === "everyWeek"
                ? t("availabilitySchedules.copy.review")
                : changed.length === 0
                  ? t("availabilitySchedules.copy.save")
                  : t("availabilitySchedules.copy.saveTo", { days: changedNames })}
            </Button>
          </div>
        }
      >
        <Stack gap="md">
          <SaveFailure messages={saver.failure} stranded={saver.stranded} />
          <DayPicker
            id={`${blockedId}-days`}
            legend={t("availabilitySchedules.copy.days")}
            days={weekdays}
            lockedDays={[source]}
            onChange={setWeekdays}
          />
          <RadioGroup
            label={t("availabilitySchedules.copy.howOften")}
            name={`${blockedId}-how`}
            value={how}
            onChange={(id) => setHow(id as How)}
          >
            <Radio
              value="thisWeek"
              label={t("availabilitySchedules.copy.thisWeek")}
              description={
                thisWeekDates === ""
                  ? undefined
                  : t("availabilitySchedules.copy.thisWeekDates", { dates: thisWeekDates })
              }
            />
            <Radio
              value="everyWeek"
              label={t("availabilitySchedules.copy.everyWeek")}
              description={t("availabilitySchedules.copy.everyWeekHint", { date: startText })}
            />
          </RadioGroup>
          <div className={copyStyles.summary} aria-live="polite">
            {consequence && (
              <Text variant="body" color="primary">
                {consequence}
              </Text>
            )}
            {block !== "allSame" && same.length > 0 && (
              <Text variant="caption" color="secondary">
                {t("availabilitySchedules.copy.alreadySame", {
                  count: same.length,
                  days: list(same.map(short)),
                })}
              </Text>
            )}
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
