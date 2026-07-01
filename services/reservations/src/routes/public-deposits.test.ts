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
    vi.mocked(depositService.create).mockResolvedValueOnce({
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

    // The PaymentIntent id is written in the single create — no second link write.
    const createCall = vi.mocked(depositService.create).mock.calls[0][0];
    expect(createCall.stripePaymentIntentId).toBe("pi_test_abc");
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
    vi.mocked(depositService.create).mockResolvedValueOnce({
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
    vi.mocked(depositService.create).mockResolvedValueOnce({
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

    // The customer id is written atomically in the single deposit create.
    const createCall = vi.mocked(depositService.create).mock.calls[0][0];
    expect(createCall.stripeCustomerId).toBe("cus_abc");
    expect(createCall.stripePaymentIntentId).toBe("pi_test_cus");
    await app.close();
  });

  it("passes an idempotency key derived from reservationId + amount to Stripe", async () => {
    vi.mocked(venueService.getRawBySlug).mockResolvedValueOnce(mockRawVenue);
    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation);
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(null);
    vi.mocked(calculateDepositAmount).mockReturnValueOnce(2500);
    mockPaymentIntents.create.mockResolvedValueOnce({
      id: "pi_test_idem",
      status: "requires_payment_method",
      client_secret: "pi_test_idem_secret",
    });
    vi.mocked(depositService.create).mockResolvedValueOnce(mockDeposit);

    const app = await buildApp({ logger: false });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: TEST_URL,
      payload: { reservationId: "res-1" },
    });

    expect(response.statusCode).toBe(201);
    const requestOptions = mockPaymentIntents.create.mock.calls[0][1] as {
      idempotencyKey?: string;
    };
    expect(requestOptions.idempotencyKey).toBe("res-1:paymentIntent:2500");
    await app.close();
  });

  it("passes a stable customer idempotency key so guest-path retries reuse the same customer + PaymentIntent", async () => {
    // Two identical guest-path attempts model a lost-response retry: attempt 1's
    // response never reaches the client, so it retries before the deposit row is
    // observed. A stable `${reservationId}:customer` key lets Stripe dedupe the
    // customer create, so attempt 2 reuses the same customer instead of minting a
    // second one (which would break the PaymentIntent idempotency and 502).
    vi.mocked(venueService.getRawBySlug).mockResolvedValue(mockRawVenue);
    vi.mocked(reservationService.getById).mockResolvedValue(mockReservation);
    vi.mocked(depositService.getByReservationId).mockResolvedValue(null);
    vi.mocked(calculateDepositAmount).mockReturnValue(2500);
    // Stripe dedupes on the stable idempotency key: same customer + PI both times.
    mockCustomers.create.mockResolvedValue({
      id: "cus_stable",
      email: "jane@example.com",
      name: "Jane Doe",
    });
    mockPaymentIntents.create.mockResolvedValue({
      id: "pi_stable",
      status: "requires_payment_method",
      client_secret: "pi_stable_secret",
    });
    vi.mocked(depositService.create).mockResolvedValue({
      ...mockDeposit,
      stripePaymentIntentId: "pi_stable",
      stripeCustomerId: "cus_stable",
    });

    const app = await buildApp({ logger: false });
    await app.ready();

    const payload = {
      reservationId: "res-1",
      guestEmail: "jane@example.com",
      guestName: "Jane Doe",
    };
    const first = await app.inject({ method: "POST", url: TEST_URL, payload });
    const second = await app.inject({ method: "POST", url: TEST_URL, payload });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);

    // Both attempts sent the SAME stable customer idempotency key.
    const firstKey = (mockCustomers.create.mock.calls[0][1] as { idempotencyKey?: string })
      .idempotencyKey;
    const secondKey = (mockCustomers.create.mock.calls[1][1] as { idempotencyKey?: string })
      .idempotencyKey;
    expect(firstKey).toBe("res-1:customer");
    expect(secondKey).toBe("res-1:customer");

    // Same customer + PaymentIntent surfaced on both attempts — no duplicate hold, no 502.
    const firstBody = first.json<{ data: { clientSecret: string } }>();
    const secondBody = second.json<{ data: { clientSecret: string } }>();
    expect(firstBody.data.clientSecret).toBe("pi_stable_secret");
    expect(secondBody.data.clientSecret).toBe("pi_stable_secret");
  });

  it("returns an ADR-008 problem-details response when createPaymentIntent throws a Stripe error", async () => {
    vi.mocked(venueService.getRawBySlug).mockResolvedValueOnce(mockRawVenue);
    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation);
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(null);
    vi.mocked(calculateDepositAmount).mockReturnValueOnce(2500);
    // Stripe PaymentIntent creation fails with a Stripe error
    const stripeError = Object.assign(new Error("Stripe is down"), {
      type: "StripeConnectionError",
    });
    mockPaymentIntents.create.mockRejectedValueOnce(stripeError);

    const app = await buildApp({ logger: false });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: TEST_URL,
      payload: { reservationId: "res-1" },
    });

    // Must be a structured problem-details envelope, not a raw 500
    expect(response.statusCode).toBe(502);
    const body = response.json<{ status: number; title: string; detail: string }>();
    expect(body.status).toBe(502);
    expect(body.detail).toBeTruthy();
    // A failed PaymentIntent must NOT leave a dangling deposit record
    expect(depositService.create).not.toHaveBeenCalled();
    await app.close();
  });

  it("returns 502 problem-details when createCustomer fails with a RETRIABLE Stripe error", async () => {
    vi.mocked(venueService.getRawBySlug).mockResolvedValueOnce(mockRawVenue);
    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation);
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(null);
    vi.mocked(calculateDepositAmount).mockReturnValueOnce(2500);
    // A retriable transient Stripe failure (connection error) must NOT be
    // swallowed — swallowing would mint a customer-less PaymentIntent under the
    // shared idempotency key, so a later retry that succeeds at customer-create
    // would 502 on the param mismatch. Fail-fast so the retry re-attempts cleanly.
    const stripeError = Object.assign(new Error("Stripe is unreachable"), {
      type: "StripeConnectionError",
    });
    mockCustomers.create.mockRejectedValueOnce(stripeError);

    const app = await buildApp({ logger: false });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: TEST_URL,
      payload: { reservationId: "res-1", guestEmail: "jane@example.com", guestName: "Jane Doe" },
    });

    expect(response.statusCode).toBe(502);
    const body = response.json<{ status: number; title: string; detail: string }>();
    expect(body.status).toBe(502);
    expect(body.detail).toBeTruthy();
    // Must not mint a PaymentIntent nor a dangling deposit on a retriable failure.
    expect(mockPaymentIntents.create).not.toHaveBeenCalled();
    expect(depositService.create).not.toHaveBeenCalled();
    await app.close();
  });

  it("proceeds customer-less (201) when createCustomer fails with a NON-retriable Stripe error", async () => {
    vi.mocked(venueService.getRawBySlug).mockResolvedValueOnce(mockRawVenue);
    vi.mocked(reservationService.getById).mockResolvedValueOnce(mockReservation);
    vi.mocked(depositService.getByReservationId).mockResolvedValueOnce(null);
    vi.mocked(calculateDepositAmount).mockReturnValueOnce(2500);
    // A permanent customer error (invalid request) stays gracefully degraded:
    // the deposit is still worth taking without a Stripe customer attached.
    const stripeError = Object.assign(new Error("No such customer field"), {
      type: "StripeInvalidRequestError",
    });
    mockCustomers.create.mockRejectedValueOnce(stripeError);
    mockPaymentIntents.create.mockResolvedValueOnce({
      id: "pi_test_noncust",
      status: "requires_payment_method",
      client_secret: "pi_test_noncust_secret",
    });
    vi.mocked(depositService.create).mockResolvedValueOnce({
      ...mockDeposit,
      stripePaymentIntentId: "pi_test_noncust",
    });

    const app = await buildApp({ logger: false });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: TEST_URL,
      payload: { reservationId: "res-1", guestEmail: "jane@example.com", guestName: "Jane Doe" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{ data: { clientSecret: string } }>();
    expect(body.data.clientSecret).toBe("pi_test_noncust_secret");
    // PaymentIntent minted without a customer — the intentional graceful path.
    const piCreateCall = mockPaymentIntents.create.mock.calls[0][0] as { customer?: string };
    expect(piCreateCall.customer).toBeUndefined();
    await app.close();
  });

  it("retriable-fail-then-retry-succeeds yields a consistent PaymentIntent customer param (no idempotency mismatch)", async () => {
    vi.mocked(venueService.getRawBySlug).mockResolvedValue(mockRawVenue);
    vi.mocked(reservationService.getById).mockResolvedValue(mockReservation);
    vi.mocked(depositService.getByReservationId).mockResolvedValue(null);
    vi.mocked(calculateDepositAmount).mockReturnValue(2500);
    // Attempt 1: customer-create hits a transient failure → route 502s (no PI minted).
    // Attempt 2 (the retry): customer-create succeeds → PI minted WITH the customer.
    // Because attempt 1 never minted a customer-less PI under the shared key, the
    // single PI create carries the customer with no param mismatch and no 502.
    const stripeError = Object.assign(new Error("Stripe is unreachable"), {
      type: "StripeConnectionError",
    });
    mockCustomers.create
      .mockRejectedValueOnce(stripeError)
      .mockResolvedValueOnce({ id: "cus_retry", email: "jane@example.com", name: "Jane Doe" });
    mockPaymentIntents.create.mockResolvedValue({
      id: "pi_retry",
      status: "requires_payment_method",
      client_secret: "pi_retry_secret",
    });
    vi.mocked(depositService.create).mockResolvedValue({
      ...mockDeposit,
      stripePaymentIntentId: "pi_retry",
      stripeCustomerId: "cus_retry",
    });

    const app = await buildApp({ logger: false });
    await app.ready();

    const payload = {
      reservationId: "res-1",
      guestEmail: "jane@example.com",
      guestName: "Jane Doe",
    };
    const first = await app.inject({ method: "POST", url: TEST_URL, payload });
    const second = await app.inject({ method: "POST", url: TEST_URL, payload });

    expect(first.statusCode).toBe(502);
    expect(second.statusCode).toBe(201);

    // The PaymentIntent was created exactly once (only on the successful retry)
    // and carried the customer — no earlier customer-less PI under the same key.
    expect(mockPaymentIntents.create).toHaveBeenCalledTimes(1);
    const piCreateCall = mockPaymentIntents.create.mock.calls[0][0] as { customer?: string };
    expect(piCreateCall.customer).toBe("cus_retry");
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
