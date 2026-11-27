import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@mattbutlerengineering/rialto";
import { addDays, weekChanges } from "@mbe/availability";
import type { AvailabilityConfig, HolidayDecision } from "@mbe/types";
import {
  useClearHolidayDecision,
  useHolidayDecisions,
  useSetHolidayDecision,
} from "../../hooks/useHolidayDecisions.js";
import { useManagerAccess } from "../../hooks/useIsManager.js";
import { useNow } from "../../hooks/useNow.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { currentServiceDate } from "../../utils/current-service-date.js";
import { venueDate } from "../../utils/service-day.js";
import { holidayStates, HOLIDAY_HORIZON_DAYS, type DecidedHoliday } from "./holiday-decisions.js";
import { useHolidayCountry } from "./use-holidays.js";
import { weekChangeRows } from "./week-changes-view.js";

type Decisions = HolidayDecision[] | null | undefined;

/** The decisions query as last seen: a new read is new data or a new error. */
export interface DecisionsRead {
  readonly data: Decisions;
  readonly error: unknown;
}

/** The week's rows: undefined holidays while they are unknown, so none is offered as undecided. */
export function useWeekRows(venueId: string, config: AvailabilityConfig) {
  const format = useVenueFormat();
  const access = useManagerAccess();
  const country = useHolidayCountry();
  const now = useNow();
  const today = venueDate(now, format.timeZone);
  // Tomorrow on, by service day: today is TodayLine's.
  const from = addDays(currentServiceDate(config, format.timeZone, now), 1);
  // The params Special dates and the holiday nudge read with, so the three share one request.
  const decisions = useHolidayDecisions({
    venueId,
    from: today,
    to: addDays(today, HOLIDAY_HORIZON_DAYS),
  });
  const isManager = access.isManager && !access.isPending;
  const view = useMemo(
    () =>
      weekChangeRows({
        changes: weekChanges(config, from),
        holidays:
          country && decisions.data
            ? holidayStates(country, from, config, decisions.data)
            : undefined,
        from,
        isManager,
      }),
    [config, from, country, decisions.data, isManager]
  );
  const read: DecisionsRead = { data: decisions.data as Decisions, error: decisions.error };
  return { ...view, decisions: read };
}

/** One holiday's save. `at` is the decisions read (data and error) when it was pressed. */
interface SaveState {
  readonly phase: "saving" | "failed" | "saved";
  readonly at: DecisionsRead;
}

export interface HolidaySaveCallbacks {
  /** The save failed: the row stays, with Retry. */
  readonly onFailed: () => void;
}

/**
 * Open as usual from a row: the same save, toast and Undo as Upcoming holidays. A row is pending
 * from the tap until the decisions are read again (the row leaves then), not only until the save
 * resolves: a second tap in between would save twice.
 */
export function useOpenAsUsual(venueId: string, decisions: DecisionsRead) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const set = useSetHolidayDecision();
  const clear = useClearHolidayDecision();
  const [saves, setSaves] = useState<ReadonlyMap<string, SaveState>>(() => new Map());
  const setSave = (date: string, save: SaveState) =>
    setSaves((prev) => new Map(prev).set(date, save));

  const openAsUsual = async (
    holiday: DecidedHoliday,
    name: string,
    callbacks: HolidaySaveCallbacks
  ): Promise<void> => {
    const serviceDate = holiday.date;
    const at = decisions;
    setSave(serviceDate, { phase: "saving", at });
    try {
      await set.mutateAsync({ venueId, serviceDate, decision: "open_as_usual" });
    } catch {
      setSave(serviceDate, { phase: "failed", at });
      callbacks.onFailed();
      return;
    }
    setSave(serviceDate, { phase: "saved", at });
    toast({
      title: t("availabilitySpecial.holidays.openAsUsualToast", { name }),
      action: {
        label: t("availability.undo.action"),
        onClick: () =>
          void clear.mutateAsync({ venueId, serviceDate }).catch(() => {
            // The mark stays: the holiday reads Open as usual in Special dates, which is true.
          }),
      },
    });
  };

  /** "pending" until the decisions are read again after the tap; "failed" until a Retry. */
  const statusOf = (date: string): "pending" | "failed" | undefined => {
    const save = saves.get(date);
    if (save === undefined) return undefined;
    if (save.phase === "failed") return "failed";
    if (save.phase === "saving") return "pending";
    // A refetch that errors ends it too: the row stays, pressable again, never stuck pending.
    const unread = save.at.data === decisions.data && save.at.error === decisions.error;
    return unread ? "pending" : undefined;
  };
  return { statusOf, openAsUsual };
}
