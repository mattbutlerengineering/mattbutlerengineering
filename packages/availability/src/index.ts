export { addDays, weekdayIndexOf, weekdayOf } from "./civil-date.js";
export { localDateTimeOf, serviceDayInstant } from "./instant.js";
export {
  resolveDay,
  type AvailabilitySnapshot,
  type BookingOpen,
  type Layer,
  type LayerKind,
  type ResolvedClosure,
  type ResolvedDay,
  type ResolvedDaySummary,
  type ResolvedService,
} from "./resolve-day.js";
export {
  normalizeLegacyHours,
  type LegacyHours,
  type LegacyHoursFailure,
  type LegacyHoursResult,
  type LegacyOverride,
  type LegacyShape,
  type LegacyWindow,
} from "./legacy-hours.js";
export {
  DEFAULT_LAST_SEATING_BUFFER,
  buildLegacyConfig,
  type LegacyMigrationInput,
  type LegacyMigrationNotes,
  type LegacyMigrationResult,
  type PastMidnightWindow,
} from "./legacy-migration.js";
export {
  projectLegacyOperatingHours,
  type LegacyDayHours,
  type LegacyOperatingHours,
} from "./legacy-projection.js";
export { MINUTES_PER_DAY, WEEKDAYS, type ServiceDate, type Weekday } from "./types.js";
export { validateConfig, type ConfigIssue, type ConfigIssueCode } from "./validate-config.js";
export {
  DEFAULT_SLOT_INTERVAL,
  activeHoldWindow,
  checkPacingForSlot,
  checkTableConflict,
  estimateDuration,
  filterSuitableTables,
  overlapWindow,
  selectBestTable,
  type EngineSettings,
  type HoldSlim,
  type ReservationSlim,
  type TableCandidate,
  type TableFilter,
} from "./slot-rules.js";
export {
  judge,
  listSlots,
  type BookingChannel,
  type BookingRequest,
  type BookingSnapshot,
  type EngineTable,
  type HardReason,
  type Slot,
  type SoftLimit,
  type Verdict,
} from "./slots.js";
