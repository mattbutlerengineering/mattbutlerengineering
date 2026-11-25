import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import type { FastifyBaseLogger } from "fastify";
import { VenueProfileSchema } from "@mbe/types";
import {
  NO_VENUE,
  notExecuted,
  readFailure,
  saveUnsure,
  writeFailure,
  type ApiClient,
} from "./gen-tool-support.js";

/**
 * Chat tools for the venue's booking settings and public profile (#9479). The venue
 * is saved with its whole `settings` blob replaced, so every write reads the venue
 * first and sends its other settings back untouched (the tonight note, theme and
 * rules included). Each result names the values it replaced, so undoing is
 * proposing the same tool again with `previous`; null clears a value. Team and
 * roles are not here and stay on the Settings page.
 */

const SETTINGS_UNSURE = saveUnsure("get_venue_settings");

/** The settings the chat may change, and the profile fields it may change. */
const SETTING_KEYS = [
  "maxPartySize",
  "phone",
  "defaultReservationDuration",
  "requirePhone",
  "requireEmail",
  "confirmationEmailEnabled",
  "reminderEmailEnabled",
] as const;
const PROFILE_KEYS = ["type", "cuisines", "website", "description"] as const;

const EMPTY_CHANGE = "Nothing to change was named. Nothing was changed.";

type Bag = Readonly<Record<string, unknown>>;

/** `base` with each key `patch` names set, or removed when its value is null. */
function applyPatch(base: Bag, patch: Bag): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete merged[key];
    else if (value !== undefined) merged[key] = value;
  }
  return merged;
}

/** The keys of `keys` the patch names, with their values. */
const named = (patch: Bag, keys: readonly string[]): Record<string, unknown> =>
  Object.fromEntries(keys.filter((k) => patch[k] !== undefined).map((k) => [k, patch[k]]));

/** The current value of each named key, null when it is not set. */
const previousOf = (current: Bag, keys: readonly string[]): Record<string, unknown> =>
  Object.fromEntries(keys.map((k) => [k, current[k] ?? null]));

const asBag = (value: unknown): Bag =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Bag) : {};

const profile = VenueProfileSchema.shape;

/** Matches Availability → Booking rules' `LIMITS.largestParty` (apps/hospitality booking-rules.ts). */
const LARGEST_PARTY_MAX = 100;

const SettingsInput = z.object({
  maxPartySize: z.number().int().min(1).max(LARGEST_PARTY_MAX).nullable().optional(),
  phone: z.string().trim().min(1).max(40).nullable().optional(),
  defaultReservationDuration: z.number().int().min(15).max(480).nullable().optional(),
  requirePhone: z.boolean().nullable().optional(),
  requireEmail: z.boolean().nullable().optional(),
  confirmationEmailEnabled: z.boolean().nullable().optional(),
  reminderEmailEnabled: z.boolean().nullable().optional(),
});

const ProfileInput = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  type: profile.type.nullable(),
  cuisines: profile.cuisines.nullable(),
  website: profile.website.nullable(),
  description: profile.description.nullable(),
});

export function createSettingsTools(
  log: FastifyBaseLogger,
  api: ApiClient,
  { venueId }: { readonly venueId?: string | undefined }
): ToolSet {
  return {
    get_venue_settings: tool({
      description:
        "Read the venue's name, booking settings (largest party, phone for large parties, default booking length, whether phone and email are required, confirmation and reminder emails) and public profile (type, cuisines, website, description). Call it before proposing a change. Team and roles are not available here.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId }, "get_venue_settings tool called");
        try {
          const venue = await api.venues.get(venueId);
          const settings = asBag(venue.settings);
          return {
            name: venue.name,
            settings: previousOf(settings, SETTING_KEYS),
            profile: previousOf(asBag(settings["profile"]), PROFILE_KEYS),
          };
        } catch (err) {
          log.error({ err, venueId }, "get_venue_settings failed");
          return readFailure(err, "the venue settings");
        }
      },
    }),

    update_venue_settings: tool({
      description:
        "Change the venue's booking settings: largest party, the phone guests call for larger parties, default booking length in minutes, whether phone and email are required, and confirmation and reminder emails. Name only what changes; null clears one. Requires confirmation. The result lists the previous values: to undo, propose this tool again with them. Team and roles can't be changed here.",
      inputSchema: SettingsInput,
      execute: async (input) => {
        if (!venueId) return notExecuted(NO_VENUE);
        log.info(
          { venueId, fields: Object.keys(named(input, SETTING_KEYS)) },
          "update_venue_settings tool called"
        );
        const patch = named(input, SETTING_KEYS);
        if (Object.keys(patch).length === 0) return notExecuted({ error: EMPTY_CHANGE });
        let unsure: string | undefined;
        try {
          const settings = asBag((await api.venues.get(venueId)).settings);
          unsure = SETTINGS_UNSURE;
          await api.venues.update(venueId, { settings: applyPatch(settings, patch) });
          return {
            updated: true,
            changed: patch,
            previous: previousOf(settings, Object.keys(patch)),
          };
        } catch (err) {
          log.error({ err, venueId }, "update_venue_settings failed");
          return writeFailure(err, { action: "change the settings", unsure });
        }
      },
    }),

    update_venue_profile: tool({
      description:
        "Change the venue's name and public profile: type (fine_dining, casual, bar, cafe), cuisines, website (http or https), and description (up to 280 characters). Name only what changes; null clears a profile field. Requires confirmation. The result lists the previous values: to undo, propose this tool again with them. The postal address, team and roles can't be changed here.",
      inputSchema: ProfileInput,
      execute: async (input) => {
        if (!venueId) return notExecuted(NO_VENUE);
        log.info({ venueId }, "update_venue_profile tool called");
        const patch = named(input, PROFILE_KEYS);
        if (Object.keys(patch).length === 0 && input.name === undefined) {
          return notExecuted({ error: EMPTY_CHANGE });
        }
        let unsure: string | undefined;
        try {
          const venue = await api.venues.get(venueId);
          const settings = asBag(venue.settings);
          const current = asBag(settings["profile"]);
          const changesProfile = Object.keys(patch).length > 0;
          unsure = SETTINGS_UNSURE;
          await api.venues.update(venueId, {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(changesProfile
              ? { settings: { ...settings, profile: applyPatch(current, patch) } }
              : {}),
          });
          return {
            updated: true,
            changed: { ...(input.name !== undefined ? { name: input.name } : {}), ...patch },
            previous: {
              ...(input.name !== undefined ? { name: venue.name } : {}),
              ...previousOf(current, Object.keys(patch)),
            },
          };
        } catch (err) {
          log.error({ err, venueId }, "update_venue_profile failed");
          return writeFailure(err, { action: "change the profile", unsure });
        }
      },
    }),
  };
}
