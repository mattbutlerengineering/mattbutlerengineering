import type { AvailabilityConfig, AvailabilityConfigSource } from "@mbe/types";

/**
 * A venue's availability config as the store read it. Its own module so the
 * pure planners (`availability-preview.ts`) can name it without importing the
 * store, which imports them.
 */
export interface ConfigState {
  /** The rows as stored (empty for a venue with none). */
  stored: AvailabilityConfig;
  /** What the venue runs on: the rows, or the legacy-derived config. */
  effective: AvailabilityConfig;
  source: AvailabilityConfigSource;
  /** `legacy` only: days the lenient reader closed, and values it coerced. */
  legacyNotes?: LegacyNotes;
  /** `unreadable` only: why even the lenient reader could not read the hours. */
  legacyProblem?: { reason: string; detail: string };
  version: number;
  timezone: string;
  operatingHours: unknown;
}

export interface LegacyNotes {
  unreadableDays: string[];
  coercions: string[];
}
