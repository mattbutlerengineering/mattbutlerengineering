import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClient, ApiValidationError } from "./client.js";
import { GuestsClient } from "./guests.js";

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
  return new GuestsClient(apiClient);
}

const fakePagination = {
  page: 1,
  limit: 10,
  total: 1,
  totalPages: 1,
  hasNext: false,
  hasPrev: false,
};

const fakeGuest = {
  id: "g1",
  venueId: "v1",
  name: "Bob Smith",
  email: "bob@example.com",
  phone: "+15551234567",
  notes: null,
  visitCount: 0,
  noShowCount: 0,
  riskScore: "standard" as const,
  lifetimeSpend: null,
  lastVisit: null,
  tags: null,
  dietaryRestrictions: null,
  communicationPreference: "email_only" as const,
  staffNotes: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("GuestsClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("list", () => {
    it("requests /api/v1/guests with venueId", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [fakeGuest], pagination: fakePagination })
      );

      await makeClient().list({ venueId: "v1" });

      const [url] = mockFetch.mock.calls[0]!;
      const parsed = new URL(url as string);
      expect(parsed.pathname).toBe("/api/v1/guests");
      expect(parsed.searchParams.get("venueId")).toBe("v1");
    });

    it("appends optional page and limit", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], pagination: { ...fakePagination, page: 2, limit: 5, total: 0 } })
      );

      await makeClient().list({ venueId: "v1", page: 2, limit: 5 });

      const [url] = mockFetch.mock.calls[0]!;
      const parsed = new URL(url as string);
      expect(parsed.searchParams.get("page")).toBe("2");
      expect(parsed.searchParams.get("limit")).toBe("5");
    });

    it("returns paginated response", async () => {
      const body = { data: [fakeGuest], pagination: fakePagination };
      mockFetch.mockResolvedValueOnce(jsonResponse(body));

      const result = await makeClient().list({ venueId: "v1" });
      expect(result).toEqual(body);
    });
  });

  describe("search", () => {
    it("requests /api/v1/guests/search with venueId", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], pagination: { ...fakePagination, total: 0 } })
      );

      await makeClient().search({ venueId: "v1", query: "Bob" });

      const [url] = mockFetch.mock.calls[0]!;
      const parsed = new URL(url as string);
      expect(parsed.pathname).toBe("/api/v1/guests/search");
      expect(parsed.searchParams.get("venueId")).toBe("v1");
      expect(parsed.searchParams.get("query")).toBe("Bob");
    });

    it("includes hasNotVisitedInDays when provided", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], pagination: { ...fakePagination, total: 0 } })
      );

      await makeClient().search({ venueId: "v1", hasNotVisitedInDays: 30 });

      const [url] = mockFetch.mock.calls[0]!;
      const parsed = new URL(url as string);
      expect(parsed.searchParams.get("hasNotVisitedInDays")).toBe("30");
    });
  });

  describe("getSegments", () => {
    it("requests /api/v1/guests/segments with venueId", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));

      await makeClient().getSegments("v1");

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/guests/segments?venueId=v1");
    });

    it("returns the segments array", async () => {
      const segments = [{ name: "VIP", description: "High-value guests", count: 5 }];
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: segments }));

      const result = await makeClient().getSegments("v1");
      expect(result).toEqual(segments);
    });
  });

  describe("get", () => {
    it("requests GET /api/v1/guests/:id and unwraps data", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeGuest }));

      const result = await makeClient().get("g1");

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/guests/g1");
      expect(result).toEqual(fakeGuest);
    });
  });

  describe("create", () => {
    it("sends POST /api/v1/guests with body", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeGuest }));

      await makeClient().create({ venueId: "v1", name: "Bob Smith", email: "bob@example.com" });

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/guests");
      expect(options?.method).toBe("POST");
      expect(JSON.parse(options?.body as string)).toMatchObject({ name: "Bob Smith" });
    });
  });

  describe("findOrCreate", () => {
    it("sends POST /api/v1/guests/find-or-create", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeGuest }));

      await makeClient().findOrCreate({
        venueId: "v1",
        name: "Bob Smith",
        email: "bob@example.com",
      });

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/guests/find-or-create");
      expect(options?.method).toBe("POST");
    });
  });

  describe("update", () => {
    it("sends PATCH /api/v1/guests/:id", async () => {
      const updated = { ...fakeGuest, name: "Robert Smith" };
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: updated }));

      await makeClient().update("g1", { name: "Robert Smith" });

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/guests/g1");
      expect(options?.method).toBe("PATCH");
    });
  });

  describe("delete", () => {
    it("sends DELETE /api/v1/guests/:id", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

      await makeClient().delete("g1");

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/guests/g1");
      expect(options?.method).toBe("DELETE");
    });
  });

  describe("error handling", () => {
    it("propagates 404 errors", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: "Not Found", message: "Guest not found", statusCode: 404 }, 404)
      );

      await expect(makeClient().get("bad")).rejects.toThrow();
    });

    it("propagates network errors", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      await expect(makeClient().list({ venueId: "v1" })).rejects.toThrow(TypeError);
    });
  });

  describe("schema validation", () => {
    it("throws ApiValidationError when get() receives a malformed guest", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: "g1" } }));

      await expect(makeClient().get("g1")).rejects.toBeInstanceOf(ApiValidationError);
    });

    it("throws ApiValidationError when create() receives a malformed guest", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: "g1" } }));

      await expect(
        makeClient().create({ venueId: "v1", name: "Bob", email: "bob@example.com" })
      ).rejects.toBeInstanceOf(ApiValidationError);
    });

    it("throws ApiValidationError when update() receives a malformed guest", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: "g1" } }));

      await expect(makeClient().update("g1", { name: "Robert" })).rejects.toBeInstanceOf(
        ApiValidationError
      );
    });
  });
});

