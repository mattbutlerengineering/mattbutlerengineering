import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, DatePicker, Dialog, Stack, Text, useToast } from "@mattbutlerengineering/rialto";
import type { ResolvedDay } from "@mbe/availability";
import type { AvailabilityConfigState, ScopeConflictMode } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { buildCopyDayChanges, copyDayDates } from "./copy-day.js";
import { seedServices } from "./draft-changes.js";
import { ownChangeDates } from "./scope-dates.js";
import { OwnChangesChoice, SaveFailure, WeekdayToggles } from "./ScheduleFormParts.js";
import { useScheduleSave } from "./use-schedule-save.js";
import styles from "./ScheduleFormParts.module.css";

export interface CopyDayActionProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  readonly date: string;
  readonly day: ResolvedDay;
  readonly onStale: () => void;
}

/**
 * Copy to other days (ux.md F4): the day's services carried to chosen weekdays from a date
 * until a date (or until changed again), with the same keep/replace choice as any dated save.
 */
export function CopyDayAction(props: CopyDayActionProps) {
  const { venueId, state, date, day, onStale } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const { toast } = useToast();
  const saver = useScheduleSave(onStale);
  const [open, setOpen] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [from, setFrom] = useState<string | null>(date);
  const [until, setUntil] = useState<string | null>(null);
  const [mode, setMode] = useState<ScopeConflictMode>("keep");

  const dates = useMemo(
    () => (from ? copyDayDates({ weekdays, from, until }) : []),
    [weekdays, from, until]
  );
  const own = useMemo(() => ownChangeDates(state.config, dates, null), [state.config, dates]);
  const heading = format.formatCalendarDate(date, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const close = () => {
    setOpen(false);
    saver.clearFailure();
  };

  const submit = async () => {
    if (!from) return;
    const changes = buildCopyDayChanges({
      config: state.config,
      services: seedServices(state.config, day, { kind: "date", date }),
      weekdays,
      from,
      until,
      makeId: () => crypto.randomUUID(),
    });
    const ok = await saver.save(venueId, state, changes, dates.length > 1 ? mode : "replace");
    if (!ok) return;
    toast({
      variant: "success",
      title: t("availabilitySchedules.copy.saved", { count: dates.length }),
    });
    close();
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {t("availabilitySchedules.copy.action")}
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title={t("availabilitySchedules.copy.title", { date: heading })}
        footer={
          <div className={styles.footer}>
            <Button variant="secondary" onClick={close}>
              {t("availabilitySchedules.cancel")}
            </Button>
            <Button
              variant="primary"
              disabled={dates.length === 0}
              isLoading={saver.isPending}
              onClick={() => void submit()}
            >
              {t("availabilitySchedules.copy.save", { count: dates.length })}
            </Button>
          </div>
        }
      >
        <Stack gap="md">
          <SaveFailure messages={saver.failure} />
          <WeekdayToggles
            legend={t("availabilitySchedules.copy.days")}
            value={weekdays}
            onChange={setWeekdays}
          />
          <div className={styles.dates}>
            <DatePicker
              label={t("availabilitySchedules.copy.from")}
              value={from}
              onChange={setFrom}
            />
            <DatePicker
              label={t("availabilitySchedules.copy.until")}
              placeholder={t("availabilitySchedules.noEnd")}
              value={until}
              min={from ?? undefined}
              onChange={setUntil}
            />
          </div>
          <Text variant="caption" color="secondary">
            {t("availabilitySchedules.impact", { count: dates.length })}
          </Text>
          <OwnChangesChoice
            count={dates.length > 1 ? own.length : 0}
            value={mode}
            onChange={setMode}
          />
        </Stack>
      </Dialog>
    </>
  );
}
