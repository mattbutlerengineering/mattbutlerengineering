/**
 * The closed value sets the new-venue onboarding wizard offers (#9475), shared so the form's
 * pickers and the chat route's patch schema (`services/agent`, the gen onboarding route) cannot
 * drift: a value the form cannot show must not reach it from the model either. Labels and
 * layouts stay with the wizard; only the ids live here.
 */

/** IANA zones the Location & Time step offers. */
export const OFFERED_TIMEZONES = [
  // Americas
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Phoenix",
  "America/Toronto",
  "America/Vancouver",
  "America/Edmonton",
  "America/Winnipeg",
  "America/Halifax",
  "America/St_Johns",
  "America/Mexico_City",
  "America/Cancun",
  "America/Bogota",
  "America/Lima",
  "America/Santiago",
  "America/Buenos_Aires",
  "America/Sao_Paulo",
  "America/Caracas",
  // Europe
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Brussels",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Zurich",
  "Europe/Vienna",
  "Europe/Stockholm",
  "Europe/Warsaw",
  "Europe/Prague",
  "Europe/Athens",
  "Europe/Helsinki",
  "Europe/Bucharest",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Europe/Lisbon",
  // Middle East & Africa
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Qatar",
  "Asia/Tehran",
  "Asia/Jerusalem",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Nairobi",
  "Africa/Casablanca",
  // Asia & Oceania
  "Asia/Kolkata",
  "Asia/Karachi",
  "Asia/Dhaka",
  "Asia/Colombo",
  "Asia/Kathmandu",
  "Asia/Bangkok",
  "Asia/Ho_Chi_Minh",
  "Asia/Jakarta",
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Asia/Manila",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Taipei",
  "Asia/Seoul",
  "Asia/Tokyo",
  "Australia/Perth",
  "Australia/Adelaide",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Brisbane",
  "Pacific/Auckland",
  "Pacific/Fiji",
  "Pacific/Guam",
] as const;

export type OfferedTimezone = (typeof OFFERED_TIMEZONES)[number];

/** ISO 4217 codes the Location & Time step offers. */
export const OFFERED_CURRENCY_CODES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "JPY",
  "CHF",
  "AED",
  "SGD",
  "INR",
  "BRL",
  "MXN",
  "NZD",
  "ZAR",
  "KRW",
  "HKD",
] as const;

export type OfferedCurrencyCode = (typeof OFFERED_CURRENCY_CODES)[number];

/** The room templates the floor-plan step offers, Blank first. */
export const ROOM_TEMPLATE_IDS = [
  "blank",
  "fine-dining",
  "casual-bistro",
  "bar-lounge",
  "cafe",
  "banquet-hall",
  "open-kitchen",
] as const;

export type RoomTemplateId = (typeof ROOM_TEMPLATE_IDS)[number];

/** The room sizes the floor-plan step offers, smallest first. */
export const ROOM_SIZE_IDS = ["cozy", "standard", "spacious", "grand"] as const;

export type RoomSizeId = (typeof ROOM_SIZE_IDS)[number];
