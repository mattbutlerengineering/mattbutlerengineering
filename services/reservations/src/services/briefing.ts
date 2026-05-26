import type { Occasion, SeatingPreference } from "@mbe/types";
import { toDateString } from "@mbe/types";
import { prisma } from "./database.js";

export interface BriefingGuest {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  visitCount: number;
  lastVisit: string | null;
  dietaryRestrictions: string[] | null;
  tags: string[] | null;
  staffNotes: Array<{ text: string; createdBy: string; createdAt: string }>;
}

export interface BriefingReservation {
  id: string;
  startTime: string;
  endTime: string;
  partySize: number;
  status: "PENDING" | "CONFIRMED";
  notes: string | null;
  occasion: Occasion | null;
  seatingPreference: SeatingPreference | null;
  guestName: string | null;
  tableId: string;
  tableName: string | null;
  venueId: string | null;
  guest: BriefingGuest | null;
}

export interface BriefingResponse {
  date: string;
  venueId: string;
  reservations: BriefingReservation[];
}

interface BriefingServiceResult {
  success: boolean;
  data?: BriefingResponse;
  error?: string;
}

export const briefingService = {
  async getBriefing({
    venueId,
    date,
  }: {
    venueId: string;
    date?: string;
  }): Promise<BriefingServiceResult> {
    // Verify venue exists
    const venue = await prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) {
      return { success: false, error: "VENUE_NOT_FOUND" };
    }

    const targetDate = date ? new Date(date) : new Date();
    // Normalize to date-only (midnight UTC) to match DB date field
    const dateOnly = new Date(
      Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate())
    );

    const reservations = await prisma.reservation.findMany({
      where: {
        venueId,
        date: dateOnly,
        status: { in: ["PENDING", "CONFIRMED"] },
      },
      include: {
        table: { select: { id: true, name: true } },
        guest: true,
      },
      orderBy: [{ startTime: "asc" }],
    });

    const briefingReservations: BriefingReservation[] = reservations.map((r) => {
      const g = r.guest;
      const briefingGuest: BriefingGuest | null = g
        ? {
            id: g.id,
            name: g.name,
            email: g.email,
            phone: g.phone,
            visitCount: g.visitCount,
            lastVisit: g.lastVisit?.toISOString() ?? null,
            dietaryRestrictions: (g.dietaryRestrictions as string[] | null) ?? null,
            tags: (g.tags as string[] | null) ?? null,
            staffNotes: (
              g.staffNotes as Array<{ text: string; createdBy: string; createdAt: string }> | null
            ) ?? [],
          }
        : null;

      return {
        id: r.id,
        startTime: r.startTime.toISOString(),
        endTime: r.endTime.toISOString(),
        partySize: r.partySize,
        status: r.status as "PENDING" | "CONFIRMED",
        notes: r.notes,
        occasion: r.occasion as Occasion | null,
        seatingPreference: r.seatingPreference as SeatingPreference | null,
        guestName: r.guestName,
        tableId: r.tableId,
        tableName: r.table?.name ?? null,
        venueId: r.venueId,
        guest: briefingGuest,
      };
    });

    return {
      success: true,
      data: {
        date: toDateString(dateOnly),
        venueId,
        reservations: briefingReservations,
      },
    };
  },
};
