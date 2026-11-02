import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { jwtVerify } from "jose";
import type * as WinBackStore from "../services/win-back-store.js";
import { buildApp } from "../app.js";
import { ProviderRejectedError } from "../notifications/provider-rejected-error.js";
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
const { claimWinBack, markWinBackSent, releaseWinBackClaim, winBackStatusFor } = vi.hoisted(() => ({
  claimWinBack: vi.fn(),
  markWinBackSent: vi.fn(),
  releaseWinBackClaim: vi.fn(),
  winBackStatusFor: vi.fn(),
}));
vi.mock("../services/win-back-store.js", async (importOriginal) => ({
  ...(await importOriginal<typeof WinBackStore>()),
  claimWinBack,
  markWinBackSent,
  releaseWinBackClaim,
  winBackStatusFor,
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

  it("sends, then records the sent time, and answers sent:true", async () => {
    claimWinBack.mockResolvedValueOnce({ claimed: true });

    const res = await send();

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ data: { sent: true } });
    expect(claimWinBack).toHaveBeenCalledWith("venue-1", "guest-1", expect.any(Date));
    expect(notificationPort.sendWinBack).toHaveBeenCalledOnce();
    expect(markWinBackSent).toHaveBeenCalledWith(
      "venue-1",
      "guest-1",
      expect.any(Date),
      expect.any(Date)
    );
  });

  it("answers 409 saying a send happened, with when, when the provider confirmed one; sends nothing", async () => {
    claimWinBack.mockResolvedValueOnce({
      claimed: false,
      claimedAt: new Date("2026-10-30T09:00:00Z"),
      sentAt: new Date("2026-10-30T09:00:01Z"),
    });

    const res = await send();

    expect(res.statusCode).toBe(409);
    const { detail } = JSON.parse(res.body);
    expect(detail).toContain("was sent a win-back message on 2026-10-30T09:00:01.000Z");
    expect(detail).toContain("after 2026-11-06T09:00:00.000Z");
    expect(notificationPort.sendWinBack).not.toHaveBeenCalled();
  });

  it("answers 409 saying a send was attempted and may not have gone out when it was never confirmed", async () => {
    claimWinBack.mockResolvedValueOnce({
      claimed: false,
      claimedAt: new Date("2026-10-30T09:00:00Z"),
      sentAt: null,
    });

    const res = await send();

    expect(res.statusCode).toBe(409);
    const { detail } = JSON.parse(res.body);
    expect(detail).toContain("attempted on 2026-10-30T09:00:00.000Z");
    expect(detail).toContain("may not have gone out");
    expect(detail).not.toMatch(/was sent a win-back/);
  });

  it("releases the claim and answers 424 when the provider rejects: nothing was sent, a retry is possible", async () => {
    claimWinBack.mockResolvedValueOnce({ claimed: true });
    notificationPort.sendWinBack.mockRejectedValueOnce(
      new ProviderRejectedError("Resend send failed (rate_limit_exceeded): Too many requests")
    );

    const res = await send();

    expect(res.statusCode).toBe(424);
    expect(JSON.parse(res.body).detail).toMatch(/Nothing was sent.*try again/i);
    expect(releaseWinBackClaim).toHaveBeenCalledWith("venue-1", "guest-1", expect.any(Date));
    expect(markWinBackSent).not.toHaveBeenCalled();
  });

  it("keeps the claim on an ambiguous failure: a 500, no release, no sent time", async () => {
    claimWinBack.mockResolvedValueOnce({ claimed: true });
    notificationPort.sendWinBack.mockRejectedValueOnce(new Error("socket hang up"));

    const res = await send();

    expect(res.statusCode).toBe(500);
    expect(releaseWinBackClaim).not.toHaveBeenCalled();
    expect(markWinBackSent).not.toHaveBeenCalled();
  });

  it("still answers sent:false for a guest who can't be emailed, without claiming", async () => {
    vi.mocked(guestService.getById).mockResolvedValue({ ...guest, email: null } as never);

    const res = await send();

    expect(JSON.parse(res.body)).toEqual({ data: { sent: false } });
    expect(claimWinBack).not.toHaveBeenCalled();
  });

  it("returns lastWinBackAt (confirmed sends only) and winBackAttemptedAt (unconfirmed claims), read for this venue", async () => {
    vi.mocked(guestService.scanLapsedGuests).mockResolvedValueOnce([
      { guestId: "guest-1", name: "Alice" },
      { guestId: "guest-2", name: "Bo" },
      { guestId: "guest-3", name: "Cy" },
    ] as never);
    winBackStatusFor.mockResolvedValueOnce(
      new Map([
        ["guest-1", { sentAt: new Date("2026-10-30T09:00:00Z"), attemptedAt: null }],
        ["guest-2", { sentAt: null, attemptedAt: new Date("2026-10-31T09:00:00Z") }],
      ])
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/guests/lapsing?venueId=venue-1",
      headers: { "x-auth-bypass": "true" },
    });

    expect(res.statusCode).toBe(200);
    const { data } = JSON.parse(res.body);
    expect(
      data.map((g: { lastWinBackAt: string | null; winBackAttemptedAt: string | null }) => [
        g.lastWinBackAt,
        g.winBackAttemptedAt,
      ])
    ).toEqual([
      ["2026-10-30T09:00:00.000Z", null],
      [null, "2026-10-31T09:00:00.000Z"],
      [null, null],
    ]);
    expect(winBackStatusFor).toHaveBeenCalledWith("venue-1", ["guest-1", "guest-2", "guest-3"]);
  });
});
