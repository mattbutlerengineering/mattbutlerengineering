import { describe, it, expect } from "vitest";
import {
  ReservationSchema,
  ReservationStatusSchema,
  TableSchema,
  TableStatusSchema,
} from "./schemas/reservation.js";
import { VenueSchema, VenueGroupSchema, DayScheduleSchema } from "./schemas/venue.js";
import {
  TableShapeMetadataSchema,
  FloorPlanLayoutSchema,
  FloorPlanSchema,
} from "./schemas/floor-plan.js";

// ── ReservationStatusSchema ────────────────────────────────────────

describe("ReservationStatusSchema", () => {
  const validStatuses = ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"];

  it.each(validStatuses)("accepts valid status: %s", (status) => {
    expect(ReservationStatusSchema.safeParse(status).success).toBe(true);
  });

  it("rejects lowercase variants", () => {
    expect(ReservationStatusSchema.safeParse("pending").success).toBe(false);
    expect(ReservationStatusSchema.safeParse("confirmed").success).toBe(false);
    expect(ReservationStatusSchema.safeParse("no_show").success).toBe(false);
  });

  it("rejects unknown statuses", () => {
    expect(ReservationStatusSchema.safeParse("ACTIVE").success).toBe(false);
    expect(ReservationStatusSchema.safeParse("").success).toBe(false);
  });

  it("rejects non-string types", () => {
    expect(ReservationStatusSchema.safeParse(1).success).toBe(false);
    expect(ReservationStatusSchema.safeParse(null).success).toBe(false);
  });
});

// ── TableStatusSchema ──────────────────────────────────────────────

describe("TableStatusSchema", () => {
  const validStatuses = ["AVAILABLE", "OCCUPIED", "DIRTY", "READY"];

  it.each(validStatuses)("accepts valid status: %s", (status) => {
    expect(TableStatusSchema.safeParse(status).success).toBe(true);
  });

  it("rejects invalid statuses", () => {
    expect(TableStatusSchema.safeParse("CLOSED").success).toBe(false);
    expect(TableStatusSchema.safeParse("available").success).toBe(false);
  });
});

// ── ReservationSchema ──────────────────────────────────────────────

describe("ReservationSchema", () => {
  const validReservation = {
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
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z",
  };

  it("accepts a valid reservation", () => {
    expect(ReservationSchema.safeParse(validReservation).success).toBe(true);
  });

  it("accepts reservation with all optional nullable fields populated", () => {
    const populated = {
      ...validReservation,
      notes: "Window seat preferred",
      cancellationReason: "GUEST_REQUEST",
      cancellationNote: "Changed plans",
      guestPhone: "+1-555-0100",
      userId: "user-abc",
    };
    expect(ReservationSchema.safeParse(populated).success).toBe(true);
  });

  it("accepts reservation with optional table included", () => {
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
      shapeMetadata: null,
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    };
    const withTable = { ...validReservation, table };
    expect(ReservationSchema.safeParse(withTable).success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const { id: _, ...noId } = validReservation;
    expect(ReservationSchema.safeParse(noId).success).toBe(false);

    const { partySize: _ps, ...noParty } = validReservation;
    expect(ReservationSchema.safeParse(noParty).success).toBe(false);

    const { tableId: _tid, ...noTable } = validReservation;
    expect(ReservationSchema.safeParse(noTable).success).toBe(false);
  });

  it("rejects invalid status", () => {
    expect(ReservationSchema.safeParse({ ...validReservation, status: "ACTIVE" }).success).toBe(
      false
    );
  });

  it("rejects non-number partySize", () => {
    expect(ReservationSchema.safeParse({ ...validReservation, partySize: "4" }).success).toBe(
      false
    );
  });

  it("rejects completely empty object", () => {
    expect(ReservationSchema.safeParse({}).success).toBe(false);
  });
});

// ── TableSchema ────────────────────────────────────────────────────

