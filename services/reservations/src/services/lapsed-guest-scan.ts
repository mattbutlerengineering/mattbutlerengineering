import type { LapsingGuest, CommunicationPreference } from "@mbe/types";
import { prisma } from "./database.js";
import { detectLapse } from "./lapse-detector.js";
import { emitLapsingGuests } from "./events.js";

const MIN_VISITS = 3;

/**
 * Scan all guests for a venue with 3+ visits, detect lapsing ones,
 * emit a guest:lapsing SSE event, and return the list.
 *
 * For each lapsing guest, we need their visit dates — these come from
 * COMPLETED reservations linked to the guest.
 */
export async function runLapsedGuestScan(venueId: string): Promise<LapsingGuest[]> {
  // Fetch guests with 3+ visits and a lastVisit date
  const guests = await prisma.guest.findMany({
    where: { venueId, visitCount: { gte: MIN_VISITS }, lastVisit: { not: null } },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      communicationPreference: true,
      reservations: {
        where: { status: "COMPLETED" },
        select: { startTime: true },
        orderBy: { startTime: "asc" },
      },
    },
  });

  const lapsing: LapsingGuest[] = [];

  for (const guest of guests) {
    const visitDates = guest.reservations.map((r) => r.startTime.toISOString());
    const { avgFrequencyDays, daysSinceLastVisit, isLapsing } = detectLapse(visitDates);

    if (!isLapsing) continue;

    lapsing.push({
      guestId: guest.id,
      name: guest.name,
      email: guest.email,
      phone: guest.phone,
      communicationPreference: guest.communicationPreference as CommunicationPreference,
      avgFrequencyDays,
      daysSinceLastVisit,
      daysOverdue: daysSinceLastVisit - avgFrequencyDays * 2,
    });
  }

  if (lapsing.length > 0) {
    emitLapsingGuests(venueId, lapsing);
  }

  return lapsing;
}
