import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../services/venue.js", () => ({
  venueService: {
    getRawBySlug: vi.fn(),
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

vi.mock("../services/deposit.js", () => ({
  depositService: {
    getByReservationId: vi.fn(),
    create: vi.fn(),
    linkPaymentIntent: vi.fn(),
    getById: vi.fn(),
    apply: vi.fn(),
    refund: vi.fn(),
    forfeit: vi.fn(),
  },
  calculateDepositAmount: vi.fn(),
}));

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

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

import { buildApp } from "../app.js";
import { venueService } from "../services/venue.js";
import { reservationService } from "../services/reservation.js";
import { depositService, calculateDepositAmount } from "../services/deposit.js";
import type { Reservation } from "@mbe/types";
import type { Deposit } from "../generated/prisma/index.js";

const TEST_URL = "/public/v1/venues/test-venue/deposits/payment-intent";

const mockRawVenue = {
  id: "venue-1",
  venueGroupId: null,
  name: "Test Venue",
  slug: "test-venue",
  ianaTimezone: "America/Los_Angeles",
  currencyCode: "USD",
  operatingHours: null,
  settings: null,
  depositEnabled: true,
  depositType: "flat" as const,
  depositAmountCents: 2500,
  freeCancellationHours: null,
  lateCancellationFeePercent: null,
  noShowFeePercent: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const mockReservation: Reservation = {
  id: "res-1",
  venueId: "venue-1",
  tableId: "table-1",
  guestId: null,
  guestName: "Jane Doe",
  guestEmail: "jane@example.com",
  guestPhone: null,
  userId: null,
  date: "2026-07-15",
  startTime: "2026-07-15T19:00:00.000Z",
  endTime: "2026-07-15T21:00:00.000Z",
  partySize: 2,
  status: "PENDING",
  notes: null,
  occasion: null,
  seatingPreference: null,
  cancellationReason: null,
  cancellationNote: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const mockDeposit: Deposit = {
  id: "dep-1",
  reservationId: "res-1",
  amountCents: 2500,
  currency: "usd",
  status: "pending",
  stripePaymentIntentId: null,
  stripeCustomerId: null,
  heldAt: null,
  appliedAt: null,
  refundedAt: null,
  forfeitedAt: null,
  feeAmountCents: null,
  refundAmountCents: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("POST /public/v1/venues/:slug/deposits/payment-intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when venue is not found", async () => {
    vi.mocked(venueService.getRawBySlug).mockResolvedValueOnce(null);

    const app = await buildApp({ logger: false });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: TEST_URL,
      payload: { reservationId: "res-1" },
    });

    expect(response.statusCode).toBe(404);
    const body = response.json<{ detail: string }>();
    expect(body.detail).toContain("test-venue");
    await app.close();
  });

  it("returns 422 when deposits are disabled for the venue", async () => {
    vi.mocked(venueService.getRawBySlug).mockResolvedValueOnce({
      ...mockRawVenue,
      depositEnabled: false,
    });

    const app = await buildApp({ logger: false });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: TEST_URL,
      payload: { reservationId: "res-1" },
    });

    expect(response.statusCode).toBe(422);
    const body = response.json<{ detail: string }>();
    expect(body.detail).toContain("not enabled");
    await app.close();
  });

  it("returns 404 when reservation does not belong to the venue", async () => {
    vi.mocked(venueService.getRawBySlug).mockResolvedValueOnce(mockRawVenue);
    // Reservation from a different venue
    vi.mocked(reservationService.getById).mockResolvedValueOnce({
      ...mockReservation,
      venueId: "other-venue",
    });

    const app = await buildApp({ logger: false });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: TEST_URL,
      payload: { reservationId: "res-1" },
    });

    expect(response.statusCode).toBe(404);
    const body = response.json<{ detail: string }>();
    expect(body.detail).toContain("Reservation not found");
    await app.close();
  });

  it("returns 404 when reservation is not found at all", async () => {
    vi.mocked(venueService.getRawBySlug).mockResolvedValueOnce(mockRawVenue);
    vi.mocked(reservationService.getById).mockResolvedValueOnce(null);

    const app = await buildApp({ logger: false });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: TEST_URL,
      payload: { reservationId: "res-1" },
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("returns 409 when a deposit already exists for the reservation (idempotency guard)", async () => {
    vi.mocked(venueService.getRawBySlug).mockResolvedValueOnce(mockRawVenue);
    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation);
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(mockDeposit);

    const app = await buildApp({ logger: false });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: TEST_URL,
      payload: { reservationId: "res-1" },
    });

    expect(response.statusCode).toBe(409);
    const body = response.json<{ detail: string }>();
    expect(body.detail).toContain("deposit already exists");
    await app.close();
  });

  it("returns 201 with clientSecret on the happy path", async () => {
    vi.mocked(venueService.getRawBySlug).mockResolvedValueOnce(mockRawVenue);
    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation);
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(null);
    vi.mocked(calculateDepositAmount).mockReturnValueOnce(2500);
    mockPaymentIntents.create.mockResolvedValueOnce({
      id: "pi_test_abc",
      status: "requires_payment_method",
      client_secret: "pi_test_abc_secret",
    });
    vi.mocked(depositService.create).mockResolvedValueOnce(mockDeposit);
    vi.mocked(depositService.linkPaymentIntent).mockResolvedValueOnce({
      ...mockDeposit,
      stripePaymentIntentId: "pi_test_abc",
    });

    const app = await buildApp({ logger: false });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: TEST_URL,
      payload: { reservationId: "res-1" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{
      data: { clientSecret: string; depositId: string; amountCents: number; currency: string };
    }>();
    expect(body.data.clientSecret).toBe("pi_test_abc_secret");
    expect(body.data.depositId).toBe("dep-1");
    expect(body.data.amountCents).toBe(2500);
    expect(body.data.currency).toBe("usd");
    await app.close();
  });

  it("continues without a Stripe customer when createCustomer fails (silent swallow)", async () => {
    vi.mocked(venueService.getRawBySlug).mockResolvedValueOnce(mockRawVenue);
    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation);
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(null);
    vi.mocked(calculateDepositAmount).mockReturnValueOnce(2500);
    // Stripe customer creation fails
    mockCustomers.create.mockRejectedValueOnce(new Error("Stripe customer error"));
    // PaymentIntent still succeeds (no customerId attached)
    mockPaymentIntents.create.mockResolvedValueOnce({
      id: "pi_test_xyz",
      status: "requires_payment_method",
      client_secret: "pi_test_xyz_secret",
    });
    vi.mocked(depositService.create).mockResolvedValueOnce(mockDeposit);
    vi.mocked(depositService.linkPaymentIntent).mockResolvedValueOnce({
      ...mockDeposit,
      stripePaymentIntentId: "pi_test_xyz",
    });

    const app = await buildApp({ logger: false });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: TEST_URL,
      payload: { reservationId: "res-1", guestEmail: "jane@example.com", guestName: "Jane Doe" },
    });

    // Route should still succeed — customer failure is non-fatal
    expect(response.statusCode).toBe(201);
    const body = response.json<{
      data: { clientSecret: string };
    }>();
    expect(body.data.clientSecret).toBe("pi_test_xyz_secret");

    // PaymentIntent was created without a customer
    const piCreateCall = mockPaymentIntents.create.mock.calls[0][0] as {
      customer?: string;
    };
    expect(piCreateCall.customer).toBeUndefined();
    await app.close();
  });

  it("attaches Stripe customer when guestEmail and guestName are provided", async () => {
    vi.mocked(venueService.getRawBySlug).mockResolvedValueOnce(mockRawVenue);
    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation);
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(null);
    vi.mocked(calculateDepositAmount).mockReturnValueOnce(2500);
    mockCustomers.create.mockResolvedValueOnce({
      id: "cus_abc",
      email: "jane@example.com",
      name: "Jane Doe",
    });
    mockPaymentIntents.create.mockResolvedValueOnce({
      id: "pi_test_cus",
      status: "requires_payment_method",
      client_secret: "pi_test_cus_secret",
    });
    vi.mocked(depositService.create).mockResolvedValueOnce(mockDeposit);
    vi.mocked(depositService.linkPaymentIntent).mockResolvedValueOnce({
      ...mockDeposit,
      stripePaymentIntentId: "pi_test_cus",
      stripeCustomerId: "cus_abc",
    });

    const app = await buildApp({ logger: false });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: TEST_URL,
      payload: { reservationId: "res-1", guestEmail: "jane@example.com", guestName: "Jane Doe" },
    });

    expect(response.statusCode).toBe(201);

    // PaymentIntent was created with the customer ID
    const piCreateCall = mockPaymentIntents.create.mock.calls[0][0] as { customer?: string };
    expect(piCreateCall.customer).toBe("cus_abc");
    await app.close();
  });

  it("returns 400 when reservationId is missing from body", async () => {
    const app = await buildApp({ logger: false });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: TEST_URL,
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
