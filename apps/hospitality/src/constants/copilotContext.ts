import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { DomainContext } from "@mattbutlerengineering/rialto";
import { useVenue } from "../contexts/VenueContext.js";
import { resolveTimeZone } from "../utils/format.js";

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

export function useChatRequestContext(): Record<string, string> {
  const { selectedVenue } = useVenue();
  return useMemo(() => chatRequestContext(selectedVenue), [selectedVenue]);
}

/** Starter prompts for an empty chat: the questions the chat can answer well today. */
export function useChatSuggestions(): readonly string[] {
  const { t } = useTranslation();
  return useMemo(
    () => [
      t("chat.suggestions.tonight"),
      t("chat.suggestions.openTables"),
      t("chat.suggestions.availability"),
      t("chat.suggestions.walkIn"),
    ],
    [t]
  );
}
