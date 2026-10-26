import type { TFunction } from "i18next";
import type { OutcomeCounts } from "./close-draft.js";

/** The button that names the result (ux.md F5 step 7): "Close and cancel 14". */
export function outcomeLabel(counts: OutcomeCounts, t: TFunction): string {
  const parts = (["cancel", "move", "keep_notify", "keep_silent"] as const)
    .filter((a) => counts[a] > 0)
    .map((a) => ({ a, count: counts[a] }));
  // Nothing chosen yet: ask for a choice rather than render an empty "Close · ".
  if (parts.length === 0) return t("availability.close.button.choose");
  if (parts.length === 1) {
    const [only] = parts;
    return t(`availability.close.button.${only!.a}`, { count: only!.count });
  }
  return t("availability.close.button.mixed", {
    parts: parts
      .map((p) => t(`availability.close.button.part.${p.a}`, { count: p.count }))
      .join(" · "),
  });
}
