import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";

// Mock all services needed for app registration
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

// ADR-026 §3.3 item 3 / #5369 PR 8: see public-venues.test.ts's identical
// comment for why this is mocked rather than hitting real `$queryRaw`.
vi.mock("../services/resolve-venue.js", () => ({
  resolveVenueId: vi.fn().mockResolvedValue("venue-1"),
}));

// Import after mocks
import { venueService } from "../services/venue.js";
import { guestService } from "../services/guest.js";
import { resolveVenueId } from "../services/resolve-venue.js";
import type { Guest } from "@mbe/types";
import { GuestRiskResultSchema } from "@mbe/types/schemas";

/** Raw 200 body is `{ data: { requiresDeposit } }` — `riskScore` is absent, not Zod-stripped. */
function expectDepositOnly(payload: string, requiresDeposit: boolean) {
  const body = JSON.parse(payload) as { data: Record<string, unknown> };
  expect(Object.keys(body)).toEqual(["data"]);
  expect(body.data).toEqual({ requiresDeposit });
  expect("riskScore" in body.data).toBe(false);
  expect(payload).not.toContain("riskScore");
}

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
    expectDepositOnly(res.payload, false);
  });

  it("does not leak noShowCount in the public response (behavioral PII)", async () => {
    vi.mocked(guestService.findByEmail).mockResolvedValue(
      makeGuest({ noShowCount: 5, riskScore: "risky" })
    );

    const res = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/guest-risk?email=alice%40example.com",
    });

    expect(res.statusCode).toBe(200);
    expectDepositOnly(res.payload, true);
    const body = JSON.parse(res.payload) as { data: Record<string, unknown> };
    expect(body.data).not.toHaveProperty("noShowCount");
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
    expectDepositOnly(res.payload, true);
  });

  it("decays risk when the guest's only no-shows are older than 12 months (uses lastNoShowAt, not lastVisit)", async () => {
    const thirteenMonthsAgo = new Date();
    thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);

    vi.mocked(guestService.findByEmail).mockResolvedValue(
      makeGuest({
        noShowCount: 2,
        riskScore: "risky",
        // lastVisit is recent (a booking made since the no-shows) — if the route
        // mistakenly derived the decay date from lastVisit instead of
        // lastNoShowAt, decay would never fire and this guest would stay risky.
        lastVisit: "2026-07-01T00:00:00.000Z",
        lastNoShowAt: thirteenMonthsAgo.toISOString(),
      })
    );

    const res = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/guest-risk?email=alice%40example.com",
    });

    expect(res.statusCode).toBe(200);
    // 2 no-shows decayed by 50% (both older than 12 months) = 1.0 effective → standard, not risky
    expectDepositOnly(res.payload, false);
  });

  it("returns trusted when guest is not found (new guest)", async () => {
    vi.mocked(guestService.findByEmail).mockResolvedValue(null);

    const res = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/guest-risk?email=newguest%40example.com",
    });

    expect(res.statusCode).toBe(200);
    expectDepositOnly(res.payload, false);
  });

  it("returns 400 when neither email nor phone is provided", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/guest-risk",
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns an RFC 7807 problem-details body for a 400 (ADR-008)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/guest-risk",
    });

    const body = JSON.parse(res.payload) as Record<string, unknown>;
    expect(body).toMatchObject({
      type: expect.any(String),
      title: expect.any(String),
      status: 400,
      detail: "email or phone query parameter is required",
    });
    expect(body).not.toHaveProperty("success");
  });

  it("returns 404 when venue is not found", async () => {
    vi.mocked(resolveVenueId).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "GET",
      url: "/public/v1/venues/unknown-venue/guest-risk?email=alice%40example.com",
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns an RFC 7807 problem-details body for a 404 (ADR-008)", async () => {
    vi.mocked(resolveVenueId).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "GET",
      url: "/public/v1/venues/unknown-venue/guest-risk?email=alice%40example.com",
    });

    const body = JSON.parse(res.payload) as Record<string, unknown>;
    expect(body).toMatchObject({
      type: expect.any(String),
      title: expect.any(String),
      status: 404,
    });
    expect(body.detail).toContain("unknown-venue");
    expect(body).not.toHaveProperty("success");
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
    // 1 no-show is standard, not risky — deposit stays off, and the name is not returned
    expectDepositOnly(res.payload, false);
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
    // With threshold=3, 2 no-shows = standard → no auto-deposit
    expectDepositOnly(res.payload, false);
  });

  it("contract: live response validates against the shared GuestRiskResult Zod schema", async () => {
    vi.mocked(guestService.findByEmail).mockResolvedValue(
      makeGuest({ noShowCount: 0, riskScore: "trusted" })
    );

    const res = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/guest-risk?email=alice%40example.com",
    });

    const body = JSON.parse(res.payload) as { data: unknown };
    const result = GuestRiskResultSchema.safeParse(body.data);
    expect(result.success).toBe(true);
    expectDepositOnly(res.payload, false);
  });

  it("does not require Authorization and still returns only requiresDeposit", async () => {
    vi.mocked(guestService.findByEmail).mockResolvedValue(
      makeGuest({ noShowCount: 2, riskScore: "risky" })
    );

    const res = await app.inject({
      method: "GET",
      url: "/public/v1/venues/the-oak-table/guest-risk?email=alice%40example.com",
      headers: { authorization: "Bearer not-a-session" },
    });

    expect(res.statusCode).toBe(200);
    expectDepositOnly(res.payload, true);
  });

  it("route description does not say the handler returns a risk score", () => {
    const doc = app.swagger() as {
      paths?: Record<string, { get?: { description?: string; summary?: string } }>;
    };
    const path = Object.keys(doc.paths ?? {}).find((key) => key.endsWith("/guest-risk"));
    const operation = path ? doc.paths?.[path]?.get : undefined;
    expect(operation?.description ?? "").not.toMatch(/risk score/i);
    expect(operation?.summary ?? "").not.toMatch(/risk score/i);
  });

  it("registered GuestRiskResult schema is only requiresDeposit", () => {
    const doc = app.swagger() as {
      components?: { schemas?: Record<string, { properties?: Record<string, unknown> }> };
      paths?: Record<
        string,
        {
          get?: {
            responses?: Record<
              string,
              {
                content?: Record<
                  string,
                  { schema?: { properties?: { data?: { $ref?: string } } } }
                >;
              }
            >;
          };
        }
      >;
    };
    const path = Object.keys(doc.paths ?? {}).find((key) => key.endsWith("/guest-risk"));
    const ref =
      doc.paths?.[path ?? ""]?.get?.responses?.["200"]?.content?.["application/json"]?.schema
        ?.properties?.data?.$ref;
    const name = ref?.split("/").pop() ?? "";
    const schema = doc.components?.schemas?.[name];
    expect(Object.keys(schema?.properties ?? {}).sort()).toEqual(["requiresDeposit"]);
    expect(schema?.properties).not.toHaveProperty("riskScore");
  });
});

describe("GET /public/v1/venues/:slug/guest-risk — rate limiting", () => {
  it("has rate limiting configured at 20 req/min", async () => {
    const freshApp = await buildApp({ logger: false });
    await freshApp.ready();

    // Send 21 requests — the 21st should be rate-limited
    const responses = [];
    for (let i = 0; i < 21; i++) {
      const response = await freshApp.inject({
        method: "GET",
        url: "/public/v1/venues/the-oak-table/guest-risk",
      });
      responses.push(response);
    }

    await freshApp.close();

    // First 20 return 400 (missing email/phone), 21st should be rate limited
    for (let i = 0; i < 20; i++) {
      const response = responses[i];
      if (!response) throw new Error(`expected response at index ${i}`);
      expect(response.statusCode).toBe(400);
    }
    const twentyFirst = responses[20];
    if (!twentyFirst) throw new Error("expected a 21st response");
    expect(twentyFirst.statusCode).toBe(429);
  });
});
