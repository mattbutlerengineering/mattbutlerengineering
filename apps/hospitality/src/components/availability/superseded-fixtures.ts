import { applyChanges } from "@mbe/availability";
import type { AvailabilityConfig } from "@mbe/types";
import { draftFromConfig, type QuickSetupDraft } from "./quick-setup-draft.js";
import { buildRegularWeekChanges } from "./schedule-changes.js";

/**
 * Test fixtures for #8688: a regular-week save made through the real change builder and engine,
 * so the superseded week it leaves behind is the one the app stores.
 */

const SAVED_AT = "2026-10-30T00:00:00.000Z";

function counter(prefix: string) {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

/** The draft with Dinner closing at 10:30 PM, last seating 9:30 PM. */
function later(draft: QuickSetupDraft): QuickSetupDraft {
  return {
    ...draft,
    services: draft.services.map((s) =>
      s.name === "Dinner"
        ? { ...s, lastSeating: "21:30", closes: "22:30", lastSeatingLinked: false }
        : s
    ),
  };
}

/**
 * Change regular week from `startsOn` with Dinner moved later: a new regular week, and the old
 * one demoted (`isRegular: false`, `kind: "regular"`) with its assignment ending the day before.
 */
export function saveRegularWeek(
  config: AvailabilityConfig,
  startsOn: string,
  prefix = "new"
): AvailabilityConfig {
  let n = 0;
  const live = draftFromConfig(config, () => `draft-${++n}`);
  return applyChanges(
    config,
    buildRegularWeekChanges({
      config,
      name: "",
      draft: later(live),
      startsOn,
      endsOn: null,
      winner: "new",
      makeId: counter(prefix),
    }),
    SAVED_AT
  );
}

/** The week a regular-week save demoted: not the regular week, still `kind: "regular"`. */
export function supersededWeekOf(config: AvailabilityConfig) {
  const week = config.schedules.find((s) => s.kind === "regular" && !s.isRegular && !s.archivedAt);
  if (!week) throw new Error("no superseded regular week in this config");
  return week;
}
