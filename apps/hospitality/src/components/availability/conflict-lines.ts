import type { TFunction } from "i18next";
import type { ScheduleChangeSince } from "./conflict-review.js";

/** Other hours the Manager ticked in Also apply to, changed or removed by the winning save. */
export interface AlsoApplySince {
  readonly changed: readonly string[];
  readonly removed: readonly string[];
}

type NamedLine = "added" | "removed" | "changed" | "alsoChanged" | "alsoRemoved";

/** What the winning version changed in the hours the draft was built from, a line each. */
export function conflictLines(
  changes: ScheduleChangeSince,
  alsoApply: AlsoApplySince | undefined,
  t: TFunction,
  locale: string
): string[] {
  const list = new Intl.ListFormat(locale, { type: "conjunction" });
  const named = (key: NamedLine, names: readonly string[] | undefined) =>
    names && names.length > 0
      ? [t(`availabilitySchedules.conflictReview.${key}`, { names: list.format(names) })]
      : [];
  return [
    ...(changes.replacedBy !== null
      ? [t("availabilitySchedules.conflictReview.regularReplaced", { name: changes.replacedBy })]
      : []),
    ...(changes.renamedTo !== null
      ? [t("availabilitySchedules.conflictReview.renamed", { name: changes.renamedTo })]
      : []),
    ...named("added", changes.added),
    ...named("removed", changes.removed),
    ...named("changed", changes.changed),
    ...named("alsoChanged", alsoApply?.changed),
    ...named("alsoRemoved", alsoApply?.removed),
  ];
}
