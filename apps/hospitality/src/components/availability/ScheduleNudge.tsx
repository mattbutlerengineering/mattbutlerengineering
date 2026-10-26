import { useTranslation } from "react-i18next";
import { Button, Text, useToast } from "@mattbutlerengineering/rialto";
import { weekdayIndexOf, type ResolvedDay } from "@mbe/availability";
import type { AvailabilityConfigState } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { NUDGE_THRESHOLD, singleDateChangeCount } from "./copy-day.js";
import { seedServices } from "./draft-changes.js";
import { buildNewScheduleChanges } from "./schedule-changes.js";
import { SaveFailure } from "./ScheduleFormParts.js";
import { useScheduleSave } from "./use-schedule-save.js";

export interface ScheduleNudgeProps {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  readonly date: string;
  readonly day: ResolvedDay;
  readonly onStale: () => void;
}

/**
 * The discovery nudge (ux.md F2 step 7): once the same weekday has been changed for single
 * dates three times, offer one tap that makes a schedule of this day's hours for that weekday.
 * Shown only while the day still follows the regular week; a weekday that already has its own
 * schedule needs no suggestion.
 */
export function ScheduleNudge(props: ScheduleNudgeProps) {
  const { venueId, state, date, day, onStale } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const { toast } = useToast();
  const saver = useScheduleSave(onStale);

  const weekday = weekdayIndexOf(date);
  const onRegular = state.config.schedules.find((s) => s.id === day.scheduleId)?.isRegular === true;
  const count = singleDateChangeCount(state.config, weekday);
  if (!onRegular || count < NUDGE_THRESHOLD || day.services.length === 0) return null;

  const weekdayName = format.formatCalendarDate(date, { weekday: "long" });
  const make = async () => {
    const changes = buildNewScheduleChanges({
      config: state.config,
      name: weekdayName,
      services: seedServices(state.config, day, { kind: "date", date }),
      useOn: { weekdays: [weekday], startsOn: null, endsOn: null },
      winner: "new",
      makeId: () => crypto.randomUUID(),
    });
    if (await saver.save(venueId, state, changes, "keep")) {
      toast({
        variant: "success",
        title: t("availabilitySchedules.nudge.created", { weekday: weekdayName }),
      });
    }
  };

  return (
    <aside aria-label={t("availabilitySchedules.nudge.label")}>
      <Text variant="body" color="primary">
        {t("availabilitySchedules.nudge.text", { weekday: weekdayName, count })}
      </Text>
      <SaveFailure messages={saver.failure} />
      <Button variant="secondary" size="sm" isLoading={saver.isPending} onClick={() => void make()}>
        {t("availabilitySchedules.nudge.make", { weekday: weekdayName })}
      </Button>
    </aside>
  );
}
