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
const { inviteMember, listMembers, revokeMember } = vi.hoisted(() => ({
  inviteMember: vi.fn(),
  listMembers: vi.fn(),
  revokeMember: vi.fn(),
}));
vi.mock("../services/guest-membership.js", () => ({ inviteMember, listMembers, revokeMember }));

const guest = { id: "guest-1", venueId: "venue-1", name: "Alice", email: "alice@example.com" };
const guestService = {
  getById: vi.fn(),
  findOrCreate: vi.fn(),
} as unknown as DomainServices["guestService"];
const venueService = { getById: vi.fn() } as unknown as DomainServices["venueService"];
const notificationPort = { sendClosureEmail: vi.fn() };

const headers = { "x-auth-bypass": "true" };

describe("Regulars Club member routes (#9626)", () => {
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
    vi.mocked(guestService.findOrCreate).mockResolvedValue(guest as never);
    vi.mocked(venueService.getById).mockResolvedValue({
      id: "venue-1",
      name: "Oak",
      slug: "oak",
    } as never);
    inviteMember.mockResolvedValue({
      id: "m1",
      guestId: "guest-1",
      tier: "REGULAR",
      status: "ACTIVE",
      invitedAt: new Date("2026-11-01T10:00:00Z"),
      revokedAt: null,
    });
    notificationPort.sendClosureEmail.mockResolvedValue(undefined);
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

  it("lists members with guest name and email", async () => {
    listMembers.mockResolvedValue([
      {
        id: "m1",
        venueId: "venue-1",
        guestId: "guest-1",
        tier: "REGULAR",
        status: "ACTIVE",
        invitedAt: new Date("2026-11-01T10:00:00Z"),
        revokedAt: null,
        guest: { name: "Alice", email: "alice@example.com" },
      },
    ]);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/guests/members?venueId=venue-1",
      headers,
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toEqual([
      {
        id: "m1",
        guestId: "guest-1",
        guestName: "Alice",
        guestEmail: "alice@example.com",
        tier: "REGULAR",
        status: "ACTIVE",
        invitedAt: "2026-11-01T10:00:00.000Z",
        revokedAt: null,
      },
    ]);
  });

  const invite = () =>
    app.inject({
      method: "POST",
      url: "/api/v1/guests/members",
      headers,
      payload: { venueId: "venue-1", email: "alice@example.com", name: "Alice" },
    });

  it("invites: 201 and emails the member link", async () => {
    const res = await invite();

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).data.guestName).toBe("Alice");
    const mail = notificationPort.sendClosureEmail.mock.calls[0]![0] as {
      to: string;
      html: string;
    };
    expect(mail.to).toBe("alice@example.com");
    expect(mail.html).toContain("/book/oak?member=");
  });

  it("answers 424 with a problem detail when the email fails, never a silent success", async () => {
    notificationPort.sendClosureEmail.mockRejectedValue(new Error("boom"));

    const res = await invite();

    expect(res.statusCode).toBe(424);
    const body = JSON.parse(res.body);
    expect(body.title).toBe("Failed Dependency");
    expect(body.detail).toContain("invitation email");
    expect(body.detail).toContain("invite again");
  });

  it("revokes an active member", async () => {
    revokeMember.mockResolvedValue(true);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/guests/guest-1/revoke-membership",
      headers,
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ data: { revoked: true } });
    expect(revokeMember).toHaveBeenCalledWith({ venueId: "venue-1", guestId: "guest-1" });
  });

  it("answers 404 when there is no active membership to revoke", async () => {
    revokeMember.mockResolvedValue(false);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/guests/guest-1/revoke-membership",
      headers,
    });

    expect(res.statusCode).toBe(404);
  });
});
