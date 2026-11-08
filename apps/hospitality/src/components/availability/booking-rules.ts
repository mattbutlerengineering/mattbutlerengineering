import type { TFunction } from "i18next";
import type { VenueSettings } from "@mbe/types";

/**
 * The venue-wide limits on when and how large a guest can book (`Venue.settings`): how far ahead
 * (`maxAdvanceBooking`, days), the least notice (`minAdvanceBooking`, hours) and the largest party
 * online (`maxPartySize`). Onboarding sets them once; Availability → Booking rules edits them.
 * Pure, no React. The form keeps text so an empty field means "not set".
 */

export interface BookingRulesForm {
  readonly daysAhead: string;
  readonly noticeHours: string;
  readonly largestParty: string;
}

export type BookingRulesField = keyof BookingRulesForm;

/** What the service applies when a rule is not set (slot-rules.ts, the booking widget). */
export const UNSET_LARGEST_PARTY = 8;

const LIMITS: Record<BookingRulesField, { readonly min: number; readonly max: number }> = {
  daysAhead: { min: 0, max: 730 },
  noticeHours: { min: 0, max: 720 },
  largestParty: { min: 1, max: 100 },
};

const text = (value: unknown) => (typeof value === "number" ? String(value) : "");

export function toBookingRulesForm(settings: VenueSettings | null | undefined): BookingRulesForm {
  return {
    daysAhead: text(settings?.maxAdvanceBooking),
    noticeHours: text(settings?.minAdvanceBooking),
    largestParty: text(settings?.maxPartySize),
  };
}

/** Every field that is not a whole number in range, in form order. Empty is allowed: "not set". */
export function invalidBookingRules(form: BookingRulesForm): readonly BookingRulesField[] {
  return (Object.keys(LIMITS) as BookingRulesField[]).filter((field) => {
    const raw = form[field].trim();
    if (raw === "") return false;
    const n = Number(raw);
    const { min, max } = LIMITS[field];
    return !Number.isInteger(n) || n < min || n > max;
  });
}

/**
 * `settings` with the three rules from the form, every other key kept (the profile, the theme,
 * deposits). An empty field removes its key, so the service's default applies again.
 */
export function withBookingRules(
  settings: VenueSettings | null | undefined,
  form: BookingRulesForm
): VenueSettings {
  const {
    maxAdvanceBooking: _a,
    minAdvanceBooking: _b,
    maxPartySize: _c,
    ...rest
  } = settings ?? {};
  const set = (key: string, raw: string) => (raw.trim() === "" ? {} : { [key]: Number(raw) });
  return {
    ...rest,
    ...set("maxAdvanceBooking", form.daysAhead),
    ...set("minAdvanceBooking", form.noticeHours),
    ...set("maxPartySize", form.largestParty),
  };
}

/** The rules as numbers (`null` = not set): what the hub's Booking node and the Schedules layer print. */
export interface BookingRulesValues {
  readonly daysAhead: number | null;
  readonly noticeHours: number | null;
  readonly largestParty: number | null;
}

/** "Up to 30 days ahead · 1 hour notice · parties up to 12 online": only the rules that are set. */
export function bookingRulesText(rules: BookingRulesValues, t: TFunction): string {
  return [
    rules.daysAhead !== null && t("setup.hub.rules.daysAhead", { count: rules.daysAhead }),
    rules.noticeHours !== null && t("setup.hub.rules.noticeHours", { count: rules.noticeHours }),
    rules.largestParty !== null && t("setup.hub.rules.largestParty", { count: rules.largestParty }),
  ]
    .filter((part): part is string => part !== false)
    .join(" · ");
}

/** The three rules in `Venue.settings` as numbers (`null` where not set). */
export function bookingRulesOf(settings: VenueSettings | null | undefined): BookingRulesValues {
  const num = (value: unknown) => (typeof value === "number" ? value : null);
  return {
    daysAhead: num(settings?.maxAdvanceBooking),
    noticeHours: num(settings?.minAdvanceBooking),
    largestParty: num(settings?.maxPartySize),
  };
}
