import { resolveDay, type ResolvedClosure, type ResolvedService } from "@mbe/availability";
import type { AvailabilityConfig } from "@mbe/types";

function seatingMinutes({ opensAt, lastSeatingAt, closesAt, seating }: ResolvedService): number[] {
  const bookable = (m: number) => m >= opensAt && m <= lastSeatingAt && m < closesAt;
  if ("fixed" in seating) return seating.fixed.filter(bookable);
  const count = Math.floor((lastSeatingAt - opensAt) / seating.interval) + 1;
  return Array.from(
    { length: Math.max(count, 0) },
    (_, k) => opensAt + k * seating.interval
  ).filter(bookable);
}

function closesOnline(band: ResolvedClosure, minute: number, venueServiceId: string): boolean {
  if (minute < band.from || minute >= band.to) return false;
  if (band.targetKind === "venue") return true;
  if (band.targetKind === "service") return band.venueServiceId === venueServiceId;
  return band.targetKind === "booking" && (band.bookingTypes ?? []).includes("online");
}

/**
 * Whether an online seating of `date` is left from `nowMinute` on. This reads the same seatings and
 * bands as the engine's `listSlots`, which is not called here because it would bring the whole
 * booking engine into a chunk every dashboard page loads. `online-seatings.test.ts` pins the two
 * together.
 */
export function onlineSeatingLeft(
  config: AvailabilityConfig,
  timezone: string,
  date: string,
  nowMinute: number
): boolean {
  const day = resolveDay({ timezone, config }, date);
  if (!day.bookingOpen.online) return false;
  return day.services.some(
    (service) =>
      service.bookingTypes.includes("online") &&
      seatingMinutes(service).some(
        (minute) =>
          minute >= nowMinute &&
          !day.closures.some((band) => closesOnline(band, minute, service.venueServiceId))
      )
  );
}
