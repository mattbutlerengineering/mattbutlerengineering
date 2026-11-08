import { createContext, use, useCallback } from "react";
import { addDays } from "@mbe/availability";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { WEEK_DISPLAY_ORDER } from "./quick-setup-draft.js";
import { type QuickSetupField, type QuickSetupIssue } from "./quick-setup-validate.js";

/** A fixed Monday: weekday names come from the active locale, never a hand-kept list. */
const SAMPLE_MONDAY = "2026-10-26";
const DEFAULT_SCOPE = "quick-setup";

/**
 * Which form instance a field id belongs to. Two forms can be mounted at once (the week panel and
 * the Change regular week drawer opened from it, on the same draft), so ids carry the instance.
 */
export const QuickSetupIdScopeContext = createContext(DEFAULT_SCOPE);

/** The DOM id of a field, so the owner can move focus to the first invalid one. */
export function quickSetupFieldId(
  serviceId: string | null,
  field: QuickSetupField | "days",
  blockId?: string,
  scope: string = DEFAULT_SCOPE
) {
  if (serviceId === null) return `${scope}-days`;
  return `${scope}-${serviceId}${blockId === undefined ? "" : `-${blockId}`}-${field}`;
}

/** `quickSetupFieldId` for the form instance this component is rendered in; stable per scope. */
export function useQuickSetupFieldId() {
  const scope = use(QuickSetupIdScopeContext);
  return useCallback(
    (serviceId: string | null, field: QuickSetupField | "days", blockId?: string) =>
      quickSetupFieldId(serviceId, field, blockId, scope),
    [scope]
  );
}

export function issuesFor(
  issues: readonly QuickSetupIssue[],
  serviceId: string | null,
  field: string,
  blockId?: string
) {
  return issues.filter(
    (i) => i.serviceId === serviceId && i.field === field && i.blockId === blockId
  );
}

/** A stored weekday index (0 = Sunday) as its name in the active locale. */
export function useWeekdayName() {
  const format = useVenueFormat();
  return (day: number, weekday: "long" | "short" = "long") =>
    format.formatCalendarDate(addDays(SAMPLE_MONDAY, WEEK_DISPLAY_ORDER.indexOf(day)), { weekday });
}

/** Applies an overlap issue's suggested start; the form provides it, `IssueText` offers it. */
export const QuickSetupFixContext = createContext<
  ((fix: { readonly serviceId: string; readonly opensAt: number }) => void) | null
>(null);
