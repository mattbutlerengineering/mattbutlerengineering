import { currentServiceDate as engineCurrentServiceDate } from "@mbe/availability";
import type { AvailabilityConfig } from "@mbe/types";

/**
 * The service day "tonight" means right now (ADR-029). The rule is the engine's, shared with the
 * reservations service; this only adapts the dashboard's `(config, timeZone, now)` call shape.
 */
export function currentServiceDate(
  config: AvailabilityConfig,
  timeZone: string,
  now: Date
): string {
  return engineCurrentServiceDate({ timezone: timeZone, config }, now);
}
