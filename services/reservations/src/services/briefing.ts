import type { Reservation, Guest } from "@mbe/types";
import { prisma } from "./database.js";

export interface BriefingEntry extends Omit<Reservation, "guestEmail" | "guestPhone"> {
  guest: BriefingGuest | null;
}

export interface BriefingGuest {
  id: string;
  name: string;
  visitCount: number;
  lastVisit: string | null;
  dietaryRestrictions: string[] | null;
  notes: string | null;
  staffNotes: Array<{ text: string; createdBy: string; createdAt: string }>;
  tags: string[] | null;
  communicationPreference: Guest["communicationPreference"] | null;
}

export interface GetBriefingParams {
  date: string;
  venueId: string;
}

async function getBriefing(params: GetBriefingParams): Promise<BriefingEntry[]> {
  const { date, venueId } = params;

  const reservations = await prisma.reservation.findMany({
    where: {
      venueId,
      date: new Date(date),
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    include: {
      table: true,
      guest: true,
    },
    orderBy: { startTime: "asc" },
  });

  return reservations.map((r) => {
    const guestData: BriefingGuest | null = r.guest
      ? {
          id: r.guest.id,
          name: r.guest.name,
          visitCount: r.guest.visitCount,
          lastVisit: r.guest.lastVisit?.toISOString() ?? null,
          dietaryRestrictions: r.guest.dietaryRestrictions as string[] | null,
          notes: r.guest.notes,
          staffNotes:
            (r.guest.staffNotes as Array<{
              text: string;
              createdBy: string;
              createdAt: string;
            }> | null) ?? [],
          tags: r.guest.tags as string[] | null,
          communicationPreference: r.guest.communicationPreference as
            | Guest["communicationPreference"]
            | null,
        }
      : null;

    return {
      id: r.id,
      date: r.date.toISOString(),
      startTime: r.startTime.toISOString(),
      endTime: r.endTime.toISOString(),
      partySize: r.partySize,
      status: r.status as Reservation["status"],
      notes: r.notes,
      cancellationReason: r.cancellationReason,
      cancellationNote: r.cancellationNote,
      guestName: r.guestName,
      guestId: r.guestId,
      userId: r.userId,
      occasion: r.occasion as Reservation["occasion"],
      seatingPreference: r.seatingPreference as Reservation["seatingPreference"],
      tableId: r.tableId,
      table: r.table
        ? {
            id: r.table.id,
            name: r.table.name,
            tableNumber: r.table.tableNumber,
            capacity: r.table.capacity,
            minCovers: r.table.minCovers,
            maxCovers: r.table.maxCovers,
            location: r.table.location,
            isActive: r.table.isActive,
            priority: r.table.priority,
            status: r.table.status as Reservation["table"] extends infer T
              ? T extends { status: infer S }
                ? S
                : never
              : never,
            venueId: r.table.venueId,
            floorPlanId: r.table.floorPlanId,
            shapeMetadata: r.table.shapeMetadata as Reservation["table"] extends infer T
              ? T extends { shapeMetadata: infer S }
                ? S
                : never
              : never,
            createdAt: r.table.createdAt.toISOString(),
            updatedAt: r.table.updatedAt.toISOString(),
          }
        : undefined,
      venueId: r.venueId,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      guest: guestData,
    };
  });
}

export const briefingService = { getBriefing };
