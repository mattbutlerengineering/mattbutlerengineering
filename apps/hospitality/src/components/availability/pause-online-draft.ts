import type { DateRule } from "@mbe/types";
import { addDays } from "../../utils/service-day.js";
import { buildCloseRule, validateClose, type CloseForm } from "./close-draft.js";

/** How long the Pause dialog pauses online booking for (availability-hub ux.md, "Pause"). */
export type PauseChoice = "tonight" | "untilResume" | "untilDate";

/** The choices in the order the dialog offers them; the first is the one it opens on. */
export const PAUSE_CHOICES: readonly PauseChoice[] = ["tonight", "untilResume", "untilDate"];

export interface PauseDraft {
  readonly choice: PauseChoice;
  /** The last date paused, for `untilDate`; empty until it is picked, and unread otherwise. */
  readonly until: string;
  readonly guestMessage: string;
}

/**
 * The Close form a pause describes: Booking only, Online, all day, never repeating. Every choice is
 * one online-only booking closure, the rule the closures command already takes:
 *
 * - `tonight`: `today` alone (`startsOn` = `endsOn`), so it ends with the service day and needs no
 *   Resume. It is a closure and not the Timeline's `pause_online` change because only a closure
 *   carries a guest message and comes back with a change Undo can take back.
 * - `untilResume`: from `today` with no end.
 * - `untilDate`: from `today` through `until`.
 *
 * `today` is the venue's service date, so Tonight past midnight is still the night in progress.
 */
function pauseOnlineForm(draft: PauseDraft, today: string): CloseForm {
  const { choice } = draft;
  return {
    what: { kind: "booking", types: ["online"] },
    when:
      choice === "tonight"
        ? { kind: "tonight" }
        : choice === "untilResume"
          ? { kind: "until-reopen", from: today }
          : { kind: "range", from: today, to: draft.until },
    fromMinute: null,
    staffNote: "",
    guestMessage: draft.guestMessage,
  };
}

/** The API's cap on a dated closure's span (`OPEN_END_DAYS` in `@mbe/availability`). */
const MAX_SPAN_DAYS = 366;

/** The last date "Until a date" may name: the API refuses a dated closure longer than this. */
export function pauseUntilMax(today: string): string {
  return addDays(today, MAX_SPAN_DAYS);
}

/** What blocks the pause: the date `untilDate` still needs or names out of range, or a message that is too long. */
export function pauseOnlineProblem(
  draft: PauseDraft,
  today: string
): "until" | "guestMessage" | null {
  if (draft.choice === "untilDate" && draft.until > pauseUntilMax(today)) return "until";
  const problem = validateClose(pauseOnlineForm(draft, today), today);
  // A pause always says what it pauses, so the only other problem is its dates.
  return problem === null || problem === "guestMessage" ? problem : "until";
}

/** The one rule the pause saves, or `null` while `pauseOnlineProblem` names a problem. */
export function pauseOnlineRule(draft: PauseDraft, id: string, today: string): DateRule | null {
  if (pauseOnlineProblem(draft, today) !== null) return null;
  return buildCloseRule(pauseOnlineForm(draft, today), id, today);
}
