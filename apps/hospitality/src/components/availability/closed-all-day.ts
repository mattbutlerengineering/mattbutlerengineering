import type { ResolvedDay } from "@mbe/availability";

/** The venue is closed for the whole day, so a rule written under that closure would not show. */
export const closedAllDay = (day: ResolvedDay): boolean =>
  day.services.length === 0 &&
  day.explanation.some((layer) => layer.kind === "closure" && !layer.window);
