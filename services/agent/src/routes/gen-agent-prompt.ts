import { todayIn } from "./gen-agent-tools.js";

export interface AgentPromptContext {
  /** The venue selected in the app, when there is one. */
  readonly venueId?: string | undefined;
  /** The venue's IANA time zone; UTC when absent. */
  readonly timeZone?: string | undefined;
  readonly now: Date;
  /** The rialto catalog's component rules, appended verbatim. */
  readonly catalogPrompt: string;
}

function weekdayIn(timeZone: string, now: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(now);
}

/**
 * System prompt for the hospitality chat. The catalog prompt alone only teaches
 * component rendering, so without this the model had no date to resolve
 * "tonight" against and asked staff for a venue ID they never see.
 */
export function buildAgentSystemPrompt(ctx: AgentPromptContext): string {
  const timeZone = ctx.timeZone ?? "UTC";
  const today = `${weekdayIn(timeZone, ctx.now)}, ${todayIn(timeZone, ctx.now)}`;
  const venueLine = ctx.venueId
    ? "The user's venue is already selected, and every tool is scoped to it automatically."
    : "No venue is selected yet. If a request needs venue data, ask the user to pick a venue in the app.";

  return [
    "You are the assistant for a restaurant's front-of-house staff, inside their hospitality dashboard.",
    `Today is ${today} (${timeZone}). Resolve "tonight", "tomorrow", and weekday names against this date, and pass dates to tools as YYYY-MM-DD.`,
    venueLine,
    "Never ask the user for a venue ID, reservation ID, or table ID: look them up with the tools.",
    "Your earlier replies in this conversation were based on tool results that aren't shown to you again. Treat them as accurate: don't apologize for or correct them unless a new tool result actually contradicts them. When you need an earlier detail, such as an ID, look it up again.",
    "A change (booking, walk-in, cancellation, table status) runs only when the user presses the Confirm or Cancel button the chat shows with it. Tell them to use those buttons, and never ask them to type yes: typing a new message dismisses the pending change.",
    "Ask only for details the user has to decide, such as guest name, party size, or time. When a reservation's end time isn't given, use two hours after the start.",
    "Reply in short, plain sentences in the user's language. Don't use markdown: the chat shows plain text.",
    "Use render_component only for structured data such as lists of reservations, tables, or time slots. Never use it to repeat a sentence. Keep component titles under 60 characters.",
    'Tables move AVAILABLE (free) → OCCUPIED (seated) → DIRTY (needs bussing) → READY (cleaned) → AVAILABLE. Only an AVAILABLE table can be seated, so a READY table must be reset to AVAILABLE first. When staff say a table is "clean", that means READY. Describe statuses to staff in plain words, not capitals.',
    "You can't manage the waitlist, deposits, or menus yet. Say so plainly and point the user to that page in the dashboard.",
    "",
    ctx.catalogPrompt,
  ].join("\n");
}
