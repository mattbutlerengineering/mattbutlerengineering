/**
 * The seed's venue definitions, in the legacy array shape the seed used to
 * write to `operatingHours` (`dayOfWeek` 0 = Sunday). Shared by
 * `prisma/seed.ts` and the migration golden test so the two cannot drift.
 */

export interface SeedHoursRow {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}

export interface SeedVenue {
  name: string;
  slug: string;
  ianaTimezone: string;
  hours: SeedHoursRow[];
  /** `defaultReservationDuration` is the key the engine reads (it was `defaultDurationMinutes`). */
  settings: { defaultReservationDuration: number; maxPartySize: number };
}

export const SEED_VENUES: readonly SeedVenue[] = [
  {
    name: "The Grand Bistro",
    slug: "the-grand-bistro",
    ianaTimezone: "America/New_York",
    hours: [
      { dayOfWeek: 0, openTime: "10:00", closeTime: "21:00", isClosed: false },
      { dayOfWeek: 1, openTime: "11:00", closeTime: "22:00", isClosed: false },
      { dayOfWeek: 2, openTime: "11:00", closeTime: "22:00", isClosed: false },
      { dayOfWeek: 3, openTime: "11:00", closeTime: "22:00", isClosed: false },
      { dayOfWeek: 4, openTime: "11:00", closeTime: "23:00", isClosed: false },
      { dayOfWeek: 5, openTime: "11:00", closeTime: "23:00", isClosed: false },
      { dayOfWeek: 6, openTime: "10:00", closeTime: "22:00", isClosed: false },
    ],
    settings: { defaultReservationDuration: 90, maxPartySize: 12 },
  },
  {
    name: "Rooftop Lounge",
    slug: "rooftop-lounge",
    ianaTimezone: "America/New_York",
    hours: [
      { dayOfWeek: 0, openTime: "16:00", closeTime: "23:00", isClosed: false },
      { dayOfWeek: 1, openTime: "00:00", closeTime: "00:00", isClosed: true },
      { dayOfWeek: 2, openTime: "16:00", closeTime: "23:00", isClosed: false },
      { dayOfWeek: 3, openTime: "16:00", closeTime: "23:00", isClosed: false },
      { dayOfWeek: 4, openTime: "16:00", closeTime: "00:00", isClosed: false },
      { dayOfWeek: 5, openTime: "16:00", closeTime: "01:00", isClosed: false },
      { dayOfWeek: 6, openTime: "14:00", closeTime: "00:00", isClosed: false },
    ],
    settings: { defaultReservationDuration: 120, maxPartySize: 8 },
  },
];
