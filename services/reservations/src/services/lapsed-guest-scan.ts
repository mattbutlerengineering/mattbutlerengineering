import type { LapsingGuest, CommunicationPreference } from "@mbe/types";
import { detectLapse } from "./lapse-detector.js";

interface GuestForScan {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  communicationPreference: string | null;
  reservations: { startTime: Date }[];
}

export interface LapsedGuestScanDeps {
  findGuestsForScan: (venueId: string) => Promise<GuestForScan[]>;
  emitLapsingGuests: (venueId: string, guests: LapsingGuest[]) => void;
}

export async function runLapsedGuestScan(
  venueId: string,
  deps: LapsedGuestScanDeps
): Promise<LapsingGuest[]> {
  const guests = await deps.findGuestsForScan(venueId);
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
    deps.emitLapsingGuests(venueId, lapsing);
  }

  return lapsing;
}
