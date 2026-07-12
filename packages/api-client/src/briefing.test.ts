import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClient, ApiClientError } from "./client.js";
import { BriefingClient } from "./briefing.js";
import type { BriefingEntry } from "./briefing.js";

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
  return new BriefingClient(apiClient);
}

const fakeEntry: BriefingEntry = {
  id: "b1",
  date: "2026-06-01",
  startTime: "19:00",
  endTime: "20:30",
  partySize: 2,
  status: "CONFIRMED",
  notes: null,
  cancellationReason: null,
  cancellationNote: null,
  guestName: "Jane Doe",
  guestId: "g1",
  userId: null,
  occasion: null,
  seatingPreference: null,
  tableId: "t1",
  table: null,
  venueId: "v1",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  guest: null,
};

describe("BriefingClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("list", () => {
    it("requests GET /api/v1/briefing with date and venueId query params", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [fakeEntry] }));

      await makeClient().list({ date: "2026-06-01", venueId: "v1" });

      const [url] = mockFetch.mock.calls[0]!;
      const parsed = new URL(url as string);
      expect(parsed.pathname).toBe("/api/v1/briefing");
      expect(parsed.searchParams.get("date")).toBe("2026-06-01");
      expect(parsed.searchParams.get("venueId")).toBe("v1");
    });

    it("unwraps data from ApiResponse", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [fakeEntry] }));

      const result = await makeClient().list({ date: "2026-06-01", venueId: "v1" });
      expect(result).toEqual([fakeEntry]);
    });

    it("propagates 404 errors", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: "Not Found", message: "Not found", statusCode: 404 }, 404)
      );

      await expect(makeClient().list({ date: "2026-06-01", venueId: "v1" })).rejects.toThrow(
        ApiClientError
      );
    });
  });
});
