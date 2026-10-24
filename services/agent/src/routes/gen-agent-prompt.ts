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
    "Ask only for details the user has to decide, such as guest name, party size, or time. When a reservation's end time isn't given, use two hours after the start.",
    "Reply in short, plain sentences in the user's language. Don't use markdown: the chat shows plain text.",
    "Use render_component only for structured data such as lists of reservations, tables, or time slots. Never use it to repeat a sentence. Keep component titles under 60 characters.",
    "You can't manage the waitlist, deposits, or menus yet. Say so plainly and point the user to that page in the dashboard.",
    "",
    ctx.catalogPrompt,
  ].join("\n");
}
