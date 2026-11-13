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
  return `${quickSetupRowScope(serviceId, blockId, scope)}-${field}`;
}

/**
 * The id prefix of one service's fields (or one of its different-hours blocks'): what the shared
 * service fields take as their `idScope`, so their ids are the ones `quickSetupFieldId` answers.
 */
function quickSetupRowScope(serviceId: string, blockId?: string, scope: string = DEFAULT_SCOPE) {
  return `${scope}-${serviceId}${blockId === undefined ? "" : `-${blockId}`}`;
}

/** `quickSetupRowScope` for the form instance this component is rendered in. */
export function useQuickSetupRowScope() {
  const scope = use(QuickSetupIdScopeContext);
  return (serviceId: string, blockId?: string) => quickSetupRowScope(serviceId, blockId, scope);
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

/** The DOM id of a service's phone line: its header button, or the region its controls sit in. */
export function quickSetupLineId(
  serviceId: string,
  part: "header" | "fields",
  scope: string = DEFAULT_SCOPE
) {
  return `${scope}-${serviceId}-line-${part}`;
}

/** `quickSetupLineId` for the form instance this component is rendered in. */
export function useQuickSetupLineId() {
  const scope = use(QuickSetupIdScopeContext);
  return useCallback(
    (serviceId: string, part: "header" | "fields") => quickSetupLineId(serviceId, part, scope),
    [scope]
  );
}

/**
 * Moves focus to the first problem's field, for an owner whose Save is refused. The form must
 * have been given the same `scope` (`idScope`), and the field must be mounted: on a phone a
 * service with a problem is held open, so it is.
 */
export function focusFirstInvalid(issues: readonly QuickSetupIssue[], scope: string) {
  const first = issues[0];
  if (!first) return;
  document
    .getElementById(quickSetupFieldId(first.serviceId, first.field, first.blockId, scope))
    ?.focus();
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

/** Applies an overlap fix: a later start for the service (`time`), or its own days (`days`).
 * The form provides it, `IssueText` offers it; either kind changes only `serviceId`. */
export type QuickSetupFix =
  | { readonly kind: "time"; readonly serviceId: string; readonly opensAt: number }
  | { readonly kind: "days"; readonly serviceId: string; readonly days: readonly number[] };

export const QuickSetupFixContext = createContext<((fix: QuickSetupFix) => void) | null>(null);
