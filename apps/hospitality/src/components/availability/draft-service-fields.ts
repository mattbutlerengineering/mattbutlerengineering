import { closeFromClock, lastSeatingFromClock, openFromClock, toClock } from "./clock-minutes.js";
import type { DraftService } from "./draft-changes.js";
import type { ServiceFieldsValue } from "./service-fields/ServiceFields.js";
import { sameBookingTypes, sameSeating } from "./service-fields/service-options.js";

/**
 * The date editor's rows as the shared service fields hold them. The fields know neither draft
 * model (import-policy.test.ts), so this is the one place a `DraftService` meets them.
 */

/** A row's minutes as the clocks the fields show. The date editor never links last seating. */
export function serviceFieldsOf(service: DraftService): ServiceFieldsValue {
  return {
    opens: toClock(service.opensAt),
    lastSeating: toClock(service.lastSeatingAt),
    closes: toClock(service.closesAt),
    lastSeatingLinked: false,
    seating: service.seating,
    // A copy: the fields' type is mutable, the row's is not.
    bookingTypes: [...service.bookingTypes],
  };
}

/**
 * The row with what the fields changed. A time cleared in its picker (`null`) changes nothing.
 * Moving the opening keeps the clocks the Manager sees; only which day they fall on can change.
 */
export function applyFieldsToService(
  service: DraftService,
  next: ServiceFieldsValue
): DraftService {
  const was = serviceFieldsOf(service);
  const opensAt =
    next.opens !== null && next.opens !== was.opens ? openFromClock(next.opens) : service.opensAt;
  const lastSeating = next.lastSeating !== was.lastSeating ? next.lastSeating : null;
  const closes = next.closes !== was.closes ? next.closes : null;
  const opened = opensAt !== service.opensAt;
  const lastSeatingAt = lastSeating
    ? lastSeatingFromClock(lastSeating, opensAt)
    : opened
      ? lastSeatingFromClock(was.lastSeating ?? "", opensAt)
      : service.lastSeatingAt;
  const closesAt = closes
    ? closeFromClock(closes, opensAt)
    : opened
      ? closeFromClock(was.closes ?? "", opensAt)
      : service.closesAt;
  const changed =
    opened ||
    lastSeatingAt !== service.lastSeatingAt ||
    closesAt !== service.closesAt ||
    !sameSeating(next.seating, was.seating) ||
    !sameBookingTypes(next.bookingTypes, was.bookingTypes);
  return changed
    ? {
        ...service,
        opensAt,
        lastSeatingAt,
        closesAt,
        seating: next.seating,
        bookingTypes: [...next.bookingTypes],
      }
    : service;
}
