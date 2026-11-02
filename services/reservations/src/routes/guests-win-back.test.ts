import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { jwtVerify } from "jose";
import { buildApp } from "../app.js";
import type { DomainServices } from "../services/domain-services.js";

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});
vi.mock("../services/resolve-venue.js", () => ({
  resolveVenueId: vi.fn().mockResolvedValue("venue-1"),
}));
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));
const { claimWinBack, lastWinBackSentAt } = vi.hoisted(() => ({
  claimWinBack: vi.fn(),
  lastWinBackSentAt: vi.fn(),
}));
vi.mock("../services/win-back-store.js", () => ({
  claimWinBack,
  lastWinBackSentAt,
  WIN_BACK_COOLDOWN_MS: 7 * 24 * 60 * 60 * 1000,
}));

const guest = {
  id: "guest-1",
  venueId: "venue-1",
  name: "Alice",
  email: "alice@example.com",
  phone: null,
  communicationPreference: "email_only",
  unsubscribed: false,
};

const guestService = {
  getById: vi.fn(),
  scanLapsedGuests: vi.fn(),
} as unknown as DomainServices["guestService"];
const venueService = {
  getById: vi.fn(),
} as unknown as DomainServices["venueService"];

const notificationPort = { sendWinBack: vi.fn() };

describe("win-back send record (#8041)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.AUTH_AUTHORITY = "https://test.auth0.com";
    process.env.AUTH_AUDIENCE = "https://api.example.com";
    process.env.AUTH_BYPASS_IN_TESTS = "true";
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { sub: "auth0|user-123", email: "test@example.com", email_verified: true },
      protectedHeader: { alg: "RS256" },
    } as never);
    vi.mocked(guestService.getById).mockResolvedValue(guest as never);
    vi.mocked(venueService.getById).mockResolvedValue({ id: "venue-1", name: "Oak" } as never);
    notificationPort.sendWinBack.mockResolvedValue(undefined);
    app = await buildApp({
      logger: false,
      services: { guestService, venueService },
      notificationPort: notificationPort as never,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  const send = () =>
    app.inject({
      method: "POST",
      url: "/api/v1/guests/guest-1/win-back",
      headers: { "x-auth-bypass": "true" },
    });

  it("sends and answers sent:true when the claim is won", async () => {
    claimWinBack.mockResolvedValueOnce({ claimed: true });

    const res = await send();

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ data: { sent: true } });
    expect(claimWinBack).toHaveBeenCalledWith("venue-1", "guest-1", expect.any(Date));
    expect(notificationPort.sendWinBack).toHaveBeenCalledOnce();
  });

  it("answers a distinct 409 win-back-cooldown with the last send time, and sends nothing", async () => {
    claimWinBack.mockResolvedValueOnce({
      claimed: false,
      lastSentAt: new Date("2026-10-30T09:00:00Z"),
    });

    const res = await send();

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body)).toMatchObject({
      status: 409,
      detail: expect.stringContaining("2026-10-30T09:00:00.000Z"),
    });
    expect(notificationPort.sendWinBack).not.toHaveBeenCalled();
  });

  it("still answers sent:false for a guest who can't be emailed, without claiming", async () => {
    vi.mocked(guestService.getById).mockResolvedValue({ ...guest, email: null } as never);

    const res = await send();

    expect(JSON.parse(res.body)).toEqual({ data: { sent: false } });
    expect(claimWinBack).not.toHaveBeenCalled();
  });

  it("returns lastWinBackAt on lapsing guests, null when never sent, read for this venue", async () => {
    vi.mocked(guestService.scanLapsedGuests).mockResolvedValueOnce([
      { guestId: "guest-1", name: "Alice" },
      { guestId: "guest-2", name: "Bo" },
    ] as never);
    lastWinBackSentAt.mockResolvedValueOnce(
      new Map([["guest-1", new Date("2026-10-30T09:00:00Z")]])
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/guests/lapsing?venueId=venue-1",
      headers: { "x-auth-bypass": "true" },
    });

    expect(res.statusCode).toBe(200);
    const { data } = JSON.parse(res.body);
    expect(data.map((g: { lastWinBackAt: string | null }) => g.lastWinBackAt)).toEqual([
      "2026-10-30T09:00:00.000Z",
      null,
    ]);
    expect(lastWinBackSentAt).toHaveBeenCalledWith("venue-1", ["guest-1", "guest-2"]);
  });
});
