import type { TFunction } from "i18next";
import type { Layer, ResolvedDay } from "@mbe/availability";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import { isWholeDay, minuteText } from "./closure-band.js";
import { scheduleNameText } from "./day-summary.js";

/** The closure a "Why this day" layer stands for, found by the row id the engine keeps on both. */
function closureOf(day: ResolvedDay, layer: Layer) {
  return layer.kind === "closure" ? day.closures.find((c) => c.ruleId === layer.id) : undefined;
}

/**
 * The engine words a layer's title in en-US. Each kind maps to a catalog key from the layer's
 * `kind` (and its closure's `targetKind`); the English text is never parsed. A layer whose title
 * carries a name the engine does not expose separately ("Use Weekend", "Lunch closed", "Skipped
 * from: …") keeps the engine's words.
 */
export function layerLabelText(day: ResolvedDay, layer: Layer, t: TFunction): string {
  switch (layer.kind) {
    case "schedule":
      return scheduleNameText(layer.label, t);
    case "special_hours":
      return t("availability.calendar.dayLabel.specialHours");
    case "tonight":
      return t("availability.drawer.layer.tonight");
    case "closure":
      return closureOf(day, layer)?.targetKind === "venue"
        ? t("availability.calendar.dayLabel.closed")
        : layer.label;
    default:
      return layer.label;
  }
}

/** What a closure or skip layer does, for the kinds whose effect the closure's own minutes give. */
export function layerEffectText(
  day: ResolvedDay,
  layer: Layer,
  t: TFunction,
  format: VenueFormat
): string {
  if (layer.kind === "skip") return t("availability.drawer.layer.bookableAsUsual");
  const closure = closureOf(day, layer);
  if (!closure) return layer.effect;
  if (isWholeDay(closure)) return t("availability.drawer.layer.allDay");
  return t("availability.drawer.layer.window", {
    from: minuteText(closure.from, t, format),
    to: minuteText(closure.to, t, format),
  });
}
