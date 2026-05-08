import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClient } from "./client.js";
import { TablesClient } from "./tables.js";

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
  return new TablesClient(apiClient);
}

const fakeTable = {
  id: "t1",
  venueId: "v1",
  name: "Table 1",
  minCapacity: 2,
  maxCapacity: 4,
  status: "AVAILABLE",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("TablesClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("list", () => {
    it("requests /api/v1/tables with no params by default", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [fakeTable], total: 1, page: 1, limit: 10 })
      );

      await makeClient().list();

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/tables");
    });

    it("appends filter params when provided", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [], total: 0, page: 1, limit: 10 })
      );

      await makeClient().list({ venueId: "v1", activeOnly: true, page: 1, limit: 20 });

      const [url] = mockFetch.mock.calls[0]!;
      const parsed = new URL(url as string);
      expect(parsed.searchParams.get("venueId")).toBe("v1");
      expect(parsed.searchParams.get("activeOnly")).toBe("true");
      expect(parsed.searchParams.get("page")).toBe("1");
      expect(parsed.searchParams.get("limit")).toBe("20");
    });

    it("returns the paginated response", async () => {
      const body = { data: [fakeTable], total: 1, page: 1, limit: 10 };
      mockFetch.mockResolvedValueOnce(jsonResponse(body));

      const result = await makeClient().list();
      expect(result).toEqual(body);
    });
  });

  describe("get", () => {
    it("requests GET /api/v1/tables/:id and unwraps data", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeTable }));

      const result = await makeClient().get("t1");

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/tables/t1");
      expect(result).toEqual(fakeTable);
    });
  });

  describe("create", () => {
    it("sends POST /api/v1/tables with body", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeTable }));

      await makeClient().create({
        venueId: "v1",
        name: "Table 1",
        minCapacity: 2,
        maxCapacity: 4,
      });

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/tables");
      expect(options?.method).toBe("POST");
      expect(JSON.parse(options?.body as string)).toMatchObject({ name: "Table 1" });
    });

    it("returns the created table", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeTable }));

      const result = await makeClient().create({
        venueId: "v1",
        name: "Table 1",
        minCapacity: 2,
        maxCapacity: 4,
      });
      expect(result).toEqual(fakeTable);
    });
  });

  describe("update", () => {
    it("sends PATCH /api/v1/tables/:id", async () => {
      const updated = { ...fakeTable, name: "Table 1A" };
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: updated }));

      await makeClient().update("t1", { name: "Table 1A" });

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/tables/t1");
      expect(options?.method).toBe("PATCH");
    });
  });

  describe("delete", () => {
    it("sends DELETE /api/v1/tables/:id", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

      await makeClient().delete("t1");

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/tables/t1");
      expect(options?.method).toBe("DELETE");
    });
  });

  describe("updateStatus", () => {
    it("sends PATCH /api/v1/tables/:id/status with status body", async () => {
      const updated = { ...fakeTable, status: "OCCUPIED" };
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: updated }));

      await makeClient().updateStatus("t1", "OCCUPIED");

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/tables/t1/status");
      expect(options?.method).toBe("PATCH");
      expect(JSON.parse(options?.body as string)).toEqual({ status: "OCCUPIED" });
    });

    it("returns the updated table", async () => {
      const updated = { ...fakeTable, status: "OCCUPIED" };
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: updated }));

      const result = await makeClient().updateStatus("t1", "OCCUPIED");
      expect(result).toEqual(updated);
    });
  });

  describe("error handling", () => {
    it("propagates 404 errors", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: "Not Found", message: "Table not found", statusCode: 404 }, 404)
      );

      await expect(makeClient().get("bad")).rejects.toThrow();
    });

    it("propagates network errors", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      await expect(makeClient().list()).rejects.toThrow(TypeError);
    });
  });
});
