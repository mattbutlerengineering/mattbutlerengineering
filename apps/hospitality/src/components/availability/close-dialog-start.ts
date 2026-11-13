import type { CloseTarget } from "./availability-address.js";

/** The `CloseDialog` props a close target opens it with. */
export interface CloseDialogStart {
  readonly initialDate: string | null;
  readonly initialDates?: readonly string[];
  readonly initialRange?: { readonly from: string; readonly to: string };
  readonly initialSectionId?: string;
  readonly startTonight?: boolean;
}

/**
 * How the Close dialog opens for `?close=<target>` (architecture.md "Layout Close and Pause
 * host"). A section the venue does not have is the dialog's to drop: it then opens on the whole
 * venue, as it always has for a stale link.
 */
export function closeDialogStart(target: CloseTarget): CloseDialogStart {
  switch (target.kind) {
    case "venue":
      return { initialDate: null };
    case "tonight":
      return { initialDate: null, startTonight: true };
    case "date":
      return { initialDate: target.date };
    case "range":
      return { initialDate: null, initialRange: { from: target.from, to: target.to } };
    case "dates":
      return { initialDate: null, initialDates: target.dates };
    case "section":
      return { initialDate: null, initialSectionId: target.sectionId };
  }
}

/** The close target for dates picked on the calendar: one is that date, more are a list. */
export function closeTargetForDates(dates: readonly string[]): CloseTarget {
  return dates.length === 1 ? { kind: "date", date: dates[0]! } : { kind: "dates", dates };
}
