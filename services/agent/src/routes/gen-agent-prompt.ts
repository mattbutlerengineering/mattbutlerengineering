import { todayIn } from "./gen-agent-tools.js";

/** The dashboard pages the chat can be opened on, and what each one shows staff. */
export const CHAT_PAGES = {
  timeline: "Timeline page (the day's bookings on the floor, table by table)",
  dashboard: "Dashboard page (today's covers, waitlist and lapsing guests)",
  reservations: "Reservations page (the booking list)",
  guests: "Guests page (the guest directory)",
  waitlist: "Waitlist page (walk-ins waiting for a table)",
  briefing: "Briefing page (the pre-shift briefing)",
  "floor-plans": "Floor plans page (the venue's layouts and tables)",
  availability: "Availability page (schedules, closures and Tonight changes)",
  menus: "Menus page (the venue's menus and items)",
  "booking-widget": "Booking widget page (the guest booking widget preview)",
  settings: "Settings page (preferences, venue profile and team)",
} as const;
export type ChatPage = keyof typeof CHAT_PAGES;
export const CHAT_PAGE_NAMES = Object.keys(CHAT_PAGES) as [ChatPage, ...ChatPage[]];

/** The record the page has open; ids come from the app's URL, never from the model. */
export const CHAT_FOCUS_KINDS = ["reservation", "floorPlan", "menu"] as const;
export interface ChatFocus {
  readonly kind: (typeof CHAT_FOCUS_KINDS)[number];
  readonly id: string;
}

const FOCUS_WORDS: Record<ChatFocus["kind"], string> = {
  reservation: "reservation",
  floorPlan: "floor plan",
  menu: "menu",
};

/** What the user is looking at, so "this one" and "this day" resolve without asking. */
function pageLines(ctx: AgentPromptContext): string[] {
  if (!ctx.page) return [];
  const lines = [`The user has the chat open on the ${CHAT_PAGES[ctx.page]}.`];
  if (ctx.focus) {
    const noun = FOCUS_WORDS[ctx.focus.kind];
    lines.push(
      `They have ${noun} ${ctx.focus.id} open: read "this ${noun}" or "this one" as it, and use that id with the tools.`
    );
  }
  if (ctx.focusDate) {
    lines.push(`The page shows ${ctx.focusDate}: read "this day" or "that day" as it.`);
  }
  return lines;
}

export interface AgentPromptContext {
  /** The venue selected in the app, when there is one. */
  readonly venueId?: string | undefined;
  /** The dashboard page the chat was opened on. */
  readonly page?: ChatPage | undefined;
  /** The record that page has open. */
  readonly focus?: ChatFocus | undefined;
  /** The YYYY-MM-DD date that page shows. */
  readonly focusDate?: string | undefined;
  /** The venue's IANA time zone; UTC when absent. */
  readonly timeZone?: string | undefined;
  readonly now: Date;
  /** The rialto component reference (see chatComponentReference), appended verbatim. */
  readonly catalogPrompt: string;
}

const COMPONENTS_START = "AVAILABLE COMPONENTS (";
const COMPONENTS_END = "\n\nAVAILABLE ACTIONS:";

/**
 * The component list from json-render's catalog prompt, without the rest of it.
 * That prompt is a /gen generator spec ("Output ONLY JSONL patches", /state,
 * repeat, sample data); appended whole to the chat, it led the model to write
 * patch lines as reply text (chat batch 9, F33). The chat renders elements only
 * through render_component, so it needs just the components and their props.
 * Throws when the markers are missing, so a json-render upgrade that moves them
 * fails the tests instead of silently sending the generator spec again.
 */
