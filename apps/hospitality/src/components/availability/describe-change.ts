import type { TFunction } from "i18next";
import type { AvailabilityChangeEntry, AvailabilityChangeOutcome } from "@mbe/types";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";

const DAY: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };

function whenOf(entry: AvailabilityChangeEntry, format: VenueFormat, t: TFunction): string | null {
  if (!entry.affectedFrom) return null;
  const from = format.formatCalendarDate(entry.affectedFrom, DAY);
  if (!entry.affectedTo || entry.affectedTo === entry.affectedFrom) return from;
  return t("availability.history.entry.range", {
    from,
    to: format.formatCalendarDate(entry.affectedTo, DAY),
  });
}

function outcomeText(outcome: AvailabilityChangeOutcome, format: VenueFormat, t: TFunction) {
  const parts = [
    outcome.cancelled > 0
      ? t("availability.history.entry.cancelled", { count: outcome.cancelled })
      : null,
    outcome.moved > 0 ? t("availability.history.entry.moved", { count: outcome.moved }) : null,
    outcome.kept > 0 ? t("availability.history.entry.kept", { count: outcome.kept }) : null,
  ].filter((p): p is string => p !== null);
  if (parts.length === 0) return t("availability.history.entry.none");
  return new Intl.ListFormat(format.locale, { style: "long", type: "conjunction" }).format(parts);
}

/**
 * Words a closure, close-early or reopening in plain, translated language from the entry's
 * structured fields (docs/features/venue-availability/ux.md F12). `null` when the entry lacks
 * them (an older API, an older row, another kind): the caller shows the stored `summary`.
 */
export function describeChange(
  entry: AvailabilityChangeEntry,
  format: VenueFormat,
  t: TFunction
): string | null {
  const when = whenOf(entry, format, t);
  if (!when) return null;
  if (entry.kind === "reopen") return t("availability.history.entry.reopened", { when });
  if (entry.kind !== "closure" || !entry.outcome) return null;
  return t(
    entry.outcome.closeEarly
      ? "availability.history.entry.closedEarly"
      : "availability.history.entry.closed",
    { when, outcome: outcomeText(entry.outcome, format, t) }
  );
}
