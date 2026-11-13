import type { ScheduleService, Seating } from "@mbe/types";

/**
 * "Seat every" and "Booked by" as values: what is offered, and when two stored values mean the
 * same thing. Pure: no React, and no form's draft model.
 */

/** How a service can be booked, as it is stored. */
export type BookingTypes = ScheduleService["bookingTypes"];

export const SEATING_INTERVALS = [5, 10, 15, 20, 30, 60] as const;

export type BookedById = "onlinePhone" | "onlineOnly" | "phoneOnly" | "walkIn";

export const BOOKED_BY: readonly { readonly id: BookedById; readonly types: BookingTypes }[] = [
  { id: "onlinePhone", types: ["online", "phone"] },
  { id: "onlineOnly", types: ["online"] },
  { id: "phoneOnly", types: ["phone"] },
  { id: "walkIn", types: [] },
];

// Order is not meaning in either list (the encoder's `hoursKey` in `@mbe/availability` sorts
// both), so two values are compared sorted.
const seatingKey = (seating: Seating) =>
  JSON.stringify(
    "interval" in seating
      ? ["i", seating.interval]
      : ["f", [...seating.fixed].sort((a, b) => a - b)]
  );

const bookingTypesKey = (types: BookingTypes) => JSON.stringify([...types].sort());

export const sameSeating = (a: Seating, b: Seating) => seatingKey(a) === seatingKey(b);

export const sameBookingTypes = (a: BookingTypes, b: BookingTypes) =>
  bookingTypesKey(a) === bookingTypesKey(b);

/** Seating and booking types as one string that ignores order, for telling two weeks apart. */
export function optionsKey(options: {
  readonly seating: Seating;
  readonly bookingTypes: BookingTypes;
}): string {
  return `${seatingKey(options.seating)}${bookingTypesKey(options.bookingTypes)}`;
}

/** Which "Booked by" choice a stored list is; one that matches none reads as walk-in only. */
export function bookedById(types: BookingTypes): BookedById {
  return BOOKED_BY.find((option) => sameBookingTypes(option.types, types))?.id ?? "walkIn";
}
