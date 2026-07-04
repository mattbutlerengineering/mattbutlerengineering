import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClient, ApiValidationError } from "./client.js";
import { PublicVenueClient } from "./public-venue.js";

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: { "Content-Type": "application/json" },
  });
}

function makeClient() {
  const apiClient = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });
  return new PublicVenueClient(apiClient);
}

describe("PublicVenueClient.guestRisk", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  const fakeRiskResult = {
    riskScore: "risky",
    requiresDeposit: true,
  };

  it("requests GET /public/v1/venues/:slug/guest-risk with email/phone query params", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeRiskResult }));

    await makeClient().guestRisk("the-oak-table", { email: "guest@example.com" });

    const [url] = mockFetch.mock.calls[0]!;
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe("/public/v1/venues/the-oak-table/guest-risk");
    expect(parsed.searchParams.get("email")).toBe("guest@example.com");
  });

  it("unwraps and returns the validated guest risk result", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeRiskResult }));

    const result = await makeClient().guestRisk("the-oak-table", { phone: "+15551234567" });
    expect(result).toEqual(fakeRiskResult);
  });

  it("throws ApiValidationError when the response is malformed", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { riskScore: "risky" } }));

    await expect(
      makeClient().guestRisk("the-oak-table", { email: "guest@example.com" })
    ).rejects.toBeInstanceOf(ApiValidationError);
  });

  it("propagates 404 errors", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: "Not Found", message: "Venue not found", statusCode: 404 }, 404)
    );

    await expect(
      makeClient().guestRisk("missing", { email: "guest@example.com" })
    ).rejects.toThrow();
  });
});

describe("PublicVenueClient.recognizeGuest", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  const fakeRecognition = {
    recognized: true,
    firstName: "Jane",
    visitCount: 5,
    hasPreferences: true,
    lastVisit: "2026-05-01T12:00:00.000Z",
  };

  it("requests GET /public/v1/venues/:slug/guests/recognize with email query param", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeRecognition }));

    await makeClient().recognizeGuest("the-oak-table", "jane@example.com");

    const [url] = mockFetch.mock.calls[0]!;
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe("/public/v1/venues/the-oak-table/guests/recognize");
    expect(parsed.searchParams.get("email")).toBe("jane@example.com");
  });

  it("unwraps and returns the validated recognition result", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeRecognition }));

    const result = await makeClient().recognizeGuest("the-oak-table", "jane@example.com");
    expect(result).toEqual(fakeRecognition);
  });

  it("throws ApiValidationError when the response is malformed", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { recognized: true } }));

    await expect(
      makeClient().recognizeGuest("the-oak-table", "jane@example.com")
    ).rejects.toBeInstanceOf(ApiValidationError);
  });

  it("propagates errors from the server", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: "Not Found", message: "Venue not found", statusCode: 404 }, 404)
    );

    await expect(makeClient().recognizeGuest("missing", "jane@example.com")).rejects.toThrow();
  });
});

describe("PublicVenueClient.joinWaitlist", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  const joinPayload = {
    venueId: "v1",
    partySize: 4,
    guestName: "Jane Doe",
    guestPhone: "+15551234567",
  };

  it("sends POST /public/v1/venues/:slug/waitlist with the payload", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: { position: 3, estimatedWaitMinutes: 45 } })
    );

    await makeClient().joinWaitlist("the-oak-table", joinPayload);

    const [url, options] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://api.test.com/public/v1/venues/the-oak-table/waitlist");
    expect(options?.method).toBe("POST");
    expect(JSON.parse(options?.body as string)).toEqual(joinPayload);
  });

  it("unwraps and returns the validated waitlist join result", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: { position: 3, estimatedWaitMinutes: 45 } })
    );

    const result = await makeClient().joinWaitlist("the-oak-table", joinPayload);
    expect(result).toEqual({ position: 3, estimatedWaitMinutes: 45 });
  });

  it("throws ApiValidationError when the response is malformed", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { position: 3 } }));

    await expect(makeClient().joinWaitlist("the-oak-table", joinPayload)).rejects.toBeInstanceOf(
      ApiValidationError
    );
  });

  it("propagates errors from the server", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: "Bad Request", message: "Invalid payload", statusCode: 400 }, 400)
    );

    await expect(makeClient().joinWaitlist("the-oak-table", joinPayload)).rejects.toThrow();
  });
});

describe("PublicVenueClient.depositIntent", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  const fakeIntent = {
    clientSecret: "pi_secret_test",
    depositId: "dep-1",
    amountCents: 2500,
    currency: "usd",
  };

  it("sends POST /public/v1/venues/:slug/deposits/payment-intent with the payload", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeIntent }));

    await makeClient().depositIntent("the-oak-table", { reservationId: "res-123" });

    const [url, options] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://api.test.com/public/v1/venues/the-oak-table/deposits/payment-intent");
    expect(options?.method).toBe("POST");
    expect(JSON.parse(options?.body as string)).toEqual({ reservationId: "res-123" });
  });

  it("unwraps and returns the validated payment intent", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeIntent }));

    const result = await makeClient().depositIntent("the-oak-table", {
      reservationId: "res-123",
    });
    expect(result).toEqual(fakeIntent);
  });

  it("throws ApiValidationError when the response is malformed", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { clientSecret: "pi_secret_test" } }));

    await expect(
      makeClient().depositIntent("the-oak-table", { reservationId: "res-123" })
    ).rejects.toBeInstanceOf(ApiValidationError);
  });

  it("propagates errors from the server", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: "Conflict", message: "Deposit already exists", statusCode: 409 }, 409)
    );

    await expect(
      makeClient().depositIntent("the-oak-table", { reservationId: "res-123" })
    ).rejects.toThrow();
  });
});

describe("PublicVenueClient.getDepositPolicy", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  const fakeConfig = {
    name: "The Oak Table",
    slug: "the-oak-table",
    ianaTimezone: "America/Los_Angeles",
    currencyCode: "USD",
    operatingHours: null,
    settings: {},
    deposit: {
      enabled: true,
      depositType: "flat",
      amountCents: 5000,
      freeCancellationHours: 24,
      lateCancellationFeePercent: 50,
      noShowFeePercent: 100,
    },
  };

  it("GETs /public/v1/venues/:slug and returns only the deposit block", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeConfig }));

    const result = await makeClient().getDepositPolicy("the-oak-table");

    const [url, options] = mockFetch.mock.calls[0]!;
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe("/public/v1/venues/the-oak-table");
    expect(options?.method ?? "GET").toBe("GET");
    expect(result).toEqual(fakeConfig.deposit);
  });

  it("throws ApiValidationError when the venue config envelope is malformed", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { slug: "the-oak-table" } }));

    await expect(makeClient().getDepositPolicy("the-oak-table")).rejects.toBeInstanceOf(
      ApiValidationError
    );
  });

  it("propagates 404 errors", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: "Not Found", message: "Venue not found", statusCode: 404 }, 404)
    );

    await expect(makeClient().getDepositPolicy("missing")).rejects.toThrow();
  });
});
