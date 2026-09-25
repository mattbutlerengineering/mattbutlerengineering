import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDepositDb, mockGuestDb, mockReservationDb } = vi.hoisted(() => ({
  mockDepositDb: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  mockGuestDb: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  // ADR-026: `deposits` carries no venue_id column, so every deposit route
  // resolves its venue scope through the owning reservation.
  mockReservationDb: {
    findUnique: vi.fn(),
  },
}));

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: { deposit: mockDepositDb, guest: mockGuestDb, reservation: mockReservationDb },
  });
});

const { mockPaymentIntents, mockCustomers } = vi.hoisted(() => ({
  mockPaymentIntents: {
    create: vi.fn(),
    capture: vi.fn(),
    cancel: vi.fn(),
  },
  mockCustomers: {
    create: vi.fn(),
  },
}));

vi.mock("stripe", () => {
  class MockStripe {
    paymentIntents = mockPaymentIntents;
    customers = mockCustomers;
    webhooks = { constructEvent: vi.fn() };
    constructor(_key: string) {}
  }
  return { default: MockStripe };
});

// Mock auth so we don't need real JWT
vi.mock("@mbe/auth/fastify", () => ({
  requireAuth: vi.fn(async (request: { user?: unknown }) => {
    request.user = {
      sub: "auth0|user-123",
      iss: "https://test.auth0.com/",
      aud: "https://api.example.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      email: "test@example.com",
      email_verified: true,
      name: "Test User",
      picture: "https://example.com/pic.jpg",
      permissions: ["admin"],
    };
  }),
  optionalAuth: vi.fn(async () => {}),
  hasPermission: vi.fn(
    (user: { permissions?: string[] } | undefined, permission: string) =>
      Array.isArray(user?.permissions) && user.permissions.includes(permission)
  ),
  requireOwnershipOrAdmin: vi.fn().mockReturnValue(vi.fn(async () => {})),
  requireAdmin: vi.fn(
    async (
      request: { user?: { permissions?: string[] } },
      reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } }
    ) => {
      const isAdmin =
        Array.isArray(request.user?.permissions) && request.user.permissions.includes("admin");
      if (!isAdmin) {
        reply.code(403).send({
          type: "about:blank",
          status: 403,
          title: "Forbidden",
          detail: "Admin role required",
        });
      }
    }
  ),
  requireVenueAccess: vi.fn(() => vi.fn(async () => {})),
  // buildApp registers venueRoutes, whose create route imports this guard at
  // registration time. These specs exercise deposits, not venue bootstrap, so
  // the stub admits every request.
  requireVenueCreateAccess: vi.fn(() => vi.fn(async () => {})),
}));

import { requireAuth } from "@mbe/auth/fastify";
import { buildApp } from "../app.js";
import { getCurrentVenueId } from "../services/venue-context-store.js";
import type { Deposit } from "../generated/prisma/index.js";

function makeDeposit(overrides: Partial<Deposit> = {}): Deposit {
  return {
    id: "dep-123",
    reservationId: "res-123",
    amountCents: 5000,
    currency: "usd",
    status: "pending",
    stripePaymentIntentId: null,
    stripeCustomerId: null,
    heldAt: null,
    appliedAt: null,
    refundedAt: null,
    forfeitedAt: null,
    forfeitOrigin: null,
    uncollectableAt: null,
    feeAmountCents: null,
    refundAmountCents: null,
    createdAt: new Date("2026-01-25T00:00:00.000Z"),
    updatedAt: new Date("2026-01-25T00:00:00.000Z"),
    ...overrides,
  };
}

const ADMIN_TOKEN = "Bearer test-token";
const VENUE_ID = "venue-1";

/** Route constants — the one place this suite spells the deposits path. */
const DEPOSITS_URL = "/api/v1/deposits";
const depositUrl = (id: string, action?: string): string =>
  action ? `${DEPOSITS_URL}/${id}/${action}` : `${DEPOSITS_URL}/${id}`;

