import type { AvailabilityConfig, AvailabilityConfigChanges } from "@mbe/types";
import { draftToChanges, type QuickSetupDraft } from "../availability/quick-setup-draft.js";

/**
 * The PUT body that makes the wizard's hours the new venue's regular week.
 *
 * The venue is created with the legacy projection of the same draft (one window per weekday),
 * so the config it serves on its first read is derived from that: a schedule named "Regular
 * week" with a service per window called "Service", its last seating 90 minutes before close
 * (`buildLegacyConfig`). The draft carries what the Manager actually typed — the service names,
 * each service's own last seating, and several services on one day — so the launch saves it
 * over the derived rows: the derived regular schedule is reused and its rows and assignment
 * replaced (`draftToChanges`), and a derived service the draft does not name is removed, so the
 * venue never lists a "Service" nobody configured.
 */
export function launchHoursChanges(
  draft: QuickSetupDraft,
  derived: AvailabilityConfig,
  newId: () => string
): AvailabilityConfigChanges {
  const changes = draftToChanges(draft, derived, newId);
  const named = new Set((changes.upsert.scheduleServices ?? []).map((s) => s.venueServiceId));
  const unused = derived.venueServices.filter((s) => !s.archivedAt && !named.has(s.id));
  if (unused.length === 0) return changes;
  return {
    ...changes,
    remove: { ...changes.remove, venueServices: unused.map((s) => s.id) },
  };
}
