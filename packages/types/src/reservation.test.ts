import { describe, it, expect } from "vitest";
import { 
  ReservationSchema, 
  ReservationStatusSchema,
  TableSchema
} from "./schemas/reservation.js";
import { VenueSchema } from "./schemas/venue.js";

describe("Reservation Schemas", () => {
  it("validates a valid reservation", () => {
    const validRes = {
      id: "res-123",
      venueId: "venue-456",
      guestId: "guest-789",
      tableId: "table-10",
      partySize: 4,
      date: "2026-05-10",
      startTime: "18:00",
      endTime: "20:00",
      status: "CONFIRMED",
      notes: null,
      cancellationReason: null,
      cancellationNote: null,
      guestName: "John Doe",
      guestEmail: "john@example.com",
      guestPhone: null,
      userId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const result = ReservationSchema.safeParse(validRes);
    expect(result.success).toBe(true);
  });

  it("validates reservation status", () => {
    expect(ReservationStatusSchema.safeParse("CONFIRMED").success).toBe(true);
    expect(ReservationStatusSchema.safeParse("CANCELLED").success).toBe(true);
    expect(ReservationStatusSchema.safeParse("pending").success).toBe(false);
  });

  it("validates venue and table", () => {
    const venue = { 
      id: "v1", 
      venueGroupId: null,
      name: "The Grill", 
      slug: "the-grill",
      ianaTimezone: "UTC",
      currencyCode: "USD",
      operatingHours: null,
      settings: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const table = { 
      id: "t1", 
      name: "Table 1",
      tableNumber: "1",
      capacity: 4, 
      minCovers: 1,
      maxCovers: 6,
      location: "Main Floor",
      isActive: true,
      priority: 1,
      status: "AVAILABLE",
      venueId: "v1", 
      floorPlanId: "fp1",
      shapeMetadata: {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        shape: "rectangle"
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const venueResult = VenueSchema.safeParse(venue);
    expect(venueResult.success).toBe(true);

    const tableResult = TableSchema.safeParse(table);
    expect(tableResult.success).toBe(true);
  });
});