describe("Deposit API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // ADR-026 venue scoping: every deposit route resolves its venue through
    // the owning reservation. Default to a resolvable venue so the existing
    // specs exercise the happy path; the fail-closed specs override it.
    mockReservationDb.findUnique.mockResolvedValue({ venueId: VENUE_ID });
  });

  describe("POST /api/v1/deposits", () => {
    it("creates a deposit and returns 201 with pending status", async () => {
      const mockDeposit = makeDeposit();
      mockDepositDb.create.mockResolvedValueOnce(mockDeposit);

      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: DEPOSITS_URL,
        headers: { authorization: ADMIN_TOKEN },
        payload: {
          reservationId: "res-123",
          amountCents: 5000,
          currency: "usd",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body) as { data: Deposit };
      expect(body.data.status).toBe("pending");
      await app.close();
    });

    it("returns 400 if reservationId is missing", async () => {
      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: DEPOSITS_URL,
        headers: { authorization: ADMIN_TOKEN },
        payload: {
          amountCents: 5000,
        },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it("returns 400 if amountCents is missing", async () => {
      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: DEPOSITS_URL,
        headers: { authorization: ADMIN_TOKEN },
        payload: {
          reservationId: "res-123",
        },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });
  });

  describe("GET /api/v1/deposits/:id", () => {
    it("returns a deposit by id", async () => {
      const mockDeposit = makeDeposit();
      // Two reads: the scope-determining lookup, then the venue-scoped read
      // whose row is actually returned (ADR-026).
      mockDepositDb.findUnique.mockResolvedValue(mockDeposit);

      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "GET",
        url: depositUrl("dep-123"),
        headers: { authorization: ADMIN_TOKEN },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { data: Deposit };
      expect(body.data.id).toBe("dep-123");
      await app.close();
    });

    it("returns 404 if deposit not found", async () => {
      mockDepositDb.findUnique.mockResolvedValueOnce(null);

      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "GET",
        url: depositUrl("not-found"),
        headers: { authorization: ADMIN_TOKEN },
      });

      expect(response.statusCode).toBe(404);
      await app.close();
    });
  });

  describe("POST /api/v1/deposits/:id/capture", () => {
    it("captures (applies) a held deposit and returns 200", async () => {
      const heldDeposit = makeDeposit({
        status: "held",
        stripePaymentIntentId: "pi_test_123",
        heldAt: new Date(),
      });
      const appliedDeposit = makeDeposit({ status: "applied", appliedAt: new Date() });

      // getById (route check) + apply (service._requireDeposit + CAS + post-CAS fetch)
      mockDepositDb.findUnique
        .mockResolvedValueOnce(heldDeposit) // route existence check
        .mockResolvedValueOnce(heldDeposit) // service._requireDeposit
        .mockResolvedValueOnce(appliedDeposit); // post-CAS fetch
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPaymentIntents.capture.mockResolvedValueOnce({
        id: "pi_test_123",
        status: "succeeded",
      });

      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: depositUrl("dep-123", "capture"),
        headers: { authorization: ADMIN_TOKEN },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { data: Deposit };
      expect(body.data.status).toBe("applied");
      await app.close();
    });

    it("returns 404 if deposit not found", async () => {
      mockDepositDb.findUnique.mockResolvedValueOnce(null);

      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: depositUrl("not-found", "capture"),
        headers: { authorization: ADMIN_TOKEN },
      });

      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it("returns 422 if deposit is not in held state", async () => {
      const pendingDeposit = makeDeposit({ status: "pending" });
      // route check + service._requireDeposit
      mockDepositDb.findUnique
        .mockResolvedValueOnce(pendingDeposit)
        .mockResolvedValueOnce(pendingDeposit);

      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: depositUrl("dep-123", "capture"),
        headers: { authorization: ADMIN_TOKEN },
      });

      expect(response.statusCode).toBe(422);
      await app.close();
    });
  });

  describe("POST /api/v1/deposits/:id/refund", () => {
    it("refunds a held deposit and returns 200", async () => {
      const heldDeposit = makeDeposit({
        status: "held",
        stripePaymentIntentId: "pi_test_123",
        heldAt: new Date(),
      });
      const refundedDeposit = makeDeposit({ status: "refunded", refundedAt: new Date() });

      mockDepositDb.findUnique
        .mockResolvedValueOnce(heldDeposit) // route existence check
        .mockResolvedValueOnce(heldDeposit) // service._requireDeposit
        .mockResolvedValueOnce(refundedDeposit); // post-CAS fetch
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPaymentIntents.cancel.mockResolvedValueOnce({
        id: "pi_test_123",
        status: "canceled",
      });

      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: depositUrl("dep-123", "refund"),
        headers: { authorization: ADMIN_TOKEN },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { data: Deposit };
      expect(body.data.status).toBe("refunded");
      await app.close();
    });

    it("returns 422 if deposit is not in held state", async () => {
      const appliedDeposit = makeDeposit({ status: "applied" });
      mockDepositDb.findUnique
        .mockResolvedValueOnce(appliedDeposit)
        .mockResolvedValueOnce(appliedDeposit);

      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: depositUrl("dep-123", "refund"),
        headers: { authorization: ADMIN_TOKEN },
      });

      expect(response.statusCode).toBe(422);
      await app.close();
    });
  });

  describe("POST /api/v1/deposits/:id/forfeit", () => {
    it("forfeits a held deposit and returns 200", async () => {
      const heldDeposit = makeDeposit({
        status: "held",
        stripePaymentIntentId: "pi_test_123",
        heldAt: new Date(),
      });
      const forfeitedDeposit = makeDeposit({ status: "forfeited", forfeitedAt: new Date() });

      mockDepositDb.findUnique
        .mockResolvedValueOnce(heldDeposit) // route existence check
        .mockResolvedValueOnce(heldDeposit) // service._requireDeposit
        .mockResolvedValueOnce(forfeitedDeposit); // post-CAS fetch
      mockDepositDb.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPaymentIntents.capture.mockResolvedValueOnce({
        id: "pi_test_123",
        status: "succeeded",
      });

      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: depositUrl("dep-123", "forfeit"),
        headers: { authorization: ADMIN_TOKEN },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { data: Deposit };
      expect(body.data.status).toBe("forfeited");
      await app.close();
    });

    it("returns 422 if deposit is not in held state", async () => {
      const pendingDeposit = makeDeposit({ status: "pending" });
      mockDepositDb.findUnique
        .mockResolvedValueOnce(pendingDeposit)
        .mockResolvedValueOnce(pendingDeposit);

      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: depositUrl("dep-123", "forfeit"),
        headers: { authorization: ADMIN_TOKEN },
      });

      expect(response.statusCode).toBe(422);
      await app.close();
    });
  });

  describe("non-admin authorization", () => {
    beforeEach(() => {
      vi.mocked(requireAuth).mockImplementationOnce(async (request: { user?: unknown }) => {
        request.user = {
          sub: "auth0|guest-456",
          iss: "https://test.auth0.com/",
          aud: "https://api.example.com",
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
          email: "guest@example.com",
          email_verified: true,
          name: "Guest User",
          picture: "https://example.com/pic.jpg",
          permissions: [],
        };
      });
    });

    it("returns 403 for POST /api/v1/deposits as non-admin", async () => {
      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: DEPOSITS_URL,
        headers: { authorization: ADMIN_TOKEN },
        payload: { reservationId: "res-123", amountCents: 5000 },
      });

      expect(response.statusCode).toBe(403);
      await app.close();
    });

    it("returns 403 for GET /api/v1/deposits/:id as non-admin", async () => {
      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "GET",
        url: depositUrl("dep-123"),
        headers: { authorization: ADMIN_TOKEN },
      });

      expect(response.statusCode).toBe(403);
      await app.close();
    });

    it("returns 403 for POST /api/v1/deposits/:id/capture as non-admin", async () => {
      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: depositUrl("dep-123", "capture"),
        headers: { authorization: ADMIN_TOKEN },
      });

      expect(response.statusCode).toBe(403);
      await app.close();
    });

    it("returns 403 for POST /api/v1/deposits/:id/refund as non-admin", async () => {
      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: depositUrl("dep-123", "refund"),
        headers: { authorization: ADMIN_TOKEN },
      });

      expect(response.statusCode).toBe(403);
      await app.close();
    });

    it("returns 403 for POST /api/v1/deposits/:id/forfeit as non-admin", async () => {
      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: depositUrl("dep-123", "forfeit"),
        headers: { authorization: ADMIN_TOKEN },
      });

      expect(response.statusCode).toBe(403);
      await app.close();
    });
  });

  /**
   * ADR-026 (#5382): these five admin routes carry no venueId of their own —
   * only an opaque deposit/reservation id — so nothing set `app.venue_id` for
   * them and the `deposit_isolation` policy would make every deposit
   * invisible to staff under default-deny. Each spec below proves the venue
   * context is actually LIVE at the moment the deposit query is issued, by
   * reading `getCurrentVenueId()` from inside the Prisma mock.
   */
  describe("ADR-026 venue context", () => {
    /** Records the venue context observed at the moment the query ran. */
    function observeVenueContext(): { current: string | null | undefined } {
      return { current: undefined };
    }

    it("POST / runs the create inside the reservation's resolved venue context", async () => {
      const observed = observeVenueContext();
      mockDepositDb.create.mockImplementationOnce(async () => {
        observed.current = getCurrentVenueId();
        return makeDeposit();
      });

      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: DEPOSITS_URL,
        headers: { authorization: ADMIN_TOKEN },
        payload: { reservationId: "res-123", amountCents: 5000, currency: "usd" },
      });

      expect(response.statusCode).toBe(201);
      expect(observed.current).toBe(VENUE_ID);
      expect(mockReservationDb.findUnique).toHaveBeenCalledWith({
        where: { id: "res-123" },
        select: { venueId: true },
      });
      await app.close();
    });

    it("GET /:id returns the row read inside the resolved venue context", async () => {
      const observed = observeVenueContext();
      mockDepositDb.findUnique
        .mockResolvedValueOnce(makeDeposit()) // scope-determining lookup
        .mockImplementationOnce(async () => {
          observed.current = getCurrentVenueId();
          return makeDeposit();
        });

      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "GET",
        url: depositUrl("dep-123"),
        headers: { authorization: ADMIN_TOKEN },
      });

      expect(response.statusCode).toBe(200);
      expect(observed.current).toBe(VENUE_ID);
      await app.close();
    });

    // Acceptance criterion 3: admin capture/refund/forfeit still succeed with
    // `app.venue_id` scoping active — the transition's compare-and-swap write
    // (the money-adjacent statement the RLS policy governs) sees the venue.
    it.each([
      ["capture", "applied", mockPaymentIntents.capture],
      ["refund", "refunded", mockPaymentIntents.cancel],
      ["forfeit", "forfeited", mockPaymentIntents.capture],
    ] as const)(
      "%s succeeds and writes inside the resolved venue context",
      async (action, expectedStatus, stripeCall) => {
        const heldDeposit = makeDeposit({
          status: "held",
          stripePaymentIntentId: "pi_test_123",
          heldAt: new Date(),
        });
        const transitioned = makeDeposit({ status: expectedStatus });
        mockDepositDb.findUnique
          .mockResolvedValueOnce(heldDeposit) // route existence check
          .mockResolvedValueOnce(heldDeposit) // service._requireDeposit
          .mockResolvedValueOnce(transitioned); // post-CAS fetch

        const observed = observeVenueContext();
        mockDepositDb.updateMany.mockImplementationOnce(async () => {
          observed.current = getCurrentVenueId();
          return { count: 1 };
        });
        stripeCall.mockResolvedValueOnce({ id: "pi_test_123", status: "succeeded" });

        const app = await buildApp({ logger: false });
        await app.ready();

        const response = await app.inject({
          method: "POST",
          url: depositUrl("dep-123", action),
          headers: { authorization: ADMIN_TOKEN },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body) as { data: Deposit };
        expect(body.data.status).toBe(expectedStatus);
        expect(observed.current).toBe(VENUE_ID);
        // The Stripe call still fires, unchanged, with its idempotency key.
        expect(stripeCall).toHaveBeenCalledTimes(1);
        await app.close();
      }
    );

    it("POST / rejects a reservation that does not exist, without creating a deposit", async () => {
      mockReservationDb.findUnique.mockResolvedValue(null);

      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: DEPOSITS_URL,
        headers: { authorization: ADMIN_TOKEN },
        payload: { reservationId: "res-missing", amountCents: 5000 },
      });

      expect(response.statusCode).toBe(404);
      expect(mockDepositDb.create).not.toHaveBeenCalled();
      await app.close();
    });

    it("POST / rejects a reservation with no venue (never treated as venue-less)", async () => {
      mockReservationDb.findUnique.mockResolvedValue({ venueId: null });

      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "POST",
        url: DEPOSITS_URL,
        headers: { authorization: ADMIN_TOKEN },
        payload: { reservationId: "res-123", amountCents: 5000 },
      });

      expect(response.statusCode).toBe(404);
      expect(mockDepositDb.create).not.toHaveBeenCalled();
      await app.close();
    });

    it("GET /:id rejects a deposit whose reservation is gone", async () => {
      mockDepositDb.findUnique.mockResolvedValue(makeDeposit());
      mockReservationDb.findUnique.mockResolvedValue(null);

      const app = await buildApp({ logger: false });
      await app.ready();

      const response = await app.inject({
        method: "GET",
        url: depositUrl("dep-123"),
        headers: { authorization: ADMIN_TOKEN },
      });

      expect(response.statusCode).toBe(404);
      await app.close();
    });

    // Fail closed on a PAYMENT surface: an unresolvable venue must stop the
    // transition before any money moves — no CAS write, no Stripe call.
    it.each([
      ["capture", mockPaymentIntents.capture],
      ["refund", mockPaymentIntents.cancel],
      ["forfeit", mockPaymentIntents.capture],
    ] as const)(
      "%s rejects an unresolvable venue before any money moves",
      async (action, stripeCall) => {
        mockDepositDb.findUnique.mockResolvedValue(
          makeDeposit({ status: "held", stripePaymentIntentId: "pi_test_123", heldAt: new Date() })
        );
        mockReservationDb.findUnique.mockResolvedValue({ venueId: null });

        const app = await buildApp({ logger: false });
        await app.ready();

        const response = await app.inject({
          method: "POST",
          url: depositUrl("dep-123", action),
          headers: { authorization: ADMIN_TOKEN },
        });

        expect(response.statusCode).toBe(404);
        expect(mockDepositDb.updateMany).not.toHaveBeenCalled();
        expect(stripeCall).not.toHaveBeenCalled();
        await app.close();
      }
    );
  });
});
