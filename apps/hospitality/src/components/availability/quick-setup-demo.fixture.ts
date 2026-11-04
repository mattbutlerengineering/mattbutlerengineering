import {
  emptyService,
  type HoursBlock,
  type QuickSetupDraft,
  type ServiceDraft,
} from "./quick-setup-draft.js";

/** Test fixtures for the quick-setup form's draft: the PRD demo week as the form holds it. */

export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

export function draftService(
  id: string,
  name: string,
  times: readonly [string, string, string],
  extra: Partial<ServiceDraft> = {}
): ServiceDraft {
  const [opens, lastSeating, closes] = times;
  return {
    ...emptyService(id),
    name,
    opens,
    lastSeating,
    closes,
    lastSeatingLinked: false,
    ...extra,
  };
}

export function draftBlock(
  id: string,
  days: number[],
  times: readonly [string, string, string]
): HoursBlock {
  const [opens, lastSeating, closes] = times;
  return { id, days, opens, lastSeating, closes, lastSeatingLinked: false };
}

/** Lunch Mon-Fri, dinner Tue-Sun with a later close Fri-Sat, brunch Sat-Sun. */
export function demoDraft(): QuickSetupDraft {
  return {
    days: EVERY_DAY,
    services: [
      draftService("lunch", "Lunch", ["11:30", "14:00", "15:00"], { days: [1, 2, 3, 4, 5] }),
      draftService("dinner", "Dinner", ["17:00", "21:00", "23:00"], {
        days: [2, 3, 4, 5, 6, 0],
        blocks: [draftBlock("late", [5, 6], ["17:00", "22:00", "00:00"])],
      }),
      draftService("brunch", "Brunch", ["10:00", "13:00", "14:00"], { days: [6, 0] }),
    ],
  };
}