describe("TableSchema", () => {
  const validTable = {
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
      x: 10,
      y: 20,
      width: 100,
      height: 80,
      shape: "rectangle",
    },
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z",
  };

  it("accepts a valid table", () => {
    expect(TableSchema.safeParse(validTable).success).toBe(true);
  });

  it("accepts table with null optional fields", () => {
    const table = {
      ...validTable,
      tableNumber: null,
      maxCovers: null,
      location: null,
      venueId: null,
      floorPlanId: null,
      shapeMetadata: null,
    };
    expect(TableSchema.safeParse(table).success).toBe(true);
  });

  it("accepts table with shape metadata including optional fields", () => {
    const table = {
      ...validTable,
      shapeMetadata: {
        x: 0,
        y: 0,
        width: 50,
        height: 50,
        rotation: 45,
        shape: "circle",
        color: "#ff0000",
      },
    };
    expect(TableSchema.safeParse(table).success).toBe(true);
  });

  it("rejects invalid table status", () => {
    expect(TableSchema.safeParse({ ...validTable, status: "CLOSED" }).success).toBe(false);
  });

  it("rejects non-boolean isActive", () => {
    expect(TableSchema.safeParse({ ...validTable, isActive: 1 }).success).toBe(false);
  });

  it("rejects invalid shapeMetadata shape enum", () => {
    const table = {
      ...validTable,
      shapeMetadata: { x: 0, y: 0, width: 50, height: 50, shape: "triangle" },
    };
    expect(TableSchema.safeParse(table).success).toBe(false);
  });
});

// ── TableShapeMetadataSchema ───────────────────────────────────────

describe("TableShapeMetadataSchema", () => {
  it("accepts valid rectangle metadata", () => {
    const metadata = { x: 0, y: 0, width: 100, height: 80, shape: "rectangle" };
    expect(TableShapeMetadataSchema.safeParse(metadata).success).toBe(true);
  });

  it("accepts valid circle metadata", () => {
    const metadata = { x: 50, y: 50, width: 60, height: 60, shape: "circle" };
    expect(TableShapeMetadataSchema.safeParse(metadata).success).toBe(true);
  });

  it("accepts valid square metadata with optional rotation and color", () => {
    const metadata = {
      x: 10,
      y: 20,
      width: 50,
      height: 50,
      rotation: 90,
      shape: "square",
      color: "#333",
    };
    expect(TableShapeMetadataSchema.safeParse(metadata).success).toBe(true);
  });

  it("rejects invalid shape values", () => {
    const metadata = { x: 0, y: 0, width: 100, height: 80, shape: "hexagon" };
    expect(TableShapeMetadataSchema.safeParse(metadata).success).toBe(false);
  });

  it("rejects missing required coordinates", () => {
    expect(
      TableShapeMetadataSchema.safeParse({ width: 100, height: 80, shape: "rectangle" }).success
    ).toBe(false);
  });
});

// ── FloorPlanLayoutSchema ──────────────────────────────────────────

describe("FloorPlanLayoutSchema", () => {
  it("accepts minimal layout", () => {
    expect(FloorPlanLayoutSchema.safeParse({ width: 800, height: 600 }).success).toBe(true);
  });

  it("accepts fully specified layout", () => {
    const layout = {
      width: 1200,
      height: 900,
      backgroundImage: "https://cdn.example.com/floorplan.png",
      gridSize: 20,
      showGrid: true,
    };
    expect(FloorPlanLayoutSchema.safeParse(layout).success).toBe(true);
  });

  it("rejects missing dimensions", () => {
    expect(FloorPlanLayoutSchema.safeParse({ height: 600 }).success).toBe(false);
    expect(FloorPlanLayoutSchema.safeParse({ width: 800 }).success).toBe(false);
  });

  it("rejects non-number dimensions", () => {
    expect(FloorPlanLayoutSchema.safeParse({ width: "800", height: 600 }).success).toBe(false);
  });
});

// ── FloorPlanSchema ────────────────────────────────────────────────

describe("FloorPlanSchema", () => {
  const validFloorPlan = {
    id: "fp-1",
    venueId: "v-1",
    name: "Main Floor",
    isActive: true,
    layoutJson: { width: 800, height: 600 },
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z",
  };

  it("accepts a valid floor plan without tables", () => {
    expect(FloorPlanSchema.safeParse(validFloorPlan).success).toBe(true);
  });

  it("accepts a floor plan with tables array", () => {
    const floorPlan = {
      ...validFloorPlan,
      tables: [
        {
          id: "t1",
          name: "Table 1",
          tableNumber: "1",
          capacity: 4,
          minCovers: 1,
          maxCovers: 6,
          location: null,
          isActive: true,
          priority: 1,
          status: "AVAILABLE",
          venueId: "v-1",
          floorPlanId: "fp-1",
          shapeMetadata: null,
          createdAt: "2026-05-10T00:00:00.000Z",
          updatedAt: "2026-05-10T00:00:00.000Z",
        },
      ],
    };
    expect(FloorPlanSchema.safeParse(floorPlan).success).toBe(true);
  });

  it("rejects missing layoutJson", () => {
    const { layoutJson: _, ...noLayout } = validFloorPlan;
    expect(FloorPlanSchema.safeParse(noLayout).success).toBe(false);
  });

  it("rejects invalid layoutJson", () => {
    expect(FloorPlanSchema.safeParse({ ...validFloorPlan, layoutJson: "invalid" }).success).toBe(
      false
    );
  });
});

