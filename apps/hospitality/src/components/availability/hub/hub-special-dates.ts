import type { DateRule } from "@mbe/types";
import type { HolidayState } from "../holiday-decisions.js";
import { nextDateOn } from "./rule-dates.js";

/** Hub row 3, special dates and holidays, as facts with no text (see `hub-rows.ts`). */

export interface HubSpecialDate {
  readonly ruleId: string;
  /** What the Add special dates sheet calls it: Closed, Special hours, Same as another day. */
  readonly kind: "closed" | "specialHours" | "useHours";
  /** The first date from today on the rule applies on: a skipped or replaced date is passed over. */
  readonly nextOn: string;
  readonly startsOn: string;
  /** `null` when the rule has no end. */
  readonly endsOn: string | null;
  /** The weekdays a repeating rule covers (0 = Sunday); `null` when it does not repeat. */
  readonly weekdays: readonly number[] | null;
}

export interface SpecialDatesRow {
  readonly row: 3;
  /** At most two, soonest `nextOn` first. A rule with no date left is not listed. */
  readonly next: readonly HubSpecialDate[];
  readonly holidaysNotPlanned: number;
}

const SPECIAL_DATES_SHOWN = 2;

function specialDateKind(rule: DateRule): HubSpecialDate["kind"] | null {
  if (rule.kind === "special_hours") return "specialHours";
  if (rule.kind === "use_schedule") return "useHours";
  // Only the whole venue closed for the whole day is a date's "Closed"; any other closure is row 4's.
  return rule.kind === "closure" && rule.targetKind === "venue" && rule.window == null
    ? "closed"
    : null;
}

export function specialDatesRow(
  rules: readonly DateRule[],
  today: string,
  holidays: readonly { readonly state: HolidayState }[]
): SpecialDatesRow {
  const next = rules
    .flatMap((rule): HubSpecialDate[] => {
      const kind = specialDateKind(rule);
      const nextOn = kind === null ? null : nextDateOn(rule, rules, today);
      if (kind === null || nextOn === null) return [];
      return [
        {
          ruleId: rule.id,
          kind,
          nextOn,
          startsOn: rule.startsOn,
          endsOn: rule.endsOn ?? null,
          weekdays: rule.repeat?.weekdays ?? null,
        },
      ];
    })
    .sort((a, b) => a.nextOn.localeCompare(b.nextOn) || a.ruleId.localeCompare(b.ruleId));
  return {
    row: 3,
    next: next.slice(0, SPECIAL_DATES_SHOWN),
    holidaysNotPlanned: holidays.filter((h) => h.state.kind === "undecided").length,
  };
}
