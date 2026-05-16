import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClient } from "./client.js";
import { VenuesClient, VenueGroupsClient } from "./venues.js";

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: { "Content-Type": "application/json" },
  });
}

function makeVenuesClient() {
  const apiClient = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });
  return new VenuesClient(apiClient);
}

function makeGroupsClient() {
  const apiClient = new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 });
  return new VenueGroupsClient(apiClient);
}

const fakeVenue = {
  id: "v1",
  name: "The Grand",
  slug: "the-grand",
  venueGroupId: "vg1",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const fakeVenueGroup = {
  id: "vg1",
  name: "Grand Group",
  slug: "grand-group",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("VenuesClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("list", () => {
    it("requests /api/v1/venues with no query when called with defaults", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [fakeVenue], total: 1, page: 1, limit: 10 })
      );

      await makeVenuesClient().list();

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/venues");
    });

    it("appends filter params when provided", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [], total: 0, page: 1, limit: 10 }));

      await makeVenuesClient().list({ page: 2, limit: 5, venueGroupId: "vg1" });

      const [url] = mockFetch.mock.calls[0]!;
      const parsed = new URL(url as string);
      expect(parsed.searchParams.get("page")).toBe("2");
      expect(parsed.searchParams.get("limit")).toBe("5");
      expect(parsed.searchParams.get("venueGroupId")).toBe("vg1");
    });

    it("returns the paginated response", async () => {
      const body = { data: [fakeVenue], total: 1, page: 1, limit: 10 };
      mockFetch.mockResolvedValueOnce(jsonResponse(body));

      const result = await makeVenuesClient().list();
      expect(result).toEqual(body);
    });
  });

  describe("get", () => {
    it("requests GET /api/v1/venues/:id", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeVenue }));

      await makeVenuesClient().get("v1");

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/venues/v1");
    });

    it("unwraps data", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeVenue }));

      const result = await makeVenuesClient().get("v1");
      expect(result).toEqual(fakeVenue);
    });
  });

  describe("getBySlug", () => {
    it("requests GET /api/v1/venues/by-slug/:slug", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeVenue }));

      await makeVenuesClient().getBySlug("the-grand");

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/venues/by-slug/the-grand");
    });
  });

  describe("create", () => {
    it("sends POST /api/v1/venues with body", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeVenue }));

      await makeVenuesClient().create({
        name: "The Grand",
        venueGroupId: "vg1",
        slug: "the-grand",
        ianaTimezone: "America/New_York",
      });

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/venues");
      expect(options?.method).toBe("POST");
    });

    it("returns the created venue", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeVenue }));

      const result = await makeVenuesClient().create({
        name: "The Grand",
        venueGroupId: "vg1",
        slug: "the-grand",
        ianaTimezone: "America/New_York",
      });
      expect(result).toEqual(fakeVenue);
    });
  });

  describe("update", () => {
    it("sends PATCH /api/v1/venues/:id", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeVenue }));

      await makeVenuesClient().update("v1", { name: "The Grand Updated" });

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/venues/v1");
      expect(options?.method).toBe("PATCH");
    });
  });

  describe("delete", () => {
    it("sends DELETE /api/v1/venues/:id", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

      await makeVenuesClient().delete("v1");

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/venues/v1");
      expect(options?.method).toBe("DELETE");
    });
  });

  describe("error handling", () => {
    it("propagates 4xx errors", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: "Not Found", message: "Venue not found", statusCode: 404 }, 404)
      );

      await expect(makeVenuesClient().get("bad")).rejects.toThrow();
    });
  });
});

describe("VenueGroupsClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("list", () => {
    it("requests /api/v1/venues/groups with default pagination", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [fakeVenueGroup], total: 1, page: 1, limit: 10 })
      );

      await makeGroupsClient().list();

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/venues/groups?page=1&limit=10");
    });
  });

  describe("get", () => {
    it("requests GET /api/v1/venues/groups/:id and unwraps data", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeVenueGroup }));

      const result = await makeGroupsClient().get("vg1");

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/venues/groups/vg1");
      expect(result).toEqual(fakeVenueGroup);
    });
  });

  describe("getBySlug", () => {
    it("requests /api/v1/venues/groups/by-slug/:slug", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeVenueGroup }));

      await makeGroupsClient().getBySlug("grand-group");

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/venues/groups/by-slug/grand-group");
    });
  });

  describe("create", () => {
    it("sends POST /api/v1/venues/groups with body", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeVenueGroup }));

      await makeGroupsClient().create({ name: "Grand Group", slug: "grand-group" });

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/venues/groups");
      expect(options?.method).toBe("POST");
    });
  });

  describe("update", () => {
    it("sends PATCH /api/v1/venues/groups/:id", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeVenueGroup }));

      await makeGroupsClient().update("vg1", { name: "Updated Group" });

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/venues/groups/vg1");
      expect(options?.method).toBe("PATCH");
    });
  });

  describe("delete", () => {
    it("sends DELETE /api/v1/venues/groups/:id", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

      await makeGroupsClient().delete("vg1");

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/venues/groups/vg1");
      expect(options?.method).toBe("DELETE");
    });
  });
});
