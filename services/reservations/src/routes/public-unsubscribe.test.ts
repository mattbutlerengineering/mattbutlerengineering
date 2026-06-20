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

import { guestService } from "../services/guest.js";

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
  });

  it("returns 400 when token is invalid", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/public/v1/guests/unsubscribe?token=not-valid-token",
    });

    expect(response.statusCode).toBe(400);
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
});
