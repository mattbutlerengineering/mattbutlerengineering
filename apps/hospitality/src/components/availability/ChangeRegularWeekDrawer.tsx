import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, DatePicker, Drawer, Input, Stack, Text } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, ScopeConflictMode } from "@mbe/types";
import { useAvailabilityUndo } from "../../hooks/useAvailabilityUndo.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { seedServices, servicesEqual, type DraftService } from "./draft-changes.js";
import {
  buildRegularWeekChanges,
  overlappingSchedules,
  datesOfUse,
  regularWeekdays,
  type Winner,
} from "./schedule-changes.js";
import { ownChangeDates } from "./scope-dates.js";
import {
  ConflictReviewPanel,
  OverlapChoice,
  OwnChangesChoice,
  SaveFailure,
  ScheduleDraftGuard,
  useWeekdaySummary,
} from "./ScheduleFormParts.js";
import { ServicesEditor } from "./ServicesEditor.js";
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
}

/**
 * Change regular week (ux.md F-UW): the current regular week's hours from a start date, until an
 * end date (then the regular week returns by itself) or with no end (this becomes the regular
 * week). It covers the days the regular week runs on, so a venue that is closed on some days stays
 * closed on them, and days another schedule runs keep that schedule's hours. Where the period
 * meets another dated schedule the Manager chooses which wins.
 */
export function ChangeRegularWeekDrawer(props: ChangeRegularWeekDrawerProps) {
  const { venueId, state, today, onStale, onClose } = props;
  const { config } = state;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const offerUndo = useAvailabilityUndo();
  const saver = useScheduleSave(onStale);
  const summarize = useWeekdaySummary();

  const regular = config.schedules.find((s) => s.isRegular && !s.archivedAt);
  const [services, setServices] = useState<DraftService[]>(() =>
    regular
      ? seedServices(config, { services: [] }, { kind: "schedule", scheduleId: regular.id })
      : []
  );
  const [startsOn, setStartsOn] = useState<string | null>(null);
  const [endsOn, setEndsOn] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [winner, setWinner] = useState<Winner>("new");
  const [conflictMode, setConflictMode] = useState<ScopeConflictMode>("keep");

  const review = useConflictReview({
    state,
    scheduleId: regular?.id,
    services,
    name: null,
    conflicted: saver.conflicted,
    clearConflict: saver.clearConflict,
    apply: (next) => setServices(next.services),
    onGone: onClose,
  });
  const dirty =
    name.trim() !== "" ||
    startsOn !== null ||
    endsOn !== null ||
    !servicesEqual(services, review.baselineServices);
  // Escape, the backdrop and Cancel all ask first while there is something to lose.
  const guard = useDiscardGuard<void>(onClose, dirty);

  const weekdays = useMemo(
    () => regularWeekdays(config, startsOn ?? today),
    [config, startsOn, today]
  );
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

  const trimmed = name.trim();
  const incomplete =
    !startsOn ||
    trimmed === "" ||
    services.length === 0 ||
    services.some((s) => s.venueServiceId === null && !s.name.trim());
  const startText = startsOn
    ? format.formatCalendarDate(startsOn, { month: "short", day: "numeric" })
    : "";

  const submit = async () => {
    if (!startsOn) return;
    const changes = buildRegularWeekChanges({
      config,
      name: trimmed,
      services,
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
      title: t("availabilitySchedules.regularWeek.saved", { name: trimmed, date: startText }),
    });
    onClose();
  };

  return (
    <>
      <Drawer
        open
        onClose={() => guard.request()}
        title={t("availabilitySchedules.regularWeek.title")}
        size="wide"
        footer={
          <div className={styles.footer}>
            <Button variant="secondary" onClick={() => guard.request()}>
              {t("availabilitySchedules.cancel")}
            </Button>
            <Button
              variant="primary"
              disabled={incomplete || saver.conflicted}
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
            <SaveFailure messages={saver.failure} />
          )}
          <div className={styles.dates}>
            <DatePicker
              label={t("availabilitySchedules.startsOn")}
              value={startsOn}
              min={today}
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
          <Text variant="caption" color="secondary">
            {t("availabilitySchedules.regularWeek.appliesTo", { days: summarize(weekdays) })}
          </Text>
          <Input
            label={t("availabilitySchedules.name")}
            value={name}
            maxLength={60}
            required
            onChange={(e) => setName(e.target.value)}
          />
          {startsOn && (
            <Text variant="caption" color="secondary">
              {t("availabilitySchedules.impact", { count: dates.length })}
            </Text>
          )}
          <ServicesEditor
            services={services}
            venueServices={config.venueServices}
            onChange={setServices}
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
