import type { TFunction } from "i18next";
import { defaultT } from "../i18n/default-t.js";
import { formatLocalTime } from "./format.js";
import type { VenueOpenState } from "./venueOpenState.js";

/**
 * The neon sign's caption and accessible name — one string per state, in the
 * app's 12-hour convention. Commas rather than middle dots, so a screen
 * reader pauses instead of announcing punctuation.
 */
export function formatVenueOpenLabel(
  s: VenueOpenState,
  formatClock: (hhmm: string) => string = formatLocalTime,
  t: TFunction = defaultT
): string {
  switch (s.state) {
    case "open":
      return t("home.openSign.open", { time: formatClock(s.closesAt) });
    case "opening-soon":
      return t("home.openSign.openingSoon", { time: formatClock(s.opensAt) });
    case "closed":
      return s.opensOn === null
        ? t("home.openSign.closedToday", { time: formatClock(s.opensAt) })
        : t("home.openSign.closedOn", {
            weekday: t(`home.openSign.weekdays.${s.opensOn}`),
            time: formatClock(s.opensAt),
          });
    case "unset":
      return t("home.openSign.unset");
  }
}
