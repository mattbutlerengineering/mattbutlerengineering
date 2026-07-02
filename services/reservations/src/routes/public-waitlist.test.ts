import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import { WaitlistJoinResultSchema } from "@mbe/types/schemas";

// Mock all services needed for app registration (mirrors public-guest-risk.test.ts)
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

vi.mock("../services/waitlist.js", () => ({
  waitlistService: {
    create: vi.fn(),
    listWaiting: vi.fn(),
    getById: vi.fn(),
    seat: vi.fn(),
    cancel: vi.fn(),
    expire: vi.fn(),
  },
}));

vi.mock("../services/waitlist-notifier.js", () => ({
  createDefaultWaitlistNotifier: vi.fn(() => ({
    notifyAdded: vi.fn().mockResolvedValue(undefined),
    notifyPositionUpdate: vi.fn().mockResolvedValue(undefined),
    notifyTableReady: vi.fn().mockResolvedValue(undefined),
    handleExpiry: vi.fn().mockResolvedValue(undefined),
  })),
  validatePhone: vi.fn().mockReturnValue(true),
}));

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

// Import after mocks
import { venueService } from "../services/venue.js";
import { waitlistService } from "../services/waitlist.js";
import { validatePhone } from "../services/waitlist-notifier.js";

const mockVenue = {
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
};

const mockEntry = {
  id: "entry-1",
  venueId: "venue-1",
  partySize: 3,
  guestName: "Alice",
  guestPhone: "5551234567",
  position: 4,
  estimatedWaitMinutes: 45,
  status: "waiting",
  notifiedAt: null,
  expiresAt: null,
  createdAt: new Date("2026-05-25T10:00:00.000Z"),
  updatedAt: new Date("2026-05-25T10:00:00.000Z"),
};

describe("POST /public/v1/venues/:slug/waitlist", () => {
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
    vi.mocked(venueService.getBySlug).mockResolvedValue(mockVenue);
    vi.mocked(validatePhone).mockReturnValue(true);
    vi.mocked(waitlistService.create).mockResolvedValue(mockEntry as never);
  });

  const validPayload = {
    venueId: "venue-1",
    partySize: 3,
    guestName: "Alice",
    guestPhone: "5551234567",
  };

  it("joins the waitlist and returns 201 with position + estimatedWaitMinutes", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/public/v1/venues/the-oak-table/waitlist",
      payload: validPayload,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload) as {
      data: { position: number; estimatedWaitMinutes: number };
    };
    expect(body.data.position).toBe(4);
    expect(body.data.estimatedWaitMinutes).toBe(45);
  });

  it("does not leak guest PII in the response", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/public/v1/venues/the-oak-table/waitlist",
      payload: validPayload,
    });

    const body = JSON.parse(res.payload) as { data: Record<string, unknown> };
    expect(Object.keys(body.data).sort()).toEqual(["estimatedWaitMinutes", "position"]);
  });

  it("always joins the venue resolved from the slug, ignoring a mismatched body.venueId", async () => {
    await app.inject({
      method: "POST",
      url: "/public/v1/venues/the-oak-table/waitlist",
      payload: { ...validPayload, venueId: "some-other-venue" },
    });

    expect(waitlistService.create).toHaveBeenCalledWith(
      expect.objectContaining({ venueId: "venue-1" })
    );
  });

  it("returns 404 when the venue is not found", async () => {
    vi.mocked(venueService.getBySlug).mockResolvedValue(null);

    const res = await app.inject({
      method: "POST",
      url: "/public/v1/venues/unknown-venue/waitlist",
      payload: validPayload,
    });

    expect(res.statusCode).toBe(404);
    expect(waitlistService.create).not.toHaveBeenCalled();
  });

  it("returns 400 when the phone number is invalid", async () => {
    vi.mocked(validatePhone).mockReturnValue(false);

    const res = await app.inject({
      method: "POST",
      url: "/public/v1/venues/the-oak-table/waitlist",
      payload: validPayload,
    });

    expect(res.statusCode).toBe(400);
    expect(waitlistService.create).not.toHaveBeenCalled();
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/public/v1/venues/the-oak-table/waitlist",
      payload: { venueId: "venue-1" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("contract: live response validates against the shared WaitlistJoinResult Zod schema", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/public/v1/venues/the-oak-table/waitlist",
      payload: validPayload,
    });

    const body = JSON.parse(res.payload) as { data: unknown };
    const result = WaitlistJoinResultSchema.safeParse(body.data);
    expect(result.success).toBe(true);
  });
});
