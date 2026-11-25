import { lastServiceDate as engineLastServiceDate } from "@mbe/availability";
import type { AvailabilityConfig } from "@mbe/types";

/**
 * The service day a closing summary means: the one that last opened (ADR-029). The rule is the
 * engine's; this only adapts the dashboard's `(config, timeZone, now)` call shape.
 */
export function lastServiceDate(config: AvailabilityConfig, timeZone: string, now: Date): string {
  return engineLastServiceDate({ timezone: timeZone, config }, now);
}