// ── VenueGroupSchema ───────────────────────────────────────────────

describe("VenueGroupSchema", () => {
  it("accepts a valid venue group", () => {
    const group = {
      id: "vg-1",
      name: "Restaurant Group",
      slug: "restaurant-group",
      settings: { theme: "dark" },
      createdAt: "2026-05-10T00:00:00.000Z",
    };
    expect(VenueGroupSchema.safeParse(group).success).toBe(true);
  });

  it("accepts venue group with null settings", () => {
    const group = {
      id: "vg-2",
      name: "Solo",
      slug: "solo",
      settings: null,
      createdAt: "2026-05-10T00:00:00.000Z",
    };
    expect(VenueGroupSchema.safeParse(group).success).toBe(true);
  });

  it("rejects missing required name", () => {
    const group = { id: "vg-1", slug: "s", settings: null, createdAt: "t" };
    expect(VenueGroupSchema.safeParse(group).success).toBe(false);
  });
});

// ── DayScheduleSchema ──────────────────────────────────────────────

describe("DayScheduleSchema", () => {
  it("accepts a valid open day", () => {
    expect(DayScheduleSchema.safeParse({ open: "09:00", close: "22:00" }).success).toBe(true);
  });

  it("accepts a closed day", () => {
    expect(
      DayScheduleSchema.safeParse({ open: "00:00", close: "00:00", closed: true }).success
    ).toBe(true);
  });

  it("rejects missing open/close", () => {
    expect(DayScheduleSchema.safeParse({ close: "22:00" }).success).toBe(false);
    expect(DayScheduleSchema.safeParse({ open: "09:00" }).success).toBe(false);
  });
});

// ── VenueSchema ────────────────────────────────────────────────────

describe("VenueSchema", () => {
  const validVenue = {
    id: "v-1",
    venueGroupId: null,
    name: "The Grill",
    slug: "the-grill",
    ianaTimezone: "America/New_York",
    currencyCode: "USD",
    operatingHours: null,
    settings: null,
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z",
  };

  it("accepts a minimal valid venue", () => {
    expect(VenueSchema.safeParse(validVenue).success).toBe(true);
  });

  it("accepts venue with full operating hours", () => {
    const venue = {
      ...validVenue,
      operatingHours: {
        monday: { open: "11:00", close: "23:00" },
        tuesday: { open: "11:00", close: "23:00" },
        wednesday: { open: "11:00", close: "23:00" },
        thursday: { open: "11:00", close: "23:00" },
        friday: { open: "11:00", close: "00:00" },
        saturday: { open: "10:00", close: "00:00" },
        sunday: { open: "10:00", close: "22:00", closed: true },
      },
    };
    expect(VenueSchema.safeParse(venue).success).toBe(true);
  });

  it("accepts venue with partial operating hours (some days omitted)", () => {
    const venue = {
      ...validVenue,
      operatingHours: {
        monday: { open: "09:00", close: "17:00" },
        friday: { open: "09:00", close: "21:00" },
      },
    };
    expect(VenueSchema.safeParse(venue).success).toBe(true);
  });

  it("accepts venue with venueGroup included", () => {
    const venue = {
      ...validVenue,
      venueGroupId: "vg-1",
      venueGroup: {
        id: "vg-1",
        name: "Group",
        slug: "group",
        settings: null,
        createdAt: "2026-05-10T00:00:00.000Z",
      },
    };
    expect(VenueSchema.safeParse(venue).success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const { name: _, ...noName } = validVenue;
    expect(VenueSchema.safeParse(noName).success).toBe(false);

    const { slug: _s, ...noSlug } = validVenue;
    expect(VenueSchema.safeParse(noSlug).success).toBe(false);

    const { ianaTimezone: _tz, ...noTz } = validVenue;
    expect(VenueSchema.safeParse(noTz).success).toBe(false);
  });

  it("rejects non-string currencyCode", () => {
    expect(VenueSchema.safeParse({ ...validVenue, currencyCode: 840 }).success).toBe(false);
  });

  it("rejects invalid operatingHours structure", () => {
    expect(VenueSchema.safeParse({ ...validVenue, operatingHours: "always" }).success).toBe(false);
  });
});
