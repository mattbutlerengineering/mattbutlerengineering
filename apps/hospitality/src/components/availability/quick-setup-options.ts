import {
  DEFAULT_KEPT,
  type DraftTimes,
  type HoursBlock,
  type KeptHours,
  type ServiceDraft,
} from "./quick-setup-draft.js";
import { sameBookingTypes, sameSeating } from "./service-fields/service-options.js";

/**
 * "Seat every" and "Booked by" on the weekly form: read from, and written to, the seating and
 * booking types a service's hours carry (`DraftTimes.kept`). Pure.
 */

/**
 * The seating and booking types a service's hours (or a different-hours block's) will be saved
 * with, which is what the row shows: their own, else what is stored under the service's name in
 * this set of hours (`stored`, the save's `keptOf`), else quick setup's defaults. The same
 * objects the draft or the config holds, so a caller can tell "not changed" by identity.
 */
export function shownKept(times: Pick<DraftTimes, "kept">, stored?: KeptHours): KeptHours {
  return times.kept ?? stored ?? DEFAULT_KEPT;
}

/** `next`, as the object already held when it means the same: a change put back reads as no change. */
function settled(next: KeptHours, held: readonly (KeptHours | undefined)[]): KeptHours {
  const known = held.filter((kept) => kept !== undefined);
  return {
    seating: known.find((kept) => sameSeating(kept.seating, next.seating))?.seating ?? next.seating,
    bookingTypes:
      known.find((kept) => sameBookingTypes(kept.bookingTypes, next.bookingTypes))?.bookingTypes ??
      next.bookingTypes,
  };
}

/**
 * The service with new seating and booking types. The row has one control for the whole service,
 * so a different-hours block that had the service's value takes the new one; a block whose value
 * differed keeps its own from then on (and says so, `OwnSettingsCaption`). Values are compared
 * without regard to order. `stored` is what `shownKept` was given.
 */
export function setServiceKept(
  service: ServiceDraft,
  next: KeptHours,
  stored?: KeptHours
): ServiceDraft {
  const was = shownKept(service, stored);
  const kept = settled(next, [stored, was]);
  return {
    ...service,
    kept,
    blocks: service.blocks.map((block) => followService(block, { was, kept, stored })),
  };
}

/** One block after its service's values went from `was` to `kept`. */
function followService(
  block: HoursBlock,
  change: { readonly was: KeptHours; readonly kept: KeptHours; readonly stored?: KeptHours }
): HoursBlock {
  const own = shownKept(block, change.stored);
  // A value the block had unlike its service's stays the block's for good: without the mark, a
  // service changed to that value and then to another would take the block along.
  const ownKept = {
    seating: block.ownKept?.seating === true || !sameSeating(own.seating, change.was.seating),
    bookingTypes:
      block.ownKept?.bookingTypes === true ||
      !sameBookingTypes(own.bookingTypes, change.was.bookingTypes),
  };
  return {
    ...block,
    ownKept,
    kept: {
      seating: ownKept.seating ? own.seating : change.kept.seating,
      bookingTypes: ownKept.bookingTypes ? own.bookingTypes : change.kept.bookingTypes,
    },
  };
}

/** Whether a different-hours block will be saved with seating or booking unlike its service's. */
export function keepsOwnSettings(service: KeptHours, block: KeptHours): boolean {
  return (
    !sameSeating(service.seating, block.seating) ||
    !sameBookingTypes(service.bookingTypes, block.bookingTypes)
  );
}
