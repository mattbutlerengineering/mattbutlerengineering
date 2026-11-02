import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, DatePicker, Dialog, Select, Stack } from "@mattbutlerengineering/rialto";
import { resolveDay } from "@mbe/availability";
import type { AvailabilityConfigState } from "@mbe/types";
import { useAvailabilityUndo } from "../../hooks/useAvailabilityUndo.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { scheduleNameText } from "./day-summary.js";
import { DraftPreview, previewIds } from "./DraftPreview.js";
import { seedServices } from "./draft-changes.js";
import { buildUseDayHoursChanges, buildUseScheduleChanges } from "./selection-actions.js";
import { BlockedReason, SaveFailure } from "./ScheduleFormParts.js";
import { useScheduleSave } from "./use-schedule-save.js";
import styles from "./ScheduleFormParts.module.css";

export interface UseScheduleDialogProps {
  readonly open: boolean;
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  readonly timezone: string;
  readonly dates: readonly string[];
  readonly onClose: () => void;
  /** The change was saved; the caller drops the selection. */
  readonly onFinished: () => void;
  readonly onStale: () => void;
}

/**
 * Use schedule / another day's hours (ux.md F-MS, F2). With two or more schedules the selected
 * dates take one schedule's week; with a single schedule they take the hours of a chosen day.
 */
export function UseScheduleDialog(props: UseScheduleDialogProps) {
  const { open, venueId, state, timezone, dates, onClose, onFinished, onStale } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const blockedId = useId();
  const offerUndo = useAvailabilityUndo();
  const saver = useScheduleSave(onStale);
  const schedules = useMemo(
    () => state.config.schedules.filter((s) => !s.archivedAt),
    [state.config.schedules]
  );
  const byDay = schedules.length < 2;
  const [chosenSchedule, setChosenSchedule] = useState<string | null>(null);
  const [sourceDate, setSourceDate] = useState<string | null>(null);
  const scheduleId = chosenSchedule ?? schedules[0]?.id ?? null;

  const sourceServices = useMemo(() => {
    if (!byDay || !sourceDate) return [];
    const day = resolveDay({ timezone, config: state.config }, sourceDate);
    return seedServices(state.config, day, { kind: "date", date: sourceDate });
  }, [byDay, sourceDate, timezone, state.config]);

  // One date copied onto itself would write a rule that changes nothing.
  const sameDay = byDay && dates.length === 1 && sourceDate === dates[0];
  const ready = byDay ? sourceServices.length > 0 && !sameDay : scheduleId !== null;
  const blockedKey = sameDay
    ? "availability.selection.use.blockedSame"
    : sourceDate
      ? "availability.selection.use.blockedClosed"
      : "availability.selection.use.blockedDay";
  // A single date (the day drawer) is named; a selection is counted.
  const oneDate = dates.length === 1 && dates[0] ? dates[0] : null;
  const title = oneDate
    ? t(
        byDay
          ? "availability.selection.use.titleDayOne"
          : "availability.selection.use.titleScheduleOne",
        {
          date: format.formatCalendarDate(oneDate, {
            weekday: "long",
            month: "short",
            day: "numeric",
          }),
        }
      )
    : t(byDay ? "availability.selection.use.titleDay" : "availability.selection.use.titleSchedule");

  const previewChanges = useMemo(() => {
    if (!open || !ready) return null;
    const makeId = previewIds();
    return byDay
      ? buildUseDayHoursChanges({
          config: state.config,
          services: sourceServices,
          dates,
          makeId,
        })
      : buildUseScheduleChanges(state.config, dates, scheduleId ?? "", makeId);
  }, [open, ready, byDay, state.config, sourceServices, dates, scheduleId]);

  const close = () => {
    saver.clearFailure();
    onClose();
  };

  const submit = async () => {
    const changes = byDay
      ? buildUseDayHoursChanges({
          config: state.config,
          services: sourceServices,
          dates,
          makeId: () => crypto.randomUUID(),
        })
      : buildUseScheduleChanges(state.config, dates, scheduleId ?? "", () => crypto.randomUUID());
    const saved = await saver.save(venueId, state, changes, "replace");
    if (!saved) return;
    offerUndo({
      venueId,
      saved,
      title: t("availability.selection.use.saved", { count: dates.length }),
    });
    onFinished();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      footer={
        <div className={styles.footer}>
          <BlockedReason id={blockedId} reason={ready ? null : t(blockedKey)} />
          <Button variant="secondary" onClick={close}>
            {t("availability.selection.use.cancel")}
          </Button>
          <Button
            variant="primary"
            disabled={!ready}
            aria-describedby={ready ? undefined : blockedId}
            isLoading={saver.isPending}
            onClick={() => void submit()}
          >
            {t("availability.selection.use.save", { count: dates.length })}
          </Button>
        </div>
      }
    >
      <Stack gap="md">
        <SaveFailure messages={saver.failure} stranded={saver.stranded} />
        {byDay ? (
          <DatePicker
            label={t("availability.selection.use.from")}
            value={sourceDate}
            onChange={setSourceDate}
          />
        ) : (
          <Select
            label={t("availability.selection.use.schedule")}
            options={schedules.map((s) => ({ value: s.id, label: scheduleNameText(s.name, t) }))}
            value={scheduleId ?? ""}
            onChange={setChosenSchedule}
          />
        )}
        <DraftPreview
          venueId={venueId}
          changes={previewChanges}
          scopeConflicts="replace"
          dates={dates}
          baseVersion={state.version}
          idle={ready ? "untouched" : "fields"}
          reviewOnSave={false}
        />
      </Stack>
    </Dialog>
  );
}
