import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, DatePicker, Dialog, Select, Stack } from "@mattbutlerengineering/rialto";
import { resolveDay } from "@mbe/availability";
import type { AvailabilityConfigState } from "@mbe/types";
import { useAvailabilityUndo } from "../../hooks/useAvailabilityUndo.js";
import { seedServices } from "./draft-changes.js";
import { buildUseDayHoursChanges, buildUseScheduleChanges } from "./selection-actions.js";
import { SaveFailure } from "./ScheduleFormParts.js";
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

  const ready = byDay ? sourceServices.length > 0 : scheduleId !== null;

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
      title={t(
        byDay ? "availability.selection.use.titleDay" : "availability.selection.use.titleSchedule"
      )}
      footer={
        <div className={styles.footer}>
          <Button variant="secondary" onClick={close}>
            {t("availability.selection.use.cancel")}
          </Button>
          <Button
            variant="primary"
            disabled={!ready}
            isLoading={saver.isPending}
            onClick={() => void submit()}
          >
            {t("availability.selection.use.save", { count: dates.length })}
          </Button>
        </div>
      }
    >
      <Stack gap="md">
        <SaveFailure messages={saver.failure} />
        {byDay ? (
          <DatePicker
            label={t("availability.selection.use.from")}
            value={sourceDate}
            onChange={setSourceDate}
          />
        ) : (
          <Select
            label={t("availability.selection.use.schedule")}
            options={schedules.map((s) => ({ value: s.id, label: s.name }))}
            value={scheduleId ?? ""}
            onChange={setChosenSchedule}
          />
        )}
      </Stack>
    </Dialog>
  );
}
