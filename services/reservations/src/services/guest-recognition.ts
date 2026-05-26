import { prisma } from "./database.js";

export interface GuestRecognition {
  recognized: boolean;
  firstName: string | null;
  phone: string | null;
  visitCount: number;
  hasPreferences: boolean;
  lastVisit: string | null;
}

const UNRECOGNIZED: GuestRecognition = {
  recognized: false,
  firstName: null,
  phone: null,
  visitCount: 0,
  hasPreferences: false,
  lastVisit: null,
};

function extractFirstName(fullName: string): string {
  return fullName.split(" ")[0];
}

function hasGuestPreferences(guest: { notes: string | null; tags: unknown }): boolean {
  if (guest.notes && guest.notes.trim().length > 0) {
    return true;
  }
  if (Array.isArray(guest.tags) && guest.tags.length > 0) {
    return true;
  }
  return false;
}

/**
 * Read-only lookup: recognize a guest by email within a venue.
 * Returns only safe public fields (first name, phone, visit stats).
 * Never exposes id, email, notes, tags, lifetimeSpend, or venueId.
 */
export async function recognizeGuest(venueId: string, email: string): Promise<GuestRecognition> {
  const guest = await prisma.guest.findUnique({
    where: { venueId_email: { venueId, email } },
  });

  if (!guest) {
    return { ...UNRECOGNIZED };
  }

  return {
    recognized: true,
    firstName: extractFirstName(guest.name),
    phone: guest.phone,
    visitCount: guest.visitCount,
    hasPreferences: hasGuestPreferences(guest),
    lastVisit: guest.lastVisit?.toISOString() ?? null,
  };
}
