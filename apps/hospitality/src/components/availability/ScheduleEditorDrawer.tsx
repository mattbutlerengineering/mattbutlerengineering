import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  DatePicker,
  Drawer,
  Input,
  Stack,
  Text,
  useToast,
} from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, ScopeConflictMode } from "@mbe/types";
import { seedServices, type DraftService } from "./draft-changes.js";
import {
  buildEditScheduleChanges,
  buildNewScheduleChanges,
  overlappingSchedules,
  datesOfUse,
  type Winner,
} from "./schedule-changes.js";
import { ownChangeDates, scopeDates } from "./scope-dates.js";
import {
  OverlapChoice,
  OwnChangesChoice,
  SaveFailure,
  WeekdayToggles,
} from "./ScheduleFormParts.js";
import { ServicesEditor } from "./ServicesEditor.js";
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
  readonly onStale: () => void;
  readonly onClose: () => void;
}

/**
 * New, duplicate and edit for a schedule (ux.md F3). A new or copied schedule also says where it
 * is used (weekdays, optional dates) and settles who wins an overlap; an edit keeps its use and
 * changes the schedule everywhere it runs.
 */
export function ScheduleEditorDrawer(props: ScheduleEditorDrawerProps) {
  const { venueId, state, timezone, today, mode, sourceScheduleId, onStale, onClose } = props;
  const { config } = state;
  const { t } = useTranslation();
  const { toast } = useToast();
  const saver = useScheduleSave(onStale);

  const source = config.schedules.find((s) => s.id === sourceScheduleId);
  const [name, setName] = useState(() =>
    mode === "edit"
      ? (source?.name ?? "")
      : mode === "duplicate"
        ? t("availabilitySchedules.copyName", { name: source?.name ?? "" })
        : ""
  );
  const [services, setServices] = useState<DraftService[]>(() =>
    source
      ? seedServices(config, { services: [] }, { kind: "schedule", scheduleId: source.id })
      : []
  );
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [startsOn, setStartsOn] = useState<string | null>(null);
  const [endsOn, setEndsOn] = useState<string | null>(null);
  const [winner, setWinner] = useState<Winner>("new");
  const [conflictMode, setConflictMode] = useState<ScopeConflictMode>("keep");

  const editing = mode === "edit";
  const useOn = useMemo(() => ({ weekdays, startsOn, endsOn }), [weekdays, startsOn, endsOn]);
  const dates = useMemo(
    () =>
      editing && sourceScheduleId
        ? scopeDates(
            { kind: "schedule", scheduleId: sourceScheduleId },
            { config, timezone, today }
          )
        : datesOfUse(useOn, today),
    [editing, sourceScheduleId, config, timezone, today, useOn]
  );
  const own = useMemo(() => ownChangeDates(config, dates, null), [config, dates]);
  const overlaps = useMemo(
    () => (editing ? [] : overlappingSchedules(config, useOn).map((s) => s.name)),
    [editing, config, useOn]
  );

  const trimmed = name.trim();
  const incomplete =
    trimmed === "" ||
    services.length === 0 ||
    services.some((s) => s.venueServiceId === null && !s.name.trim());

  const submit = async () => {
    const makeId = () => crypto.randomUUID();
    const changes =
      editing && sourceScheduleId
        ? buildEditScheduleChanges({
            config,
            scheduleId: sourceScheduleId,
            name: trimmed,
            services,
            makeId,
          })
        : buildNewScheduleChanges({ config, name: trimmed, services, useOn, winner, makeId });
    const ok = await saver.save(
      venueId,
      state,
      changes,
      dates.length > 1 ? conflictMode : "replace"
    );
    if (!ok) return;
    toast({ variant: "success", title: t("availabilitySchedules.saved", { name: trimmed }) });
    onClose();
  };

  const title =
    mode === "edit"
      ? t("availabilitySchedules.editTitle", { name: source?.name ?? "" })
      : mode === "duplicate"
        ? t("availabilitySchedules.duplicateTitle")
        : t("availabilitySchedules.newTitle");

  return (
    <Drawer
      open
      onClose={onClose}
      title={title}
      size="wide"
      footer={
        <div className={styles.footer}>
          <Button variant="secondary" onClick={onClose}>
            {t("availabilitySchedules.cancel")}
          </Button>
          <Button
            variant="primary"
            disabled={incomplete}
            isLoading={saver.isPending}
            onClick={() => void submit()}
          >
            {t("availabilitySchedules.save")}
          </Button>
        </div>
      }
    >
      <Stack gap="md">
        <SaveFailure messages={saver.failure} />
        <Input
          label={t("availabilitySchedules.name")}
          value={name}
          maxLength={60}
          required
          onChange={(e) => setName(e.target.value)}
        />
        {!editing && (
          <>
            <WeekdayToggles
              legend={t("availabilitySchedules.useOn")}
              value={weekdays}
              onChange={setWeekdays}
            />
            <div className={styles.dates}>
              <DatePicker
                label={t("availabilitySchedules.startsOn")}
                placeholder={t("availabilitySchedules.noStart")}
                value={startsOn}
                onChange={setStartsOn}
              />
              <DatePicker
                label={t("availabilitySchedules.endsOn")}
                placeholder={t("availabilitySchedules.noEnd")}
                value={endsOn}
                min={startsOn ?? undefined}
                onChange={setEndsOn}
              />
            </div>
          </>
        )}
        <Text variant="caption" color="secondary">
          {weekdays.length === 0 && !editing
            ? t("availabilitySchedules.impactNone")
            : t("availabilitySchedules.impact", { count: dates.length })}
        </Text>
        <ServicesEditor
          services={services}
          venueServices={config.venueServices}
          date={today}
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
  );
}
