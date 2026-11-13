import { useMemo } from "react";
import { addDays } from "@mbe/availability";
import {
  HOLIDAY_HORIZON_DAYS,
  holidayStates,
} from "../components/availability/holiday-decisions.js";
import { hubRows, type HubRows } from "../components/availability/hub/hub-rows.js";
import { useHolidayCountry } from "../components/availability/use-holidays.js";
import { useVenue } from "../contexts/VenueContext.js";
import { minutesOfDayIn } from "../utils/service-day.js";
import type { AvailabilityScope } from "./useAvailabilityScope.js";
import { useVenueFloorPlanSections } from "./useFloorPlans.js";
import { useHolidayDecisions } from "./useHolidayDecisions.js";
import { useNow } from "./useNow.js";

const NO_HOLIDAYS: readonly never[] = [];

/**
 * The hub's five rows for the layout's config, or `null` until it has loaded. Section names and
 * holiday decisions are read here, through the queries the list pages use. While either loads or
 * fails the rows still render: a section reads as "a section", and no holiday is counted as not
 * planned, since the hub cannot yet know that it is.
 */
export function useAvailabilityHub(scope: AvailabilityScope): HubRows | null {
  const { venueId, state, timezone, today } = scope;
  const { selectedVenue } = useVenue();
  const settings = selectedVenue?.settings;
  const nowMinute = minutesOfDayIn(useNow(), timezone);
  const sections = useVenueFloorPlanSections({ venueId });
  const country = useHolidayCountry();
  const decisions = useHolidayDecisions({
    venueId,
    from: today,
    to: addDays(today, HOLIDAY_HORIZON_DAYS),
  });
  return useMemo(() => {
    if (!state) return null;
    return hubRows({
      state,
      settings,
      holidays:
        country && decisions.data
          ? holidayStates(country, today, state.config, decisions.data)
          : NO_HOLIDAYS,
      sectionNames: new Map((sections.data ?? []).map((s) => [s.id, s.name])),
      timezone,
      today,
      nowMinute,
    });
  }, [state, settings, country, decisions.data, sections.data, timezone, today, nowMinute]);
}
