import { useMemo } from "react";
import { useVenue } from "../contexts/VenueContext.js";
import { resolveTimeZone } from "../utils/format.js";

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
