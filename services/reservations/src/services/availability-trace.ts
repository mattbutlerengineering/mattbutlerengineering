import { localDateTimeOf, traceDay } from "@mbe/availability";
import type { DayTraceResult } from "@mbe/types";
import { bookingWindow } from "./slot-rules.js";
import { VenueNotFoundError, loadAvailabilitySnapshot } from "./availability-snapshot.js";

/**
 * Staff's per-day slot trace: the guest listing's pipeline (engine seatings, then the
 * venue's booking window) run for one date, with the rule that removed each time.
 * Read-only. Callers must be inside the venue's context (`venueScoped`).
 *
 * A past date is traced against today's rules and no booking window: it shows what the
 * rules produce now, which is not necessarily what was offered then.
 */
export async function traceAvailabilityDay(
  venueId: string,
  date: string,
  partySize: number,
  now: Date
): Promise<DayTraceResult | null> {
  let loaded;
  try {
    loaded = await loadAvailabilitySnapshot(venueId, date, date, now);
  } catch (error) {
    if (error instanceof VenueNotFoundError) return null;
    throw error;
  }
  const { snapshot, venueSettings } = loaded;
  const isPast = date < localDateTimeOf(now, snapshot.timezone).date;
  const window = isPast
    ? undefined
    : (({ earliest, latestLocalDate }) => ({ earliest, latestLocalDate }))(
        bookingWindow(venueSettings, now, snapshot.timezone)
      );
  const { day, times } = traceDay(snapshot, date, { partySize, now, channel: "online", window });
  return {
    serviceDate: date,
    partySize,
    channel: "online",
    day,
    times,
    basis: isPast ? "current_rules_past_date" : "current_rules",
  };
}
