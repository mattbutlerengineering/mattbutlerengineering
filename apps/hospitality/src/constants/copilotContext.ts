import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type {
  ActionDescription,
  DomainContext,
  PendingAction,
} from "@mattbutlerengineering/rialto";
import { useLocation } from "react-router";
import { useVenue } from "../contexts/VenueContext.js";
import { chatPageContext, chatSuggestionKeys } from "./chatPageContext.js";
import { useTables } from "../hooks/useTables.js";
import { formatCalendarDate, formatLocalTime, resolveTimeZone } from "../utils/format.js";

/**
 * Hardcoded domain context for the hospitality app's Gen Copilot.
 * Describes the app's core data schemas so the AI model can generate
 * appropriate UI components referencing real field names.
 */
export const HOSPITALITY_DOMAIN_CONTEXT: DomainContext = {
  schemas: [
    {
      name: "Reservation",
      description: "A dining reservation linked to a table and guest.",
      fields:
        "id, guestName, tableId, partySize, date, time, status (pending|confirmed|cancelled|seated|completed), notes",
    },
    {
      name: "FloorPlan",
      description: "A restaurant floor layout with named zones and table positions.",
      fields:
        "id, name, tables (id, label, x, y, width, height, capacity, shape, zoneId), zones (id, name, color)",
    },
    {
      name: "Guest",
      description: "A guest profile with visit history and preferences.",
      fields: "id, name, email, phone, visitCount, lastVisit, preferences, notes",
    },
  ],
};

interface ChatVenue {
  readonly id: string;
  readonly ianaTimezone: string;
}

/**
 * The fields the chat merges into every agent request: the selected venue (the
 * server pins every tool to it) and its time zone (so "tonight" is the venue's
 * tonight). A zone the runtime rejects is dropped rather than sent, because the
 * server answers an unknown zone with a 400 for the whole message.
 */
export function chatRequestContext(venue: ChatVenue | null | undefined): Record<string, string> {
  if (!venue) return {};
  const timeZone = resolveTimeZone(venue.ianaTimezone);
  return timeZone ? { venueId: venue.id, timeZone } : { venueId: venue.id };
}

/** The venue fields plus the page the chat is open on and the record it shows (#7924). */
export function useChatRequestContext(): Readonly<Record<string, unknown>> {
  const { selectedVenue } = useVenue();
  const { pathname, search } = useLocation();
  return useMemo(
    () => ({ ...chatRequestContext(selectedVenue), ...chatPageContext(pathname, search) }),
    [selectedVenue, pathname, search]
  );
}

/** Starter prompts for an empty chat: the questions the chat answers well on this page. */
export function useChatSuggestions(): readonly string[] {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { page } = chatPageContext(pathname, "");
  return useMemo(() => chatSuggestionKeys(page).map((key) => t(key)), [t, page]);
}

const ACTION_TITLES = {
  create_reservation: "chat.actions.create_reservation",
  modify_reservation: "chat.actions.modify_reservation",
  cancel_reservation: "chat.actions.cancel_reservation",
  seat_walk_in: "chat.actions.seat_walk_in",
  update_table_status: "chat.actions.update_table_status",
  change_tonight_availability: "chat.actions.change_tonight_availability",
  end_tonight_change: "chat.actions.end_tonight_change",
  undo_availability_change: "chat.actions.undo_availability_change",
  add_guest: "chat.actions.add_guest",
  update_guest: "chat.actions.update_guest",
  add_guest_note: "chat.actions.add_guest_note",
  send_win_back: "chat.actions.send_win_back",
} as const;

const ACTION_FIELDS = {
  guestName: "chat.actions.fields.guestName",
  partySize: "chat.actions.fields.partySize",
  date: "chat.actions.fields.date",
  startTime: "chat.actions.fields.startTime",
  endTime: "chat.actions.fields.endTime",
  tableId: "chat.actions.fields.tableId",
  table: "chat.actions.fields.table",
  status: "chat.actions.fields.status",
  notes: "chat.actions.fields.notes",
  reservationId: "chat.actions.fields.reservationId",
  change: "chat.actions.fields.change",
  closeAt: "chat.actions.fields.closeAt",
  from: "chat.actions.fields.from",
  to: "chat.actions.fields.to",
  service: "chat.actions.fields.service",
  tables: "chat.actions.fields.tables",
  covers: "chat.actions.fields.covers",
  summary: "chat.actions.fields.summary",
  guest: "chat.actions.fields.guest",
  contact: "chat.actions.fields.contact",
  name: "chat.actions.fields.name",
  phone: "chat.actions.fields.phone",
  email: "chat.actions.fields.email",
  addTags: "chat.actions.fields.addTags",
  removeTags: "chat.actions.fields.removeTags",
  dietaryRestrictions: "chat.actions.fields.dietaryRestrictions",
  text: "chat.actions.fields.text",
} as const;

