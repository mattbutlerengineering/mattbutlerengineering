import { prisma } from "./database.js";
import { setVenueContext } from "../middleware/venue-context.js";
import { recordReservationEvent, guestActor } from "./reservation-events.js";
import type { GuestSignalKind } from "./can-signal.js";

/** How many of each signal this reservation has already sent (read inside the venue context). */
export async function countGuestSignals(
  reservationId: string
): Promise<{ late: number; arrived: number }> {
  const rows = await prisma.reservationEvent.findMany({
    where: { reservationId, kind: "guest_signal" },
    select: { toState: true },
  });
  let late = 0;
  let arrived = 0;
  for (const row of rows) {
    const signal = (row.toState as { signal?: string } | null)?.signal;
    if (signal === "arrived") arrived += 1;
    else if (signal === "running-late") late += 1;
  }
  return { late, arrived };
}

/** Appends the signal to the reservation history. Never touches the reservation row. */
export async function recordGuestSignal(input: {
  reservationId: string;
  venueId: string;
  guestId: string | null;
  kind: GuestSignalKind;
  minutes?: number;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // `$transaction` bypasses the auto-scoped model wrapper, so the venue (RLS) context must be set explicitly.
    await setVenueContext(tx, input.venueId);
    await recordReservationEvent(tx, {
      reservationId: input.reservationId,
      venueId: input.venueId,
      kind: "guest_signal",
      actor: guestActor(input.guestId),
      to: {
        signal: input.kind,
        ...(input.minutes === undefined ? {} : { minutes: input.minutes }),
      },
    });
  });
}
