import { useMemo } from "react";
import type { AvailabilityConfig, Schedule } from "@mbe/types";
import { useNow } from "../../hooks/useNow.js";
import { currentServiceDate } from "../../utils/current-service-date.js";
import { visibleSchedules } from "./superseded-schedules.js";

/**
 * The venue's current service date on its own clock, the same one the Availability page uses
 * (ADR-029): after midnight on an overnight venue it is still last night's date.
 */
export function useServiceDate(config: AvailabilityConfig, timezone: string): string {
  const now = useNow();
  return useMemo(() => currentServiceDate(config, timezone, now), [config, timezone, now]);
}

/** The schedules a Manager can see right now (#8688): what every schedule picker and count lists. */
export function useVisibleSchedules(config: AvailabilityConfig, timezone: string): Schedule[] {
  const serviceDate = useServiceDate(config, timezone);
  return useMemo(() => visibleSchedules(config, serviceDate), [config, serviceDate]);
}
