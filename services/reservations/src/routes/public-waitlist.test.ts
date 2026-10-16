import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import type { DomainServices } from "../services/domain-services.js";
import { WaitlistJoinResultSchema } from "@mbe/types/schemas";

// Domain services are injected via buildApp({ services }) (issue #6771), so the
// migrated public routes need no vi.mock of their service modules.
const venueService = {
  list: vi.fn(),
  getById: vi.fn(),
  getBySlug: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
} as unknown as DomainServices["venueService"];
const waitlistService = {
  create: vi.fn(),
  listWaiting: vi.fn(),
  getById: vi.fn(),
  withLiveEstimates: vi.fn(),
  seat: vi.fn(),
  cancel: vi.fn(),
  expire: vi.fn(),
} as unknown as DomainServices["waitlistService"];

vi.mock("../services/guest-recognition.js", () => ({
  recognizeGuest: vi.fn(),
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

// ADR-026 §3.3 item 3 / #5369 PR 8: see public-venues.test.ts's identical
// comment for why this is mocked rather than hitting real `$queryRaw`.
// Resolves to `mockVenue.id` so the "ignores a mismatched body.venueId" test
// below still proves the write lands under the slug-resolved venue.
vi.mock("../services/resolve-venue.js", () => ({
  resolveVenueId: vi.fn().mockResolvedValue("venue-1"),
}));

// Import after mocks
import { validatePhone } from "../services/waitlist-notifier.js";
import { resolveVenueId } from "../services/resolve-venue.js";
import {
  generateWaitlistStatusToken,
  WAITLIST_STATUS_TOKEN_TTL_MS,
} from "../services/waitlist-status-token.js";

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
    app = await buildApp({ logger: false, services: { venueService, waitlistService } });
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

  it("returns a null estimate (not 0) when the entry has none, and still matches the shared schema", async () => {
    vi.mocked(waitlistService.create).mockResolvedValue({
      ...mockEntry,
      estimatedWaitMinutes: null,
    } as never);

    const res = await app.inject({
      method: "POST",
      url: "/public/v1/venues/the-oak-table/waitlist",
      payload: validPayload,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload) as { data: { estimatedWaitMinutes: number | null } };
    expect(body.data.estimatedWaitMinutes).toBeNull();
    expect(WaitlistJoinResultSchema.safeParse(body.data).success).toBe(true);
  });

  it("returns a status token, never the bare entry id", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/public/v1/venues/the-oak-table/waitlist",
      payload: validPayload,
    });

    const body = JSON.parse(res.payload) as { data: Record<string, unknown> };
    expect(typeof body.data.statusToken).toBe("string");
    expect(body.data).not.toHaveProperty("entryId");
    expect(res.payload).not.toContain("entry-1");
  });

  it("does not leak guest PII in the response", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/public/v1/venues/the-oak-table/waitlist",
      payload: validPayload,
    });

    const body = JSON.parse(res.payload) as { data: Record<string, unknown> };
    expect(Object.keys(body.data).sort()).toEqual([
      "estimatedWaitMinutes",
      "position",
      "statusToken",
    ]);
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
    vi.mocked(resolveVenueId).mockResolvedValueOnce(null);

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

describe("GET /public/v1/venues/:slug/waitlist/status", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false, services: { venueService, waitlistService } });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveVenueId).mockResolvedValue("venue-1");
    vi.mocked(venueService.getBySlug).mockResolvedValue(mockVenue);
    vi.mocked(waitlistService.getById).mockResolvedValue(mockEntry as never);
    vi.mocked(waitlistService.withLiveEstimates).mockImplementation(((entries: unknown[]) =>
      Promise.resolve(
        entries.map((e) => ({ ...(e as object), estimatedWaitMinutes: 12 }))
      )) as never);
  });

  const urlFor = (token: string, slug = "the-oak-table") =>
    `/public/v1/venues/${slug}/waitlist/status?token=${encodeURIComponent(token)}`;
  const goodToken = () => generateWaitlistStatusToken("entry-1", "venue-1");

  it("returns the live position, computed estimate and status for the token's entry", async () => {
    const res = await app.inject({ method: "GET", url: urlFor(goodToken()) });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as { data: Record<string, unknown> };
    expect(body.data).toEqual({ position: 4, estimatedWaitMinutes: 12, status: "waiting" });
  });

  it("returns a null estimate when the live estimator has none, even if one is stored", async () => {
    vi.mocked(waitlistService.withLiveEstimates).mockImplementation(((entries: unknown[]) =>
      Promise.resolve(
        entries.map((e) => ({ ...(e as object), estimatedWaitMinutes: null }))
      )) as never);

    const res = await app.inject({ method: "GET", url: urlFor(goodToken()) });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as { data: Record<string, unknown> };
    expect(body.data).toEqual({ position: 4, estimatedWaitMinutes: null, status: "waiting" });
  });

  it("rejects a bare entry id used as a token", async () => {
    const res = await app.inject({ method: "GET", url: urlFor("entry-1") });

    expect(res.statusCode).toBe(404);
    expect(waitlistService.getById).not.toHaveBeenCalled();
  });

  it("rejects a token minted for another venue", async () => {
    const res = await app.inject({
      method: "GET",
      url: urlFor(generateWaitlistStatusToken("entry-1", "venue-2")),
    });

    expect(res.statusCode).toBe(404);
  });

  it("rejects an expired token", async () => {
    const old = generateWaitlistStatusToken(
      "entry-1",
      "venue-1",
      Date.now() - WAITLIST_STATUS_TOKEN_TTL_MS - 1000
    );
    const res = await app.inject({ method: "GET", url: urlFor(old) });

    expect(res.statusCode).toBe(404);
  });

  it("returns 404 when the entry belongs to another venue", async () => {
    vi.mocked(waitlistService.getById).mockResolvedValue({
      ...mockEntry,
      venueId: "venue-2",
    } as never);

    const res = await app.inject({ method: "GET", url: urlFor(goodToken()) });

    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for an unknown venue slug", async () => {
    vi.mocked(resolveVenueId).mockResolvedValueOnce(null);

    const res = await app.inject({ method: "GET", url: urlFor(goodToken()) });

    expect(res.statusCode).toBe(404);
    expect(waitlistService.getById).not.toHaveBeenCalled();
  });
});

describe("POST /public/v1/venues/:slug/waitlist — rate limiting", () => {
  it("has rate limiting configured at 20 req/min", async () => {
    const freshApp = await buildApp({ logger: false, services: { venueService, waitlistService } });
    await freshApp.ready();

    // Send 21 requests — the 21st should be rate-limited
    const responses = [];
    for (let i = 0; i < 21; i++) {
      const response = await freshApp.inject({
        method: "POST",
        url: "/public/v1/venues/the-oak-table/waitlist",
        payload: { venueId: "venue-1" },
      });
      responses.push(response);
    }

    await freshApp.close();

    // First 20 return 400 (missing required fields), 21st should be rate limited
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
