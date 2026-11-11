import { toPublicVenueProfile, type VenueProfile } from "@mbe/types";

type VenueAddress = NonNullable<VenueProfile["address"]>;

/** Matches the plan's cap on `Venue.settings.tonightNote`; a longer stored value is ignored, never truncated. */
const TONIGHT_NOTE_MAX_LENGTH = 200;

/**
 * The two venue fields the guest night-of page needs beyond name/timezone: the
 * public postal address (allow-listed through `toPublicVenueProfile`, the same
 * projection the public venue config uses) and the venue's note for tonight.
 * `settings` is free-form JSON, so both fail closed: absent, wrongly typed,
 * blank or oversized values are omitted.
 */
export function nightOfVenueFields(settings: unknown): {
  address?: VenueAddress;
  tonightNote?: string;
} {
  const record = typeof settings === "object" && settings !== null ? settings : {};
  const { address } = toPublicVenueProfile((record as { profile?: unknown }).profile);
  const rawNote = (record as { tonightNote?: unknown }).tonightNote;
  const note = typeof rawNote === "string" ? rawNote.trim() : "";
  return {
    ...(address ? { address } : {}),
    ...(note.length > 0 && note.length <= TONIGHT_NOTE_MAX_LENGTH ? { tonightNote: note } : {}),
  };
}