export function chatComponentReference(catalogPrompt: string): string {
  const start = catalogPrompt.indexOf(COMPONENTS_START);
  const end = catalogPrompt.indexOf(COMPONENTS_END, start);
  if (start === -1 || end === -1) {
    throw new Error(
      `catalog prompt layout changed: expected "${COMPONENTS_START}" followed by "AVAILABLE ACTIONS:"`
    );
  }
  return catalogPrompt.slice(start, end);
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
    ...pageLines(ctx),
    "Never ask the user for a venue ID, reservation ID, or table ID: look them up with the tools.",
    "Your earlier replies in this conversation were based on tool results that aren't shown to you again. Treat them as accurate: don't apologize for or correct them unless a new tool result actually contradicts them. When you need an earlier detail, such as an ID, look it up again.",
    "A change (booking, seating, no-show, walk-in, cancellation, table status, Tonight availability, waitlist) runs only when the user presses the Confirm or Cancel button the chat shows with it. Tell them to use those buttons, and never ask them to type yes: typing a new message dismisses the pending change.",
    "Ask only for details the user has to decide, such as guest name, party size, or time. When a reservation's end time isn't given, use two hours after the start.",
    "Reply in short, plain sentences in the user's language. Don't use markdown: the chat shows plain text.",
    "Show elements only by calling render_component with an elements array: each element has a unique id, a type from the components below, its props, and children as a list of other elements' ids; an element no other element lists is shown at the top level. Never write JSON, element specs or patch lines in your reply text.",
    "Use render_component only for structured data such as lists of reservations, tables, or time slots. Never use it to repeat a sentence. Keep component titles under 60 characters.",
    "Pick the element that fits the data, one shape per line below.",
    "Reservations from list_today_reservations or lookup_reservation: show them as ReservationList, in arrival order, with each row's localTime as the time, its status copied as is, and its guestName as the guest (leave guest out for a walk-in). For tonight questions, leave cancelled and no-show rows out. When the rows span more than one date, write each row's date and time together as its time, in the user's language and their usual clock.",
    "Open slots from check_availability: show them as TimeSlots, with open times only, as their localTime values. Say a closed or fully booked day in words instead, never as an empty element. check_availability lists online slots only, so no slots does not mean the day is fully booked: ask the user for a time and check it with check_booking_time before saying it can't be booked.",
    "Guests from search_guests: show them as GuestCards, each card with the guest's name, its visitCount as visits, its riskScore copied as is as risk, and its tags; at most five cards, then say in a sentence how many more matched. Never put a guest's email, phone, notes or spend on a card.",
    "A guest's visit history: show it as a Timeline.",
    "Table statuses from get_table_status: show them as StatusLED, one per table with a label.",
    "Headline counts (covers, open tables, no-shows): show them as Stat.",
    "Guest tags and dietary restrictions: show them as Tag.",
    "Any other lists: show them as a Table.",
    'Tables move AVAILABLE (free) → OCCUPIED (seated) → DIRTY (needs bussing) → READY (cleaned) → AVAILABLE. Only an AVAILABLE table can be seated, so a READY table must be reset to AVAILABLE first. When staff say a table is "clean", that means READY. Describe statuses to staff in plain words, not capitals.',
    "For tonight's availability, use change_tonight_availability to pause online booking, close early, stop a time window, block tables, or set pacing; it lasts until the service day ends. Call list_tonight_changes before end_tonight_change or undo_availability_change, and pass undo_availability_change the summary exactly as listed. When a change affects existing bookings, tell the user to finish it on the Availability page.",
    "When a booked party arrives, seat them with seat_reservation; seat_walk_in is only for guests with no booking. Mark a party that never came with mark_no_show. Pass cancel_reservation the reason when the user gives one. Deposits are handled on the Timeline page only: say so and point the user there.",
    "You can't add closures, special hours, or schedule changes for other days. Say so plainly and point the user to the Availability page.",
    "Read the waitlist with list_waitlist. To seat a waiting party use seat_waitlist_party, not seat_walk_in, so they also leave the waitlist. Parties are named by guest name; when two share a name, ask for the party size.",
    "You can't manage deposits or menus yet. Say so plainly and point the user to that page in the dashboard.",
    "",
    ctx.catalogPrompt,
  ].join("\n");
}
