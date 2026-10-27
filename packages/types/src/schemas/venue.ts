import { z } from "zod";

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Open days need HH:MM times; a closed day's times are ignored and may be empty. */
export const DayScheduleSchema = z
  .object({
    open: z.string(),
    close: z.string(),
    closed: z.boolean().optional(),
  })
  .superRefine((day, ctx) => {
    if (day.closed === true) return;
    for (const field of ["open", "close"] as const) {
      if (!HH_MM.test(day[field])) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "Expected a time in HH:MM format",
        });
      }
    }
  });

/**
 * Restaurant identity ported from eat-sheet's `tenants` table (#7250). Stored
 * at `Venue.settings.profile` — `settings` is already `Json?`, so there is no
 * migration.
 */
export const VENUE_TYPES = ["fine_dining", "casual", "bar", "cafe"] as const;

export const VenueTypeSchema = z.enum(VENUE_TYPES);

/** Longest `description` an operator may store, in characters. */
export const VENUE_DESCRIPTION_MAX_LENGTH = 280;

/**
 * An http(s) URL, expressed as a `pattern` rather than `z.url()` on purpose.
 * `toRequestJsonSchema` drops a `pattern` that sits next to a `format`, so
 * `z.url()` would reach Fastify's AJV as a bare `format: "uri"` — which accepts
 * `javascript:alert(1)`. Keeping the constraint a pattern means the HTTP
 * boundary itself answers 400 for a non-http(s) URL, and the value is safe to
 * render as an `href`.
 */
const HTTP_URL_PATTERN = /^https?:\/\/[^\s/?#]+(?:[/?#][^\s]*)?$/;

export const VenueAddressSchema = z.object({
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  region: z.string().min(1).max(100),
  postalCode: z.string().min(1).max(20),
  country: z.string().regex(/^[A-Za-z]{2}$/, "Must be an ISO 3166-1 alpha-2 country code"),
});

/**
 * Every field is optional: a venue that has never filled in a profile is
 * valid, and so is one that filled in only a website.
 */
export const VenueProfileSchema = z.object({
  type: VenueTypeSchema.optional(),
  cuisines: z.array(z.string().min(1).max(50)).max(20).optional(),
  address: VenueAddressSchema.optional(),
  website: z.string().max(200).regex(HTTP_URL_PATTERN, "Must be an http(s) URL").optional(),
  description: z.string().max(VENUE_DESCRIPTION_MAX_LENGTH).optional(),
});

export type VenueProfile = z.infer<typeof VenueProfileSchema>;

/**
 * Projects a stored `settings.profile` onto the fields an unauthenticated
 * caller may see. `VenueProfileSchema` **is** the allow-list: `z.object` strips
 * every key it does not declare, recursively, so no operational setting that
 * shares the blob can ride along. Fails closed — an absent, non-object or
 * invalid stored profile yields `{}` rather than a half-validated payload.
 */
export function toPublicVenueProfile(stored: unknown): VenueProfile {
  const parsed = VenueProfileSchema.safeParse(stored ?? {});
  return parsed.success ? parsed.data : {};
}
const HexColorSchema = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);

/** Per-venue palette stored at `Venue.settings.theme` — applied over rialto's colour tokens. */
export const VenueThemeSchema = z.object({
  accent: HexColorSchema,
  accentHover: HexColorSchema,
  surface: HexColorSchema.optional(),
  surfaceElevated: HexColorSchema.optional(),
  textPrimary: HexColorSchema.optional(),
  source: z.enum(["extracted", "manual"]),
});

export type VenueTheme = z.infer<typeof VenueThemeSchema>;

export const VenueGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  settings: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
});

export const VenueSchema = z.object({
  id: z.string(),
  venueGroupId: z.string().nullable(),
  venueGroup: VenueGroupSchema.optional(),
  name: z.string(),
  slug: z.string(),
  ianaTimezone: z.string(),
  currencyCode: z.string(),
  operatingHours: z
    .object({
      monday: DayScheduleSchema.optional(),
      tuesday: DayScheduleSchema.optional(),
      wednesday: DayScheduleSchema.optional(),
      thursday: DayScheduleSchema.optional(),
      friday: DayScheduleSchema.optional(),
      saturday: DayScheduleSchema.optional(),
      sunday: DayScheduleSchema.optional(),
    })
    .nullable(),
  settings: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * Curated public projection of `VenueSchema` — see `PublicVenue` (#4022).
 * Carries `ianaTimezone` (#4976) so guest-facing booking flows can render
 * slot/reservation times in the venue's clock without depending on the
 * separate `/public/v1` config endpoint.
 */
export const PublicVenueSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  ianaTimezone: z.string(),
  operatingHours: VenueSchema.shape.operatingHours,
  settings: z.object({ maxPartySize: z.number().optional() }).nullable().optional(),
  phone: z.string().optional(),
});

/**
 * Mirrors the Prisma `DepositType` enum. Exported under this name so the
 * prisma-enum-drift guard (scripts/prisma-enum-drift.mjs) pairs it with the
 * database enum — the inline copy it replaces was invisible to that check
 * and drifted silently by construction (#7310).
 */
export const DepositTypeSchema = z.enum(["flat", "per_person"]);

export const PublicVenueDepositSchema = z.object({
  enabled: z.boolean(),
  depositType: DepositTypeSchema.nullable(),
  amountCents: z.number().nullable(),
  freeCancellationHours: z.number().nullable(),
  lateCancellationFeePercent: z.number().nullable(),
  noShowFeePercent: z.number().nullable(),
});

export const PublicVenueConfigSchema = z.object({
  name: z.string(),
  slug: z.string(),
  ianaTimezone: z.string(),
  currencyCode: z.string(),
  operatingHours: VenueSchema.shape.operatingHours,
  settings: z.object({
    defaultReservationDuration: z.number().optional(),
    maxPartySize: z.number().optional(),
    maxAdvanceBooking: z.number().optional(),
    slotIntervalMinutes: z.number().optional(),
  }),
  deposit: PublicVenueDepositSchema,
  /**
   * Venue identity from `settings.profile`, through the allow-list (#7250).
   * Optional so a client on this contract still parses a response from a
   * service that predates it — the service always sends it, possibly `{}`.
   */
  profile: VenueProfileSchema.optional(),
});

export const DepositPaymentIntentSchema = z.object({
  clientSecret: z.string(),
  depositId: z.string(),
  amountCents: z.number(),
  currency: z.string(),
});
