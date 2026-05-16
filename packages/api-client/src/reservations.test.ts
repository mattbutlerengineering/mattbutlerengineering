import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClient } from "./client.js";
import { ReservationsClient } from "./reservations.js";

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
  return new ReservationsClient(apiClient);
}

const fakeReservation = {
  id: "r1",
  venueId: "v1",
  guestId: "g1",
  tableId: "t1",
  partySize: 2,
  status: "CONFIRMED",
  date: "2026-06-01",
  startTime: "19:00",
  durationMinutes: 90,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("ReservationsClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("list", () => {
    it("requests /api/v1/reservations with no params when called with defaults", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [fakeReservation], total: 1, page: 1, limit: 10 })
      );

      await makeClient().list();

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/reservations");
    });

    it("appends filter query params", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], total: 0, page: 1, limit: 10 })
      );

      await makeClient().list({ venueId: "v1", date: "2026-06-01", status: "CONFIRMED" });

      const [url] = mockFetch.mock.calls[0]!;
      const parsed = new URL(url as string);
      expect(parsed.searchParams.get("venueId")).toBe("v1");
      expect(parsed.searchParams.get("date")).toBe("2026-06-01");
      expect(parsed.searchParams.get("status")).toBe("CONFIRMED");
    });

    it("returns the paginated response directly", async () => {
      const body = { data: [fakeReservation], total: 1, page: 1, limit: 10 };
      mockFetch.mockResolvedValueOnce(jsonResponse(body));

      const result = await makeClient().list();
      expect(result).toEqual(body);
    });
  });

  describe("me", () => {
    it("requests /api/v1/reservations/me with pagination", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], total: 0, page: 1, limit: 10 })
      );

      await makeClient().me();

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/reservations/me?page=1&limit=10");
    });

    it("passes custom page and limit", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], total: 0, page: 3, limit: 5 })
      );

      await makeClient().me(3, 5);

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/reservations/me?page=3&limit=5");
    });
  });

  describe("get", () => {
    it("requests GET /api/v1/reservations/:id", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeReservation }));

      await makeClient().get("r1");

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/reservations/r1");
    });

    it("unwraps data from ApiResponse", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeReservation }));

      const result = await makeClient().get("r1");
      expect(result).toEqual(fakeReservation);
    });
  });

  describe("create", () => {
    it("sends POST /api/v1/reservations with body", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeReservation }));

      await makeClient().create({
        venueId: "v1",
        guestId: "g1",
        tableId: "t1",
        partySize: 2,
        date: "2026-06-01",
        startTime: "19:00",
        endTime: "21:00",
      });

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/reservations");
      expect(options?.method).toBe("POST");
    });

    it("returns the created reservation", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeReservation }));

      const result = await makeClient().create({
        venueId: "v1",
        guestId: "g1",
        tableId: "t1",
        partySize: 2,
        date: "2026-06-01",
        startTime: "19:00",
        endTime: "21:00",
      });
      expect(result).toEqual(fakeReservation);
    });
  });

  describe("update", () => {
    it("sends PATCH /api/v1/reservations/:id", async () => {
      const updated = { ...fakeReservation, partySize: 4 };
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: updated }));

      await makeClient().update("r1", { partySize: 4 });

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/reservations/r1");
      expect(options?.method).toBe("PATCH");
      expect(JSON.parse(options?.body as string)).toMatchObject({ partySize: 4 });
    });
  });

  describe("cancel", () => {
    it("sends DELETE /api/v1/reservations/:id", async () => {
      const cancelled = { ...fakeReservation, status: "CANCELLED" };
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: cancelled }));

      await makeClient().cancel("r1");

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/reservations/r1");
      expect(options?.method).toBe("DELETE");
    });
  });

  describe("cancelWithReason", () => {
    it("delegates to update with CANCELLED status", async () => {
      const cancelled = { ...fakeReservation, status: "CANCELLED" };
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: cancelled }));

      await makeClient().cancelWithReason("r1", {
        cancellationReason: "guest_request",
        cancellationNote: "Changed plans",
      });

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/reservations/r1");
      expect(options?.method).toBe("PATCH");
      const body = JSON.parse(options?.body as string);
      expect(body.status).toBe("CANCELLED");
      expect(body.cancellationReason).toBe("guest_request");
    });
  });

  describe("walkIn", () => {
    it("sends POST /api/v1/reservations/walk-in", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeReservation }));

      await makeClient().walkIn({ partySize: 2, tableId: "t1", venueId: "v1" });

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/reservations/walk-in");
      expect(options?.method).toBe("POST");
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

      await expect(makeClient().list()).rejects.toThrow(TypeError);
    });
  });
});