describe("GuestsClient.getRisk", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  const fakeRiskResult = {
    riskScore: "risky",
    noShowCount: 2,
    requiresDeposit: true,
  };

  it("requests GET /public/v1/venues/:slug/guest-risk with email/phone query params", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeRiskResult }));

    await makeClient().getRisk("the-oak-table", { email: "guest@example.com" });

    const [url] = mockFetch.mock.calls[0]!;
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe("/public/v1/venues/the-oak-table/guest-risk");
    expect(parsed.searchParams.get("email")).toBe("guest@example.com");
  });

  it("unwraps and returns the validated guest risk result", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeRiskResult }));

    const result = await makeClient().getRisk("the-oak-table", { phone: "+15551234567" });
    expect(result).toEqual(fakeRiskResult);
  });

  it("throws ApiValidationError when the response is malformed", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { riskScore: "risky" } }));

    await expect(
      makeClient().getRisk("the-oak-table", { email: "guest@example.com" })
    ).rejects.toBeInstanceOf(ApiValidationError);
  });

  it("propagates 404 errors", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: "Not Found", message: "Venue not found", statusCode: 404 }, 404)
    );

    await expect(makeClient().getRisk("missing", { email: "guest@example.com" })).rejects.toThrow();
  });
});

describe("GuestsClient.recognize", () => {
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

    await makeClient().recognize("the-oak-table", "jane@example.com");

    const [url] = mockFetch.mock.calls[0]!;
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe("/public/v1/venues/the-oak-table/guests/recognize");
    expect(parsed.searchParams.get("email")).toBe("jane@example.com");
  });

  it("unwraps and returns the validated recognition result", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeRecognition }));

    const result = await makeClient().recognize("the-oak-table", "jane@example.com");
    expect(result).toEqual(fakeRecognition);
  });

  it("throws ApiValidationError when the response is malformed", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { recognized: true } }));

    await expect(
      makeClient().recognize("the-oak-table", "jane@example.com")
    ).rejects.toBeInstanceOf(ApiValidationError);
  });
});
