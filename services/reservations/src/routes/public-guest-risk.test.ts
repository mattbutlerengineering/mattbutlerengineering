import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";

// Mock all services needed for app registration
vi.mock("../services/venue.js", () => ({
  venueService: {
    list: vi.fn(),
    getById: vi.fn(),
    getBySlug: vi.fn(),
    getRawBySlug: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  venueGroupService: {
    list: vi.fn(),
    getById: vi.fn(),
    getBySlug: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../services/table.js", () => ({
  tableService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../services/reservation.js", () => ({
  reservationService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    listByUserId: vi.fn(),
  },
}));

vi.mock("../services/guest.js", () => ({
  guestService: {
    list: vi.fn(),
    getById: vi.fn(),
    search: vi.fn(),
    findOrCreate: vi.fn(),
    findByEmail: vi.fn(),
    findByPhone: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    addNote: vi.fn(),
    getSegments: vi.fn(),
    recordVisit: vi.fn(),
    scanLapsedGuests: vi.fn(),
  },
}));

vi.mock("../services/floor-plan.js", () => ({
  floorPlanService: {
    list: vi.fn(),
    getById: vi.fn(),
    getActiveByVenueId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    bulkUpdatePositions: vi.fn(),
    assignTable: vi.fn(),
    removeTable: vi.fn(),
  },
}));

vi.mock("../services/guest-recognition.js", () => ({
  recognizeGuest: vi.fn(),
}));

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

// Import after mocks
import { venueService } from "../services/venue.js";
import { guestService } from "../services/guest.js";
import type { Guest } from "@mbe/types";

function makeGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: "guest-1",
    venueId: "venue-1",
    email: "alice@example.com",
    phone: "+15551234567",
    name: "Alice",
    notes: null,
    visitCount: 5,
    noShowCount: 0,
    riskScore: "trusted",
    lifetimeSpend: "250.00",
    lastVisit: "2026-04-01T00:00:00.000Z",
    tags: null,
    dietaryRestrictions: null,
    staffNotes: [],
    communicationPreference: "both",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("GET /public/v1/venues/:slug/guest-risk", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(venueService.getBySlug).mockResolvedValue({
      id: "venue-1",
      venueGroupId: null,
      name: "The Oak Table",
      slug: "the-oak-table",
      ianaTimezone: "America/Los_Angeles",
      currencyCode: "USD",
      operatingHours: null,
      settings: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("returns trusted for a guest with no no-shows (email lookup)", async () => {
    vi.mocked(guestService.findByEmail).mockResolvedValue(
      makeGuest({ noShowCount: 0, riskScore: "trusted" })
    );

    const res = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/guest-risk?email=alice%40example.com",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as {
      data: { riskScore: string; noShowCount: number; requiresDeposit: boolean };
    };
    expect(body.data.riskScore).toBe("trusted");
    expect(body.data.noShowCount).toBe(0);
    expect(body.data.requiresDeposit).toBe(false);
  });

  it("returns risky and requiresDeposit=true for a guest with 2+ no-shows", async () => {
    vi.mocked(guestService.findByEmail).mockResolvedValue(
      makeGuest({ noShowCount: 2, riskScore: "risky" })
    );

    const res = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/guest-risk?email=alice%40example.com",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as {
      data: { riskScore: string; requiresDeposit: boolean };
    };
    expect(body.data.riskScore).toBe("risky");
    expect(body.data.requiresDeposit).toBe(true);
  });

  it("returns trusted when guest is not found (new guest)", async () => {
    vi.mocked(guestService.findByEmail).mockResolvedValue(null);

    const res = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/guest-risk?email=newguest%40example.com",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as {
      data: { riskScore: string; requiresDeposit: boolean };
    };
    expect(body.data.riskScore).toBe("trusted");
    expect(body.data.requiresDeposit).toBe(false);
  });

  it("returns 400 when neither email nor phone is provided", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/guest-risk",
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when venue is not found", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValue(null);

    const res = await app.inject({
      method: "GET",
      url: "/public/v1/venues/unknown-venue/guest-risk?email=alice%40example.com",
    });

    expect(res.statusCode).toBe(404);
  });

  it("looks up by phone when email is not provided", async () => {
    vi.mocked(guestService.findByPhone).mockResolvedValue(
      makeGuest({ noShowCount: 1, riskScore: "standard" })
    );

    const res = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/guest-risk?phone=%2B15551234567",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as { data: { riskScore: string } };
    expect(body.data.riskScore).toBe("standard");
  });

  it("respects venue autoDepositAfterNoShows config", async () => {
    // Venue requires deposit after 3 no-shows (not 2)
    vi.mocked(venueService.getBySlug).mockResolvedValue({
      id: "venue-1",
      venueGroupId: null,
      name: "The Oak Table",
      slug: "the-oak-table",
      ianaTimezone: "America/Los_Angeles",
      currencyCode: "USD",
      operatingHours: null,
      settings: { autoDepositAfterNoShows: 3 },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    // Guest has 2 no-shows — risky under default but standard under threshold=3
    vi.mocked(guestService.findByEmail).mockResolvedValue(
      makeGuest({ noShowCount: 2, riskScore: "standard" })
    );

    const res = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/guest-risk?email=alice%40example.com",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as { data: { requiresDeposit: boolean } };
    // With threshold=3, 2 no-shows = standard → no auto-deposit
    expect(body.data.requiresDeposit).toBe(false);
  });
});
