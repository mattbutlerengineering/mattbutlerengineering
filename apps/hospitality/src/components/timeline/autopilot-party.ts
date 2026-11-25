import type { TFunction } from "i18next";

/** The guest's name, or "Party of N" in the host's language when the booking has no name. */
export function partyName(t: TFunction, label: string | null, size: number): string {
  return label ?? t("timeline.autopilot.partyFallback", { size });
}
