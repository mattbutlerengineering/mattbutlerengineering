import { availabilityPath } from "../availability-address.js";
import type { HubRowModels } from "./hub-rows.js";

/**
 * Each hub row's one action (availability-hub ux.md, "Hub"): a Manager edits rows 1, 2, 3 and 5
 * and views row 4; a Host views rows 3 and 4 and has nothing to do on the others. Row 2 reads Add
 * while no seasonal hours exist, and goes straight to the new-hours editor. Every address comes
 * from the address module. Pure: no text.
 */
export interface HubAction {
  readonly kind: "edit" | "add" | "view";
  readonly to: string;
}

export function hubActions(
  rows: HubRowModels,
  isManager: boolean
): readonly [HubAction | null, HubAction | null, HubAction, HubAction, HubAction | null] {
  const view = (to: string): HubAction => ({ kind: "view", to });
  const edit = (to: string): HubAction | null => (isManager ? { kind: "edit", to } : null);
  const specialDates = availabilityPath({ view: "specialDates" });
  const seasonal: HubAction | null = !isManager
    ? null
    : rows[1].sets.length === 0
      ? { kind: "add", to: availabilityPath({ view: "seasonal", screen: "new" }) }
      : { kind: "edit", to: availabilityPath({ view: "seasonal" }) };
  return [
    edit(availabilityPath({ view: "hours" })),
    seasonal,
    edit(specialDates) ?? view(specialDates),
    view(availabilityPath({ view: "closures" })),
    edit(availabilityPath({ view: "bookingRules" })),
  ];
}