const TABLE_STATUSES = {
  AVAILABLE: "floorPlan.tableStatus.available",
  OCCUPIED: "floorPlan.tableStatus.occupied",
  DIRTY: "floorPlan.tableStatus.dirty",
  READY: "floorPlan.tableStatus.ready",
} as const;

const TONIGHT_CHANGES = {
  pause_online: "chat.actions.tonightChanges.pause_online",
  close_early: "chat.actions.tonightChanges.close_early",
  stop_window: "chat.actions.tonightChanges.stop_window",
  block_tables: "chat.actions.tonightChanges.block_tables",
  pacing: "chat.actions.tonightChanges.pacing",
} as const;

type ChatActionKey =
  | (typeof ACTION_TITLES)[keyof typeof ACTION_TITLES]
  | (typeof ACTION_FIELDS)[keyof typeof ACTION_FIELDS]
  | (typeof TABLE_STATUSES)[keyof typeof TABLE_STATUSES]
  | (typeof TONIGHT_CHANGES)[keyof typeof TONIGHT_CHANGES];

type Translate = (key: ChatActionKey) => string;

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isRealDate = (value: string): boolean => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const WALL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIME_FIELDS: ReadonlySet<string> = new Set(["startTime", "endTime", "closeAt", "from", "to"]);

/** A tool's YYYY-MM-DD date or HH:MM wall time as people read it; anything else as sent. */
function formatWhen(key: string, value: string, locale?: string): string {
  if (key === "date" && CALENDAR_DATE.test(value) && isRealDate(value)) {
    return formatCalendarDate(value, { weekday: "long", month: "short", day: "numeric" }, locale);
  }
  if (TIME_FIELDS.has(key) && WALL_TIME.test(value)) return formatLocalTime(value, locale);
  return value;
}

function lookup<T extends Record<string, string>>(map: T, key: string): T[keyof T] | undefined {
  return Object.hasOwn(map, key) ? map[key as keyof T] : undefined;
}

/**
 * How the chat's confirm bar presents a pending write: a translated title and
 * labelled values, with a table id shown as the table's name and dates and times
 * in the user's locale. An id that can't be resolved, or a date or time that isn't
 * in the tool's format, stays visible as sent: what the user confirms must be what
 * executes. A
 * tool or field this map doesn't know shows its raw name rather than a key.
 */
export function describeChatAction(
  action: PendingAction,
  t: Translate,
  tableName: (id: string) => string | undefined,
  locale?: string
): ActionDescription {
  const titleKey = lookup(ACTION_TITLES, action.toolName);
  return {
    title: titleKey ? t(titleKey) : action.toolName.replace(/_/g, " "),
    details: Object.entries(action.toolInput).map(([key, raw]) => {
      const value = Array.isArray(raw) ? raw.join(", ") : String(raw);
      const statusKey =
        key === "status"
          ? lookup(TABLE_STATUSES, value)
          : key === "change"
            ? lookup(TONIGHT_CHANGES, value)
            : undefined;
      const shown =
        key === "tableId"
          ? (tableName(value) ?? value)
          : statusKey
            ? t(statusKey)
            : formatWhen(key, value, locale);
      const labelKey = lookup(ACTION_FIELDS, key);
      return { label: labelKey ? t(labelKey) : key, value: shown };
    }),
  };
}

export function useDescribeChatAction(): (action: PendingAction) => ActionDescription {
  const { t, i18n } = useTranslation();
  const { selectedVenue } = useVenue();
  const { data: tables } = useTables({
    venueId: selectedVenue?.id ?? "",
    limit: 100,
    enabled: Boolean(selectedVenue),
  });
  return useCallback(
    (action: PendingAction) =>
      describeChatAction(
        action,
        t,
        (id) => tables?.find((table) => table.id === id)?.name,
        i18n.language
      ),
    [t, tables, i18n.language]
  );
}
