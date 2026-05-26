import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import { createHmac } from "crypto";

// Mock all services used by the app
vi.mock("../services/venue.js", () => ({
  venueService: {
    list: vi.fn(),
    getById: vi.fn(),
    getBySlug: vi.fn(),
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
vi.mock("../services/hold.js", () => ({
  holdService: { create: vi.fn(), release: vi.fn(), getById: vi.fn(), maybeCleanup: vi.fn() },
}));
vi.mock("../services/confirm-hold.js", () => ({
  confirmHold: vi.fn(),
}));
vi.mock("../services/availability.js", () => ({
  availabilityService: { getTimeSlots: vi.fn(), getDateAvailability: vi.fn() },
}));
vi.mock("../services/table.js", () => ({
  tableService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updateStatus: vi.fn(),
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
    createWalkIn: vi.fn(),
    createWithConflictCheck: vi.fn(),
    updateWithConflictCheck: vi.fn(),
    cancel: vi.fn(),
  },
}));
vi.mock("../services/guest.js", () => ({
  guestService: {
    list: vi.fn(),
    getById: vi.fn(),
    search: vi.fn(),
    findOrCreate: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getSegments: vi.fn(),
    addNote: vi.fn(),
    unsubscribe: vi.fn(),
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
vi.mock("../services/database.js", () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]),
  },
  getSlowQueryStats: vi.fn().mockReturnValue({ count5min: 0, slowestMs: 0 }),
  getServiceStatus: vi.fn().mockReturnValue("ok"),
  getPoolMetrics: vi.fn().mockReturnValue({
    active: 1,
    idle: 4,
    busy: 1,
    size: 5,
    utilization: 0.2,
    isDegraded: false,
  }),
}));
vi.mock("jose", () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => vi.fn()),
}));

import { guestService } from "../services/guest.js";

const UNSUBSCRIBE_SECRET = "test-unsubscribe-secret";

function makeToken(guestId: string) {
  return createHmac("sha256", UNSUBSCRIBE_SECRET).update(guestId).digest("hex") + "." + guestId;
}

describe("GET /public/v1/guests/unsubscribe", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.AUTH_BYPASS_IN_TESTS = "true";
    process.env.UNSUBSCRIBE_SECRET = UNSUBSCRIBE_SECRET;
    app = await buildApp({ logger: false });
    await app.ready();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.AUTH_BYPASS_IN_TESTS;
    delete process.env.UNSUBSCRIBE_SECRET;
  });

  it("returns 200 and sets unsubscribed=true for valid token", async () => {
    const guestId = "guest_abc";
    const token = makeToken(guestId);
    vi.mocked(guestService.unsubscribe).mockResolvedValueOnce();

    const response = await app.inject({
      method: "GET",
      url: `/public/v1/guests/unsubscribe?token=${token}`,
    });

    expect(response.statusCode).toBe(200);
    expect(guestService.unsubscribe).toHaveBeenCalledWith(guestId);
    expect(response.headers["content-type"]).toMatch(/text\/html/);
    expect(response.body).toContain("unsubscribed");
  });

  it("returns 400 for invalid token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/public/v1/guests/unsubscribe?token=invalid-token",
    });

    expect(response.statusCode).toBe(400);
    expect(guestService.unsubscribe).not.toHaveBeenCalled();
  });

  it("returns 400 for tampered token", async () => {
    const guestId = "guest_abc";
    const token = makeToken(guestId);
    const tampered = "aaaaaaaaa" + token.slice(9);

    const response = await app.inject({
      method: "GET",
      url: `/public/v1/guests/unsubscribe?token=${tampered}`,
    });

    expect(response.statusCode).toBe(400);
    expect(guestService.unsubscribe).not.toHaveBeenCalled();
  });

  it("returns 400 when token query param is missing", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/public/v1/guests/unsubscribe",
    });

    expect(response.statusCode).toBe(400);
  });
});
