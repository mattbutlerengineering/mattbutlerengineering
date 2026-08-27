import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClient, ApiValidationError } from "./client.js";
import { WaitlistClient } from "./waitlist.js";

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
  return new WaitlistClient(apiClient);
}

const fakeEntry = {
  id: "w1",
  venueId: "v1",
  partySize: 2,
  guestName: "Jane Doe",
  guestPhone: "+15551234567",
  position: 1,
  estimatedWaitMinutes: 20,
  status: "waiting",
  notifiedAt: null,
  expiresAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("WaitlistClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("list", () => {
    it("requests GET /api/v1/waitlist with venueId query param", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [fakeEntry] }));

      await makeClient().list("v1");

      const [url, options] = mockFetch.mock.calls[0]!;
      const parsed = new URL(url as string);
      expect(parsed.pathname).toBe("/api/v1/waitlist");
      expect(parsed.searchParams.get("venueId")).toBe("v1");
      expect(options?.method ?? "GET").toBe("GET");
    });

    it("returns the unwrapped array of entries", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [fakeEntry] }));

      const result = await makeClient().list("v1");
      expect(result).toEqual([fakeEntry]);
    });

    it("throws ApiValidationError when data is not an array", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeEntry }));

      await expect(makeClient().list("v1")).rejects.toBeInstanceOf(ApiValidationError);
    });
  });

  describe("get", () => {
    it("requests GET /api/v1/waitlist/:id", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeEntry }));

      await makeClient().get("w1");

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/waitlist/w1");
      expect(options?.method ?? "GET").toBe("GET");
    });

    it("unwraps data from the ApiResponse envelope", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeEntry }));

      const result = await makeClient().get("w1");
      expect(result).toEqual(fakeEntry);
    });

    it("throws ApiValidationError when response is malformed", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: "w1" } }));

      await expect(makeClient().get("w1")).rejects.toBeInstanceOf(ApiValidationError);
    });
  });

  describe("create", () => {
    it("sends POST /api/v1/waitlist with body", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeEntry }, 201));

      await makeClient().create({
        venueId: "v1",
        partySize: 2,
        guestName: "Jane Doe",
        guestPhone: "+15551234567",
      });

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/waitlist");
      expect(options?.method).toBe("POST");
      expect(JSON.parse(options?.body as string)).toMatchObject({
        venueId: "v1",
        partySize: 2,
        guestName: "Jane Doe",
        guestPhone: "+15551234567",
      });
    });

    it("returns the created entry", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeEntry }, 201));

      const result = await makeClient().create({
        venueId: "v1",
        partySize: 2,
        guestName: "Jane Doe",
        guestPhone: "+15551234567",
      });
      expect(result).toEqual(fakeEntry);
    });

    it("throws ApiValidationError when response is malformed", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: "w1" } }, 201));

      await expect(
        makeClient().create({
          venueId: "v1",
          partySize: 2,
          guestName: "Jane Doe",
          guestPhone: "+15551234567",
        })
      ).rejects.toBeInstanceOf(ApiValidationError);
    });
  });

  describe("seat", () => {
    it("sends PUT /api/v1/waitlist/:id/seat", async () => {
      const seated = { ...fakeEntry, status: "seated" };
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: seated }));

      await makeClient().seat("w1");

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/waitlist/w1/seat");
      expect(options?.method).toBe("PUT");
    });
  });

  describe("cancel", () => {
    it("sends PUT /api/v1/waitlist/:id/cancel", async () => {
      const cancelled = { ...fakeEntry, status: "cancelled" };
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: cancelled }));

      await makeClient().cancel("w1");

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/waitlist/w1/cancel");
      expect(options?.method).toBe("PUT");
    });
  });

  describe("notify", () => {
    it("sends PUT /api/v1/waitlist/:id/notify", async () => {
      const notified = { ...fakeEntry, status: "notified" };
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: notified }));

      await makeClient().notify("w1");

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/waitlist/w1/notify");
      expect(options?.method).toBe("PUT");
    });
  });

  describe("expire", () => {
    it("sends PUT /api/v1/waitlist/:id/expire", async () => {
      const expired = { ...fakeEntry, status: "expired" };
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: expired }));

      await makeClient().expire("w1");

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/waitlist/w1/expire");
      expect(options?.method).toBe("PUT");
    });

    it("throws ApiValidationError when response is malformed", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: "w1" } }));

      await expect(makeClient().expire("w1")).rejects.toBeInstanceOf(ApiValidationError);
    });
  });

  describe("error handling", () => {
    it("propagates 404 errors", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: "Not Found", message: "Not found", statusCode: 404 }, 404)
      );

      await expect(makeClient().get("bad")).rejects.toThrow();
    });

    it("propagates network errors", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      await expect(makeClient().list("v1")).rejects.toThrow(TypeError);
    });
  });
});
