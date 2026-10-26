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
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { seedServices, type DraftService } from "./draft-changes.js";
import {
  buildRegularWeekChanges,
  overlappingSchedules,
  datesOfUse,
  type Winner,
} from "./schedule-changes.js";
import { ownChangeDates } from "./scope-dates.js";
import { OverlapChoice, OwnChangesChoice, SaveFailure } from "./ScheduleFormParts.js";
import { ServicesEditor } from "./ServicesEditor.js";
import { useScheduleSave } from "./use-schedule-save.js";
import styles from "./ScheduleFormParts.module.css";

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

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
 * week). Where the period meets another dated schedule the Manager chooses which wins.
 */
export function ChangeRegularWeekDrawer(props: ChangeRegularWeekDrawerProps) {
  const { venueId, state, today, onStale, onClose } = props;
  const { config } = state;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const { toast } = useToast();
  const saver = useScheduleSave(onStale);

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

  const dates = useMemo(
    () => (startsOn ? datesOfUse({ weekdays: EVERY_DAY, startsOn, endsOn }, startsOn) : []),
    [startsOn, endsOn]
  );
  const own = useMemo(() => ownChangeDates(config, dates, null), [config, dates]);
  const overlaps = useMemo(
    () =>
      startsOn && endsOn
        ? overlappingSchedules(config, { weekdays: EVERY_DAY, startsOn, endsOn }).map((s) => s.name)
        : [],
    [config, startsOn, endsOn]
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
    const ok = await saver.save(
      venueId,
      state,
      changes,
      dates.length > 1 ? conflictMode : "replace"
    );
    if (!ok) return;
    toast({
      variant: "success",
      title: t("availabilitySchedules.regularWeek.saved", { name: trimmed, date: startText }),
    });
    onClose();
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={t("availabilitySchedules.regularWeek.title")}
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
            {startsOn
              ? t("availabilitySchedules.regularWeek.save", { date: startText })
              : t("availabilitySchedules.save")}
          </Button>
        </div>
      }
    >
      <Stack gap="md">
        <SaveFailure messages={saver.failure} />
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
        </div>
        {endsOn === null && (
          <Text variant="caption" color="secondary">
            {t("availabilitySchedules.regularWeek.noEnd")}
          </Text>
        )}
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
          date={startsOn ?? today}
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
