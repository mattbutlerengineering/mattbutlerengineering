import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClient, ApiValidationError } from "./client.js";
import { DepositsClient } from "./deposits.js";

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
  return new DepositsClient(apiClient);
}

const fakeDeposit = {
  id: "dep_1",
  reservationId: "res_1",
  amountCents: 2500,
  currency: "usd",
  status: "held",
  stripePaymentIntentId: "pi_1",
  stripeCustomerId: null,
  heldAt: "2026-05-26T00:00:00Z",
  appliedAt: null,
  refundedAt: null,
  forfeitedAt: null,
  createdAt: "2026-05-26T00:00:00Z",
  updatedAt: "2026-05-26T00:00:00Z",
};

describe("DepositsClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("create", () => {
    it("POSTs /api/v1/deposits and unwraps the validated deposit", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeDeposit }));

      const result = await makeClient().create({
        reservationId: "res_1",
        amountCents: 2500,
        currency: "usd",
      });

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/deposits");
      expect(options?.method).toBe("POST");
      expect(JSON.parse(options?.body as string)).toEqual({
        reservationId: "res_1",
        amountCents: 2500,
        currency: "usd",
      });
      expect(result).toEqual(fakeDeposit);
    });
  });

  describe("get", () => {
    it("GETs /api/v1/deposits/:id and unwraps the validated deposit", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeDeposit }));

      const result = await makeClient().get("dep_1");

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/deposits/dep_1");
      expect(options?.method ?? "GET").toBe("GET");
      expect(result).toEqual(fakeDeposit);
    });

    it("throws ApiValidationError when the deposit envelope is malformed", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: "dep_1" } }));

      await expect(makeClient().get("dep_1")).rejects.toBeInstanceOf(ApiValidationError);
    });
  });

  describe("capture", () => {
    it("POSTs /api/v1/deposits/:id/capture and returns the deposit", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: { ...fakeDeposit, status: "applied", appliedAt: "2026-05-27T00:00:00Z" } })
      );

      const result = await makeClient().capture("dep_1");

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/deposits/dep_1/capture");
      expect(options?.method).toBe("POST");
      expect(result.status).toBe("applied");
    });
  });

  describe("refund", () => {
    it("POSTs /api/v1/deposits/:id/refund and returns the deposit", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: { ...fakeDeposit, status: "refunded", refundedAt: "2026-05-27T00:00:00Z" } })
      );

      const result = await makeClient().refund("dep_1");

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/deposits/dep_1/refund");
      expect(options?.method).toBe("POST");
      expect(result.status).toBe("refunded");
    });
  });

  describe("forfeit", () => {
    it("POSTs /api/v1/deposits/:id/forfeit and returns the deposit", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: { ...fakeDeposit, status: "forfeited", forfeitedAt: "2026-05-27T00:00:00Z" } })
      );

      const result = await makeClient().forfeit("dep_1");

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/deposits/dep_1/forfeit");
      expect(result.status).toBe("forfeited");
    });
  });

  describe("transition", () => {
    it("dispatches to the action-specific endpoint", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeDeposit }));

      await makeClient().transition("dep_9", "capture");

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/deposits/dep_9/capture");
    });
  });

  it("throws ApiValidationError when the response fails schema validation", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: { ...fakeDeposit, status: "not-a-real-status" } })
    );

    await expect(makeClient().create({ reservationId: "res_1", amountCents: 2500 })).rejects.toThrow(
      ApiValidationError
    );
  });
});
