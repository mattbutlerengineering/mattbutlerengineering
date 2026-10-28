/**
 * What the chat knows about the page it is opened on (#7924): the dashboard page,
 * the record that page has open, and the day it shows, all read from the URL.
 * The agent validates each value again and drops any it doesn't accept.
 */

/** Dashboard pages the agent describes; keep in step with `CHAT_PAGES` in the agent service. */
const CHAT_PAGES = new Set([
  "timeline",
  "dashboard",
  "reservations",
  "guests",
  "waitlist",
  "briefing",
  "floor-plans",
  "availability",
  "menus",
  "booking-widget",
  "settings",
]);

/** Pages whose `?date=` names the day on screen. */
const DATED_PAGES = new Set(["timeline", "reservations", "briefing"]);

const RECORD_ID = /^[\w-]{1,64}$/;
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface ChatFocus {
  readonly kind: "reservation" | "floorPlan" | "menu";
  readonly id: string;
}

export interface ChatPageContext {
  readonly page?: string;
  readonly focus?: ChatFocus;
  readonly focusDate?: string;
}

function focusFor(page: string, rest: readonly string[], params: URLSearchParams) {
  const pathId = rest[0];
  const raw =
    page === "timeline"
      ? { kind: "reservation" as const, id: params.get("selected") }
      : page === "floor-plans"
        ? { kind: "floorPlan" as const, id: pathId }
        : page === "menus"
          ? { kind: "menu" as const, id: pathId }
          : undefined;
  return raw?.id && RECORD_ID.test(raw.id) ? { kind: raw.kind, id: raw.id } : undefined;
}

/** The chat context for `pathname` + `search`; empty for a page the agent doesn't know. */
export function chatPageContext(pathname: string, search: string): ChatPageContext {
  const segments = pathname
    .replace(/^\/hospitality/, "")
    .split("/")
    .filter(Boolean);
  const page = segments[0] ?? "timeline";
  if (!CHAT_PAGES.has(page)) return {};
  const params = new URLSearchParams(search);
  const focus = focusFor(page, segments.slice(1), params);
  const date = params.get("date");
  const focusDate = DATED_PAGES.has(page) && date && CALENDAR_DATE.test(date) ? date : undefined;
  return { page, ...(focus ? { focus } : {}), ...(focusDate ? { focusDate } : {}) };
}

const GENERAL_SUGGESTIONS = [
  "chat.suggestions.tonight",
  "chat.suggestions.openTables",
  "chat.suggestions.availability",
  "chat.suggestions.walkIn",
] as const;

const PAGE_SUGGESTIONS = {
  availability: [
    "chat.suggestions.tonightChanges",
    "chat.suggestions.stopOnline",
    "chat.suggestions.availability",
    "chat.suggestions.tonight",
  ],
} as const;

export type ChatSuggestionKey =
  | (typeof GENERAL_SUGGESTIONS)[number]
  | (typeof PAGE_SUGGESTIONS)[keyof typeof PAGE_SUGGESTIONS][number];

/** Starter prompts for an empty chat on `page`: the questions the chat answers well there. */
export function chatSuggestionKeys(page: string | undefined): readonly ChatSuggestionKey[] {
  return page && Object.hasOwn(PAGE_SUGGESTIONS, page)
    ? PAGE_SUGGESTIONS[page as keyof typeof PAGE_SUGGESTIONS]
    : GENERAL_SUGGESTIONS;
}
