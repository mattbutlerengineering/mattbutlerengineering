import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClient } from "./client.js";
import { AvailabilityClient, HoldsClient } from "./availability.js";

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: { "Content-Type": "application/json" },
  });
}

function makeApiClient() {
  return new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });
}

const fakeTimeSlot = {
  time: "19:00",
  available: true,
  tableIds: ["t1", "t2"],
};

const fakeDateAvailability = {
  date: "2026-06-01",
  available: true,
  slotsCount: 5,
};

const fakeHold = {
  id: "h1",
  venueId: "v1",
  tableId: "t1",
  guestId: "g1",
  date: "2026-06-01",
  startTime: "19:00",
  partySize: 2,
  expiresAt: "2026-06-01T20:00:00Z",
  status: "ACTIVE",
};

const fakeReservation = {
  id: "r1",
  venueId: "v1",
  status: "CONFIRMED",
};

describe("AvailabilityClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("getTimeSlots", () => {
    it("requests /api/v1/availability/:venueId with required params", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [fakeTimeSlot] }));

      await new AvailabilityClient(makeApiClient()).getTimeSlots({
        venueId: "v1",
        date: "2026-06-01",
        partySize: 2,
      });

      const [url] = mockFetch.mock.calls[0]!;
      const parsed = new URL(url as string);
      expect(parsed.pathname).toBe("/api/v1/availability/v1");
      expect(parsed.searchParams.get("date")).toBe("2026-06-01");
      expect(parsed.searchParams.get("partySize")).toBe("2");
    });

    it("includes optional duration when provided", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));

      await new AvailabilityClient(makeApiClient()).getTimeSlots({
        venueId: "v1",
        date: "2026-06-01",
        partySize: 2,
        duration: 90,
      });

      const [url] = mockFetch.mock.calls[0]!;
      expect(new URL(url as string).searchParams.get("duration")).toBe("90");
    });

    it("omits duration when not provided", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));

      await new AvailabilityClient(makeApiClient()).getTimeSlots({
        venueId: "v1",
        date: "2026-06-01",
        partySize: 2,
      });

      const [url] = mockFetch.mock.calls[0]!;
      expect(new URL(url as string).searchParams.has("duration")).toBe(false);
    });

    it("returns the time slots array", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [fakeTimeSlot] }));

      const result = await new AvailabilityClient(makeApiClient()).getTimeSlots({
        venueId: "v1",
        date: "2026-06-01",
        partySize: 2,
      });
      expect(result).toEqual([fakeTimeSlot]);
    });
  });

  describe("getDates", () => {
    it("requests /api/v1/availability/:venueId/dates with params", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [fakeDateAvailability] }));

      await new AvailabilityClient(makeApiClient()).getDates({
        venueId: "v1",
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        partySize: 4,
      });

      const [url] = mockFetch.mock.calls[0]!;
      const parsed = new URL(url as string);
      expect(parsed.pathname).toBe("/api/v1/availability/v1/dates");
      expect(parsed.searchParams.get("startDate")).toBe("2026-06-01");
      expect(parsed.searchParams.get("endDate")).toBe("2026-06-30");
      expect(parsed.searchParams.get("partySize")).toBe("4");
    });

    it("returns the date availability array", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [fakeDateAvailability] }));

      const result = await new AvailabilityClient(makeApiClient()).getDates({
        venueId: "v1",
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        partySize: 4,
      });
      expect(result).toEqual([fakeDateAvailability]);
    });
  });
});

describe("HoldsClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("setSessionId / getSessionId", () => {
    it("stores and retrieves session ID", () => {
      const holdsClient = new HoldsClient(makeApiClient());
      expect(holdsClient.getSessionId()).toBeNull();

      holdsClient.setSessionId("sess-123");
      expect(holdsClient.getSessionId()).toBe("sess-123");
    });
  });

  describe("create", () => {
    it("sends POST /api/v1/holds with x-session-id header", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeHold }));

      const holdsClient = new HoldsClient(makeApiClient());
      holdsClient.setSessionId("sess-abc");

      await holdsClient.create({
        venueId: "v1",
        tableId: "t1",
        date: "2026-06-01",
        time: "19:00",
        partySize: 2,
      });

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/holds");
      expect(options?.method).toBe("POST");
      expect((options?.headers as Record<string, string>)["x-session-id"]).toBe("sess-abc");
    });

    it("generates a sessionId if none is set", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeHold }));

      const holdsClient = new HoldsClient(makeApiClient());
      const result = await holdsClient.create({
        venueId: "v1",
        tableId: "t1",
        date: "2026-06-01",
        time: "19:00",
        partySize: 2,
      });

      expect(result.sessionId).toBeTruthy();
      expect(holdsClient.getSessionId()).toBe(result.sessionId);
    });

    it("returns hold and sessionId", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeHold }));

      const holdsClient = new HoldsClient(makeApiClient());
      holdsClient.setSessionId("sess-xyz");

      const result = await holdsClient.create({
        venueId: "v1",
        tableId: "t1",
        date: "2026-06-01",
        time: "19:00",
        partySize: 2,
      });

      expect(result.hold).toEqual(fakeHold);
      expect(result.sessionId).toBe("sess-xyz");
    });
  });

  describe("get", () => {
    it("requests GET /api/v1/holds/:id and unwraps data", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeHold }));

      const result = await new HoldsClient(makeApiClient()).get("h1");

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/holds/h1");
      expect(result).toEqual(fakeHold);
    });
  });

  describe("release", () => {
    it("sends DELETE /api/v1/holds/:id with x-session-id header", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));

      const holdsClient = new HoldsClient(makeApiClient());
      holdsClient.setSessionId("sess-abc");
      await holdsClient.release("h1");

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/holds/h1");
      expect(options?.method).toBe("DELETE");
      expect((options?.headers as Record<string, string>)["x-session-id"]).toBe("sess-abc");
    });

    it("throws when no session ID is set", async () => {
      const holdsClient = new HoldsClient(makeApiClient());

      await expect(holdsClient.release("h1")).rejects.toThrow("Session ID required");
    });
  });

  describe("confirm", () => {
    it("sends POST /api/v1/holds/:id/confirm with x-session-id header", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeReservation }));

      const holdsClient = new HoldsClient(makeApiClient());
      holdsClient.setSessionId("sess-abc");

      await holdsClient.confirm("h1", {
        guestId: "g1",
        notes: "Window seat please",
      });

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/holds/h1/confirm");
      expect(options?.method).toBe("POST");
      expect((options?.headers as Record<string, string>)["x-session-id"]).toBe("sess-abc");
    });

    it("throws when no session ID is set", async () => {
      const holdsClient = new HoldsClient(makeApiClient());

      await expect(holdsClient.confirm("h1", { guestId: "g1" })).rejects.toThrow(
        "Session ID required"
      );
    });

    it("returns the confirmed reservation", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeReservation }));

      const holdsClient = new HoldsClient(makeApiClient());
      holdsClient.setSessionId("sess-abc");

      const result = await holdsClient.confirm("h1", { guestId: "g1" });
      expect(result).toEqual(fakeReservation);
    });
  });

  describe("error handling", () => {
    it("propagates 404 errors on get", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: "Not Found", message: "Hold not found", statusCode: 404 }, 404)
      );

      await expect(new HoldsClient(makeApiClient()).get("bad")).rejects.toThrow();
    });
  });
});
