import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiClient } from "./client.js";
import { FloorPlansClient } from "./floor-plans.js";

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
  return new FloorPlansClient(apiClient);
}

const fakeFloorPlan = {
  id: "fp1",
  venueId: "v1",
  name: "Main Floor",
  isActive: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

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

describe("FloorPlansClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("list", () => {
    it("requests /api/v1/floor-plans with no params by default", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: [fakeFloorPlan], total: 1, page: 1, limit: 10 })
      );

      await makeClient().list();

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/floor-plans");
    });

    it("appends venueId filter when provided", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [], total: 0, page: 1, limit: 10 }));

      await makeClient().list({ venueId: "v1", page: 1, limit: 5 });

      const [url] = mockFetch.mock.calls[0]!;
      const parsed = new URL(url as string);
      expect(parsed.searchParams.get("venueId")).toBe("v1");
      expect(parsed.searchParams.get("page")).toBe("1");
      expect(parsed.searchParams.get("limit")).toBe("5");
    });
  });

  describe("getById / get", () => {
    it("requests GET /api/v1/floor-plans/:id and unwraps data", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeFloorPlan }));

      const result = await makeClient().getById("fp1");

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/floor-plans/fp1");
      expect(result).toEqual(fakeFloorPlan);
    });

    it("get() is an alias for getById()", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeFloorPlan }));

      const result = await makeClient().get("fp1");

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/floor-plans/fp1");
      expect(result).toEqual(fakeFloorPlan);
    });
  });

  describe("create", () => {
    it("sends POST /api/v1/floor-plans with body", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeFloorPlan }));

      await makeClient().create({
        venueId: "v1",
        name: "Main Floor",
        layoutJson: { width: 800, height: 600 },
      });

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/floor-plans");
      expect(options?.method).toBe("POST");
      expect(JSON.parse(options?.body as string)).toMatchObject({ name: "Main Floor" });
    });
  });

  describe("update", () => {
    it("sends PATCH /api/v1/floor-plans/:id", async () => {
      const updated = { ...fakeFloorPlan, name: "Updated Floor" };
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: updated }));

      await makeClient().update("fp1", { name: "Updated Floor" });

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/floor-plans/fp1");
      expect(options?.method).toBe("PATCH");
    });
  });

  describe("delete", () => {
    it("sends DELETE /api/v1/floor-plans/:id", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

      await makeClient().delete("fp1");

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/floor-plans/fp1");
      expect(options?.method).toBe("DELETE");
    });
  });

  describe("setActive / activate", () => {
    it("sends POST /api/v1/floor-plans/:id/active", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeFloorPlan }));

      await makeClient().setActive("fp1");

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/floor-plans/fp1/active");
      expect(options?.method).toBe("POST");
    });

    it("activate() is an alias for setActive()", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeFloorPlan }));

      await makeClient().activate("fp1");

      const [url] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/floor-plans/fp1/active");
    });
  });

  describe("bulkUpdatePositions", () => {
    it("sends POST /api/v1/floor-plans/:id/bulk-update-positions with positions", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [fakeTable] }));

      const positions = [
        {
          tableId: "t1",
          shapeMetadata: { x: 10, y: 20, width: 60, height: 60, shape: "square" as const },
        },
      ];
      const result = await makeClient().bulkUpdatePositions("fp1", positions);

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/floor-plans/fp1/bulk-update-positions");
      expect(options?.method).toBe("POST");
      expect(JSON.parse(options?.body as string)).toEqual(positions);
      expect(result).toEqual([fakeTable]);
    });
  });

  describe("clone", () => {
    it("sends POST /api/v1/floor-plans/:id/clone", async () => {
      const cloned = { ...fakeFloorPlan, id: "fp2" };
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: cloned }));

      const result = await makeClient().clone("fp1");

      const [url, options] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://api.test.com/api/v1/floor-plans/fp1/clone");
      expect(options?.method).toBe("POST");
      expect(result).toEqual(cloned);
    });
  });

  describe("error handling", () => {
    it("propagates 404 errors", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: "Not Found", message: "Floor plan not found", statusCode: 404 }, 404)
      );

      await expect(makeClient().get("bad")).rejects.toThrow();
    });

    it("propagates network errors", async () => {
      mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      await expect(makeClient().list()).rejects.toThrow(TypeError);
    });
  });
});
