import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { generateUnsubscribeToken } from "../services/post-visit-notifier.js";

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

vi.mock("jose", () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => vi.fn()),
}));

vi.mock("../services/reservation.js", () => ({
  reservationService: {
    getById: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../services/venue.js", () => ({
  venueService: {
    list: vi.fn(),
    getById: vi.fn(),
    getBySlug: vi.fn(),
  },
}));

vi.mock("../services/guest.js", () => ({
  guestService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    search: vi.fn(),
    markUnsubscribed: vi.fn(),
  },
}));

// ADR-026 §3.3 item 4 / #5369 PR 8: this route now resolves the guest's
// venue via `resolveVenueId` — see public-venues.test.ts's identical comment
// for why this is mocked rather than hitting real `$queryRaw`.
vi.mock("../services/resolve-venue.js", () => ({
  resolveVenueId: vi.fn().mockResolvedValue("venue-1"),
}));

import { guestService } from "../services/guest.js";
import { resolveVenueId } from "../services/resolve-venue.js";

describe("GET /public/v1/guests/unsubscribe", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.AUTH_AUTHORITY = "https://test.auth0.com";
    process.env.AUTH_AUDIENCE = "https://api.example.com";
    app = await buildApp({ logger: false });
    await app.ready();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 400 when token is missing", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/public/v1/guests/unsubscribe",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("MISSING_TOKEN");
  });

  it("returns 400 when token is invalid", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/public/v1/guests/unsubscribe?token=not-valid-token",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("INVALID_TOKEN");
  });

  it("calls markUnsubscribed and returns 200 HTML for valid token", async () => {
    const token = generateUnsubscribeToken("guest-abc");
    vi.mocked(guestService.markUnsubscribed).mockResolvedValueOnce(undefined);

    const response = await app.inject({
      method: "GET",
      url: `/public/v1/guests/unsubscribe?token=${token}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(guestService.markUnsubscribed).toHaveBeenCalledWith("guest-abc");
    expect(response.body).toContain("unsubscribed");
  });

  it("returns 404 with a code extension when the guest no longer exists (ADR-026 §3.3 item 4)", async () => {
    const token = generateUnsubscribeToken("guest-gone");
    vi.mocked(resolveVenueId).mockResolvedValueOnce(null);

    const response = await app.inject({
      method: "GET",
      url: `/public/v1/guests/unsubscribe?token=${token}`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("GUEST_NOT_FOUND");
    expect(guestService.markUnsubscribed).not.toHaveBeenCalled();
  });

  it("returns 500 with the canonical RFC title when markUnsubscribed fails", async () => {
    const token = generateUnsubscribeToken("guest-abc");
    vi.mocked(guestService.markUnsubscribed).mockRejectedValueOnce(new Error("db down"));

    const response = await app.inject({
      method: "GET",
      url: `/public/v1/guests/unsubscribe?token=${token}`,
    });

    expect(response.statusCode).toBe(500);
    expect(response.json().title).toBe("Internal Server Error");
  });
});

describe("GET /public/v1/guests/unsubscribe — rate limiting", () => {
  it("has rate limiting configured at 10 req/min", async () => {
    process.env.AUTH_AUTHORITY = "https://test.auth0.com";
    process.env.AUTH_AUDIENCE = "https://api.example.com";
    const freshApp = await buildApp({ logger: false });
    await freshApp.ready();

    // Send 11 requests — the 11th should be rate-limited
    const responses = [];
    for (let i = 0; i < 11; i++) {
      const response = await freshApp.inject({
        method: "GET",
        url: "/public/v1/guests/unsubscribe",
      });
      responses.push(response);
    }

    await freshApp.close();

    // First 10 return 400 (missing token), 11th should be rate limited
    for (let i = 0; i < 10; i++) {
      const response = responses[i];
      if (!response) throw new Error(`expected response at index ${i}`);
      expect(response.statusCode).toBe(400);
    }
    const eleventh = responses[10];
    if (!eleventh) throw new Error("expected an 11th response");
    expect(eleventh.statusCode).toBe(429);
  });
});
