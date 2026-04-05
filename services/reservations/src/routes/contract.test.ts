import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import { ReservationSchema } from "@mbe/types";

// Mock all service dependencies
vi.mock("../services/reservation.js", () => ({
  reservationService: {
    getById: vi.fn(),
  },
}));

vi.mock("../services/table.js", () => ({
  tableService: {
    list: vi.fn(),
  },
}));

vi.mock("../services/events.js", () => ({
  emitTableUpdated: vi.fn(),
}));

vi.mock("../services/venue.js", () => ({
  venueService: {
    list: vi.fn(),
  },
  venueGroupService: {
    list: vi.fn(),
  },
}));

vi.mock("../services/guest.js", () => ({
  guestService: {
    list: vi.fn(),
  },
}));

vi.mock("../services/floor-plan.js", () => ({
  floorPlanService: {
    list: vi.fn(),
  },
}));

vi.mock("../services/database.js", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

// Mock jose library
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

import { reservationService } from "../services/reservation.js";

const mockTable = {
  id: "table-123",
  name: "Table 1",
  tableNumber: "1",
  capacity: 4,
  minCovers: 1,
  maxCovers: null,
  location: "Main Floor",
  isActive: true,
  priority: 0,
  status: "AVAILABLE",
  venueId: "venue-123",
  floorPlanId: "floor-123",
  shapeMetadata: {
    x: 10,
    y: 10,
    width: 100,
    height: 100,
    shape: "rectangle",
  },
  createdAt: "2026-01-25T00:00:00.000Z",
  updatedAt: "2026-01-25T00:00:00.000Z",
};

const mockReservation = {
  id: "res-123",
  date: "2026-02-15",
  startTime: "2026-02-15T18:00:00.000Z",
  endTime: "2026-02-15T20:00:00.000Z",
  partySize: 4,
  status: "PENDING",
  notes: null,
  cancellationReason: null,
  cancellationNote: null,
  guestName: "John Doe",
  guestEmail: "john@example.com",
  guestPhone: null,
  guestId: null,
  userId: null,
  tableId: "table-123",
  table: mockTable,
  venueId: "venue-123",
  createdAt: "2026-01-25T00:00:00.000Z",
  updatedAt: "2026-01-25T00:00:00.000Z",
};

describe("Reservation Service API Contract", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("GET /api/v1/reservations/:id matches ReservationSchema", async () => {
    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation as any);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/reservations/res-123",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    console.log("Response Body Data:", JSON.stringify(body.data, null, 2));
    
    // Validate against Zod schema from @mbe/types
    const result = ReservationSchema.safeParse(body.data);
    if (!result.success) {
      console.error("Zod Validation Error:", result.error.format());
    }
    expect(result.success).toBe(true);
  });
});
